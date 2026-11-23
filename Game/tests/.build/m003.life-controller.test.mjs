// tests/m003.life-controller.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE2 from "three";

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

// src/render/life.ts
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

// src/render/life.ts
var M = palette_default.materials;
var H = (key) => M[key].hex;
var TIMBER = H("bark_dark");
var WOOD = H("trunk");
var STONE = H("noxel_stone_b");
var SOIL = "#684A32";
var SOIL_EDGE = H("strata_ochre");
var GREEN = H("canopy_green_a");
var GREEN_LIGHT = H("canopy_green_c");
var GOLD = "#D9AD3D";
var GOLD_LIGHT = "#F0CF63";
var FIBER = "#B8A96B";
var LIFE_MATERIAL = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true
});
function paint(geometry, hex) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute("uv");
  const colour = new THREE.Color(hex);
  const values = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) {
    values[i * 3] = colour.r;
    values[i * 3 + 1] = colour.g;
    values[i * 3 + 2] = colour.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(values, 3));
  return g;
}
function box(w, h, d, x, y, z, colour) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(x, y + h / 2, z);
  return paint(geometry, colour);
}
function mesh(parts, name) {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error(`could not merge life mesh ${name}`);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const result = new THREE.Mesh(geometry, LIFE_MATERIAL);
  result.name = name;
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}
function stockpileFrame() {
  const parts = [
    box(3.4, 0.18, 2.6, 0, 0, 0, STONE),
    // Slatted timber bin, open at the front so empty storage is visible.
    box(3, 0.16, 0.16, 0, 0.18, -1.02, TIMBER),
    box(0.16, 0.65, 2, -1.43, 0.18, 0, TIMBER),
    box(0.16, 0.65, 2, 1.43, 0.18, 0, TIMBER),
    box(3, 0.16, 0.16, 0, 0.7, -1.02, WOOD)
  ];
  for (const x of [-1.43, 1.43]) {
    const post = new THREE.CylinderGeometry(0.09, 0.12, 1.85, 4);
    post.rotateY(Math.PI / 4);
    post.translate(x, 1.105, -1);
    parts.push(paint(post, TIMBER));
  }
  const roof = new THREE.ConeGeometry(2.35, 0.62, 4);
  roof.rotateY(Math.PI / 4);
  roof.scale(1, 1, 0.76);
  roof.translate(0, 2.15, -1);
  parts.push(paint(roof, WOOD));
  return mesh(parts, "stockpile_frame");
}
function resourceGeometry(resource, index) {
  const x = -1.05 + index % 4 * 0.7;
  const z = 0.42 - Math.floor(index / 4) * 0.65;
  if (resource === "wood") {
    const log = new THREE.CylinderGeometry(0.16, 0.18, 0.58, 6);
    log.rotateZ(Math.PI / 2);
    log.translate(x, 0.39, z);
    return paint(log, WOOD);
  }
  if (resource === "stone" || resource === "ore") {
    const rock = new THREE.DodecahedronGeometry(resource === "ore" ? 0.2 : 0.24, 0);
    rock.scale(1.1, 0.75, 0.9);
    rock.rotateY(index * 0.7);
    rock.translate(x, 0.38, z);
    return paint(rock, resource === "ore" ? H("ore_crystal") : STONE);
  }
  if (resource === "fiber" || resource === "seed") {
    const bundle = new THREE.ConeGeometry(0.22, 0.44, 5);
    bundle.translate(x, 0.4, z);
    return paint(bundle, resource === "seed" ? GOLD : FIBER);
  }
  const sack = new THREE.OctahedronGeometry(0.25, 0);
  sack.scale(0.9, 1.15, 0.8);
  sack.translate(x, 0.42, z);
  return paint(sack, resource === "rations" ? GOLD_LIGHT : GOLD);
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
  const group = new THREE.Group();
  group.name = `life_${stock.id}`;
  group.position.set(stock.x, surfaceAt(world, Math.floor(stock.x), Math.floor(stock.z)), stock.z);
  group.userData.stockpileId = stock.id;
  group.userData.capacity = stock.capacity;
  group.userData.inspectTarget = { x: 0, y: 1.5, z: -0.4 };
  group.add(stockpileFrame());
  const resources = stockpileResources(stock);
  const empty = new THREE.Object3D();
  empty.name = "stockpile_empty";
  empty.visible = resources === null;
  group.userData.empty = resources === null;
  group.add(empty);
  if (resources) group.add(resources);
  return group;
}
function plant(parts, x, y, z, height, spread, colour, crown) {
  const stem = new THREE.CylinderGeometry(0.025, 0.04, height, 5);
  stem.translate(x, y + height / 2, z);
  parts.push(paint(stem, colour));
  for (const side of [-1, 1]) {
    const leaf = new THREE.OctahedronGeometry(0.1, 0);
    leaf.scale(1.6, 0.45, 0.8);
    leaf.rotateZ(side * 0.55);
    leaf.translate(x + side * spread * 0.45, y + height * 0.52, z);
    parts.push(paint(leaf, colour));
  }
  if (height > 0.5) {
    const head = new THREE.DodecahedronGeometry(0.1, 0);
    head.scale(0.85, 1.35, 0.85);
    head.translate(x, y + height, z);
    parts.push(paint(head, crown));
  }
}
function cropGeometry(row, crop, tick) {
  const parts = [];
  if (!crop) {
    parts.push(box(row.w, 0.07, row.d * 0.72, row.x, row.y, row.z, SOIL));
    const clods = Math.max(3, Math.round(row.w / 1.5));
    for (let i = 0; i < clods; i++) {
      const clod = new THREE.DodecahedronGeometry(0.085, 0);
      clod.scale(1.4, 0.45, 0.8);
      clod.translate(row.x - row.w / 2 + row.w * (i + 0.5) / clods, row.y + 0.075, row.z);
      parts.push(paint(clod, i % 2 ? SOIL_EDGE : SOIL));
    }
  } else {
    const progress = THREE.MathUtils.clamp(
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
        ready ? GOLD : stage === 0 ? GREEN_LIGHT : GREEN,
        ready ? GOLD_LIGHT : GREEN_LIGHT
      );
    }
  }
  const geometry = mergeGeometries(parts, false);
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
  const group = new THREE.Group();
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
    const plot = new THREE.Mesh(cropGeometry(rows[index], crop, life.tick), LIFE_MATERIAL);
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
function disposeLifeMeshes(group) {
  group.traverse((object2) => {
    if (object2 instanceof THREE.Mesh) object2.geometry.dispose();
  });
  group.clear();
}

// src/ui/life.ts
function element(tag, className, text2) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text2 !== void 0) node.textContent = text2;
  return node;
}
function button(text2, action) {
  const node = element("button", void 0, text2);
  node.type = "button";
  node.dataset.action = action;
  return node;
}
var LifePanel = class {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.root = element("section", "life-panel");
    this.root.id = "life-panel";
    this.root.setAttribute("aria-label", "Settlement");
    this.root.hidden = false;
    const header = element("header", "life-head");
    header.append(element("h2", void 0, "Settlement"));
    this.root.append(header);
    this.body = element("div", "life-body");
    const unavailable = element(
      "p",
      "life-unavailable",
      "Settlement life is unavailable in this legacy world."
    );
    this.body.append(
      unavailable,
      this.makeBagSection(
        "carried",
        "Gathered \xB7 carried bag",
        CARRIED_CAPACITY,
        this.carriedValues
      ),
      this.makeBagSection(
        "stockpile",
        "Founder stockpile",
        STOCKPILE_CAPACITY,
        this.stockValues
      ),
      this.makeTransfers(),
      this.makeProduction(),
      this.makeCrops()
    );
    this.root.append(this.body);
    this.toastEl = element("div", "life-toast");
    this.toastEl.id = "life-toast";
    this.toastEl.setAttribute("role", "status");
    this.toastEl.setAttribute("aria-live", "polite");
    this.toastEl.hidden = true;
    document.body.append(this.root, this.toastEl);
  }
  callbacks;
  root;
  body;
  toastEl;
  transferControls = /* @__PURE__ */ new Map();
  carriedValues = /* @__PURE__ */ new Map();
  stockValues = /* @__PURE__ */ new Map();
  produceButtons = /* @__PURE__ */ new Map();
  cropButtons = /* @__PURE__ */ new Map();
  tickButtons = [];
  carriedCapacity;
  stockCapacity;
  jobs;
  tick;
  farmStatus;
  makeBagSection(id2, title, capacity, values) {
    const section = element("section", `life-bag life-${id2}`);
    section.dataset.bag = id2;
    section.setAttribute("aria-label", title);
    const heading = element("h3", void 0, title);
    const total2 = element("strong", "life-capacity", `0 / ${capacity}`);
    total2.dataset.capacity = id2;
    if (id2 === "carried") this.carriedCapacity = total2;
    else this.stockCapacity = total2;
    heading.append(total2);
    section.append(heading);
    const list = element("dl", "life-resources");
    for (const resource of LIFE_RESOURCES) {
      const value = element("dd", "life-resource-value", "0");
      value.dataset.resource = resource;
      values.set(resource, value);
      const label = element("dt", void 0, resource);
      const row = element("div", "life-resource");
      row.dataset.resource = resource;
      row.append(label, value);
      list.append(row);
    }
    section.append(list);
    return section;
  }
  makeTransfers() {
    const section = element("section", "life-transfers");
    section.setAttribute("aria-label", "Move resources");
    section.append(element("h3", void 0, "Move resources"));
    section.append(this.makeTransfer("deposit", "fiber"));
    section.append(this.makeTransfer("withdraw", "food"));
    return section;
  }
  makeTransfer(type, defaultResource) {
    const row = element("div", `life-transfer life-${type}`);
    row.dataset.transfer = type;
    const title = type === "deposit" ? "Deposit to stockpile" : "Withdraw to bag";
    row.setAttribute("aria-label", title);
    const id2 = `life-${type}`;
    const resourceLabel = element("label", void 0, `${title} resource`);
    resourceLabel.htmlFor = `${id2}-resource`;
    const select = element("select");
    select.id = `${id2}-resource`;
    select.name = `${type}-resource`;
    select.dataset.resource = type;
    select.setAttribute("aria-label", `${title} resource`);
    for (const resource of LIFE_RESOURCES) {
      const option = element("option", void 0, resource);
      option.value = resource;
      select.append(option);
    }
    select.value = defaultResource;
    resourceLabel.append(select);
    const amountLabel = element("label", void 0, "Amount");
    amountLabel.htmlFor = `${id2}-amount`;
    const input = element("input");
    input.id = `${id2}-amount`;
    input.name = `${type}-amount`;
    input.type = "number";
    input.min = "1";
    input.step = "1";
    input.required = true;
    input.value = "2";
    input.dataset.amount = type;
    amountLabel.append(input);
    const action = button(type === "deposit" ? "Deposit" : "Withdraw", type);
    action.dataset.resource = type;
    action.dataset.amount = type;
    action.disabled = true;
    action.addEventListener("click", () => {
      const resource = select.value;
      const raw = input.value.trim();
      const amount = Number(raw);
      if (!LIFE_RESOURCES.includes(resource) || raw === "" || !Number.isSafeInteger(amount) || amount <= 0) {
        input.setCustomValidity("Enter a positive whole-number amount.");
        input.setAttribute("aria-invalid", "true");
        return;
      }
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
      this.callbacks.onIntent({ type, resource, amount });
    });
    input.addEventListener("input", () => {
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
    });
    select.addEventListener("change", () => {
      action.dataset.resource = select.value;
    });
    this.transferControls.set(type, { select, input, button: action });
    row.append(resourceLabel, amountLabel, action);
    return row;
  }
  makeProduction() {
    const section = element("section", "life-production");
    section.setAttribute("aria-label", "Processing and ticks");
    section.append(element("h3", void 0, "Processing"));
    this.jobs = element("p", "life-jobs");
    this.jobs.dataset.jobs = "";
    this.tick = element("p", "life-tick");
    this.tick.dataset.tick = "";
    section.append(this.jobs, this.tick);
    for (const recipeId of ["seed", "rations"]) {
      const recipe = RECIPES[recipeId];
      const [input, inputAmount] = Object.entries(recipe.input)[0];
      const [output, outputAmount] = Object.entries(recipe.output)[0];
      const action = button(
        `Make ${recipeId}: ${inputAmount} ${input} \u2192 ${outputAmount} ${output} \xB7 ${recipe.ticks} ${recipe.ticks === 1 ? "tick" : "ticks"}`,
        "produce"
      );
      action.dataset.recipe = recipeId;
      action.disabled = true;
      action.addEventListener("click", () => {
        this.callbacks.onIntent({ type: "produce", recipe: recipeId });
      });
      this.produceButtons.set(recipeId, action);
      section.append(action);
    }
    for (const ticks of [1, 4]) {
      const action = button(`+${ticks} ${ticks === 1 ? "tick" : "ticks"}`, "tick");
      action.dataset.ticks = String(ticks);
      action.disabled = true;
      action.addEventListener("click", () => this.callbacks.onIntent({ type: "tick", ticks }));
      this.tickButtons.push(action);
      section.append(action);
    }
    return section;
  }
  makeCrops() {
    const section = element("section", "life-crops");
    section.setAttribute("aria-label", "Terraced farm crops");
    section.append(element("h3", void 0, "Terraced farm crops"));
    this.farmStatus = element("p", "life-farm-status");
    this.farmStatus.dataset.farm = "";
    section.append(this.farmStatus);
    const plots = element("div", "life-plots");
    for (const plotId of CROP_PLOT_IDS) {
      const action = button("Plant 1 seed", "plant");
      action.dataset.plot = plotId;
      action.dataset.action = "plant";
      action.disabled = true;
      action.addEventListener("click", () => {
        this.callbacks.onIntent({
          type: action.dataset.action === "harvest_crop" ? "harvest_crop" : "plant",
          plotId
        });
      });
      this.cropButtons.set(plotId, action);
      plots.append(action);
    }
    section.append(plots);
    return section;
  }
  render(world) {
    const life = world.life;
    this.body.dataset.available = String(Boolean(life));
    this.root.classList.toggle("is-legacy", !life);
    const unavailable = this.body.querySelector(".life-unavailable");
    if (unavailable) unavailable.hidden = Boolean(life);
    const carriedValues = {};
    const stockValues = {};
    if (life) {
      const stock = life.stockpiles.get(FOUNDER_STOCKPILE_ID);
      const inventory2 = stock?.inventory ?? {};
      for (const resource of LIFE_RESOURCES) {
        carriedValues[resource] = world.inventory[resource] ?? 0;
        stockValues[resource] = stock ? inventory2[resource] ?? 0 : null;
      }
      this.carriedCapacity.textContent = `${Object.values(world.inventory).reduce((sum, n) => sum + n, 0)} / ${CARRIED_CAPACITY}`;
      this.stockCapacity.textContent = stock ? `${Object.values(inventory2).reduce((sum, n) => sum + n, 0)} / ${STOCKPILE_CAPACITY}` : "Unavailable";
      this.jobs.textContent = `${life.jobs.size} / ${MAX_PRODUCTION_JOBS} active jobs`;
      this.tick.textContent = `Settlement tick ${life.tick}`;
      const hasFarm = [...world.structures.values()].some((structure) => structure.kind === "terrace");
      this.farmStatus.textContent = hasFarm ? "Founder terraced farm \xB7 9 plots" : "Farm missing";
      this.farmStatus.dataset.farm = hasFarm ? "present" : "missing";
      for (const [recipeId, action] of this.produceButtons) {
        const enoughInput = Object.entries(RECIPES[recipeId].input).every(([resource, amount]) => (inventory2[resource] ?? 0) >= (amount ?? 0));
        action.disabled = !stock || life.jobs.size >= MAX_PRODUCTION_JOBS || !enoughInput;
      }
      for (const action of this.tickButtons) action.disabled = false;
      for (const plotId of CROP_PLOT_IDS) {
        const action = this.cropButtons.get(plotId);
        const crop = life.crops.get(plotId);
        if (!crop) {
          action.dataset.action = "plant";
          action.textContent = "Plant 1 seed";
          action.disabled = !hasFarm || (inventory2.seed ?? 0) < 1;
        } else if (cropReady(crop, life.tick)) {
          action.dataset.action = "harvest_crop";
          action.textContent = "Harvest crop";
          action.disabled = false;
        } else {
          action.dataset.action = "plant";
          const remaining = Math.max(0, crop.plantedTick + crop.growthTicks - life.tick);
          action.textContent = `Growing ${remaining}/${crop.growthTicks} ticks`;
          action.disabled = true;
        }
      }
    } else {
      this.carriedCapacity.textContent = `Unavailable / ${CARRIED_CAPACITY}`;
      this.stockCapacity.textContent = `Unavailable / ${STOCKPILE_CAPACITY}`;
      this.jobs.textContent = "Jobs unavailable";
      this.tick.textContent = "Settlement tick unavailable";
      this.farmStatus.textContent = "Farm missing \xB7 settlement life unavailable";
      this.farmStatus.dataset.farm = "missing";
      for (const action of this.produceButtons.values()) action.disabled = true;
      for (const action of this.tickButtons) action.disabled = true;
      for (const plotId of CROP_PLOT_IDS) {
        const action = this.cropButtons.get(plotId);
        action.dataset.action = "plant";
        action.textContent = "Plant 1 seed";
        action.disabled = true;
      }
    }
    for (const resource of LIFE_RESOURCES) {
      const carried = this.carriedValues.get(resource);
      const stock = this.stockValues.get(resource);
      carried.textContent = !life ? "Unavailable" : String(carriedValues[resource] ?? 0);
      stock.textContent = !life || stockValues[resource] === null ? "Unavailable" : String(stockValues[resource]);
      carried.dataset.value = !life ? "unavailable" : String(carriedValues[resource] ?? 0);
      stock.dataset.value = !life || stockValues[resource] === null ? "unavailable" : String(stockValues[resource]);
    }
    for (const controls of this.transferControls.values()) {
      controls.button.disabled = !life;
      controls.select.disabled = !life;
      controls.input.disabled = !life;
    }
  }
  setVisible(visible) {
    this.root.hidden = !visible;
  }
  toast(message, kind = "good") {
    this.toastEl.textContent = message;
    this.toastEl.className = `life-toast show ${kind}`;
    this.toastEl.hidden = false;
    this.callbacks.onToast?.(message, kind);
  }
};

// src/app/life.ts
var LifeGame = class {
  constructor(options) {
    this.options = options;
    this.meshes = buildLifeMeshes(options.session.world);
    options.scene.add(this.meshes);
    this.lastRevision = options.session.world.revision;
    this.panel = new LifePanel({
      onIntent: (intent) => this.submit(intent)
    });
    this.panel.render(options.session.world);
  }
  options;
  panel;
  meshes;
  lastRevision = -1;
  submit(intent) {
    const session = this.options.session;
    if (session.journal.schema !== 3) return;
    const target = intent.type === "deposit" || intent.type === "withdraw" ? intent.resource : intent.type === "produce" ? intent.recipe : intent.type === "tick" ? String(intent.ticks) : intent.type === "plant" || intent.type === "harvest_crop" ? intent.plotId : "";
    const base = {
      schema: 3,
      id: session.commandId(intent.type, target),
      expectedRevision: session.world.revision
    };
    let command;
    if (intent.type === "deposit" || intent.type === "withdraw") {
      command = {
        ...base,
        type: intent.type,
        stockpileId: FOUNDER_STOCKPILE_ID,
        resources: { [intent.resource]: intent.amount }
      };
    } else if (intent.type === "produce") {
      command = {
        ...base,
        type: intent.type,
        stockpileId: FOUNDER_STOCKPILE_ID,
        recipe: intent.recipe
      };
    } else if (intent.type === "tick") {
      command = { ...base, type: intent.type, ticks: intent.ticks };
    } else if (intent.type === "plant" || intent.type === "harvest_crop") {
      command = { ...base, type: intent.type, plotId: intent.plotId };
    } else {
      throw new Error("unsupported life intent");
    }
    const result = session.dispatch(command);
    if (!result.ok) {
      this.options.toast(`${intent.type.replace("_", " ")}: ${result.reasons.join("; ")}`, "bad");
      return;
    }
    let saved = null;
    if (!result.duplicate) saved = this.options.store.save(session);
    const message = lifeMessage(intent) + (saved ? ` \xB7 ${saved.message}` : "");
    this.options.toast(message, saved?.ok === false ? "bad" : "good");
    if (!result.duplicate) this.refresh();
  }
  refresh() {
    const world = this.options.session.world;
    if (world.revision === this.lastRevision) return;
    this.panel.render(world);
    const next = buildLifeMeshes(world);
    disposeLifeMeshes(this.meshes);
    this.meshes.add(...next.children);
    disposeLifeMeshes(next);
    this.lastRevision = world.revision;
  }
  get inspectableRoot() {
    return this.meshes;
  }
  setVisible(visible) {
    this.panel.setVisible(visible);
    this.meshes.visible = visible || !document.body.classList.contains("clean");
  }
};
function lifeMessage(intent) {
  if (intent.type === "deposit" || intent.type === "withdraw") {
    return `${intent.type === "deposit" ? "Stored" : "Collected"} ${intent.amount} ${intent.resource}`;
  }
  if (intent.type === "produce") return `Started ${intent.recipe} production`;
  if (intent.type === "tick") return `Advanced ${intent.ticks} simulation tick${intent.ticks === 1 ? "" : "s"}`;
  if (intent.type === "plant" || intent.type === "harvest_crop") {
    return intent.type === "plant" ? `Planted ${intent.plotId}` : `Harvested ${intent.plotId}: 6 food + 1 fiber`;
  }
  return "";
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

// src/app/persistence.ts
var SAVE_SCHEMA = 1;
var DESIGN_SAVE_SCHEMA = 2;
var CURRENT_SAVE_SCHEMA = 3;
var MAX_SAVE_JSON_BYTES = 3e7;
function saveKey(seed, schema) {
  return `astrix:m002:v${schema}:seed:${seed}`;
}
function parseSave(raw, seed, schema) {
  if (raw.length > MAX_SAVE_JSON_BYTES) throw new Error("save exceeds the JSON size limit");
  const value = JSON.parse(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid save envelope");
  const record = value;
  if (record.schema !== schema || record.seed !== seed || !("snapshot" in record) || !("journal" in record) || Object.keys(record).length !== 4) throw new Error("unsupported or malformed save envelope");
  return record;
}
var BrowserSaveStore = class {
  constructor(storage, seed) {
    this.storage = storage;
    this.seed = seed;
  }
  storage;
  seed;
  status = "new";
  message = "";
  schema = CURRENT_SAVE_SCHEMA;
  persistent = false;
  load() {
    let raw = null;
    let schema = CURRENT_SAVE_SCHEMA;
    this.schema = CURRENT_SAVE_SCHEMA;
    this.persistent = false;
    try {
      raw = this.storage?.getItem(saveKey(this.seed, schema)) ?? null;
      for (const candidate of [CURRENT_SAVE_SCHEMA, DESIGN_SAVE_SCHEMA, SAVE_SCHEMA]) {
        raw = this.storage?.getItem(saveKey(this.seed, candidate)) ?? null;
        if (raw !== null) {
          schema = candidate;
          this.schema = candidate;
          break;
        }
      }
    } catch (error2) {
      return this.unavailable(`Local save unavailable: ${error2.message}; this session is volatile.`);
    }
    if (raw === null) {
      if (!this.storage) return this.unavailable("Local storage is unavailable; this session is volatile.");
      this.status = "new";
      this.message = "New local world.";
      return this.result(GameSession.genesis(this.seed));
    }
    const key = saveKey(this.seed, schema);
    try {
      const save = parseSave(raw, this.seed, schema);
      const session = GameSession.restore(save.snapshot, save.journal);
      this.status = "restored";
      this.message = `Restored ${session.nextSequence} accepted command${session.nextSequence === 1 ? "" : "s"}.`;
      this.persistent = true;
      return this.result(session);
    } catch (error2) {
      try {
        if (!this.storage) throw new Error("local storage is unavailable");
        this.storage.setItem(`${key}:corrupt`, raw);
        this.storage.removeItem(key);
        this.status = "corrupt";
        this.message = `Save rejected: ${error2.message}. Original bytes quarantined; started a new world.`;
        return this.result(GameSession.genesis(this.seed));
      } catch (quarantineError) {
        return this.unavailable(`Save rejected: ${error2.message}; quarantine failed: ${quarantineError.message}. Original save left untouched; this session is volatile.`);
      }
    }
  }
  /** Replace the sole record only after an accepted command reaches the journal. */
  save(session) {
    try {
      if (!this.storage) throw new Error("local storage is unavailable");
      if (session.world.seed !== this.seed) throw new Error("save seed does not match this browser session");
      const schema = session.journal.schema;
      if (schema !== SAVE_SCHEMA && schema !== DESIGN_SAVE_SCHEMA && schema !== CURRENT_SAVE_SCHEMA) throw new Error("unsupported journal schema");
      const record = {
        schema,
        seed: this.seed,
        snapshot: session.snapshot,
        journal: session.journal
      };
      const raw = JSON.stringify(record);
      if (raw.length > MAX_SAVE_JSON_BYTES) throw new Error("save exceeds the JSON size limit");
      this.storage.setItem(saveKey(this.seed, schema), raw);
      this.schema = schema;
      this.status = "saved";
      this.message = "Saved locally.";
      this.persistent = true;
      return { ok: true, message: this.message };
    } catch (error2) {
      this.status = "unavailable";
      this.message = `Save failed: ${error2.message}. Latest accepted work is not safely persisted.`;
      this.persistent = false;
      return { ok: false, message: this.message };
    }
  }
  metrics() {
    return { schema: this.schema, key: saveKey(this.seed, this.schema), status: this.status, persistent: this.persistent, message: this.message };
  }
  result(session) {
    return { session, status: this.status, message: this.message };
  }
  unavailable(message) {
    this.status = "unavailable";
    this.message = message;
    this.persistent = false;
    return this.result(GameSession.genesis(this.seed));
  }
};

// tests/m003.life-controller.test.ts
var Element = class _Element {
  constructor(tagName) {
    this.tagName = tagName;
    if (tagName.toUpperCase() === "SELECT") this.value = "fiber";
  }
  tagName;
  children = [];
  dataset = {};
  classList = {
    toggle: (_name, _force) => false,
    remove: (..._names) => {
    }
  };
  hidden = false;
  disabled = false;
  value = "";
  id = "";
  name = "";
  type = "";
  min = "";
  step = "";
  required = false;
  htmlFor = "";
  className = "";
  textContent = "";
  append(...children) {
    for (const child of children) if (child instanceof _Element) this.children.push(child);
  }
  setAttribute() {
  }
  removeAttribute() {
  }
  addEventListener() {
  }
  querySelector(selector) {
    if (selector === ".life-unavailable") return new _Element("p");
    return null;
  }
};
var documentStub = {
  createElement: (tag) => new Element(tag),
  body: {
    append: (..._children) => {
    },
    classList: { contains: (_name) => false }
  }
};
Object.assign(globalThis, { document: documentStub });
var MemoryStorage = class {
  values = /* @__PURE__ */ new Map();
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.values.set(key, value);
  }
  removeItem(key) {
    this.values.delete(key);
  }
};
function buildFarm(session) {
  const result = session.dispatch({
    schema: 3,
    id: "controller-test-farm",
    type: "build",
    projectId: "farm",
    designVersion: 2,
    expectedRevision: session.world.revision
  });
  assert.equal(result.ok, true, JSON.stringify(result));
}
test("controller refresh grows from an empty depot to nine crop rows and remains revision-driven", () => {
  const session = GameSession.genesis();
  const scene = new THREE2.Scene();
  const game = new LifeGame({
    session,
    store: new BrowserSaveStore(new MemoryStorage(), session.world.seed),
    scene,
    toast: () => {
    }
  });
  const overlay = scene.getObjectByName("life_state");
  assert.equal(overlay.children.length, 1);
  game.refresh();
  assert.equal(overlay.children.length, 1, "an unchanged revision does no render work");
  buildFarm(session);
  assert.equal(overlay.children.length, 1, "the old overlay remains valid before refresh");
  assert.doesNotThrow(() => game.refresh());
  assert.equal(overlay.parent, scene);
  assert.equal(overlay.children.filter((child) => child.userData.cropId).length, 9);
  assert.doesNotThrow(() => game.refresh());
  assert.equal(
    overlay.children.filter((child) => child.userData.cropId).length,
    9,
    "later revisions must not duplicate or remove crop rows"
  );
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwMy5saWZlLWNvbnRyb2xsZXIudGVzdC50cyIsICIuLi8uLi9zcmMvc2ltL2Vjb25vbXkudHMiLCAiLi4vLi4vc3JjL3JlbmRlci9saWZlLnRzIiwgIi4uLy4uL3NyYy9kYXRhL3BhbGV0dGUuanNvbiIsICIuLi8uLi9zcmMvc2ltL3N0b25lLWNvbXBhdC50cyIsICIuLi8uLi9zcmMvc2ltL3dvcmxkLnRzIiwgIi4uLy4uL3NyYy91aS9saWZlLnRzIiwgIi4uLy4uL3NyYy9hcHAvbGlmZS50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4udHMiLCAiLi4vLi4vc3JjL3NpbS9jb25zdHJ1Y3Rpb24udHMiLCAiLi4vLi4vc3JjL3NpbS9wcmVwYXJhdGlvbi50cyIsICIuLi8uLi9zcmMvc2ltL3N0cnVjdHVyZXMudHMiLCAiLi4vLi4vc3JjL3NpbS9jYW5vbmljYWwudHMiLCAiLi4vLi4vc3JjL3NpbS9tMDAyLnRzIiwgIi4uLy4uL3NyYy9zaW0vc2NlbmFyaW8udHMiLCAiLi4vLi4vc3JjL3NpbS9zbmFwc2hvdC50cyIsICIuLi8uLi9zcmMvYXBwL3Byb2plY3RzLnRzIiwgIi4uLy4uL3NyYy9hcHAvc2Vzc2lvbi50cyIsICIuLi8uLi9zcmMvYXBwL3BlcnNpc3RlbmNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgYXNzZXJ0IGZyb20gJ25vZGU6YXNzZXJ0L3N0cmljdCc7XG5pbXBvcnQgdGVzdCBmcm9tICdub2RlOnRlc3QnO1xuaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuaW1wb3J0IHsgTGlmZUdhbWUgfSBmcm9tICcuLi9zcmMvYXBwL2xpZmUnO1xuaW1wb3J0IHsgQnJvd3NlclNhdmVTdG9yZSwgS2V5VmFsdWVTdG9yYWdlIH0gZnJvbSAnLi4vc3JjL2FwcC9wZXJzaXN0ZW5jZSc7XG5pbXBvcnQgeyBHYW1lU2Vzc2lvbiB9IGZyb20gJy4uL3NyYy9hcHAvc2Vzc2lvbic7XG5cbi8vIExpZmVQYW5lbCdzIERPTSBpcyBvdXRzaWRlIHRoaXMgdGVzdCdzIHB1cnBvc2UuIFRoZXNlIG1pbmltYWwgbm9kZXMgY292ZXIgaXRzXG4vLyBjb25zdHJ1Y3Rpb24vcmVuZGVyIGNvbnRyYWN0IHdpdGhvdXQgaW5zdGFsbGluZyBhIHByb2R1Y3Rpb24gRE9NIGRlcGVuZGVuY3kuXG5jbGFzcyBFbGVtZW50IHtcbiAgcmVhZG9ubHkgY2hpbGRyZW46IEVsZW1lbnRbXSA9IFtdO1xuICByZWFkb25seSBkYXRhc2V0OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIHJlYWRvbmx5IGNsYXNzTGlzdCA9IHtcbiAgICB0b2dnbGU6IChfbmFtZTogc3RyaW5nLCBfZm9yY2U/OiBib29sZWFuKSA9PiBmYWxzZSxcbiAgICByZW1vdmU6ICguLi5fbmFtZXM6IHN0cmluZ1tdKSA9PiB7fSxcbiAgfTtcbiAgaGlkZGVuID0gZmFsc2U7XG4gIGRpc2FibGVkID0gZmFsc2U7XG4gIHZhbHVlID0gJyc7XG4gIGlkID0gJyc7XG4gIG5hbWUgPSAnJztcbiAgdHlwZSA9ICcnO1xuICBtaW4gPSAnJztcbiAgc3RlcCA9ICcnO1xuICByZXF1aXJlZCA9IGZhbHNlO1xuICBodG1sRm9yID0gJyc7XG4gIGNsYXNzTmFtZSA9ICcnO1xuICB0ZXh0Q29udGVudCA9ICcnO1xuXG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHRhZ05hbWU6IHN0cmluZykge1xuICAgIGlmICh0YWdOYW1lLnRvVXBwZXJDYXNlKCkgPT09ICdTRUxFQ1QnKSB0aGlzLnZhbHVlID0gJ2ZpYmVyJztcbiAgfVxuICBhcHBlbmQoLi4uY2hpbGRyZW46IChFbGVtZW50IHwgc3RyaW5nKVtdKTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikgaWYgKGNoaWxkIGluc3RhbmNlb2YgRWxlbWVudCkgdGhpcy5jaGlsZHJlbi5wdXNoKGNoaWxkKTtcbiAgfVxuICBzZXRBdHRyaWJ1dGUoKTogdm9pZCB7fVxuICByZW1vdmVBdHRyaWJ1dGUoKTogdm9pZCB7fVxuICBhZGRFdmVudExpc3RlbmVyKCk6IHZvaWQge31cbiAgcXVlcnlTZWxlY3RvcihzZWxlY3Rvcjogc3RyaW5nKTogRWxlbWVudCB8IG51bGwge1xuICAgIGlmIChzZWxlY3RvciA9PT0gJy5saWZlLXVuYXZhaWxhYmxlJykgcmV0dXJuIG5ldyBFbGVtZW50KCdwJyk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuY29uc3QgZG9jdW1lbnRTdHViID0ge1xuICBjcmVhdGVFbGVtZW50OiAodGFnOiBzdHJpbmcpID0+IG5ldyBFbGVtZW50KHRhZyksXG4gIGJvZHk6IHtcbiAgICBhcHBlbmQ6ICguLi5fY2hpbGRyZW46IEVsZW1lbnRbXSkgPT4ge30sXG4gICAgY2xhc3NMaXN0OiB7IGNvbnRhaW5zOiAoX25hbWU6IHN0cmluZykgPT4gZmFsc2UgfSxcbiAgfSxcbn07XG5PYmplY3QuYXNzaWduKGdsb2JhbFRoaXMsIHsgZG9jdW1lbnQ6IGRvY3VtZW50U3R1YiB9KTtcblxuY2xhc3MgTWVtb3J5U3RvcmFnZSBpbXBsZW1lbnRzIEtleVZhbHVlU3RvcmFnZSB7XG4gIHByaXZhdGUgdmFsdWVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgZ2V0SXRlbShrZXk6IHN0cmluZyk6IHN0cmluZyB8IG51bGwgeyByZXR1cm4gdGhpcy52YWx1ZXMuZ2V0KGtleSkgPz8gbnVsbDsgfVxuICBzZXRJdGVtKGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZCB7IHRoaXMudmFsdWVzLnNldChrZXksIHZhbHVlKTsgfVxuICByZW1vdmVJdGVtKGtleTogc3RyaW5nKTogdm9pZCB7IHRoaXMudmFsdWVzLmRlbGV0ZShrZXkpOyB9XG59XG5cbmZ1bmN0aW9uIGJ1aWxkRmFybShzZXNzaW9uOiBHYW1lU2Vzc2lvbik6IHZvaWQge1xuICBjb25zdCByZXN1bHQgPSBzZXNzaW9uLmRpc3BhdGNoKHtcbiAgICBzY2hlbWE6IDMsIGlkOiAnY29udHJvbGxlci10ZXN0LWZhcm0nLCB0eXBlOiAnYnVpbGQnLCBwcm9qZWN0SWQ6ICdmYXJtJyxcbiAgICBkZXNpZ25WZXJzaW9uOiAyLCBleHBlY3RlZFJldmlzaW9uOiBzZXNzaW9uLndvcmxkLnJldmlzaW9uLFxuICB9KTtcbiAgYXNzZXJ0LmVxdWFsKHJlc3VsdC5vaywgdHJ1ZSwgSlNPTi5zdHJpbmdpZnkocmVzdWx0KSk7XG59XG5cbnRlc3QoJ2NvbnRyb2xsZXIgcmVmcmVzaCBncm93cyBmcm9tIGFuIGVtcHR5IGRlcG90IHRvIG5pbmUgY3JvcCByb3dzIGFuZCByZW1haW5zIHJldmlzaW9uLWRyaXZlbicsICgpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IEdhbWVTZXNzaW9uLmdlbmVzaXMoKTtcbiAgY29uc3Qgc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcbiAgY29uc3QgZ2FtZSA9IG5ldyBMaWZlR2FtZSh7XG4gICAgc2Vzc2lvbiwgc3RvcmU6IG5ldyBCcm93c2VyU2F2ZVN0b3JlKG5ldyBNZW1vcnlTdG9yYWdlKCksIHNlc3Npb24ud29ybGQuc2VlZCksXG4gICAgc2NlbmUsIHRvYXN0OiAoKSA9PiB7fSxcbiAgfSk7XG4gIGNvbnN0IG92ZXJsYXkgPSBzY2VuZS5nZXRPYmplY3RCeU5hbWUoJ2xpZmVfc3RhdGUnKSE7XG4gIGFzc2VydC5lcXVhbChvdmVybGF5LmNoaWxkcmVuLmxlbmd0aCwgMSk7XG4gIGdhbWUucmVmcmVzaCgpO1xuICBhc3NlcnQuZXF1YWwob3ZlcmxheS5jaGlsZHJlbi5sZW5ndGgsIDEsICdhbiB1bmNoYW5nZWQgcmV2aXNpb24gZG9lcyBubyByZW5kZXIgd29yaycpO1xuXG4gIGJ1aWxkRmFybShzZXNzaW9uKTtcbiAgYXNzZXJ0LmVxdWFsKG92ZXJsYXkuY2hpbGRyZW4ubGVuZ3RoLCAxLCAndGhlIG9sZCBvdmVybGF5IHJlbWFpbnMgdmFsaWQgYmVmb3JlIHJlZnJlc2gnKTtcbiAgYXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiBnYW1lLnJlZnJlc2goKSk7XG4gIGFzc2VydC5lcXVhbChvdmVybGF5LnBhcmVudCwgc2NlbmUpO1xuICBhc3NlcnQuZXF1YWwob3ZlcmxheS5jaGlsZHJlbi5maWx0ZXIoKGNoaWxkKSA9PiBjaGlsZC51c2VyRGF0YS5jcm9wSWQpLmxlbmd0aCwgOSk7XG4gIGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4gZ2FtZS5yZWZyZXNoKCkpO1xuICBhc3NlcnQuZXF1YWwob3ZlcmxheS5jaGlsZHJlbi5maWx0ZXIoKGNoaWxkKSA9PiBjaGlsZC51c2VyRGF0YS5jcm9wSWQpLmxlbmd0aCwgOSxcbiAgICAnbGF0ZXIgcmV2aXNpb25zIG11c3Qgbm90IGR1cGxpY2F0ZSBvciByZW1vdmUgY3JvcCByb3dzJyk7XG59KTtcbiIsICIvLyBTY2hlbWEtMyBsaWZlIGxvb3AuIEFsbCBxdWFudGl0aWVzIGFyZSBpbnRlZ2VycyBhbmQgYWxsIG11dGF0aW9ucyBhcmUgZHJpdmVuXG4vLyBieSBhY2NlcHRlZCBjb21tYW5kczsgd2FsbC1jbG9jayB0aW1lIGFuZCByZW5kZXJpbmcgbmV2ZXIgYWR2YW5jZSB0aGlzIHN0YXRlLlxuaW1wb3J0IHR5cGUgeyBXb3JsZCB9IGZyb20gJy4vd29ybGQnO1xuXG5leHBvcnQgY29uc3QgTElGRV9SRVNPVVJDRVMgPSBbJ2ZpYmVyJywgJ2Zvb2QnLCAnb3JlJywgJ3JhdGlvbnMnLCAnc2VlZCcsICdzdG9uZScsICd3b29kJ10gYXMgY29uc3Q7XG5leHBvcnQgdHlwZSBMaWZlUmVzb3VyY2UgPSAodHlwZW9mIExJRkVfUkVTT1VSQ0VTKVtudW1iZXJdO1xuZXhwb3J0IGNvbnN0IENBUlJJRURfQ0FQQUNJVFkgPSAxMjA7XG5leHBvcnQgY29uc3QgU1RPQ0tQSUxFX0NBUEFDSVRZID0gMjAwO1xuZXhwb3J0IGNvbnN0IE1BWF9QUk9EVUNUSU9OX0pPQlMgPSAxNjtcbmV4cG9ydCBjb25zdCBNQVhfVElDS1NfUEVSX0NPTU1BTkQgPSA2NDtcbmV4cG9ydCBjb25zdCBDUk9QX0dST1dUSF9USUNLUyA9IDQ7XG5leHBvcnQgY29uc3QgRk9VTkRFUl9TVE9DS1BJTEVfSUQgPSAnc3RvY2twaWxlOmZvdW5kZXInO1xuZXhwb3J0IGNvbnN0IEZPVU5ERVJfU1RPQ0tQSUxFID0geyBpZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHg6IC01MCwgejogLTMyLCBjYXBhY2l0eTogU1RPQ0tQSUxFX0NBUEFDSVRZIH0gYXMgY29uc3Q7XG5cbmV4cG9ydCB0eXBlIExpZmVSZXNvdXJjZUJhZyA9IFBhcnRpYWw8UmVjb3JkPExpZmVSZXNvdXJjZSwgbnVtYmVyPj47XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvY2twaWxlIHtcbiAgaWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIGNhcGFjaXR5OiB0eXBlb2YgU1RPQ0tQSUxFX0NBUEFDSVRZO1xuICBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG59XG5cbmV4cG9ydCB0eXBlIFJlY2lwZUlkID0gJ3NlZWQnIHwgJ3JhdGlvbnMnO1xuZXhwb3J0IGNvbnN0IFJFQ0lQRVM6IFJlY29yZDxSZWNpcGVJZCwgeyBpbnB1dDogTGlmZVJlc291cmNlQmFnOyBvdXRwdXQ6IExpZmVSZXNvdXJjZUJhZzsgdGlja3M6IG51bWJlciB9PiA9IHtcbiAgc2VlZDogeyBpbnB1dDogeyBmaWJlcjogMiB9LCBvdXRwdXQ6IHsgc2VlZDogMyB9LCB0aWNrczogMSB9LFxuICByYXRpb25zOiB7IGlucHV0OiB7IGZvb2Q6IDIgfSwgb3V0cHV0OiB7IHJhdGlvbnM6IDMgfSwgdGlja3M6IDIgfSxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvZHVjdGlvbkpvYiB7XG4gIGlkOiBzdHJpbmc7XG4gIHN0b2NrcGlsZUlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7XG4gIHJlY2lwZTogUmVjaXBlSWQ7XG4gIHJlbWFpbmluZ1RpY2tzOiBudW1iZXI7XG59XG5cbi8qKiBGaXhlZCBwbG90cyBjb3JyZXNwb25kIHRvIHRoZSBuaW5lIGF1dGhvcml0YXRpdmUgdGVycmFjZSBjcm9wLXJvdyB2b2x1bWVzLiAqL1xuZXhwb3J0IGNvbnN0IENST1BfUExPVF9JRFMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiA5IH0sIChfLCBpKSA9PiBgY3JvcDoke2l9YCk7XG5leHBvcnQgaW50ZXJmYWNlIENyb3BQbG90IHtcbiAgaWQ6IHN0cmluZztcbiAgcGxhbnRlZFRpY2s6IG51bWJlcjtcbiAgZ3Jvd3RoVGlja3M6IHR5cGVvZiBDUk9QX0dST1dUSF9USUNLUztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBMaWZlU3RhdGUge1xuICBzdG9ja3BpbGVzOiBNYXA8c3RyaW5nLCBTdG9ja3BpbGU+O1xuICBqb2JzOiBNYXA8c3RyaW5nLCBQcm9kdWN0aW9uSm9iPjtcbiAgY3JvcHM6IE1hcDxzdHJpbmcsIENyb3BQbG90PjtcbiAgdGljazogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTGlmZVN0YXRlKCk6IExpZmVTdGF0ZSB7XG4gIHJldHVybiB7XG4gICAgc3RvY2twaWxlczogbmV3IE1hcChbW0ZPVU5ERVJfU1RPQ0tQSUxFX0lELCB7XG4gICAgICBpZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHg6IEZPVU5ERVJfU1RPQ0tQSUxFLngsIHo6IEZPVU5ERVJfU1RPQ0tQSUxFLnosXG4gICAgICBjYXBhY2l0eTogU1RPQ0tQSUxFX0NBUEFDSVRZLCBpbnZlbnRvcnk6IHt9LFxuICAgIH1dXSksIGpvYnM6IG5ldyBNYXAoKSwgY3JvcHM6IG5ldyBNYXAoKSwgdGljazogMCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvdGFsKGJhZzogUmVjb3JkPHN0cmluZywgbnVtYmVyPik6IG51bWJlciB7XG4gIHJldHVybiBPYmplY3QudmFsdWVzKGJhZykucmVkdWNlKChzdW0sIGFtb3VudCkgPT4gc3VtICsgYW1vdW50LCAwKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsb25lQmFnKGJhZzogUmVjb3JkPHN0cmluZywgbnVtYmVyPik6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICByZXR1cm4gT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5lbnRyaWVzKGJhZykuZmlsdGVyKChbLCBhbW91bnRdKSA9PiBhbW91bnQgPiAwKVxuICAgIC5zb3J0KChbYV0sIFtiXSkgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsaWZlU3RhdGUod29ybGQ6IFdvcmxkKTogTGlmZVN0YXRlIHtcbiAgaWYgKCF3b3JsZC5saWZlKSB0aHJvdyBuZXcgRXJyb3IoJ2xpZmUtbG9vcCBjb21tYW5kcyByZXF1aXJlIGEgc2NoZW1hLTMgd29ybGQnKTtcbiAgcmV0dXJuIHdvcmxkLmxpZmU7XG59XG5cbmV4cG9ydCB0eXBlIExpZmVGYWlsdXJlID0geyBvazogZmFsc2U7IGNvZGU6IHN0cmluZzsgcmVhc29uczogc3RyaW5nW10gfTtcbmV4cG9ydCB0eXBlIExpZmVTdWNjZXNzPFQ+ID0geyBvazogdHJ1ZTsgdmFsdWU6IFQgfTtcbmV4cG9ydCB0eXBlIExpZmVSZXN1bHQ8VD4gPSBMaWZlU3VjY2VzczxUPiB8IExpZmVGYWlsdXJlO1xuZnVuY3Rpb24gcmVqZWN0TGlmZShjb2RlOiBzdHJpbmcsIHJlYXNvbnM6IHN0cmluZ1tdKTogTGlmZUZhaWx1cmUge1xuICByZXR1cm4geyBvazogZmFsc2UsIGNvZGUsIHJlYXNvbnMgfTtcbn1cbnR5cGUgUGFyc2VkQW1vdW50ID0geyBvazogdHJ1ZTsgcmVzb3VyY2U6IExpZmVSZXNvdXJjZTsgYW1vdW50OiBudW1iZXIgfSB8IHsgb2s6IGZhbHNlOyByZWFzb25zOiBzdHJpbmdbXSB9O1xuZnVuY3Rpb24gcmVxdWlyZUFtb3VudChiYWc6IExpZmVSZXNvdXJjZUJhZyk6IFBhcnNlZEFtb3VudCB7XG4gIGNvbnN0IGVudHJpZXMgPSBPYmplY3QuZW50cmllcyhiYWcpO1xuICBpZiAoZW50cmllcy5sZW5ndGggIT09IDEpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uczogWyd0cmFuc2ZlciBleGFjdGx5IG9uZSByZXNvdXJjZSBhdCBhIHRpbWUnXSB9O1xuICBjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gPSBlbnRyaWVzWzBdO1xuICBpZiAoIUxJRkVfUkVTT1VSQ0VTLmluY2x1ZGVzKHJlc291cmNlIGFzIExpZmVSZXNvdXJjZSkgfHwgIU51bWJlci5pc1NhZmVJbnRlZ2VyKGFtb3VudCkgfHwgKGFtb3VudCA/PyAwKSA8PSAwKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb25zOiBbJ3Jlc291cmNlIGFtb3VudCBtdXN0IGJlIGEgcG9zaXRpdmUgaW50ZWdlciddIH07XG4gIH1cbiAgcmV0dXJuIHsgb2s6IHRydWUsIHJlc291cmNlOiByZXNvdXJjZSBhcyBMaWZlUmVzb3VyY2UsIGFtb3VudCB9O1xufVxuXG5mdW5jdGlvbiBtb3ZlKHdvcmxkOiBXb3JsZCwgZnJvbTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiwgdG86IFJlY29yZDxzdHJpbmcsIG51bWJlcj4sXG4gIHJlcXVlc3RlZDogTGlmZVJlc291cmNlQmFnLCB0b0NhcGFjaXR5OiBudW1iZXIpOiBMaWZlUmVzdWx0PExpZmVSZXNvdXJjZUJhZz4ge1xuICBjb25zdCBjaGVja2VkID0gcmVxdWlyZUFtb3VudChyZXF1ZXN0ZWQpO1xuICBpZiAoIWNoZWNrZWQub2spIHJldHVybiByZWplY3RMaWZlKCdpbnZhbGlkX3RyYW5zZmVyJywgW2NoZWNrZWQucmVhc29uc1swXV0pO1xuICBjb25zdCB7IHJlc291cmNlLCBhbW91bnQgfSA9IGNoZWNrZWQ7XG4gIGlmICgoZnJvbVtyZXNvdXJjZV0gPz8gMCkgPCBhbW91bnQpIHJldHVybiByZWplY3RMaWZlKCdpbnN1ZmZpY2llbnRfcmVzb3VyY2VzJywgW2BuZWVkICR7YW1vdW50fSAke1N0cmluZyhyZXNvdXJjZSl9LCBoYXZlICR7ZnJvbVtyZXNvdXJjZV0gPz8gMH1gXSk7XG4gIGlmICh0b3RhbCh0bykgKyBhbW91bnQgPiB0b0NhcGFjaXR5KSByZXR1cm4gcmVqZWN0TGlmZSgnY2FwYWNpdHlfZXhjZWVkZWQnLCBbYGRlc3RpbmF0aW9uIGNhcGFjaXR5ICR7dG9DYXBhY2l0eX0gd291bGQgYmUgZXhjZWVkZWRgXSk7XG4gIGZyb21bcmVzb3VyY2VdID0gKGZyb21bcmVzb3VyY2VdID8/IDApIC0gYW1vdW50O1xuICBpZiAoZnJvbVtyZXNvdXJjZV0gPT09IDApIGRlbGV0ZSBmcm9tW3Jlc291cmNlXTtcbiAgdG9bcmVzb3VyY2VdID0gKHRvW3Jlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB7IFtyZXNvdXJjZV06IGFtb3VudCB9IH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmFuc2Zlcih3b3JsZDogV29ybGQsIGtpbmQ6ICdkZXBvc2l0JyB8ICd3aXRoZHJhdycsIGJhZzogTGlmZVJlc291cmNlQmFnKTogTGlmZVJlc3VsdDxMaWZlUmVzb3VyY2VCYWc+IHtcbiAgY29uc3QgbGlmZSA9IGxpZmVTdGF0ZSh3b3JsZCk7XG4gIGNvbnN0IHN0b2NrID0gbGlmZS5zdG9ja3BpbGVzLmdldChGT1VOREVSX1NUT0NLUElMRV9JRCk7XG4gIGlmICghc3RvY2spIHJldHVybiByZWplY3RMaWZlKCdtaXNzaW5nX3N0b2NrcGlsZScsIFsnZm91bmRlciBzdG9ja3BpbGUgaXMgYWJzZW50J10pO1xuICByZXR1cm4ga2luZCA9PT0gJ2RlcG9zaXQnXG4gICAgPyBtb3ZlKHdvcmxkLCB3b3JsZC5pbnZlbnRvcnksIHN0b2NrLmludmVudG9yeSwgYmFnLCBzdG9jay5jYXBhY2l0eSlcbiAgICA6IG1vdmUod29ybGQsIHN0b2NrLmludmVudG9yeSwgd29ybGQuaW52ZW50b3J5LCBiYWcsIENBUlJJRURfQ0FQQUNJVFkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RhcnRQcm9kdWN0aW9uKHdvcmxkOiBXb3JsZCwgcmVjaXBlSWQ6IFJlY2lwZUlkLCBqb2JJZDogc3RyaW5nKTogTGlmZVJlc3VsdDxQcm9kdWN0aW9uSm9iPiB7XG4gIGNvbnN0IGxpZmUgPSBsaWZlU3RhdGUod29ybGQpO1xuICBjb25zdCBzdG9jayA9IGxpZmUuc3RvY2twaWxlcy5nZXQoRk9VTkRFUl9TVE9DS1BJTEVfSUQpO1xuICBpZiAoIXN0b2NrKSByZXR1cm4gcmVqZWN0TGlmZSgnbWlzc2luZ19zdG9ja3BpbGUnLCBbJ2ZvdW5kZXIgc3RvY2twaWxlIGlzIGFic2VudCddKTtcbiAgaWYgKGxpZmUuam9icy5oYXMoam9iSWQpKSByZXR1cm4gcmVqZWN0TGlmZSgnZHVwbGljYXRlX2pvYicsIFsncHJvZHVjdGlvbiBqb2IgYWxyZWFkeSBleGlzdHMnXSk7XG4gIGlmIChsaWZlLmpvYnMuc2l6ZSA+PSBNQVhfUFJPRFVDVElPTl9KT0JTKSByZXR1cm4gcmVqZWN0TGlmZSgnam9iX2xpbWl0JywgW2BhdCBtb3N0ICR7TUFYX1BST0RVQ1RJT05fSk9CU30gam9icyBtYXkgYmUgYWN0aXZlYF0pO1xuICBjb25zdCByZWNpcGUgPSBSRUNJUEVTW3JlY2lwZUlkXTtcbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocmVjaXBlLmlucHV0KSkge1xuICAgIGlmICgoc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwKSA8IChhbW91bnQgPz8gMCkpIHtcbiAgICAgIHJldHVybiByZWplY3RMaWZlKCdpbnN1ZmZpY2llbnRfcmVzb3VyY2VzJywgW2BuZWVkICR7YW1vdW50fSAke1N0cmluZyhyZXNvdXJjZSl9LCBoYXZlICR7c3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwfWBdKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgcmVzZXJ2ZWRPdXRwdXQgPSBbLi4ubGlmZS5qb2JzLnZhbHVlcygpXS5maWx0ZXIoKGopID0+IGouc3RvY2twaWxlSWQgPT09IHN0b2NrLmlkKVxuICAgIC5yZWR1Y2UoKHN1bSwgam9iKSA9PiBzdW0gKyB0b3RhbChjbG9uZUJhZyhSRUNJUEVTW2pvYi5yZWNpcGVdLm91dHB1dCBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KSksIDApO1xuICBpZiAodG90YWwoc3RvY2suaW52ZW50b3J5KSAtIHRvdGFsKGNsb25lQmFnKHJlY2lwZS5pbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KSlcbiAgICArIHJlc2VydmVkT3V0cHV0ICsgdG90YWwoY2xvbmVCYWcocmVjaXBlLm91dHB1dCBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KSkgPiBzdG9jay5jYXBhY2l0eSkge1xuICAgIHJldHVybiByZWplY3RMaWZlKCdjYXBhY2l0eV9leGNlZWRlZCcsIFsncmVzZXJ2ZWQgcHJvZHVjdGlvbiBvdXRwdXQgd291bGQgZXhjZWVkIHN0b2NrcGlsZSBjYXBhY2l0eSddKTtcbiAgfVxuICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhyZWNpcGUuaW5wdXQpKSB7XG4gICAgc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA9IChzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDApIC0gKGFtb3VudCA/PyAwKTtcbiAgICBpZiAoc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA9PT0gMCkgZGVsZXRlIHN0b2NrLmludmVudG9yeVtyZXNvdXJjZV07XG4gIH1cbiAgY29uc3Qgam9iOiBQcm9kdWN0aW9uSm9iID0geyBpZDogam9iSWQsIHN0b2NrcGlsZUlkOiBzdG9jay5pZCwgcmVjaXBlOiByZWNpcGVJZCwgcmVtYWluaW5nVGlja3M6IHJlY2lwZS50aWNrcyB9O1xuICBsaWZlLmpvYnMuc2V0KGpvYi5pZCwgam9iKTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB7IC4uLmpvYiB9IH07XG59XG5cbi8qKiBQbGFudCBpbnRvIGFuIGVtcHR5IGZpeGVkIHRlcnJhY2UgcGxvdC4gVGhlIGZvdW5kZXIgZmFybSBtdXN0IGFscmVhZHkgZXhpc3QuICovXG5leHBvcnQgZnVuY3Rpb24gcGxhbnRDcm9wKHdvcmxkOiBXb3JsZCwgcGxvdElkOiBzdHJpbmcpOiBMaWZlUmVzdWx0PENyb3BQbG90PiB7XG4gIGNvbnN0IGxpZmUgPSBsaWZlU3RhdGUod29ybGQpO1xuICBpZiAoIUNST1BfUExPVF9JRFMuaW5jbHVkZXMocGxvdElkKSkgcmV0dXJuIHJlamVjdExpZmUoJ2ludmFsaWRfcGxvdCcsIFsndW5rbm93biBjcm9wIHBsb3QnXSk7XG4gIGlmICghWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldLnNvbWUoKHMpID0+IHMua2luZCA9PT0gJ3RlcnJhY2UnKSkge1xuICAgIHJldHVybiByZWplY3RMaWZlKCdmYXJtX3JlcXVpcmVkJywgWydidWlsZCB0aGUgZm91bmRlciB0ZXJyYWNlZCBmYXJtIGJlZm9yZSBwbGFudGluZyddKTtcbiAgfVxuICBpZiAobGlmZS5jcm9wcy5oYXMocGxvdElkKSkgcmV0dXJuIHJlamVjdExpZmUoJ3Bsb3Rfb2NjdXBpZWQnLCBbJ2Nyb3AgcGxvdCBpcyBhbHJlYWR5IHBsYW50ZWQnXSk7XG4gIGNvbnN0IHN0b2NrID0gbGlmZS5zdG9ja3BpbGVzLmdldChGT1VOREVSX1NUT0NLUElMRV9JRCk7XG4gIGlmICghc3RvY2sgfHwgKHN0b2NrLmludmVudG9yeS5zZWVkID8/IDApIDwgMSkgcmV0dXJuIHJlamVjdExpZmUoJ2luc3VmZmljaWVudF9yZXNvdXJjZXMnLCBbJ25lZWQgMSBzZWVkIGluIHRoZSBmb3VuZGVyIHN0b2NrcGlsZSddKTtcbiAgc3RvY2suaW52ZW50b3J5LnNlZWQhLS07XG4gIGlmIChzdG9jay5pbnZlbnRvcnkuc2VlZCA9PT0gMCkgZGVsZXRlIHN0b2NrLmludmVudG9yeS5zZWVkO1xuICBjb25zdCBjcm9wOiBDcm9wUGxvdCA9IHsgaWQ6IHBsb3RJZCwgcGxhbnRlZFRpY2s6IGxpZmUudGljaywgZ3Jvd3RoVGlja3M6IENST1BfR1JPV1RIX1RJQ0tTIH07XG4gIGxpZmUuY3JvcHMuc2V0KHBsb3RJZCwgY3JvcCk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogeyAuLi5jcm9wIH0gfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyb3BSZWFkeShjcm9wOiBDcm9wUGxvdCwgdGljazogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB0aWNrIC0gY3JvcC5wbGFudGVkVGljayA+PSBjcm9wLmdyb3d0aFRpY2tzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFydmVzdENyb3Aod29ybGQ6IFdvcmxkLCBwbG90SWQ6IHN0cmluZyk6IExpZmVSZXN1bHQ8eyBmb29kOiBudW1iZXI7IGZpYmVyOiBudW1iZXIgfT4ge1xuICBjb25zdCBsaWZlID0gbGlmZVN0YXRlKHdvcmxkKTtcbiAgY29uc3QgY3JvcCA9IGxpZmUuY3JvcHMuZ2V0KHBsb3RJZCk7XG4gIGlmICghY3JvcCkgcmV0dXJuIHJlamVjdExpZmUoJ25vdF9wbGFudGVkJywgWydjcm9wIHBsb3QgaXMgZW1wdHknXSk7XG4gIGlmICghY3JvcFJlYWR5KGNyb3AsIGxpZmUudGljaykpIHJldHVybiByZWplY3RMaWZlKCdjcm9wX25vdF9yZWFkeScsIFtgY3JvcCBuZWVkcyAke2Nyb3AuZ3Jvd3RoVGlja3MgLSAobGlmZS50aWNrIC0gY3JvcC5wbGFudGVkVGljayl9IG1vcmUgdGlja3NgXSk7XG4gIC8vIFBsYW50IGdyb3d0aCBpcyB0aGUgZXhwbGljaXQgYmlvbG9naWNhbCBzb3VyY2U7IGV2ZXJ5IG90aGVyIGxpZmUtbG9vcFxuICAvLyB0cmFuc2Zvcm1hdGlvbiBjb25zZXJ2ZXMgaXRzIGRlY2xhcmVkIGlucHV0cyBhbmQgb3V0cHV0cy5cbiAgY29uc3QgeWllbGRCYWcgPSB7IGZvb2Q6IDYsIGZpYmVyOiAxIH07XG4gIGlmICh0b3RhbCh3b3JsZC5pbnZlbnRvcnkpICsgeWllbGRCYWcuZm9vZCArIHlpZWxkQmFnLmZpYmVyID4gQ0FSUklFRF9DQVBBQ0lUWSkge1xuICAgIHJldHVybiByZWplY3RMaWZlKCdjYXBhY2l0eV9leGNlZWRlZCcsIFtgY2FycmllZCBjYXBhY2l0eSAke0NBUlJJRURfQ0FQQUNJVFl9IHdvdWxkIGJlIGV4Y2VlZGVkYF0pO1xuICB9XG4gIHdvcmxkLmludmVudG9yeS5mb29kID0gKHdvcmxkLmludmVudG9yeS5mb29kID8/IDApICsgeWllbGRCYWcuZm9vZDtcbiAgd29ybGQuaW52ZW50b3J5LmZpYmVyID0gKHdvcmxkLmludmVudG9yeS5maWJlciA/PyAwKSArIHlpZWxkQmFnLmZpYmVyO1xuICBsaWZlLmNyb3BzLmRlbGV0ZShwbG90SWQpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHlpZWxkQmFnIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGlja091dGNvbWUge1xuICBmcm9tVGljazogbnVtYmVyO1xuICB0b1RpY2s6IG51bWJlcjtcbiAgY29tcGxldGVkSm9iczogQXJyYXk8eyBpZDogc3RyaW5nOyByZWNpcGU6IFJlY2lwZUlkOyBvdXRwdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfT47XG4gIHJlYWR5Q3JvcHM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWR2YW5jZVRpY2tzKHdvcmxkOiBXb3JsZCwgY291bnQ6IG51bWJlcik6IExpZmVSZXN1bHQ8VGlja091dGNvbWU+IHtcbiAgY29uc3QgbGlmZSA9IGxpZmVTdGF0ZSh3b3JsZCk7XG4gIGlmICghTnVtYmVyLmlzU2FmZUludGVnZXIoY291bnQpIHx8IGNvdW50IDwgMSB8fCBjb3VudCA+IE1BWF9USUNLU19QRVJfQ09NTUFORCkge1xuICAgIHJldHVybiByZWplY3RMaWZlKCdpbnZhbGlkX3RpY2tfY291bnQnLCBbYHRpY2tzIG11c3QgYmUgYW4gaW50ZWdlciBmcm9tIDEgdG8gJHtNQVhfVElDS1NfUEVSX0NPTU1BTkR9YF0pO1xuICB9XG4gIGNvbnN0IGNvbXBsZXRlZDogVGlja091dGNvbWVbJ2NvbXBsZXRlZEpvYnMnXSA9IFtdO1xuICBjb25zdCBmcm9tVGljayA9IGxpZmUudGljaztcbiAgLy8gSm9icyBhcmUgcHJvY2Vzc2VkIGluIHN0YWJsZSBpZCBvcmRlciBhdCBlYWNoIHRpY2ssIG5ldmVyIG1hcCBpbnNlcnRpb24sXG4gIC8vIHdhbGwgdGltZSwgZnJhbWUgZGVsdGEsIG9yIGFzeW5jaHJvbm91cyBjb21wbGV0aW9uIG9yZGVyLlxuICBmb3IgKGxldCBzdGVwID0gMDsgc3RlcCA8IGNvdW50OyBzdGVwKyspIHtcbiAgICBsaWZlLnRpY2srKztcbiAgICBmb3IgKGNvbnN0IGpvYiBvZiBbLi4ubGlmZS5qb2JzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpKSB7XG4gICAgICBqb2IucmVtYWluaW5nVGlja3MtLTtcbiAgICAgIGlmIChqb2IucmVtYWluaW5nVGlja3MgPiAwKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHN0b2NrID0gbGlmZS5zdG9ja3BpbGVzLmdldChqb2Iuc3RvY2twaWxlSWQpO1xuICAgICAgaWYgKCFzdG9jaykgdGhyb3cgbmV3IEVycm9yKCdhY3RpdmUgcHJvZHVjdGlvbiByZWZlcmVuY2VzIGEgbWlzc2luZyBzdG9ja3BpbGUnKTtcbiAgICAgIGNvbnN0IG91dHB1dCA9IGNsb25lQmFnKFJFQ0lQRVNbam9iLnJlY2lwZV0ub3V0cHV0IGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4pO1xuICAgICAgaWYgKHRvdGFsKHN0b2NrLmludmVudG9yeSkgKyB0b3RhbChvdXRwdXQpID4gc3RvY2suY2FwYWNpdHkpIHRocm93IG5ldyBFcnJvcigncmVzZXJ2ZWQgcHJvZHVjdGlvbiBvdXRwdXQgZXhjZWVkcyBjYXBhY2l0eScpO1xuICAgICAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMob3V0cHV0KSkgc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA9IChzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICAgICAgbGlmZS5qb2JzLmRlbGV0ZShqb2IuaWQpO1xuICAgICAgY29tcGxldGVkLnB1c2goeyBpZDogam9iLmlkLCByZWNpcGU6IGpvYi5yZWNpcGUsIG91dHB1dCB9KTtcbiAgICB9XG4gIH1cbiAgY29uc3QgcmVhZHlDcm9wcyA9IFsuLi5saWZlLmNyb3BzLnZhbHVlcygpXS5maWx0ZXIoKGNyb3ApID0+IGNyb3BSZWFkeShjcm9wLCBsaWZlLnRpY2spXG4gICAgJiYgY3JvcC5wbGFudGVkVGljayArIGNyb3AuZ3Jvd3RoVGlja3MgPiBmcm9tVGljaykubWFwKChjcm9wKSA9PiBjcm9wLmlkKS5zb3J0KCk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogeyBmcm9tVGljaywgdG9UaWNrOiBsaWZlLnRpY2ssIGNvbXBsZXRlZEpvYnM6IGNvbXBsZXRlZCwgcmVhZHlDcm9wcyB9IH07XG59XG4iLCAiLy8gU2NoZW1hLTMgbGlmZS1zdGF0ZSBwcmVzZW50YXRpb24uIFRoZSBzaW11bGF0aW9uIG93bnMgc3RvY2twaWxlIGNvbnRlbnRzLFxuLy8gY3JvcCBleGlzdGVuY2UgYW5kIGdyb3d0aDsgdGhpcyBtb2R1bGUgb25seSBkZXJpdmVzIGRpc3Bvc2FibGUgVEhSRUUgbWVzaGVzLlxuaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuaW1wb3J0IHsgbWVyZ2VHZW9tZXRyaWVzIH0gZnJvbSAndGhyZWUvZXhhbXBsZXMvanNtL3V0aWxzL0J1ZmZlckdlb21ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHBhbGV0dGUgZnJvbSAnLi4vZGF0YS9wYWxldHRlLmpzb24nO1xuaW1wb3J0IHsgV29ybGQsIHN1cmZhY2VBdCB9IGZyb20gJy4uL3NpbS93b3JsZCc7XG5pbXBvcnQgeyBTdHJ1Y3R1cmVNb2R1bGUgfSBmcm9tICcuLi9zaW0vc3RydWN0dXJlcyc7XG5pbXBvcnQgeyBDcm9wUGxvdCwgU3RvY2twaWxlIH0gZnJvbSAnLi4vc2ltL2Vjb25vbXknO1xuXG5jb25zdCBNID0gcGFsZXR0ZS5tYXRlcmlhbHMgYXMgUmVjb3JkPHN0cmluZywgeyBoZXg6IHN0cmluZyB9PjtcbmNvbnN0IEggPSAoa2V5OiBzdHJpbmcpID0+IE1ba2V5XS5oZXg7XG5jb25zdCBUSU1CRVIgPSBIKCdiYXJrX2RhcmsnKTtcbmNvbnN0IFdPT0QgPSBIKCd0cnVuaycpO1xuY29uc3QgU1RPTkUgPSBIKCdub3hlbF9zdG9uZV9iJyk7XG5jb25zdCBTT0lMID0gJyM2ODRBMzInO1xuY29uc3QgU09JTF9FREdFID0gSCgnc3RyYXRhX29jaHJlJyk7XG5jb25zdCBHUkVFTiA9IEgoJ2Nhbm9weV9ncmVlbl9hJyk7XG5jb25zdCBHUkVFTl9MSUdIVCA9IEgoJ2Nhbm9weV9ncmVlbl9jJyk7XG5jb25zdCBHT0xEID0gJyNEOUFEM0QnO1xuY29uc3QgR09MRF9MSUdIVCA9ICcjRjBDRjYzJztcbmNvbnN0IEZJQkVSID0gJyNCOEE5NkInO1xuXG5jb25zdCBMSUZFX01BVEVSSUFMID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xuICB2ZXJ0ZXhDb2xvcnM6IHRydWUsXG4gIGZsYXRTaGFkaW5nOiB0cnVlLFxufSk7XG5cbmZ1bmN0aW9uIHBhaW50KGdlb21ldHJ5OiBUSFJFRS5CdWZmZXJHZW9tZXRyeSwgaGV4OiBzdHJpbmcpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XG4gIGNvbnN0IGcgPSBnZW9tZXRyeS5pbmRleCA/IGdlb21ldHJ5LnRvTm9uSW5kZXhlZCgpIDogZ2VvbWV0cnk7XG4gIGcuZGVsZXRlQXR0cmlidXRlKCd1dicpO1xuICBjb25zdCBjb2xvdXIgPSBuZXcgVEhSRUUuQ29sb3IoaGV4KTtcbiAgY29uc3QgdmFsdWVzID0gbmV3IEZsb2F0MzJBcnJheShnLmF0dHJpYnV0ZXMucG9zaXRpb24uY291bnQgKiAzKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBnLmF0dHJpYnV0ZXMucG9zaXRpb24uY291bnQ7IGkrKykge1xuICAgIHZhbHVlc1tpICogM10gPSBjb2xvdXIucjtcbiAgICB2YWx1ZXNbaSAqIDMgKyAxXSA9IGNvbG91ci5nO1xuICAgIHZhbHVlc1tpICogMyArIDJdID0gY29sb3VyLmI7XG4gIH1cbiAgZy5zZXRBdHRyaWJ1dGUoJ2NvbG9yJywgbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZSh2YWx1ZXMsIDMpKTtcbiAgcmV0dXJuIGc7XG59XG5cbmZ1bmN0aW9uIGJveCh3OiBudW1iZXIsIGg6IG51bWJlciwgZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBjb2xvdXI6IHN0cmluZykge1xuICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSh3LCBoLCBkKTtcbiAgZ2VvbWV0cnkudHJhbnNsYXRlKHgsIHkgKyBoIC8gMiwgeik7XG4gIHJldHVybiBwYWludChnZW9tZXRyeSwgY29sb3VyKTtcbn1cblxuZnVuY3Rpb24gbWVzaChwYXJ0czogVEhSRUUuQnVmZmVyR2VvbWV0cnlbXSwgbmFtZTogc3RyaW5nKTogVEhSRUUuTWVzaCB7XG4gIGNvbnN0IGdlb21ldHJ5ID0gbWVyZ2VHZW9tZXRyaWVzKHBhcnRzLCBmYWxzZSk7XG4gIGZvciAoY29uc3QgcGFydCBvZiBwYXJ0cykgcGFydC5kaXNwb3NlKCk7XG4gIGlmICghZ2VvbWV0cnkpIHRocm93IG5ldyBFcnJvcihgY291bGQgbm90IG1lcmdlIGxpZmUgbWVzaCAke25hbWV9YCk7XG4gIGdlb21ldHJ5LmNvbXB1dGVCb3VuZGluZ0JveCgpO1xuICBnZW9tZXRyeS5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcbiAgY29uc3QgcmVzdWx0ID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIExJRkVfTUFURVJJQUwpO1xuICByZXN1bHQubmFtZSA9IG5hbWU7XG4gIHJlc3VsdC5jYXN0U2hhZG93ID0gdHJ1ZTtcbiAgcmVzdWx0LnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIEEgc21hbGwgb3BlbiBOb3hlbCBkZXBvdDogc3RvbmUgcGFkLCB0aW1iZXIgcmFpbHMgYW5kIGEgcGl0Y2hlZCBjYW5vcHkuIEl0c1xuICogcmVzb3VyY2UgcGlsZSBpcyBhIHNlcGFyYXRlIG5vZGUgc28gcmVwbGFjaW5nIGl0IGFmdGVyIGEgdHJhbnNmZXIgaXMgc2ltcGxlLlxuICovXG5mdW5jdGlvbiBzdG9ja3BpbGVGcmFtZSgpOiBUSFJFRS5NZXNoIHtcbiAgY29uc3QgcGFydHM6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5W10gPSBbXG4gICAgYm94KDMuNCwgMC4xOCwgMi42LCAwLCAwLCAwLCBTVE9ORSksXG4gICAgLy8gU2xhdHRlZCB0aW1iZXIgYmluLCBvcGVuIGF0IHRoZSBmcm9udCBzbyBlbXB0eSBzdG9yYWdlIGlzIHZpc2libGUuXG4gICAgYm94KDMuMCwgMC4xNiwgMC4xNiwgMCwgMC4xOCwgLTEuMDIsIFRJTUJFUiksXG4gICAgYm94KDAuMTYsIDAuNjUsIDIuMCwgLTEuNDMsIDAuMTgsIDAsIFRJTUJFUiksXG4gICAgYm94KDAuMTYsIDAuNjUsIDIuMCwgMS40MywgMC4xOCwgMCwgVElNQkVSKSxcbiAgICBib3goMy4wLCAwLjE2LCAwLjE2LCAwLCAwLjcwLCAtMS4wMiwgV09PRCksXG4gIF07XG4gIGZvciAoY29uc3QgeCBvZiBbLTEuNDMsIDEuNDNdKSB7XG4gICAgY29uc3QgcG9zdCA9IG5ldyBUSFJFRS5DeWxpbmRlckdlb21ldHJ5KDAuMDksIDAuMTIsIDEuODUsIDQpO1xuICAgIHBvc3Qucm90YXRlWShNYXRoLlBJIC8gNCk7XG4gICAgcG9zdC50cmFuc2xhdGUoeCwgMS4xMDUsIC0xLjApO1xuICAgIHBhcnRzLnB1c2gocGFpbnQocG9zdCwgVElNQkVSKSk7XG4gIH1cbiAgLy8gQSByZXN0cmFpbmVkIGZvdXItc2lkZWQgcGl0Y2hlZCByb29mLCByYXRoZXIgdGhhbiBhbm90aGVyIGdlbmVyaWMgY3Vib2lkLlxuICBjb25zdCByb29mID0gbmV3IFRIUkVFLkNvbmVHZW9tZXRyeSgyLjM1LCAwLjYyLCA0KTtcbiAgcm9vZi5yb3RhdGVZKE1hdGguUEkgLyA0KTtcbiAgcm9vZi5zY2FsZSgxLCAxLCAwLjc2KTtcbiAgcm9vZi50cmFuc2xhdGUoMCwgMi4xNSwgLTEuMCk7XG4gIHBhcnRzLnB1c2gocGFpbnQocm9vZiwgV09PRCkpO1xuICByZXR1cm4gbWVzaChwYXJ0cywgJ3N0b2NrcGlsZV9mcmFtZScpO1xufVxuXG5mdW5jdGlvbiByZXNvdXJjZUdlb21ldHJ5KHJlc291cmNlOiBzdHJpbmcsIGluZGV4OiBudW1iZXIpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XG4gIGNvbnN0IHggPSAtMS4wNSArIChpbmRleCAlIDQpICogMC43MDtcbiAgY29uc3QgeiA9IDAuNDIgLSBNYXRoLmZsb29yKGluZGV4IC8gNCkgKiAwLjY1O1xuICBpZiAocmVzb3VyY2UgPT09ICd3b29kJykge1xuICAgIGNvbnN0IGxvZyA9IG5ldyBUSFJFRS5DeWxpbmRlckdlb21ldHJ5KDAuMTYsIDAuMTgsIDAuNTgsIDYpO1xuICAgIGxvZy5yb3RhdGVaKE1hdGguUEkgLyAyKTtcbiAgICBsb2cudHJhbnNsYXRlKHgsIDAuMzksIHopO1xuICAgIHJldHVybiBwYWludChsb2csIFdPT0QpO1xuICB9XG4gIGlmIChyZXNvdXJjZSA9PT0gJ3N0b25lJyB8fCByZXNvdXJjZSA9PT0gJ29yZScpIHtcbiAgICBjb25zdCByb2NrID0gbmV3IFRIUkVFLkRvZGVjYWhlZHJvbkdlb21ldHJ5KHJlc291cmNlID09PSAnb3JlJyA/IDAuMjAgOiAwLjI0LCAwKTtcbiAgICByb2NrLnNjYWxlKDEuMSwgMC43NSwgMC45KTtcbiAgICByb2NrLnJvdGF0ZVkoaW5kZXggKiAwLjcpO1xuICAgIHJvY2sudHJhbnNsYXRlKHgsIDAuMzgsIHopO1xuICAgIHJldHVybiBwYWludChyb2NrLCByZXNvdXJjZSA9PT0gJ29yZScgPyBIKCdvcmVfY3J5c3RhbCcpIDogU1RPTkUpO1xuICB9XG4gIGlmIChyZXNvdXJjZSA9PT0gJ2ZpYmVyJyB8fCByZXNvdXJjZSA9PT0gJ3NlZWQnKSB7XG4gICAgY29uc3QgYnVuZGxlID0gbmV3IFRIUkVFLkNvbmVHZW9tZXRyeSgwLjIyLCAwLjQ0LCA1KTtcbiAgICBidW5kbGUudHJhbnNsYXRlKHgsIDAuNDAsIHopO1xuICAgIHJldHVybiBwYWludChidW5kbGUsIHJlc291cmNlID09PSAnc2VlZCcgPyBHT0xEIDogRklCRVIpO1xuICB9XG4gIC8vIEZvb2QgYW5kIHJhdGlvbnMgYXJlIHNtYWxsIGZhY2V0ZWQgc2Fja3MsIHJlY29nbml6YWJsZSB3aXRob3V0IGxhYmVscy5cbiAgY29uc3Qgc2FjayA9IG5ldyBUSFJFRS5PY3RhaGVkcm9uR2VvbWV0cnkoMC4yNSwgMCk7XG4gIHNhY2suc2NhbGUoMC45LCAxLjE1LCAwLjgpO1xuICBzYWNrLnRyYW5zbGF0ZSh4LCAwLjQyLCB6KTtcbiAgcmV0dXJuIHBhaW50KHNhY2ssIHJlc291cmNlID09PSAncmF0aW9ucycgPyBHT0xEX0xJR0hUIDogR09MRCk7XG59XG5cbmZ1bmN0aW9uIHN0b2NrcGlsZVJlc291cmNlcyhzdG9jazogU3RvY2twaWxlKTogVEhSRUUuTWVzaCB8IG51bGwge1xuICBjb25zdCBlbnRyaWVzID0gT2JqZWN0LmVudHJpZXMoc3RvY2suaW52ZW50b3J5KVxuICAgIC5maWx0ZXIoKFssIGFtb3VudF0pID0+IGFtb3VudCA+IDApXG4gICAgLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuICBjb25zdCBwYXJ0cyA9IGVudHJpZXMubWFwKChbcmVzb3VyY2VdLCBpbmRleCkgPT4gcmVzb3VyY2VHZW9tZXRyeShyZXNvdXJjZSwgaW5kZXgpKTtcbiAgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJlc291cmNlcyA9IG1lc2gocGFydHMsICdzdG9ja3BpbGVfcmVzb3VyY2VzJyk7XG4gIHJlc291cmNlcy51c2VyRGF0YS5yZXNvdXJjZXMgPSBPYmplY3QuZnJvbUVudHJpZXMoZW50cmllcyk7XG4gIHJlc291cmNlcy51c2VyRGF0YS5zdG9yZWQgPSBlbnRyaWVzLnJlZHVjZSgoc3VtLCBbLCBhbW91bnRdKSA9PiBzdW0gKyBhbW91bnQsIDApO1xuICByZXNvdXJjZXMudXNlckRhdGEuY2FwYWNpdHkgPSBzdG9jay5jYXBhY2l0eTtcbiAgcmV0dXJuIHJlc291cmNlcztcbn1cblxuZnVuY3Rpb24gYnVpbGRTdG9ja3BpbGUod29ybGQ6IFdvcmxkLCBzdG9jazogU3RvY2twaWxlKTogVEhSRUUuR3JvdXAge1xuICBjb25zdCBncm91cCA9IG5ldyBUSFJFRS5Hcm91cCgpO1xuICBncm91cC5uYW1lID0gYGxpZmVfJHtzdG9jay5pZH1gO1xuICBncm91cC5wb3NpdGlvbi5zZXQoc3RvY2sueCwgc3VyZmFjZUF0KHdvcmxkLCBNYXRoLmZsb29yKHN0b2NrLngpLCBNYXRoLmZsb29yKHN0b2NrLnopKSwgc3RvY2sueik7XG4gIGdyb3VwLnVzZXJEYXRhLnN0b2NrcGlsZUlkID0gc3RvY2suaWQ7XG4gIGdyb3VwLnVzZXJEYXRhLmNhcGFjaXR5ID0gc3RvY2suY2FwYWNpdHk7XG4gIGdyb3VwLnVzZXJEYXRhLmluc3BlY3RUYXJnZXQgPSB7IHg6IDAsIHk6IDEuNSwgejogLTAuNCB9O1xuICBncm91cC5hZGQoc3RvY2twaWxlRnJhbWUoKSk7XG4gIGNvbnN0IHJlc291cmNlcyA9IHN0b2NrcGlsZVJlc291cmNlcyhzdG9jayk7XG4gIC8vIEVtcHR5IHN0b3JhZ2UgaXMgYSByZWFsIHZpc2libGUgc3RhdGUsIG5vdCBhbiBpbnZpc2libGUgcGxhY2Vob2xkZXIuXG4gIGNvbnN0IGVtcHR5ID0gbmV3IFRIUkVFLk9iamVjdDNEKCk7XG4gIGVtcHR5Lm5hbWUgPSAnc3RvY2twaWxlX2VtcHR5JztcbiAgZW1wdHkudmlzaWJsZSA9IHJlc291cmNlcyA9PT0gbnVsbDtcbiAgZ3JvdXAudXNlckRhdGEuZW1wdHkgPSByZXNvdXJjZXMgPT09IG51bGw7XG4gIGdyb3VwLmFkZChlbXB0eSk7XG4gIGlmIChyZXNvdXJjZXMpIGdyb3VwLmFkZChyZXNvdXJjZXMpO1xuICByZXR1cm4gZ3JvdXA7XG59XG5cbmZ1bmN0aW9uIHBsYW50KFxuICBwYXJ0czogVEhSRUUuQnVmZmVyR2VvbWV0cnlbXSwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcixcbiAgaGVpZ2h0OiBudW1iZXIsIHNwcmVhZDogbnVtYmVyLCBjb2xvdXI6IHN0cmluZywgY3Jvd246IHN0cmluZyxcbik6IHZvaWQge1xuICBjb25zdCBzdGVtID0gbmV3IFRIUkVFLkN5bGluZGVyR2VvbWV0cnkoMC4wMjUsIDAuMDQsIGhlaWdodCwgNSk7XG4gIHN0ZW0udHJhbnNsYXRlKHgsIHkgKyBoZWlnaHQgLyAyLCB6KTtcbiAgcGFydHMucHVzaChwYWludChzdGVtLCBjb2xvdXIpKTtcbiAgLy8gVHdvIHBvaW50ZWQgbGVhdmVzIGdpdmUgc3Byb3V0cyBhIHJlYWRhYmxlIG9yZ2FuaWMgc2lsaG91ZXR0ZS5cbiAgZm9yIChjb25zdCBzaWRlIG9mIFstMSwgMV0pIHtcbiAgICBjb25zdCBsZWFmID0gbmV3IFRIUkVFLk9jdGFoZWRyb25HZW9tZXRyeSgwLjEwLCAwKTtcbiAgICBsZWFmLnNjYWxlKDEuNiwgMC40NSwgMC44KTtcbiAgICBsZWFmLnJvdGF0ZVooc2lkZSAqIDAuNTUpO1xuICAgIGxlYWYudHJhbnNsYXRlKHggKyBzaWRlICogc3ByZWFkICogMC40NSwgeSArIGhlaWdodCAqIDAuNTIsIHopO1xuICAgIHBhcnRzLnB1c2gocGFpbnQobGVhZiwgY29sb3VyKSk7XG4gIH1cbiAgaWYgKGhlaWdodCA+IDAuNSkge1xuICAgIGNvbnN0IGhlYWQgPSBuZXcgVEhSRUUuRG9kZWNhaGVkcm9uR2VvbWV0cnkoMC4xMCwgMCk7XG4gICAgaGVhZC5zY2FsZSgwLjg1LCAxLjM1LCAwLjg1KTtcbiAgICBoZWFkLnRyYW5zbGF0ZSh4LCB5ICsgaGVpZ2h0LCB6KTtcbiAgICBwYXJ0cy5wdXNoKHBhaW50KGhlYWQsIGNyb3duKSk7XG4gIH1cbn1cblxuLyoqIEdlb21ldHJ5IHJlbWFpbnMgaW5zaWRlIHRoZSBjb3JyZXNwb25kaW5nIGF1dGhvcml0YXRpdmUgY3JvcC1yb3cgYm91bmRzLiAqL1xuZnVuY3Rpb24gY3JvcEdlb21ldHJ5KHJvdzogU3RydWN0dXJlTW9kdWxlLCBjcm9wOiBDcm9wUGxvdCB8IHVuZGVmaW5lZCwgdGljazogbnVtYmVyKTogVEhSRUUuQnVmZmVyR2VvbWV0cnkge1xuICBjb25zdCBwYXJ0czogVEhSRUUuQnVmZmVyR2VvbWV0cnlbXSA9IFtdO1xuICBpZiAoIWNyb3ApIHtcbiAgICAvLyBFbXB0eSBwbG90cyBzaG93IGEgbG93IHRpbGxlZCByaWRnZSwgd2l0aCBzbWFsbCBicmVha3MgaW4gaXRzIHNpbGhvdWV0dGUuXG4gICAgcGFydHMucHVzaChib3gocm93LncsIDAuMDcsIHJvdy5kICogMC43Miwgcm93LngsIHJvdy55LCByb3cueiwgU09JTCkpO1xuICAgIGNvbnN0IGNsb2RzID0gTWF0aC5tYXgoMywgTWF0aC5yb3VuZChyb3cudyAvIDEuNSkpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2xvZHM7IGkrKykge1xuICAgICAgY29uc3QgY2xvZCA9IG5ldyBUSFJFRS5Eb2RlY2FoZWRyb25HZW9tZXRyeSgwLjA4NSwgMCk7XG4gICAgICBjbG9kLnNjYWxlKDEuNCwgMC40NSwgMC44KTtcbiAgICAgIGNsb2QudHJhbnNsYXRlKHJvdy54IC0gcm93LncgLyAyICsgcm93LncgKiAoaSArIDAuNSkgLyBjbG9kcywgcm93LnkgKyAwLjA3NSwgcm93LnopO1xuICAgICAgcGFydHMucHVzaChwYWludChjbG9kLCBpICUgMiA/IFNPSUxfRURHRSA6IFNPSUwpKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgcHJvZ3Jlc3MgPSBUSFJFRS5NYXRoVXRpbHMuY2xhbXAoXG4gICAgICAodGljayAtIGNyb3AucGxhbnRlZFRpY2spIC8gY3JvcC5ncm93dGhUaWNrcywgMCwgMSxcbiAgICApO1xuICAgIGNvbnN0IHJlYWR5ID0gcHJvZ3Jlc3MgPj0gMTtcbiAgICAvLyBGb3VyIHZpc2libGUgc3RhZ2VzOyByZWFkaW5lc3MgYWxzbyBjaGFuZ2VzIGdyZWVuIGZvbGlhZ2UgdG8gZ29sZC5cbiAgICBjb25zdCBzdGFnZSA9IHJlYWR5ID8gMyA6IE1hdGguZmxvb3IocHJvZ3Jlc3MgKiAzKTtcbiAgICBjb25zdCBoZWlnaHQgPSAwLjE0ICsgc3RhZ2UgKiAwLjA5O1xuICAgIGNvbnN0IGNvdW50ID0gTWF0aC5tYXgoMywgTWF0aC5yb3VuZChyb3cudyAvIDAuOSkpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuICAgICAgY29uc3QgeCA9IHJvdy54IC0gcm93LncgLyAyICsgcm93LncgKiAoaSArIDAuNSkgLyBjb3VudDtcbiAgICAgIGNvbnN0IHogPSByb3cueiArIChpICUgMiA9PT0gMCA/IC0wLjAyNSA6IDAuMDI1KTtcbiAgICAgIHBsYW50KHBhcnRzLCB4LCByb3cueSwgeiwgaGVpZ2h0LCByb3cuZCAqIDAuNCxcbiAgICAgICAgcmVhZHkgPyBHT0xEIDogc3RhZ2UgPT09IDAgPyBHUkVFTl9MSUdIVCA6IEdSRUVOLFxuICAgICAgICByZWFkeSA/IEdPTERfTElHSFQgOiBHUkVFTl9MSUdIVCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGdlb21ldHJ5ID0gbWVyZ2VHZW9tZXRyaWVzKHBhcnRzLCBmYWxzZSk7XG4gIGZvciAoY29uc3QgcGFydCBvZiBwYXJ0cykgcGFydC5kaXNwb3NlKCk7XG4gIGlmICghZ2VvbWV0cnkpIHRocm93IG5ldyBFcnJvcihgY291bGQgbm90IG1lcmdlIGxpZmUgY3JvcCByb3cgJHtyb3cueH0sJHtyb3cuen1gKTtcbiAgZ2VvbWV0cnkuY29tcHV0ZUJvdW5kaW5nQm94KCk7XG4gIGdlb21ldHJ5LmNvbXB1dGVCb3VuZGluZ1NwaGVyZSgpO1xuICByZXR1cm4gZ2VvbWV0cnk7XG59XG5cbmZ1bmN0aW9uIGNyb3BSb3dzKHdvcmxkOiBXb3JsZCk6IFN0cnVjdHVyZU1vZHVsZVtdIHtcbiAgY29uc3Qgc3RydWN0dXJlcyA9IFsuLi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXVxuICAgIC5maWx0ZXIoKHN0cnVjdHVyZSkgPT4gc3RydWN0dXJlLmtpbmQgPT09ICd0ZXJyYWNlJylcbiAgICAuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKTtcbiAgY29uc3Qgc291cmNlID0gc3RydWN0dXJlcy5maW5kKChzdHJ1Y3R1cmUpID0+IHN0cnVjdHVyZS5kZXNpZ25WZXJzaW9uID09PSAyKSA/PyBzdHJ1Y3R1cmVzWzBdO1xuICByZXR1cm4gc291cmNlPy5tb2R1bGVzLmZpbHRlcigobW9kdWxlKSA9PiBtb2R1bGUua2luZCA9PT0gJ2Nyb3Bfcm93JykgPz8gW107XG59XG5cbi8qKlxuICogQnVpbGQgdGhlIGNvbXBsZXRlIHNjaGVtYS0zIGxpZmUgb3ZlcmxheS4gTm8gc3RydWN0dXJlIG1lc2hlcyBhcmUgaW5jbHVkZWQ6XG4gKiB0aGUgY2FsbGVyIG11c3QgcmVuZGVyIHRoYXQgZmFybSB3aXRob3V0IGl0cyBzdGF0aWMgY3JvcCBmb2xpYWdlIHRvIGF2b2lkIGFcbiAqIHNlY29uZCwgbGlmZWN5Y2xlLXVuYXdhcmUgcGxhbnQgbGF5ZXIuIExlZ2FjeSB3b3JsZHMgcmV0dXJuIGFuIGVtcHR5IGdyb3VwLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRMaWZlTWVzaGVzKHdvcmxkOiBXb3JsZCk6IFRIUkVFLkdyb3VwIHtcbiAgY29uc3QgZ3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgZ3JvdXAubmFtZSA9ICdsaWZlX3N0YXRlJztcbiAgZ3JvdXAudXNlckRhdGEuc2NoZW1hID0gMztcbiAgaWYgKCF3b3JsZC5saWZlKSByZXR1cm4gZ3JvdXA7XG5cbiAgY29uc3QgbGlmZSA9IHdvcmxkLmxpZmU7XG4gIGZvciAoY29uc3Qgc3RvY2sgb2YgWy4uLmxpZmUuc3RvY2twaWxlcy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKSkge1xuICAgIGdyb3VwLmFkZChidWlsZFN0b2NrcGlsZSh3b3JsZCwgc3RvY2spKTtcbiAgfVxuICBjb25zdCByb3dzID0gY3JvcFJvd3Mod29ybGQpO1xuICAvLyBJRHMgYXJlIGZpeGVkIHBsb3QgaW5kaWNlcywgc28gZXh0cmEvbWlzc2luZyB0ZXJyYWNlIHJvd3MgY2Fubm90IHNpbGVudGx5XG4gIC8vIGFzc29jaWF0ZSBhIHBsYW50IHdpdGggdGhlIHdyb25nIHBoeXNpY2FsIGxvY2F0aW9uLlxuICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgTWF0aC5taW4ocm93cy5sZW5ndGgsIDkpOyBpbmRleCsrKSB7XG4gICAgY29uc3QgaWQgPSBgY3JvcDoke2luZGV4fWA7XG4gICAgY29uc3QgY3JvcCA9IGxpZmUuY3JvcHMuZ2V0KGlkKTtcbiAgICBjb25zdCByZWFkeSA9IGNyb3AgIT09IHVuZGVmaW5lZCAmJiB0aWNrUmVhZHkoY3JvcCwgbGlmZS50aWNrKTtcbiAgICBjb25zdCBwbG90ID0gbmV3IFRIUkVFLk1lc2goY3JvcEdlb21ldHJ5KHJvd3NbaW5kZXhdLCBjcm9wLCBsaWZlLnRpY2spLCBMSUZFX01BVEVSSUFMKTtcbiAgICBwbG90Lm5hbWUgPSBgbGlmZV8ke2lkfWA7XG4gICAgcGxvdC5jYXN0U2hhZG93ID0gY3JvcCAhPT0gdW5kZWZpbmVkO1xuICAgIHBsb3QucmVjZWl2ZVNoYWRvdyA9IHRydWU7XG4gICAgcGxvdC51c2VyRGF0YS5jcm9wSWQgPSBpZDtcbiAgICBwbG90LnVzZXJEYXRhLnN0YXRlID0gIWNyb3AgPyAnZW1wdHknIDogcmVhZHkgPyAncmVhZHknIDogJ3Nwcm91dCc7XG4gICAgcGxvdC51c2VyRGF0YS5wbGFudGVkVGljayA9IGNyb3A/LnBsYW50ZWRUaWNrO1xuICAgIHBsb3QudXNlckRhdGEuZ3Jvd3RoVGlja3MgPSBjcm9wPy5ncm93dGhUaWNrcztcbiAgICBwbG90LnVzZXJEYXRhLnRpY2sgPSBsaWZlLnRpY2s7XG4gICAgcGxvdC51c2VyRGF0YS5pbnNwZWN0VGFyZ2V0ID0ge1xuICAgICAgeDogcm93c1tpbmRleF0ueCwgeTogcm93c1tpbmRleF0ueSArIE1hdGgubWF4KDAuMTIsIHJvd3NbaW5kZXhdLmggLyAyKSwgejogcm93c1tpbmRleF0ueixcbiAgICB9O1xuICAgIGdyb3VwLmFkZChwbG90KTtcbiAgfVxuICByZXR1cm4gZ3JvdXA7XG59XG5cbmZ1bmN0aW9uIHRpY2tSZWFkeShjcm9wOiBDcm9wUGxvdCwgdGljazogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB0aWNrIC0gY3JvcC5wbGFudGVkVGljayA+PSBjcm9wLmdyb3d0aFRpY2tzO1xufVxuXG4vKiogRGlzcG9zZSBwZXItaW5zdGFuY2UgZ2VvbWV0cnk7IHRoZSBzaGFyZWQgZmxhdC1zaGFkZWQgbWF0ZXJpYWwgaXMgcmV0YWluZWQuICovXG5leHBvcnQgZnVuY3Rpb24gZGlzcG9zZUxpZmVNZXNoZXMoZ3JvdXA6IFRIUkVFLkdyb3VwKTogdm9pZCB7XG4gIGdyb3VwLnRyYXZlcnNlKChvYmplY3QpID0+IHtcbiAgICBpZiAob2JqZWN0IGluc3RhbmNlb2YgVEhSRUUuTWVzaCkgb2JqZWN0Lmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgfSk7XG4gIGdyb3VwLmNsZWFyKCk7XG59XG4iLCAie1xuICBcInNjaGVtYVwiOiBcInBhbGV0dGVfdjJcIixcbiAgXCJkYXRlXCI6IFwiMjAyNi0xMC0yMlwiLFxuICBcInN0YXR1c1wiOiBcInByb3Bvc2VkXCIsXG4gIFwic291cmNlXCI6IFwiUkVGLTAwMiAoaHlicmlkIHdvcmxkIHJlZmVyZW5jZSksIHZhbHVlcyBzYW1wbGVkIGJ5IGV5ZTsgbnVtZXJpYyB2ZXJpZmljYXRpb24gcGVuZGluZ1wiLFxuICBcIm5vdGVcIjogXCJPbmUgbWF0ZXJpYWwgcGFsZXR0ZS4gVGltZSBvZiBkYXkgaXMgZXhwcmVzc2VkIGJ5IHRoZSBsaWdodGluZyBwcmVzZXRzIGJlbG93LCBub3QgYnkgcmVwYWludGluZyBtYXRlcmlhbHMuXCIsXG4gIFwibWF0ZXJpYWxzXCI6IHtcbiAgICBcImdyYXNzX3RvcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM3OUI5NENcIixcbiAgICAgIFwicm9sZVwiOiBcInRlcnJhaW4gdG9wLCBsb3cgZWxldmF0aW9uXCJcbiAgICB9LFxuICAgIFwiZ3Jhc3NfaGlnaFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM4RkM5NUVcIixcbiAgICAgIFwicm9sZVwiOiBcInRlcnJhaW4gdG9wLCBtaWQgZWxldmF0aW9uXCJcbiAgICB9LFxuICAgIFwiZ3Jhc3NfcGVha1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QUQwNkFcIixcbiAgICAgIFwicm9sZVwiOiBcInRlcnJhaW4gdG9wLCBoaWdoIGVsZXZhdGlvblwiXG4gICAgfSxcbiAgICBcImdyYXNzX2NhcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM1RTk0NDBcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYmFuZCAwLjAtMC40IG0gYmVsb3cgdG9wXCJcbiAgICB9LFxuICAgIFwic3RyYXRhX29jaHJlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0M5OUE1RlwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBiYW5kIDAuNC0wLjYyIG0gYmVsb3cgdG9wXCJcbiAgICB9LFxuICAgIFwic3RyYXRhX3J1c3RcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjQ2MzNDXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJhbmQgMC42Mi0wLjgwIG0gYmVsb3cgdG9wXCJcbiAgICB9LFxuICAgIFwic3RvbmVfdG9wXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U2REZDQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwiYmFyZSBzdG9uZSB0b3Agc3VyZmFjZVwiXG4gICAgfSxcbiAgICBcInN0b25lX2JvZHlfYVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEQ0QzQkVcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYm9keSwgZXZlbiA0LjUgbSBiYW5kXCJcbiAgICB9LFxuICAgIFwic3RvbmVfYm9keV9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0QxQzdBRlwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBib2R5LCBvZGQgNC41IG0gYmFuZFwiXG4gICAgfSxcbiAgICBcInN0b25lX3NoYWRlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0I5QUU5NlwiLFxuICAgICAgXCJyb2xlXCI6IFwiY3JldmljZSAvIHJlY2Vzc2VkIHN0b25lIGFjY2VudFwiXG4gICAgfSxcbiAgICBcInNhbmRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTNEM0E2XCIsXG4gICAgICBcInJvbGVcIjogXCJzaG9yZSBjZWxsc1wiXG4gICAgfSxcbiAgICBcIndhdGVyX3NoYWxsb3dcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNjdDRkQ4XCIsXG4gICAgICBcInJvbGVcIjogXCJ3YXRlciBkZXB0aCA8PSAwLjUgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX21pZFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMzQUFGQzRcIixcbiAgICAgIFwicm9sZVwiOiBcIndhdGVyIGRlcHRoIH4xLjUgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX2RlZXBcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMkE4RkE4XCIsXG4gICAgICBcInJvbGVcIjogXCJ3YXRlciBkZXB0aCA+PSA0LjAgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX3JpbVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCRkVBRjBcIixcbiAgICAgIFwicm9sZVwiOiBcInNob3JlbGluZSByaW0gLyBmb2FtIHRpbnRcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfZ3JlZW5fYVwiOiB7XG4gICAgICBcImhleFwiOiBcIiM1RkE4M0ZcIixcbiAgICAgIFwicm9sZVwiOiBcImdyZWVuIGNhbm9weSwgc2hhZGUgbWFzc1wiXG4gICAgfSxcbiAgICBcImNhbm9weV9ncmVlbl9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZGQjg0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JlZW4gY2Fub3B5LCBtYWluIG1hc3NcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfZ3JlZW5fY1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM3RkMzNTZcIixcbiAgICAgIFwicm9sZVwiOiBcImdyZWVuIGNhbm9weSwgaGlnaGxpZ2h0IG1hc3NcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfcGlua1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNGMkE2QzRcIixcbiAgICAgIFwicm9sZVwiOiBcImJsb3Nzb20gYWNjZW50IHNwZWNpZXMgb25seVwiXG4gICAgfSxcbiAgICBcImNhbm9weV9waW5rX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTg4RkIyXCIsXG4gICAgICBcInJvbGVcIjogXCJibG9zc29tIHNoYWRlIG1hc3NcIlxuICAgIH0sXG4gICAgXCJ0cnVua1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM2QjRBMzNcIixcbiAgICAgIFwicm9sZVwiOiBcInRyZWUgdHJ1bmtzXCJcbiAgICB9LFxuICAgIFwiYmFya19kYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzRFMzYyNlwiLFxuICAgICAgXCJyb2xlXCI6IFwidHJ1bmsgc2hhZGUsIHN0dW1wc1wiXG4gICAgfSxcbiAgICBcIm9yZV9jcnlzdGFsXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzdCNUFENlwiLFxuICAgICAgXCJyb2xlXCI6IFwib3JlIGRlcG9zaXQgYWNjZW50IChwcm9wb3NlZCwgcmVwbGFjZXMgdGVhbClcIlxuICAgIH0sXG4gICAgXCJvcmVfY3J5c3RhbF9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlCN0JFOFwiLFxuICAgICAgXCJyb2xlXCI6IFwib3JlIGhpZ2hsaWdodCBmYWNldFwiXG4gICAgfSxcbiAgICBcIm5veGVsX3N0b25lXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U2REZDQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwiTm94ZWwgYXJjaGl0ZWN0dXJlIG1haW4gc3RvbmVcIlxuICAgIH0sXG4gICAgXCJub3hlbF9zdG9uZV9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0QzQzlCNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiTm94ZWwgc2Vjb25kYXJ5IHN0b25lIC8gcmVjZXNzXCJcbiAgICB9LFxuICAgIFwiYWNjZW50X2JsdWVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0U3RkI4XCIsXG4gICAgICBcInJvbGVcIjogXCJiYW5uZXIgLyBjbG90aCBhY2NlbnRcIlxuICAgIH0sXG4gICAgXCJhY2NlbnRfdGVhbFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMyRkE2QTBcIixcbiAgICAgIFwicm9sZVwiOiBcInNlY29uZGFyeSBhY2NlbnRcIlxuICAgIH0sXG4gICAgXCJlbWlzc2l2ZV9maXJlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0ZGOUU0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2FtcGZpcmUgLyB3YXJtIGVtaXNzaXZlIChlZmZlY3RzIG9ubHkpXCJcbiAgICB9LFxuICAgIFwiZW1pc3NpdmVfbWFnaWNcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDI0QkZGXCIsXG4gICAgICBcInJvbGVcIjogXCJyZXNlcnZlZDogbWFnaWMgZWZmZWN0cyBvbmx5LCBuZXZlciBtYXRlcmlhbHNcIlxuICAgIH1cbiAgfSxcbiAgXCJsaWdodGluZ1wiOiB7XG4gICAgXCJkYXduXCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDEyLFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDEwNSxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjRkZDNzlBXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAyLjIsXG4gICAgICBcImhlbWlTa3lcIjogXCIjOEZBNkM4XCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjNEU1RjZFXCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMC42LFxuICAgICAgXCJza3lcIjogXCIjQThCRUQ2XCIsXG4gICAgICBcImZvZ1wiOiBcIiNBOEJFRDZcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwNSxcbiAgICAgIFwiZXhwb3N1cmVcIjogMS4xXG4gICAgfSxcbiAgICBcIm5vb25cIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogMzgsXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogNTAsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0ZGRjREQ1wiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMi43NSxcbiAgICAgIFwiaGVtaVNreVwiOiBcIiNCRkQ5RjJcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiM3QThGNTVcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAwLjU1LFxuICAgICAgXCJza3lcIjogXCIjOUVEMkVFXCIsXG4gICAgICBcImZvZ1wiOiBcIiNEQ0VGRjhcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwMjgsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuMDVcbiAgICB9LFxuICAgIFwiZHVza1wiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiA5LFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDI1MCxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjRkZCMjdBXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAzLjIsXG4gICAgICBcImhlbWlTa3lcIjogXCIjOEU3QzlFXCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjNUE0QTUwXCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMS4xLFxuICAgICAgXCJza3lcIjogXCIjQzk4RTg2XCIsXG4gICAgICBcImZvZ1wiOiBcIiNDMDkwOEFcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwMzYsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuMzJcbiAgICB9LFxuICAgIFwibmlnaHRcIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogNDAsXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogMjIwLFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNBRkM4RkZcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDEuMCxcbiAgICAgIFwiaGVtaVNreVwiOiBcIiMzQTRDN0FcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiMxQzI1NDBcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAxLjA1LFxuICAgICAgXCJza3lcIjogXCIjMTAxNzM2XCIsXG4gICAgICBcImZvZ1wiOiBcIiMxNTFDM0NcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwNDUsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuNVxuICAgIH1cbiAgfVxufSIsICIvLyBQcml2YXRlIG1pZ3JhdGlvbiByZXBsYXkgb25seS4gUmV0aXJlZCBlbnRpdGllcyBsaXZlIGluIHRoaXMgV29ybGQgd2hpbGUgYW5cbi8vIGFjY2VwdGVkIGhpc3RvcmljYWwgam91cm5hbCBpcyBjaGVja2VkOyBubyBwdWJsaWMgY29tbWFuZCBlbmFibGVzIHRoaXMgbW9kZS5cbmludGVyZmFjZSBSZXBsYXlTdGF0ZSB7XG4gIGFjdGl2ZTogYm9vbGVhbjtcbiAgaGlzdG9yaWNhbEhhc2g6IGJvb2xlYW47XG4gIG1pZ3JhdGVkOiBib29sZWFuO1xufVxuXG5jb25zdCBzdGF0ZXMgPSBuZXcgV2Vha01hcDxvYmplY3QsIFJlcGxheVN0YXRlPigpO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZDogb2JqZWN0KTogUmVwbGF5U3RhdGUge1xuICBsZXQgc3RhdGUgPSBzdGF0ZXMuZ2V0KHdvcmxkKTtcbiAgaWYgKCFzdGF0ZSkgeyBzdGF0ZSA9IHsgYWN0aXZlOiBmYWxzZSwgaGlzdG9yaWNhbEhhc2g6IGZhbHNlLCBtaWdyYXRlZDogZmFsc2UgfTsgc3RhdGVzLnNldCh3b3JsZCwgc3RhdGUpOyB9XG4gIHJldHVybiBzdGF0ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZVN0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgY29uc3Qgc3RhdGUgPSByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKTtcbiAgc3RhdGUuYWN0aXZlID0gdHJ1ZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xuICBzdGF0ZS5taWdyYXRlZCA9IGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8uYWN0aXZlID8/IGZhbHNlO1xufVxuXG4vKiogU25hcHNob3QgaGFzaGVzIGJlZm9yZSBhbmQgZHVyaW5nIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5IGluY2x1ZGUgc3RvbmVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZUhpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5oaXN0b3JpY2FsSGFzaCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0hpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lmhpc3RvcmljYWxIYXNoID8/IGZhbHNlO1xufVxuXG4vKiogQSBtaWdyYXRlZCBzbmFwc2hvdCBhbHJlYWR5IGhhcyByZXRpcmVtZW50IHRvbWJzdG9uZXMgaW4gZ2VuZXJhdGVkIGNodW5rcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIHJlcGxheVN0b25lU3RhdGUod29ybGQpLm1pZ3JhdGVkID0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8ubWlncmF0ZWQgPz8gZmFsc2U7XG59XG5cbi8qKiBFeGl0IGhpc3RvcmljYWwgbW9kZSBhZnRlciBhbGwgYWNjZXB0ZWQgY29tbWFuZHMgYW5kIGhhc2hlcyBoYXZlIHBhc3NlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5pc2hTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IGZhbHNlO1xuICBzdGF0ZS5oaXN0b3JpY2FsSGFzaCA9IGZhbHNlO1xuICBzdGF0ZS5taWdyYXRlZCA9IHRydWU7XG59XG4iLCAiLy8gU2ltdWxhdGlvbiBsYXllciBcdTIwMTQgcHVyZSBUeXBlU2NyaXB0LCBubyB0aHJlZS5qcyBpbXBvcnRzIChELTAwNSkuXG4vL1xuLy8gTTAwMSB3b3JsZCBmb3VuZGF0aW9uOiBhIGNodW5rZWQsIGdlbnVpbmVseSB0aHJlZS1kaW1lbnNpb25hbCB2b3hlbCB3b3JsZC5cbi8vIFRoZSBzdG9yZWQgc3RhdGUgaXMgb25lIG1hdGVyaWFsIGJ5dGUgcGVyIGNlbGwgKDAgPSBhaXIpOyBvY2N1cGFuY3kgaXNcbi8vIGltcGxpY2l0LiBTdXJmYWNlIGhlaWdodCBpcyBhIGRlcml2ZWQgcXVlcnksIG5vdCB0aGUgc3RvcmFnZS4gVGhpcyByZXBsYWNlc1xuLy8gdGhlIGZvcm1lciAyNTYgeCAyNTYgaGVpZ2h0ZmllbGQgKHNlZSBJUi0wMDUpLlxuLy9cbi8vIFdvcmxkIG1ldHJlczogeC96IGluIFstMTAyNCwgMTAyNCksIHkgaW4gWy0xNiwgMTEyKSwgc2VhIGxldmVsIDAuXG4vLyBBIGNodW5rIGlzIDMyIHggMzIgeCAxMjggY2VsbHMuIEdlbmVyYXRpb24gaXMgYSBwdXJlIGZ1bmN0aW9uIG9mIHRoZSBzZWVkLFxuLy8gZ2VuZXJhdG9yIHZlcnNpb24sIHBhcmFtZXRlcnMgYW5kIGNodW5rIGNvb3JkaW5hdGVzOyBlZGl0cyBhcmUgcmVjb3JkZWRcbi8vIHNlcGFyYXRlbHkgYW5kIHJlLWFwcGxpZWQgd2hlbiBhIGNodW5rIGlzIHJlZ2VuZXJhdGVkLlxuaW1wb3J0IHR5cGUgeyBTdHJ1Y3R1cmUgfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHR5cGUgeyBMaWZlU3RhdGUgfSBmcm9tICcuL2Vjb25vbXknO1xuaW1wb3J0IHsgaXNTdG9uZVJlcGxheSB9IGZyb20gJy4vc3RvbmUtY29tcGF0JztcblxuZXhwb3J0IGNvbnN0IFdPUkxEX1NJWkUgPSAyMDQ4O1xuZXhwb3J0IGNvbnN0IEhBTEYgPSBXT1JMRF9TSVpFIC8gMjtcbmV4cG9ydCBjb25zdCBDSFVOS19TSVpFID0gMzI7XG5leHBvcnQgY29uc3QgQ0hVTktTX1BFUl9TSURFID0gV09STERfU0laRSAvIENIVU5LX1NJWkU7XG5leHBvcnQgY29uc3QgWV9NSU4gPSAtMTY7XG5leHBvcnQgY29uc3QgWV9NQVggPSAxMTI7XG5leHBvcnQgY29uc3QgV09STERfSEVJR0hUID0gWV9NQVggLSBZX01JTjtcbmV4cG9ydCBjb25zdCBTRUFfTEVWRUwgPSAwO1xuZXhwb3J0IGNvbnN0IFdBVEVSID0gU0VBX0xFVkVMO1xuZXhwb3J0IGNvbnN0IEdFTkVSQVRPUl9WRVJTSU9OID0gMTtcbmV4cG9ydCBjb25zdCBDSFVOS19WT0xVTUUgPSBDSFVOS19TSVpFICogQ0hVTktfU0laRSAqIFdPUkxEX0hFSUdIVDtcbmV4cG9ydCBjb25zdCBDSFVOS19BUkVBID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkU7XG5cbmV4cG9ydCBjb25zdCBNQVQgPSB7XG4gIEFJUjogMCxcbiAgR1JBU1M6IDEsXG4gIFNPSUw6IDIsXG4gIFNBTkQ6IDMsXG4gIEdSQVZFTDogNCxcbiAgU1RPTkU6IDUsXG4gIE9SRTogNixcbiAgV0FURVI6IDcsXG4gIEJFRFJPQ0s6IDgsXG4gIE1PU1M6IDksXG59IGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgTWF0SWQgPSAodHlwZW9mIE1BVClba2V5b2YgdHlwZW9mIE1BVF07XG5cbmV4cG9ydCBjb25zdCBpc1NvbGlkID0gKG06IG51bWJlcik6IGJvb2xlYW4gPT4gbSAhPT0gTUFULkFJUiAmJiBtICE9PSBNQVQuV0FURVI7XG5leHBvcnQgY29uc3QgaXNPcGFxdWUgPSBpc1NvbGlkO1xuXG5leHBvcnQgY29uc3QgY2xhbXAgPSAodjogbnVtYmVyLCBhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gKHYgPCBhID8gYSA6IHYgPiBiID8gYiA6IHYpO1xuZXhwb3J0IGNvbnN0IGxlcnAgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIsIHQ6IG51bWJlcikgPT4gYSArIChiIC0gYSkgKiB0O1xuY29uc3Qgc21vb3Roc3RlcCA9IChlMDogbnVtYmVyLCBlMTogbnVtYmVyLCB4OiBudW1iZXIpID0+IHtcbiAgY29uc3QgdCA9IGNsYW1wKCh4IC0gZTApIC8gKGUxIC0gZTApLCAwLCAxKTtcbiAgcmV0dXJuIHQgKiB0ICogKDMgLSAyICogdCk7XG59O1xuXG4vLyAtLS0tLS0tLS0tIGRldGVybWluaXN0aWMgaGFzaCAvIG5vaXNlIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBoYXNoMmkoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gc2VlZCBeIE1hdGguaW11bCh4LCAzNzQ3NjEzOTMpIF4gTWF0aC5pbXVsKHksIDY2ODI2NTI2Myk7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxMyksIDEyNzQxMjYxNzcpO1xuICByZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc2gzaSh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpIF4gTWF0aC5pbXVsKHosIDIyNDY4MjI1MTkpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtdWxiZXJyeTMyKHNlZWQ6IG51bWJlcik6ICgpID0+IG51bWJlciB7XG4gIGxldCBhID0gc2VlZCA+Pj4gMDtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBhID0gKGEgKyAweDZkMmI3OWY1KSA+Pj4gMDtcbiAgICBsZXQgdCA9IGE7XG4gICAgdCA9IE1hdGguaW11bCh0IF4gKHQgPj4+IDE1KSwgdCB8IDEpO1xuICAgIHQgXj0gdCArIE1hdGguaW11bCh0IF4gKHQgPj4+IDcpLCB0IHwgNjEpO1xuICAgIHJldHVybiAoKHQgXiAodCA+Pj4gMTQpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xuICB9O1xufVxuXG5jb25zdCBzbW9vdGggPSAodDogbnVtYmVyKSA9PiB0ICogdCAqICgzIC0gMiAqIHQpO1xuXG5mdW5jdGlvbiB2YWx1ZU5vaXNlMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgeGkgPSBNYXRoLmZsb29yKHgpLCB5aSA9IE1hdGguZmxvb3IoeSk7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSk7XG4gIGNvbnN0IGEgPSBoYXNoMmkoeGksIHlpLCBzZWVkKSwgYiA9IGhhc2gyaSh4aSArIDEsIHlpLCBzZWVkKTtcbiAgY29uc3QgYyA9IGhhc2gyaSh4aSwgeWkgKyAxLCBzZWVkKSwgZCA9IGhhc2gyaSh4aSArIDEsIHlpICsgMSwgc2VlZCk7XG4gIGNvbnN0IHRvcCA9IGEgKyAoYiAtIGEpICogeGY7XG4gIGNvbnN0IGJvdHRvbSA9IGMgKyAoZCAtIGMpICogeGY7XG4gIHJldHVybiB0b3AgKyAoYm90dG9tIC0gdG9wKSAqIHlmO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmJtMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMih4ICogZnJlcSwgeSAqIGZyZXEsIHNlZWQgKyBpICogMTMxKTtcbiAgICBub3JtICs9IGFtcDtcbiAgICBhbXAgKj0gMC41OyBmcmVxICo9IDI7XG4gIH1cbiAgcmV0dXJuIHN1bSAvIG5vcm07XG59XG5cbmZ1bmN0aW9uIHZhbHVlTm9pc2UzKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpLCB6aSA9IE1hdGguZmxvb3Ioeik7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSksIHpmID0gc21vb3RoKHogLSB6aSk7XG4gIGNvbnN0IGMwMDAgPSBoYXNoM2koeGksIHlpLCB6aSwgc2VlZCksIGMxMDAgPSBoYXNoM2koeGkgKyAxLCB5aSwgemksIHNlZWQpO1xuICBjb25zdCBjMDEwID0gaGFzaDNpKHhpLCB5aSArIDEsIHppLCBzZWVkKSwgYzExMCA9IGhhc2gzaSh4aSArIDEsIHlpICsgMSwgemksIHNlZWQpO1xuICBjb25zdCBjMDAxID0gaGFzaDNpKHhpLCB5aSwgemkgKyAxLCBzZWVkKSwgYzEwMSA9IGhhc2gzaSh4aSArIDEsIHlpLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCBjMDExID0gaGFzaDNpKHhpLCB5aSArIDEsIHppICsgMSwgc2VlZCksIGMxMTEgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppICsgMSwgc2VlZCk7XG4gIGNvbnN0IHgwMCA9IGMwMDAgKyAoYzEwMCAtIGMwMDApICogeGY7XG4gIGNvbnN0IHgxMCA9IGMwMTAgKyAoYzExMCAtIGMwMTApICogeGY7XG4gIGNvbnN0IHgwMSA9IGMwMDEgKyAoYzEwMSAtIGMwMDEpICogeGY7XG4gIGNvbnN0IHgxMSA9IGMwMTEgKyAoYzExMSAtIGMwMTEpICogeGY7XG4gIGNvbnN0IHkwID0geDAwICsgKHgxMCAtIHgwMCkgKiB5ZjtcbiAgY29uc3QgeTEgPSB4MDEgKyAoeDExIC0geDAxKSAqIHlmO1xuICByZXR1cm4geTAgKyAoeTEgLSB5MCkgKiB6Zjtcbn1cblxuZnVuY3Rpb24gZmJtMyh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwLCBhbXAgPSAxLCBmcmVxID0gMSwgbm9ybSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG4gICAgc3VtICs9IGFtcCAqIHZhbHVlTm9pc2UzKHggKiBmcmVxLCB5ICogZnJlcSwgeiAqIGZyZXEsIHNlZWQgKyBpICogMTMxKTtcbiAgICBub3JtICs9IGFtcDtcbiAgICBhbXAgKj0gMC41OyBmcmVxICo9IDI7XG4gIH1cbiAgcmV0dXJuIHN1bSAvIG5vcm07XG59XG5cbi8vIC0tLS0tLS0tLS0gd29ybGQgdHlwZXMgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFBhcmFtcyB7XG4gIHNpemU6IG51bWJlcjtcbiAgY2h1bmtTaXplOiBudW1iZXI7XG4gIHlNaW46IG51bWJlcjtcbiAgeU1heDogbnVtYmVyO1xuICBzZWFMZXZlbDogbnVtYmVyO1xuICBnZW5lcmF0b3JWZXJzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1BBUkFNUzogV29ybGRQYXJhbXMgPSB7XG4gIHNpemU6IFdPUkxEX1NJWkUsXG4gIGNodW5rU2l6ZTogQ0hVTktfU0laRSxcbiAgeU1pbjogWV9NSU4sXG4gIHlNYXg6IFlfTUFYLFxuICBzZWFMZXZlbDogU0VBX0xFVkVMLFxuICBnZW5lcmF0b3JWZXJzaW9uOiBHRU5FUkFUT1JfVkVSU0lPTixcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxDaHVuayB7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIGtleTogc3RyaW5nO1xuICAvKiogeCArIHoqMzIgKyAoeS1ZX01JTikqMTAyNCAqL1xuICBkYXRhOiBVaW50OEFycmF5O1xuICAvKiogdG9wIHNvbGlkIHksIGVuY29kZWQgYXMgKHkgLSBZX01JTiksIDAuLjEyNzsgMCBtZWFucyBubyBzb2xpZC4gKi9cbiAgaGVpZ2h0czogVWludDhBcnJheTtcbiAgLyoqIHRvcCBtYXRlcmlhbCBwZXIgY29sdW1uLiAqL1xuICB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7XG4gIG5vbkFpcjogbnVtYmVyO1xuICBkaXJ0eTogYm9vbGVhbjtcbiAgZ2VuZXJhdGVkQXQ6IG51bWJlcjtcbn1cblxuLy8gTmF0dXJhbCBhc3NldHMgYXJlIHRoZSBwcm9qZWN0J3MgU3R5bCAoYG5hdF9gKSBwaXBlbGluZSAoQVMtMDAxIHYyKSwgbm90XG4vLyBOb3hlbCBhcmNoaXRlY3R1cmUuIE5veGVsIHJlbWFpbnMgdGhlIGh1bWFuLW1hZGUga2l0L3dheXN0b25lL21hcmtlciBzeXN0ZW0uXG4vLyBSZXRpcmVkIG9ubHkgYXMgd29ybGQgY29udGVudC4gVGhlIG5hbWVzIHJlbWFpbiBpbiB0aGUgc2VyaWFsaXplZCB0eXBlIHNvXG4vLyBvbGQgc25hcHNob3RzIGFuZCBhY2NlcHRlZCBoYXJ2ZXN0IGpvdXJuYWxzIGNhbiBiZSBtaWdyYXRlZCB3aXRob3V0IHJlamVjdGluZ1xuLy8gb3RoZXJ3aXNlIHZhbGlkIHNhdmVzLiBHZW5lcmF0aW9uLCBjb2xsaXNpb24gYW5kIGluc3BlY3Rpb24gbmV2ZXIgdXNlIHRoZW0uXG5leHBvcnQgY29uc3QgUkVUSVJFRF9TVE9ORV9LSU5EUyA9IG5ldyBTZXQ8RW50aXR5S2luZD4oW1xuICAnc3R5bF9yb2NrX3NtYWxsJywgJ3N0eWxfcm9ja19tZWRpdW0nLCAnc3R5bF9yb2NrX2xhcmdlJyxcbl0pO1xuZXhwb3J0IGNvbnN0IGlzUmV0aXJlZFN0b25lS2luZCA9IChraW5kOiBFbnRpdHlLaW5kKTogYm9vbGVhbiA9PiBSRVRJUkVEX1NUT05FX0tJTkRTLmhhcyhraW5kKTtcbmV4cG9ydCB0eXBlIEFjdGl2ZUVudGl0eUtpbmQgPSBFeGNsdWRlPEVudGl0eUtpbmQsXG4gICdzdHlsX3JvY2tfc21hbGwnIHwgJ3N0eWxfcm9ja19tZWRpdW0nIHwgJ3N0eWxfcm9ja19sYXJnZSc+O1xuXG5mdW5jdGlvbiBsaXZlRW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IEVudGl0eSB8IG51bGwge1xuICBjb25zdCBlbnRpdHkgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICByZXR1cm4gIWVudGl0eSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpXG4gICAgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGlkKSA/IG51bGwgOiBlbnRpdHk7XG59XG5cbmV4cG9ydCB0eXBlIEVudGl0eUtpbmQgPVxuICB8ICdzdHlsX3RyZWVfc3BpcmUnXG4gIHwgJ3N0eWxfdHJlZV90YWJsZSdcbiAgfCAnc3R5bF90cmVlX2NsdXN0ZXInXG4gIHwgJ3N0eWxfdHJlZV9ibG9zc29tJ1xuICB8ICdzdHlsX3NocnViJ1xuICB8ICdzdHlsX3JvY2tfc21hbGwnXG4gIHwgJ3N0eWxfcm9ja19tZWRpdW0nXG4gIHwgJ3N0eWxfcm9ja19sYXJnZSdcbiAgfCAnc3R5bF9vcmUnXG4gIHwgJ3N0eWxfY2Fpcm4nXG4gIHwgJ3dheXN0b25lJ1xuICB8ICdtYXJrZXInO1xuXG5leHBvcnQgdHlwZSBSZXNvdXJjZVR5cGUgPSAnd29vZCcgfCAnc3RvbmUnIHwgJ29yZScgfCAnZmliZXInO1xuXG5leHBvcnQgaW50ZXJmYWNlIEVudGl0eSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6IEVudGl0eUtpbmQ7XG4gIGNodW5rOiBzdHJpbmc7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBzY2FsZTogbnVtYmVyO1xuICB2YXJpYW50OiBudW1iZXI7XG4gIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsO1xuICByZW1haW5pbmc6IG51bWJlcjtcbiAgeWllbGRQZXJIYXJ2ZXN0OiBudW1iZXI7XG4gIC8qKiBUcnVlIG9uY2UgdGhlIGVudGl0eSBpcyBmdWxseSBkZXBsZXRlZC4gKi9cbiAgaGFydmVzdGVkOiBib29sZWFuO1xuICAvKiogVHJ1ZSBhZnRlciB0aGUgZmlyc3Qgc3VjY2Vzc2Z1bCBoYXJ2ZXN0LCBldmVuIGlmIHlpZWxkIHJlbWFpbnMuICovXG4gIGhhcnZlc3RlZE9uY2U/OiBib29sZWFuO1xuICBwcm92aXNpb25hbDogYm9vbGVhbjtcbiAgYXV0aG9yZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm94ZWxTaXRlIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogJ3dheXN0b25lJyB8ICdtYXJrZXInO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgcHJvdmlzaW9uYWw6IHRydWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVnaW9uSW5mbyB7XG4gIGlkOiBzdHJpbmc7XG4gIGxhYmVsOiBzdHJpbmc7XG4gIHR5cGU6ICdwbGFpbicgfCAnZm9yZXN0JyB8ICdoaWxscycgfCAnaGlnaGxhbmQnIHwgJ3dhdGVyJyB8ICdyaWRnZSc7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIHJ4OiBudW1iZXI7XG4gIHJ6OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRTdGF0cyB7XG4gIGNodW5rc0dlbmVyYXRlZDogbnVtYmVyO1xuICBjaHVua3NFdmljdGVkOiBudW1iZXI7XG4gIHZveGVsc0ZpbGxlZDogbnVtYmVyO1xuICBnZW5lcmF0aW9uTXM6IG51bWJlcjtcbiAgZW50aXRpZXM6IG51bWJlcjtcbiAgdHJlZXM6IG51bWJlcjtcbiAgcGlua1RyZWVzOiBudW1iZXI7XG4gIHBpbmtPdmVyZmxvdzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkIHtcbiAgc2VlZDogbnVtYmVyO1xuICBwYXJhbXM6IFdvcmxkUGFyYW1zO1xuICBjaHVua3M6IE1hcDxzdHJpbmcsIFZveGVsQ2h1bms+O1xuICBlbnRpdGllczogTWFwPHN0cmluZywgRW50aXR5PjtcbiAgZW50aXR5Q2h1bmtzOiBNYXA8c3RyaW5nLCBzdHJpbmdbXT47XG4gIC8qKiBDaHVua3Mgd2hvc2UgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsLWVudGl0eSBzdGF0ZSBoYXMgYmVlbiBjaGFuZ2VkLiAqL1xuICBlbnRpdHlDaGFuZ2VzOiBTZXQ8c3RyaW5nPjtcbiAgLyoqIFRvbWJzdG9uZXMgZm9yIHJlbW92ZWQgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsIGVudGl0aWVzLiAqL1xuICBlbnRpdHlSZW1vdmFsczogU2V0PHN0cmluZz47XG4gIC8qKiBBdXRob3JpdGF0aXZlIGJ1aWx0IHN0cnVjdHVyZXMgKGhvdXNlLCBwYXRoLCB0ZXJyYWNlcywgY3JvcHMpLiAqL1xuICBzdHJ1Y3R1cmVzOiBNYXA8c3RyaW5nLCBTdHJ1Y3R1cmU+O1xuICBzaXRlczogTm94ZWxTaXRlW107XG4gIHJlZ2lvbnM6IFJlZ2lvbkluZm9bXTtcbiAgLyoqIGNodW5rIGtleSAtPiBsb2NhbCB2b3hlbCBpbmRleCAtPiBtYXRlcmlhbC4gRHVyYWJsZSwgY29tcGFjdCBlZGl0cy4gKi9cbiAgZWRpdHM6IE1hcDxzdHJpbmcsIE1hcDxudW1iZXIsIG51bWJlcj4+O1xuICAvKiogR2xvYmFsIGxvY2FsLXBsYXllciBjYXJyaWVkIGJhZzsgYm91bmRlZCBpbiBzY2hlbWEgMywgbGVnYWN5IGluIDEvMi4gKi9cbiAgaW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICAvKiogUHJlc2VudCBvbmx5IGFmdGVyIHNjaGVtYS0zIGdlbmVzaXMvcmVzdG9yYXRpb24uICovXG4gIGxpZmU/OiBMaWZlU3RhdGU7XG4gIGRpcnR5OiBTZXQ8c3RyaW5nPjtcbiAgc3RhdHM6IFdvcmxkU3RhdHM7XG4gIGF1dGhvcmVkUGxhY2VkOiBib29sZWFuO1xuICAvKipcbiAgICogTW9ub3RvbmljIHJldmlzaW9uIG9mIGF1dGhvcml0YXRpdmUgc3RhdGUgKHZveGVscyBhbmQgZW50aXRpZXMpLiBEZXJpdmVkXG4gICAqIGNhY2hlcyBrZXllZCBvbiB0aGlzIHZhbHVlIGFyZSBkaXNjYXJkZWQgYWZ0ZXIgYW4gZWRpdDsgbWVzaC9uYXZpZ2F0aW9uXG4gICAqIHJldmlzaW9ucyBhcmUgc2VwYXJhdGUgYmVjYXVzZSB0aGV5IGFyZSBkZXJpdmVkLCBub3Qgd29ybGQgc3RhdGUuXG4gICAqL1xuICByZXZpc2lvbjogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgY2h1bmtLZXkgPSAoY3g6IG51bWJlciwgY3o6IG51bWJlcikgPT4gYCR7Y3h9LCR7Y3p9YDtcbmV4cG9ydCBjb25zdCBjaHVua09yaWdpblggPSAoY3g6IG51bWJlcikgPT4gY3ggKiBDSFVOS19TSVpFIC0gSEFMRjtcbmV4cG9ydCBjb25zdCBjaHVua09yaWdpblogPSAoY3o6IG51bWJlcikgPT4gY3ogKiBDSFVOS19TSVpFIC0gSEFMRjtcbmV4cG9ydCBjb25zdCBsb2NhbEluZGV4ID0gKGx4OiBudW1iZXIsIHlJbmRleDogbnVtYmVyLCBsejogbnVtYmVyKSA9PlxuICBseCArIGx6ICogQ0hVTktfU0laRSArIHlJbmRleCAqIENIVU5LX0FSRUE7XG5leHBvcnQgY29uc3Qgd29ybGRUb0NodW5rWCA9ICh4OiBudW1iZXIpID0+IE1hdGguZmxvb3IoKHggKyBIQUxGKSAvIENIVU5LX1NJWkUpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9DaHVua1ogPSAoejogbnVtYmVyKSA9PiBNYXRoLmZsb29yKCh6ICsgSEFMRikgLyBDSFVOS19TSVpFKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvTG9jYWxYID0gKHg6IG51bWJlcikgPT4geCAtICh3b3JsZFRvQ2h1bmtYKHgpICogQ0hVTktfU0laRSAtIEhBTEYpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9Mb2NhbFogPSAoejogbnVtYmVyKSA9PiB6IC0gKHdvcmxkVG9DaHVua1ooeikgKiBDSFVOS19TSVpFIC0gSEFMRik7XG5leHBvcnQgY29uc3QgeVRvSW5kZXggPSAoeTogbnVtYmVyKSA9PiB5IC0gWV9NSU47XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVXb3JsZChzZWVkID0gMTMzNyk6IFdvcmxkIHtcbiAgcmV0dXJuIHtcbiAgICBzZWVkLFxuICAgIHBhcmFtczogeyAuLi5ERUZBVUxUX1BBUkFNUyB9LFxuICAgIGNodW5rczogbmV3IE1hcCgpLFxuICAgIGVudGl0aWVzOiBuZXcgTWFwKCksXG4gICAgZW50aXR5Q2h1bmtzOiBuZXcgTWFwKCksXG4gICAgZW50aXR5Q2hhbmdlczogbmV3IFNldCgpLFxuICAgIGVudGl0eVJlbW92YWxzOiBuZXcgU2V0KCksXG4gICAgc3RydWN0dXJlczogbmV3IE1hcCgpLFxuICAgIHNpdGVzOiBbXSxcbiAgICByZWdpb25zOiBSRUdJT05TLFxuICAgIGVkaXRzOiBuZXcgTWFwKCksXG4gICAgaW52ZW50b3J5OiB7fSxcbiAgICBkaXJ0eTogbmV3IFNldCgpLFxuICAgIHN0YXRzOiB7XG4gICAgICBjaHVua3NHZW5lcmF0ZWQ6IDAsIGNodW5rc0V2aWN0ZWQ6IDAsIHZveGVsc0ZpbGxlZDogMCwgZ2VuZXJhdGlvbk1zOiAwLFxuICAgICAgZW50aXRpZXM6IDAsIHRyZWVzOiAwLCBwaW5rVHJlZXM6IDAsIHBpbmtPdmVyZmxvdzogMCxcbiAgICB9LFxuICAgIGF1dGhvcmVkUGxhY2VkOiBmYWxzZSxcbiAgICByZXZpc2lvbjogMCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlV29ybGQoc2VlZCA9IDEzMzcsIGluaXRpYWxSYWRpdXMgPSAwKTogV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHNlZWQpO1xuICBjb25zdCBjZW50cmUgPSBNYXRoLmZsb29yKENIVU5LU19QRVJfU0lERSAvIDIpO1xuICBmb3IgKGxldCBjeiA9IGNlbnRyZSAtIGluaXRpYWxSYWRpdXM7IGN6IDw9IGNlbnRyZSArIGluaXRpYWxSYWRpdXM7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGNlbnRyZSAtIGluaXRpYWxSYWRpdXM7IGN4IDw9IGNlbnRyZSArIGluaXRpYWxSYWRpdXM7IGN4KyspIHtcbiAgICAgIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gICAgfVxuICB9XG4gIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZCk7XG4gIHJldHVybiB3b3JsZDtcbn1cblxuLy8gLS0tLS0tLS0tLSBnZW9ncmFwaHkgLS0tLS0tLS0tLVxuZXhwb3J0IGNvbnN0IFJFR0lPTlM6IFJlZ2lvbkluZm9bXSA9IFtcbiAgeyBpZDogJ2ZvdW5kZXInLCBsYWJlbDogJ0ZvdW5kZXIgdmFsbGV5JywgdHlwZTogJ3BsYWluJywgY3g6IDAsIGN6OiAwLCByeDogMTEwLCByejogODUgfSxcbiAgeyBpZDogJ2Vhc3R3b29kJywgbGFiZWw6ICdFYXN0d29vZCcsIHR5cGU6ICdmb3Jlc3QnLCBjeDogMjIwLCBjejogLTExMCwgcng6IDI2MCwgcno6IDIyMCB9LFxuICB7IGlkOiAnY3Jvd24nLCBsYWJlbDogJ0Nyb3duIGhpZ2hsYW5kcycsIHR5cGU6ICdoaWdobGFuZCcsIGN4OiAtMzYwLCBjejogLTMwMCwgcng6IDM4MCwgcno6IDMwMCB9LFxuICB7IGlkOiAnbGFrZScsIGxhYmVsOiAnTWlycm9yIGxha2UnLCB0eXBlOiAnd2F0ZXInLCBjeDogLTI2MCwgY3o6IC0yMzAsIHJ4OiAxMjAsIHJ6OiA5NSB9LFxuICB7IGlkOiAnc291dGhkb3ducycsIGxhYmVsOiAnU291dGggZG93bnMnLCB0eXBlOiAnaGlsbHMnLCBjeDogMTIwLCBjejogMzMwLCByeDogMjYwLCByejogMTkwIH0sXG4gIHsgaWQ6ICd3ZXN0cmlzZScsIGxhYmVsOiAnV2VzdCByaXNlJywgdHlwZTogJ2hpbGxzJywgY3g6IC0zNjAsIGN6OiAxMjAsIHJ4OiAyMjAsIHJ6OiAyMTAgfSxcbiAgeyBpZDogJ2NvYXN0JywgbGFiZWw6ICdCcm9rZW4gY29hc3QnLCB0eXBlOiAncmlkZ2UnLCBjeDogMCwgY3o6IDAsIHJ4OiA3ODAsIHJ6OiA2NjAgfSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckNlbnRlclgoejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVGhlIHJpdmVyIHJ1bnMgbm9ydGhcdTIwMTNzb3V0aCBhYm91dCA3MFx1MjAxMzExMCBtIHdlc3Qgb2YgdGhlIGZvdW5kZXIgc2hlbGYsIHNvXG4gIC8vIHRoZSBkZWZhdWx0IG5vcnRoLXdlc3QgdmlldyBoYXMgd2F0ZXIsIGEgbmVhciBiYW5rIGFuZCBhIGZhciBiYW5rLlxuICByZXR1cm4gLTkwICsgNTUgKiBNYXRoLnNpbigoeiArIDEwMCkgLyAyNDApICsgMTggKiBNYXRoLnNpbigoeiAtIDIwKSAvIDgwKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJpdmVyRGlzdGFuY2UoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5hYnMoeCAtIHJpdmVyQ2VudGVyWCh6KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsYWtlRGlzdGFuY2UoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5zcXJ0KCgoeCArIDI2MCkgLyAxMjApICoqIDIgKyAoKHogKyAyMzApIC8gOTUpICoqIDIpO1xufVxuXG4vKipcbiAqIEludGVnZXIgdG9wIHNvbGlkIHkgb2YgdGhlIGJhc2UgZ2VuZXJhdGVkIHN1cmZhY2UgKG5vIGVkaXRzL292ZXJoYW5ncykuXG4gKlxuICogVGhpcyBpcyB0aGUgKnNoYXBlKiB0aGUgdm94ZWwgdm9sdW1lIGlzIGZpbGxlZCBmcm9tLCBub3QgdGhlIHN0b3JlZCB3b3JsZC5cbiAqIFRoZSBpbXBvcnRhbnQgY29ycmVjdGlvbiBvdmVyIHRoZSBmaXJzdCBNMDAxIHBhc3MgaXMgdGhhdCB0aGUgbGFuZHNjYXBlIGlzXG4gKiBub3Qgb25lIHNtb290aCByYWRpYWwgYm93bDogaXQgaXMgYSB3YXJwZWQgbXVsdGktc2NhbGUgc3VyZmFjZSB3aXRoIGEgYnJvYWRcbiAqIHJpdmVyIHZhbGxleSwgYSBzbWFsbCBidWlsZGFibGUgc2hlbGYsIGFuZCByaWRnZWQgaGlnaGxhbmRzLiBBIHNoYWxsb3dcbiAqIHNtb290aCBzdXJmYWNlIHF1YW50aXNlZCB0byAxIG0gdm94ZWxzIGlzIHdoYXQgcHJvZHVjZWQgdGhlIGNvbmNlbnRyaWNcbiAqIGNvbnRvdXIgcmluZ3M7IHZhcmllZCByZWxpZWYgYW5kIGEgcml2ZXIgdmFsbGV5IGJyZWFrIHRoZW0gbmF0dXJhbGx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3VyZmFjZUhlaWdodEF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAvLyBUd28tc2NhbGUgZG9tYWluIHdhcnAuIFRoZSBicm9hZCB3YXJwIG1vdmVzIGNvYXN0bGluZXMgYW5kIGhpbGxzOyB0aGVcbiAgLy8gc21hbGwgd2FycCBrZWVwcyB0aGUgMSBtIHF1YW50aXNhdGlvbiBmcm9tIGZvbGxvd2luZyBjbGVhbiBjb250b3Vycy5cbiAgY29uc3Qgd3ggPSB4XG4gICAgKyAoZmJtMih4IC8gNDIwLCB6IC8gNDIwLCBzZWVkICsgMTAxLCAzKSAtIDAuNSkgKiAyNDBcbiAgICArIChmYm0yKHggLyA5NSwgeiAvIDk1LCBzZWVkICsgMTAyLCAyKSAtIDAuNSkgKiAzMDtcbiAgY29uc3Qgd3ogPSB6XG4gICAgKyAoZmJtMih4IC8gNDIwICsgNy4zLCB6IC8gNDIwIC0gMy4xLCBzZWVkICsgMTAzLCAzKSAtIDAuNSkgKiAyNDBcbiAgICArIChmYm0yKHggLyA5NSArIDMuNywgeiAvIDk1IC0gOC4xLCBzZWVkICsgMTA0LCAyKSAtIDAuNSkgKiAzMDtcblxuICBjb25zdCByYWRpYWwgPSBNYXRoLnNxcnQoKHd4IC8gNzgwKSAqKiAyICsgKHd6IC8gNjYwKSAqKiAyKTtcbiAgY29uc3QgY29hc3ROb2lzZSA9IChmYm0yKHd4IC8gMzAwLCB3eiAvIDMwMCwgc2VlZCArIDEwNSwgNCkgLSAwLjUpICogMC4zNFxuICAgICsgKGZibTIod3ggLyA5NSwgd3ogLyA5NSwgc2VlZCArIDEwNiwgMikgLSAwLjUpICogMC4xMDtcbiAgY29uc3QgbGFuZG5lc3MgPSAxLjAgLSByYWRpYWwgKyBjb2FzdE5vaXNlO1xuICBjb25zdCBpbmxhbmQgPSBzbW9vdGhzdGVwKC0wLjAzLCAwLjEyLCBsYW5kbmVzcyk7XG5cbiAgY29uc3Qgb2NlYW5GbG9vciA9IC0xMyArIDYgKiBmYm0yKHd4IC8gMTcwLCB3eiAvIDE3MCwgc2VlZCArIDEwNywgMyk7XG5cbiAgLy8gUm9sbGluZyBsYW5kIGF0IHRocmVlIHNjYWxlcy4gVGhlIDQwIG0gYW5kIDE1IG0gY29tcG9uZW50cyBhcmUgcmVhbFxuICAvLyBzdXJmYWNlIGhlaWdodCwgbm90IGEgcmVuZGVyIGRlY29yYXRpb24sIHNvIHRoZSBtYWNybyBzYW1wbGVyIGFncmVlcy5cbiAgY29uc3Qgc3dlbGwgPSA0ICsgMTEgKiBmYm0yKHd4IC8gMzQwLCB3eiAvIDM0MCwgc2VlZCArIDEwOCwgNCk7XG4gIGNvbnN0IGhpbGxzID0gOCAqIGZibTIod3ggLyAxMTUsIHd6IC8gMTE1LCBzZWVkICsgMTA5LCAzKTtcbiAgY29uc3QgYnVtcHMgPSAyLjIgKiBmYm0yKHggLyA0MiwgeiAvIDQyLCBzZWVkICsgMTEwLCAyKVxuICAgICsgMC45ICogZmJtMih4IC8gMTUsIHogLyAxNSwgc2VlZCArIDExMSwgMik7XG5cbiAgLy8gUmlkZ2VkIGhpZ2hsYW5kcy4gVGhlIG1hc3NpZiBtYXNrIGlzIHJlZ2lvbmFsIGFuZCBiaWFzZWQgdG8gdGhlXG4gIC8vIG5vcnRoLXdlc3Q7IHdpdGhvdXQgdGhlIHJlZ2lvbmFsIGdhdGUgdGhlIGZpcnN0IE0wMDEgcGFzcyByYWlzZWQgYSA0OCBtXG4gIC8vIG1vdW50YWluIGRpcmVjdGx5IHVuZGVyIHRoZSBmb3VuZGVyIHNoZWxmLlxuICBjb25zdCBtYXNzaWZOb2lzZSA9IGZibTIod3ggLyA0ODAgKyAxMSwgd3ogLyA0ODAgLSA3LCBzZWVkICsgMTEyLCA0KTtcbiAgY29uc3QgbWFzc2lmTWFzayA9IHNtb290aHN0ZXAoMC42MCwgMC43OCwgbWFzc2lmTm9pc2UpO1xuICBjb25zdCByaWRnZSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDIzMCwgd3ogLyAyMzAsIHNlZWQgKyAxMTMsIDQpIC0gMSk7XG4gIGNvbnN0IHJpZGdlMiA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDkwLCB3eiAvIDkwLCBzZWVkICsgMTE0LCAzKSAtIDEpO1xuICBjb25zdCBud0JpYXMgPSBNYXRoLmV4cCgtKCgod3ggKyAzNjApIC8gMzgwKSAqKiAyICsgKCh3eiArIDMwMCkgLyAzMjApICoqIDIpKTtcbiAgY29uc3QgbW91bnQgPSBNYXRoLm1pbigxLCBtYXNzaWZNYXNrICogKDAuMzAgKyAwLjcwICogbndCaWFzKSArIDAuMjIgKiBud0JpYXMpO1xuXG4gIGxldCBoID0gc3dlbGwgKyBoaWxscyArIGJ1bXBzXG4gICAgKyBtb3VudCAqICgyMCArIDQwICogcmlkZ2UgKiByaWRnZSArIDEyICogcmlkZ2UyKTtcblxuICAvLyBTcHVycyBhbmQgZ3VsbGllcyBhdCAzMFx1MjAxMzkwIG0uIFdpdGhvdXQgdGhlc2UsIGEgc21vb3RoIGhpbGwgcXVhbnRpc2VkIHRvXG4gIC8vIDEgbSB2b3hlbHMgcmVhZHMgYXMgY29uY2VudHJpYyBjb250b3VyIHJpbmdzOyB3aXRoIHRoZW0sIHRoZSBzYW1lIGhpbGxcbiAgLy8gYnJlYWtzIGludG8gcmlkZ2VzLCBzaWRlIHZhbGxleXMgYW5kIHJvY2sgZmFjZXMuXG4gIGNvbnN0IHNwdXIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA4NSwgd3ogLyA4NSwgc2VlZCArIDEyMCwgMykgLSAxKTtcbiAgY29uc3QgZ3VsbHkgPSBNYXRoLnBvdygxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA1MiArIDEzLCB3eiAvIDUyIC0gNSwgc2VlZCArIDEyMSwgMykgLSAxKSwgMik7XG4gIGggKz0gKHNwdXIgLSAwLjU1KSAqIDUuMCAtIGd1bGx5ICogMy4yO1xuXG4gIGggPSBvY2VhbkZsb29yICsgKGggLSBvY2VhbkZsb29yKSAqIGlubGFuZDtcbiAgaCArPSAxLjYgKiBzbW9vdGhzdGVwKDAuMCwgMC4xMCwgbGFuZG5lc3MpO1xuXG4gIC8vIEJyb2FkIHJpdmVyIHZhbGxleSwgdGhlbiB0aGUgY2hhbm5lbCBpdHNlbGYuIFRoZSB2YWxsZXkgbWFzayBpcyBnYXRlZCBieVxuICAvLyBsYW5kbmVzczogd2l0aG91dCB0aGUgZ2F0ZSBpdCBwdWxsZWQgdGhlIG9jZWFuIGZsb29yIHVwIHRvIHRoZSB2YWxsZXlcbiAgLy8gZmxvb3Igb3V0c2lkZSB0aGUgaXNsYW5kLCB3aGljaCB0aGUgbWFwIHZpZXcgc2hvd2VkIGFzIHBhbGUgcml2ZXItc2hhcGVkXG4gIC8vIGJhcnMgcnVubmluZyB0byB0aGUgaG9yaXpvbi5cbiAgY29uc3QgcmQgPSByaXZlckRpc3RhbmNlKHd4LCB3eik7XG4gIGNvbnN0IHZhbGxleSA9IHNtb290aHN0ZXAoOTUsIDEwLCByZCkgKiBzbW9vdGhzdGVwKDAuMCwgMC4xMCwgbGFuZG5lc3MpO1xuICBjb25zdCB2YWxsZXlGbG9vciA9IDIuNSArIDEuMCAqIGZibTIod3ggLyA2MCwgd3ogLyA2MCwgc2VlZCArIDExNSwgMik7XG4gIGggPSBsZXJwKGgsIHZhbGxleUZsb29yLCB2YWxsZXkgKiAwLjc1KTtcbiAgY29uc3Qgcml2ZXJXID0gNS4wICsgMy4wICogZmJtMih3eCAvIDQ1LCB3eiAvIDQ1LCBzZWVkICsgMTE2LCAyKTtcbiAgLy8gQSB3aWRlLCBzaGFsbG93IGNoYW5uZWwgcHJvZmlsZS4gVGhlIGZpcnN0IHBhc3MgY2FydmVkIGEgMTIgbSBzbG90IHdpdGhcbiAgLy8gbmVhci12ZXJ0aWNhbCBiYW5rcywgd2hpY2ggcmVhZCBhcyBhIGJyaWdodCBzdG9uZSBxdWFycnkgcmF0aGVyIHRoYW4gYVxuICAvLyByaXZlci4gVGhlIG91dGVyIGVkZ2UgaXMgbm93IH4yNSBtIGZyb20gdGhlIGNlbnRyZWxpbmUsIGFuZCB0aGUgYmVkIGlzXG4gIC8vIG9ubHkgMiBtIGJlbG93IHNlYSBsZXZlbC5cbiAgY29uc3QgY2hhbm5lbCA9IHNtb290aHN0ZXAocml2ZXJXICsgMTgsIHJpdmVyVyAqIDAuNCwgcmQpO1xuICBpZiAobGFuZG5lc3MgPiAwLjApIGggPSBsZXJwKGgsIC0yLjAsIGNoYW5uZWwgKiAwLjk1KTtcblxuICAvLyBMYWtlIGJhc2luIGF0IHRoZSBmb290IG9mIHRoZSBub3J0aC13ZXN0IGhpZ2hsYW5kcy5cbiAgY29uc3QgbGFrZUQgPSBsYWtlRGlzdGFuY2Uod3gsIHd6KVxuICAgICogKDEgKyAwLjE4ICogKGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNywgMikgLSAwLjUpICogMik7XG4gIGlmIChsYWtlRCA8IDEuMTUpIHtcbiAgICBjb25zdCBsYWtlTWFzayA9IHNtb290aHN0ZXAoMS4xNSwgMC41NSwgbGFrZUQpO1xuICAgIGggPSBsZXJwKGgsIC02LjUsIGxha2VNYXNrICogMC45NSk7XG4gIH1cblxuICAvLyBGb3VuZGVyIHNoZWxmOiBhIHNtYWxsLCBpcnJlZ3VsYXIgYnVpbGRhYmxlIHRlcnJhY2Ugb24gdGhlIGVhc3QgYmFuay5cbiAgLy8gRGVsaWJlcmF0ZWx5IG5vdCBhIDI2MCBtIHJhZGlhbCBmbGF0dGVuOyB0aGUgcHJldmlvdXMgcGFzcyBzaG93ZWQgdGhhdCBhXG4gIC8vIGxhcmdlIGZsYXR0ZW4tdG8tY29uc3RhbnQgYmVjb21lcyBhIHZpc2libGUgYm93bCBvZiBjb250b3VyIHJpbmdzLlxuICBjb25zdCBzaGVsZkQgPSBNYXRoLnNxcnQoKCh4ICsgOCkgLyA2MikgKiogMiArICgoeiAtIDQpIC8gNDgpICoqIDIpXG4gICAgKyAoZmJtMih4IC8gNDUsIHogLyA0NSwgc2VlZCArIDExOCwgMikgLSAwLjUpICogMC41NTtcbiAgY29uc3Qgc2hlbGYgPSBzbW9vdGhzdGVwKDEuMDUsIDAuNTUsIHNoZWxmRCk7XG4gIGlmIChzaGVsZiA+IDApIHtcbiAgICBjb25zdCB0YXJnZXQgPSAxMy4wICsgMS4yICogZmJtMih4IC8gMzYsIHogLyAzNiwgc2VlZCArIDExOSwgMikgKyB4ICogMC4wMTtcbiAgICBoID0gbGVycChoLCB0YXJnZXQsIHNoZWxmICogMC43OCk7XG4gIH1cblxuICByZXR1cm4gTWF0aC5yb3VuZChjbGFtcChoLCAtMTQsIDkyKSk7XG59XG5cbmZ1bmN0aW9uIHNsb3BlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCAtIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggKyAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6IC0gMSkpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiArIDEpKSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gdG9wTWF0ZXJpYWxBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcj86IGJvb2xlYW4pOiBNYXRJZCB7XG4gIC8vIFJpdmVyIGJlZCBpcyBncmF2ZWw7IHRoZSBiZWFjaCBpcyBhIG5hcnJvdyBzYW5kIGJhbmQsIG5vdCB0aGUgd2hvbGVcbiAgLy8gdmFsbGV5IGZsb29yLiBUaGUgZmlyc3QgcGFzcyBtYXJrZWQgZXZlcnkgY2VsbCB3aXRoaW4gNCBtIG9mIHNlYSBsZXZlbFxuICAvLyBhcyBzYW5kLCB3aGljaCBwcm9kdWNlZCBhIGNvbnNwaWN1b3VzIHBhbGUgc3RyaXAgYWxvbmcgdGhlIHJpdmVyLlxuICBpZiAocml2ZXJEaXN0YW5jZSh4LCB6KSA8IDEyICYmIGggPCBTRUFfTEVWRUwgKyAxKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgaWYgKGggPD0gU0VBX0xFVkVMICsgMC41KSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmIChuZWFyV2F0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgIG5lYXJXYXRlciA9XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCAtIDMsIHopIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggKyAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6IC0gMykgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiArIDMpIDwgU0VBX0xFVkVMICsgMTtcbiAgfVxuICBpZiAobmVhcldhdGVyICYmIGggPD0gU0VBX0xFVkVMICsgMS41KSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmIChzbG9wZSA+PSAzKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDU4ICYmIGZibTIoeCAvIDE4LCB6IC8gMTgsIHNlZWQgKyAxMjAsIDIpID4gMC40NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0OCAmJiBzbG9wZSA+PSAyKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDQwICYmIHNsb3BlID49IDIgJiYgZmJtMih4IC8gMTIsIHogLyAxMiwgc2VlZCArIDEyMSwgMikgPiAwLjU1KSByZXR1cm4gTUFULlNUT05FO1xuICByZXR1cm4gTUFULkdSQVNTO1xuXG59XG5cbi8qKiBQdWJsaWMgYmFzZS1tYXRlcmlhbCBzZWxlY3RvciBmb3IgbWFjcm8gTE9EIGFuZCB0ZXN0cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlVG9wTWF0ZXJpYWwoXG4gIHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyOiBib29sZWFuLFxuKTogTWF0SWQge1xuICByZXR1cm4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbn1cblxuZnVuY3Rpb24gc3Vic29pbEZvcih0b3A6IE1hdElkKTogTWF0SWQge1xuICBpZiAodG9wID09PSBNQVQuR1JBU1MgfHwgdG9wID09PSBNQVQuTU9TUykgcmV0dXJuIE1BVC5TT0lMO1xuICBpZiAodG9wID09PSBNQVQuU0FORCkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAodG9wID09PSBNQVQuR1JBVkVMKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgcmV0dXJuIE1BVC5TVE9ORTtcbn1cblxuZnVuY3Rpb24gb3JlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGNvbnN0IGNsdXN0ZXIgPSBmYm0yKHggLyA1NSwgeiAvIDU1LCBzZWVkICsgMTMwLCAyKTtcbiAgaWYgKGNsdXN0ZXIgPCAwLjU3KSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IG4gPSB2YWx1ZU5vaXNlMyh4ICogMC4wOSwgeSAqIDAuMTMsIHogKiAwLjA5LCBzZWVkICsgMTMxKTtcbiAgY29uc3QgbjIgPSB2YWx1ZU5vaXNlMyh4ICogMC4yMiArIDUsIHkgKiAwLjMxLCB6ICogMC4yMiAtIDMsIHNlZWQgKyAxMzIpO1xuICByZXR1cm4gbiA+IDAuNzAgJiYgbjIgPiAwLjUwO1xufVxuXG5mdW5jdGlvbiBjYXZlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiBmYm0zKHggKiAwLjA3NSwgeSAqIDAuMTEsIHogKiAwLjA3NSwgc2VlZCArIDE0MCwgMikgPiAwLjcyO1xufVxuXG5mdW5jdGlvbiBvdmVyaGFuZ0F0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gdmFsdWVOb2lzZTMoeCAqIDAuMTgsIHkgKiAwLjIyLCB6ICogMC4xOCwgc2VlZCArIDE0MSkgPiAwLjYyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cmZhY2VTYW1wbGUge1xuICB5OiBudW1iZXI7XG4gIHRvcDogTWF0SWQ7XG4gIHNsb3BlOiBudW1iZXI7XG59XG5cbi8qKiBCYXNlIHN1cmZhY2Ugc2FtcGxlIGZvciBtYWNybyBMT0QuIERvZXMgbm90IGluY2x1ZGUgdm94ZWwgZWRpdHMvb3ZlcmhhbmdzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhbXBsZVN1cmZhY2Uoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFN1cmZhY2VTYW1wbGUge1xuICBjb25zdCB5ID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xuICBjb25zdCBzbG9wZSA9IHNsb3BlQXQoc2VlZCwgeCwgeiwgeSk7XG4gIHJldHVybiB7IHksIHRvcDogdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCB5LCBzbG9wZSksIHNsb3BlIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gY2h1bmsgZ2VuZXJhdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICByZXR1cm4gZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuXG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IGRhdGEgPSBuZXcgVWludDhBcnJheShDSFVOS19WT0xVTUUpO1xuICBjb25zdCBoZWlnaHRzID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSk7XG4gIGNvbnN0IHRvcE1hdGVyaWFscyA9IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjeCksIG96ID0gY2h1bmtPcmlnaW5aKGN6KTtcbiAgY29uc3Qgc2VlZCA9IHdvcmxkLnNlZWQ7XG5cbiAgLy8gUGFkZGVkIGhlaWdodCBjYWNoZTogYSB0aHJlZS1jZWxsIGJvcmRlciBjb3ZlcnMgc2xvcGUsIGJlYWNoIGFuZCBsZWRnZXMuXG4gIGNvbnN0IFAgPSAzO1xuICBjb25zdCBQVyA9IENIVU5LX1NJWkUgKyBQICogMjtcbiAgY29uc3QgYmFzZUggPSBuZXcgSW50MTZBcnJheShQVyAqIFBXKTtcbiAgZm9yIChsZXQgcHogPSAwOyBweiA8IFBXOyBweisrKSB7XG4gICAgZm9yIChsZXQgcHggPSAwOyBweCA8IFBXOyBweCsrKSB7XG4gICAgICBiYXNlSFtweiAqIFBXICsgcHhdID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIG94ICsgcHggLSBQLCBveiArIHB6IC0gUCk7XG4gICAgfVxuICB9XG5cbiAgbGV0IG5vbkFpciA9IDA7XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBseCwgd3ogPSBveiArIGx6O1xuICAgICAgY29uc3QgaCA9IGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQKV07XG4gICAgICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCAtIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCArIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IG5lYXJXYXRlciA9XG4gICAgICAgIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMyldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCAtIDMpICogUFcgKyAobHggKyBQKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgKyAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMTtcbiAgICAgIGNvbnN0IHRvcCA9IHRvcE1hdGVyaWFsQXQoc2VlZCwgd3gsIHd6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbiAgICAgIGNvbnN0IHN1YiA9IHN1YnNvaWxGb3IodG9wKTtcbiAgICAgIGNvbnN0IG9yZVBvdGVudGlhbCA9IGZibTIod3ggLyA1NSwgd3ogLyA1NSwgc2VlZCArIDEzMCwgMikgPiAwLjU3O1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG5cbiAgICAgIGNvbnN0IHN0YXJ0ID0gWV9NSU47XG4gICAgICBjb25zdCBlbmQgPSBNYXRoLm1pbihZX01BWCAtIDEsIGggLSAxKTtcbiAgICAgIGZvciAobGV0IHkgPSBzdGFydDsgeSA8PSBlbmQ7IHkrKykge1xuICAgICAgICBjb25zdCBkZXB0aCA9IGggLSAxIC0geTtcbiAgICAgICAgbGV0IG06IE1hdElkO1xuICAgICAgICBpZiAoeSA9PT0gWV9NSU4pIG0gPSBNQVQuQkVEUk9DSztcbiAgICAgICAgZWxzZSBpZiAoZGVwdGggPT09IDApIG0gPSB0b3A7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoIDw9IDIpIG0gPSBzdWI7XG4gICAgICAgIGVsc2UgbSA9IE1BVC5TVE9ORTtcblxuICAgICAgICBpZiAobSA9PT0gTUFULlNUT05FICYmIGRlcHRoID4gNCAmJiBvcmVQb3RlbnRpYWwgJiYgb3JlQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuT1JFO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU3BhcnNlIDNEIG92ZXJoYW5ncy91bmRlcmN1dHMgYXQgc3RlZXAgZmFjZXMuIFRoaXMgaXMgYSByZWFsXG4gICAgICAgIC8vIG9jY3VwYW5jeSBjaGFuZ2UsIG5vdCBhIGRlY29yYXRpb24gb24gdG9wIG9mIGEgaGVpZ2h0ZmllbGQuXG4gICAgICAgIGlmIChkZXB0aCA8PSAyICYmIHNsb3BlID49IDIgJiYgb3ZlcmhhbmdBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5BSVI7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGVlcCBjYXZlcywga2VwdCBhd2F5IGZyb20gdGhlIHN1cmZhY2Ugc28gdGhleSBkbyBub3QgY3JlYXRlIGhvbGVzLlxuICAgICAgICBpZiAobSAhPT0gTUFULkFJUiAmJiBkZXB0aCA+IDcgJiYgZGVwdGggPCAyNCAmJiBjYXZlQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIpIHtcbiAgICAgICAgICBkYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildID0gbTtcbiAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBXYXRlciB2b2x1bWU6IGV2ZXJ5dGhpbmcgYWJvdmUgdGhlIHNvbGlkIHN1cmZhY2UgdXAgdG8gc2VhIGxldmVsLlxuICAgICAgaWYgKGggPCBTRUFfTEVWRUwpIHtcbiAgICAgICAgZm9yIChsZXQgeSA9IE1hdGgubWF4KFlfTUlOLCBoKTsgeSA8IFNFQV9MRVZFTDsgeSsrKSB7XG4gICAgICAgICAgY29uc3QgaWR4ID0gbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KTtcbiAgICAgICAgICBpZiAoZGF0YVtpZHhdID09PSBNQVQuQUlSKSB7XG4gICAgICAgICAgICBkYXRhW2lkeF0gPSBNQVQuV0FURVI7XG4gICAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9wU29saWQgPSBNYXRoLm1pbihZX01BWCAtIDEsIE1hdGgubWF4KFlfTUlOLCBoIC0gMSkpO1xuICAgICAgaGVpZ2h0c1tjb2xdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICB0b3BNYXRlcmlhbHNbY29sXSA9IHRvcDtcbiAgICB9XG4gIH1cblxuICAvLyBQcm90cnVkaW5nIGxlZGdlczogb25lIG9yIHR3byBzdG9uZSBibG9ja3MgZXh0ZW5kIGZyb20gYSBoaWdoIGNvbHVtbiBvdmVyXG4gIC8vIGEgbG93ZXIgbmVpZ2hib3VyLiBUaGV5IGNyZWF0ZSByZWFkYWJsZSBvdmVyaGFuZ3Mgd2l0aG91dCBhIGZ1bGwgY2F2ZSBwYXNzLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCBoID0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFApXTtcbiAgICAgIGNvbnN0IHNsb3BlID0gTWF0aC5tYXgoXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQIC0gMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQICsgMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICApO1xuICAgICAgaWYgKHNsb3BlIDwgMikgY29udGludWU7XG4gICAgICBjb25zdCBkaXJzOiBBcnJheTxbbnVtYmVyLCBudW1iZXJdPiA9IFtbLTEsIDBdLCBbMSwgMF0sIFswLCAtMV0sIFswLCAxXV07XG4gICAgICBmb3IgKGNvbnN0IFtkeCwgZHpdIG9mIGRpcnMpIHtcbiAgICAgICAgY29uc3QgbnggPSBseCArIGR4LCBueiA9IGx6ICsgZHo7XG4gICAgICAgIGlmIChueCA8IDAgfHwgbnogPCAwIHx8IG54ID49IENIVU5LX1NJWkUgfHwgbnogPj0gQ0hVTktfU0laRSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IG5oID0gYmFzZUhbKG56ICsgUCkgKiBQVyArIChueCArIFApXTtcbiAgICAgICAgaWYgKGggLSBuaCA8IDIpIGNvbnRpbnVlO1xuICAgICAgICBpZiAoaGFzaDNpKGx4LCBseiwgZHggKiAzICsgZHogKiA3LCBzZWVkICsgMTUwKSA8IDAuNTUpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCB5ID0gaCAtIDI7XG4gICAgICAgIGlmICh5IDwgWV9NSU4gfHwgeSA+PSBoKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgaWR4ID0gbG9jYWxJbmRleChueCwgeVRvSW5kZXgoeSksIG56KTtcbiAgICAgICAgaWYgKGRhdGFbaWR4XSA9PT0gTUFULkFJUikge1xuICAgICAgICAgIGRhdGFbaWR4XSA9IE1BVC5TVE9ORTtcbiAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFJlY29tcHV0ZSB0aGUgY29sdW1uIGNhY2hlIGFmdGVyIGxlZGdlcy9jYXZlcy4gVGhlIGV4cG9zZWQgdG9wIG1hdGVyaWFsXG4gIC8vIG11c3QgY29tZSBmcm9tIHRoZSBhY3R1YWwgdG9wIHNvbGlkIHZveGVsLCBub3QgdGhlIHByZS1jYXJ2ZSBndWVzcy5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gICAgICBsZXQgdG9wTWF0OiBudW1iZXIgPSB0b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICAgICAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgICAgIGNvbnN0IG0gPSBkYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildO1xuICAgICAgICBpZiAoaXNTb2xpZChtKSkgeyB0b3BTb2xpZCA9IHk7IHRvcE1hdCA9IG07IGJyZWFrOyB9XG4gICAgICB9XG4gICAgICBoZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgdG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IHRvcE1hdDtcbiAgICB9XG4gIH1cblxuICBjb25zdCBjaHVuazogVm94ZWxDaHVuayA9IHtcbiAgICBjeCwgY3osIGtleSwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIsXG4gICAgZGlydHk6IHRydWUsXG4gICAgZ2VuZXJhdGVkQXQ6IHBlcmZvcm1hbmNlLm5vdygpLFxuICB9O1xuXG4gIC8vIEFwcGx5IGR1cmFibGUgZWRpdHMgYWZ0ZXIgYmFzZSBnZW5lcmF0aW9uLlxuICBjb25zdCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChrZXkpO1xuICBpZiAoZWRpdHMpIHtcbiAgICBmb3IgKGNvbnN0IFtpZHgsIG1dIG9mIGVkaXRzKSB7XG4gICAgICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICAgIH1cbiAgICAvLyBSZWNvbXB1dGUgdGhlIGNhY2hlIGZvciBlZGl0ZWQgY2h1bmtzLlxuICAgIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykgdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bmssIGx4LCBseik7XG4gICAgfVxuICB9XG4gIC8vIE5vbi1haXIgY291bnRzIGFyZSBkZXJpdmVkIHJlbmRlcmVyIHN0YXRpc3RpY3MsIG5vdCBkdXJhYmxlIHdvcmxkIHN0YXRlLlxuICAvLyBFZGl0ZWQgYmFzZSBhaXIgbWF5IGJlY29tZSBzb2xpZCAoYW5kIHZpY2UgdmVyc2EpIGR1cmluZyByZXN0b3JhdGlvbi5cbiAgbGV0IGVkaXRlZE5vbkFpciA9IDA7XG4gIGZvciAoY29uc3QgbWF0ZXJpYWwgb2YgY2h1bmsuZGF0YSkgaWYgKG1hdGVyaWFsICE9PSBNQVQuQUlSKSBlZGl0ZWROb25BaXIrKztcbiAgd29ybGQuc3RhdHMudm94ZWxzRmlsbGVkICs9IGVkaXRlZE5vbkFpciAtIG5vbkFpcjtcblxuICB3b3JsZC5jaHVua3Muc2V0KGtleSwgY2h1bmspO1xuICB3b3JsZC5zdGF0cy5jaHVua3NHZW5lcmF0ZWQrKztcbiAgd29ybGQuc3RhdHMudm94ZWxzRmlsbGVkICs9IG5vbkFpcjtcbiAgd29ybGQuc3RhdHMuZ2VuZXJhdGlvbk1zICs9IHBlcmZvcm1hbmNlLm5vdygpIC0gdDA7XG4gIHdvcmxkLmRpcnR5LmFkZChrZXkpO1xuXG4gIGdlbmVyYXRlRW50aXRpZXMod29ybGQsIGNodW5rKTtcbiAgcmV0dXJuIGNodW5rO1xufVxuXG4vKiogQSBiYXNlLXRlcnJhaW4gY2FjaGUgc2hhcmVkIGJ5IGVkaXRlZCBhbmQgdW5lZGl0ZWQgcmVnZW5lcmF0aW9uLiBOYXR1cmFsXG4gKiBzY2VuZXJ5IG5ldmVyIGRlcGVuZHMgb24gbGF0ZXIgdm94ZWwgZWRpdHM7IHRoaXMgYWxzbyBsZXRzIGEgc25hcHNob3QgcmVzdG9yZVxuICogYSBoYXJ2ZXN0ZWQgY2h1bmsgd2l0aG91dCBtYXRlcmlhbGl6aW5nIHVucmVsYXRlZCBuZWlnaGJvdXJpbmcgY2h1bmtzLiAqL1xuY29uc3QgYmFzZUNvbHVtbkNhY2hlID0gbmV3IFdlYWtNYXA8V29ybGQsIE1hcDxzdHJpbmcsIHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5IH0+PigpO1xuXG5mdW5jdGlvbiBiYXNlQ29sdW1ucyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogeyBoZWlnaHRzOiBVaW50OEFycmF5OyB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXkgfSB7XG4gIGxldCBjYWNoZSA9IGJhc2VDb2x1bW5DYWNoZS5nZXQod29ybGQpO1xuICBpZiAoIWNhY2hlKSB7IGNhY2hlID0gbmV3IE1hcCgpOyBiYXNlQ29sdW1uQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZSk7IH1cbiAgY29uc3QgY2FjaGVkID0gY2FjaGUuZ2V0KGNodW5rLmtleSk7XG4gIGlmIChjYWNoZWQpIHJldHVybiBjYWNoZWQ7XG4gIGNvbnN0IGNvbHVtbnMgPSB7IGhlaWdodHM6IG5ldyBVaW50OEFycmF5KGNodW5rLmhlaWdodHMpLCB0b3BNYXRlcmlhbHM6IG5ldyBVaW50OEFycmF5KGNodW5rLnRvcE1hdGVyaWFscykgfTtcbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgeCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCkgKyBseCwgeiA9IGNodW5rT3JpZ2luWihjaHVuay5jeikgKyBsejtcbiAgICAgIGNvbnN0IGggPSBzdXJmYWNlSGVpZ2h0QXQod29ybGQuc2VlZCwgeCwgeik7XG4gICAgICBjb25zdCBzbG9wZSA9IHNsb3BlQXQod29ybGQuc2VlZCwgeCwgeiwgaCk7XG4gICAgICBjb25zdCBpbmRleCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgY29sdW1ucy5oZWlnaHRzW2luZGV4XSA9IGNsYW1wKGggLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICBjb2x1bW5zLnRvcE1hdGVyaWFsc1tpbmRleF0gPSB0b3BNYXRlcmlhbEF0KHdvcmxkLnNlZWQsIHgsIHosIGgsIHNsb3BlKTtcbiAgICB9XG4gIH1cbiAgY2FjaGUuc2V0KGNodW5rLmtleSwgY29sdW1ucyk7XG4gIHJldHVybiBjb2x1bW5zO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXZpY3RDaHVuayh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmICghd29ybGQuY2h1bmtzLmhhcyhrZXkpKSByZXR1cm4gZmFsc2U7XG4gIHdvcmxkLmNodW5rcy5kZWxldGUoa2V5KTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzRXZpY3RlZCsrO1xuICAvLyBDaHVuayBieXRlcyBhbmQgY29sdW1uIGNhY2hlcyBhcmUgcmVnZW5lcmF0ZWQgb24gZGVtYW5kLiBFbnRpdGllcyByZW1haW5cbiAgLy8gYXV0aG9yaXRhdGl2ZTogZXZpY3Rpb24gbXVzdCBub3QgZm9yZ2V0IHRoZWlyIHBlcnNpc3RlbnQgc3RhdGUuXG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyAtLS0tLS0tLS0tIHF1ZXJpZXMgLyBlZGl0cyAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZ2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeSA8IFlfTUlOKSByZXR1cm4gTUFULkJFRFJPQ0s7XG4gIGlmICh5ID49IFlfTUFYKSByZXR1cm4gTUFULkFJUjtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLmRhdGFbbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBtOiBNYXRJZCk6IGJvb2xlYW4ge1xuICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gWV9NQVgpIHJldHVybiBmYWxzZTtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgaWR4ID0gbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSk7XG4gIGNvbnN0IHByZXZpb3VzRWRpdCA9IHdvcmxkLmVkaXRzLmdldChjaHVua0tleShjeCwgY3opKT8uZ2V0KGlkeCk7XG4gIC8vIEEgY2h1bmsgZXZpY3RlZCBhZnRlciBhbiBlYXJsaWVyIGVkaXQgY2FuIHJlZ2VuZXJhdGUgd2l0aCB0aGF0IGR1cmFibGVcbiAgLy8gbWF0ZXJpYWwgYWxyZWFkeSBhcHBsaWVkLiBEcm9wcGluZyB0aGUgZWRpdCBoZXJlIHdvdWxkIG1ha2UgaXQgZGlzYXBwZWFyXG4gIC8vIG9uIHRoZSBuZXh0IGV2aWN0aW9uL3Jlc3RvcmF0aW9uLCBldmVuIHRob3VnaCB0aGUgY3VycmVudCB3cml0ZSBuby1vcHMuXG4gIGlmIChwcmV2aW91c0VkaXQgPT09IG0pIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIGZhbHNlO1xuICBsZXQgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoY2h1bmsua2V5KTtcbiAgaWYgKCFlZGl0cykgeyBlZGl0cyA9IG5ldyBNYXAoKTsgd29ybGQuZWRpdHMuc2V0KGNodW5rLmtleSwgZWRpdHMpOyB9XG4gIC8vIEFuIGlkZW1wb3RlbnQgd3JpdGUgbXVzdCBzdGlsbCByZXN0b3JlIGEgZHVyYWJsZSBkZWx0YSBkaXNjYXJkZWQgYnkgYW5cbiAgLy8gb2xkZXIgc25hcHNob3Qgb3IgZGVsdGEgZGVjb2Rlci4gSXQgaXMgbm90IGEgbmV3IGF1dGhvcml0YXRpdmUgcmV2aXNpb24uXG4gIGlmIChjaHVuay5kYXRhW2lkeF0gPT09IG0pIHtcbiAgICBpZiAoIWVkaXRzLmhhcyhpZHgpKSBlZGl0cy5zZXQoaWR4LCBtKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgZWRpdHMuc2V0KGlkeCwgbSk7XG4gIGNodW5rLmRpcnR5ID0gdHJ1ZTtcbiAgd29ybGQuZGlydHkuYWRkKGNodW5rLmtleSk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCB3b3JsZFRvTG9jYWxYKHgpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rOiBWb3hlbENodW5rLCBseDogbnVtYmVyLCBsejogbnVtYmVyKTogdm9pZCB7XG4gIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICBpZiAoaXNTb2xpZChjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildKSkgeyB0b3BTb2xpZCA9IHk7IGJyZWFrOyB9XG4gIH1cbiAgY2h1bmsuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgY29uc3QgdG0gPSBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICBpZiAodG9wU29saWQgPj0gWV9NSU4pIHtcbiAgICBjb25zdCBtID0gY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh0b3BTb2xpZCksIGx6KV07XG4gICAgaWYgKG0gIT09IE1BVC5XQVRFUikgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IG07XG4gIH0gZWxzZSB7XG4gICAgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IHRtO1xuICB9XG59XG5cbi8qKlxuICogVGhlIHkgY29vcmRpbmF0ZSBvZiB0aGUgZXhwb3NlZCB0b3AgZmFjZSBvZiB0aGUgc29saWQgY29sdW1uIGF0IHgvei5cbiAqIEEgc29saWQgdm94ZWwgYXQgeSBvY2N1cGllcyBbeSwgeSsxKSwgc28gdGhlIHdhbGthYmxlIHN1cmZhY2UgaXMgdG9wU29saWQrMS5cbiAqIFRoaXMgaXMgYSBkZXJpdmVkIHF1ZXJ5OyB0aGUgYXV0aG9yaXRhdGl2ZSBzdGF0ZSByZW1haW5zIHRoZSB2b3hlbCB2b2x1bWUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBZX01JTjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBZX01JTjtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvcE1hdGVyaWFsQXRXb3JsZCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsudG9wTWF0ZXJpYWxzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoZWlnaHRBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXRlckRlcHRoQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGggPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICByZXR1cm4gaCA8IFNFQV9MRVZFTCA/IFNFQV9MRVZFTCAtIGggOiAwO1xufVxuXG4vLyAtLS0tLS0tLS0tIGVudGl0aWVzIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIGFkZEVudGl0eSh3b3JsZDogV29ybGQsIGU6IEVudGl0eSk6IHZvaWQge1xuICBpZiAod29ybGQuZW50aXRpZXMuaGFzKGUuaWQpIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpXG4gICAgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpKSByZXR1cm47XG4gIHdvcmxkLmVudGl0aWVzLnNldChlLmlkLCBlKTtcbiAgbGV0IGxpc3QgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGUuY2h1bmspO1xuICBpZiAoIWxpc3QpIHsgbGlzdCA9IFtdOyB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIGxpc3QpOyB9XG4gIGxpc3QucHVzaChlLmlkKTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICAvLyBHZW5lcmF0aW9uIGlzIGRldGVybWluaXN0aWMgYW5kIGFkdmFuY2VzIG5vIHBsYXllci1jb21tYW5kIHByZWNvbmRpdGlvbi5cbiAgLy8gQXV0aG9yZWQgc2NhZmZvbGRpbmcgbWF5IHRyYW5zaWVudGx5IGNoYW5nZSBpdDsgdGhlIHNuYXBzaG90IHJlc3RvcmVzIHRoZVxuICAvLyBzYXZlZCByZXZpc2lvbiBhZnRlciBwbGFjaW5nIHRoYXQgc2NhZmZvbGRpbmcuXG59XG5cbi8qKlxuICogUmVtb3ZlIGFuIGVudGl0eSBmcm9tIHRoZSBhdXRob3JpdGF0aXZlIHdvcmxkLiBVc2VkIHdoZW4gYSBzaXRlIGlzIGNsZWFyZWQ6XG4gKiB0aGUgcmVzb3VyY2UgeWllbGQgaXMgYWNjb3VudGVkIGZvciBieSB0aGUgY2FsbGVyLCBhbmQgdGhlIGVudGl0eSBtdXN0IHN0b3BcbiAqIGV4aXN0aW5nIGZvciBjb2xsaXNpb24sIG9ic3RydWN0aW9uIGFuZCBwZXJzaXN0ZW5jZSwgbm90IGp1c3QgYmUgaGlkZGVuIGJ5XG4gKiB0aGUgcmVuZGVyZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICBpZiAoIWUgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgY29uc3QgbGlzdCA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoZS5jaHVuayk7XG4gIGlmIChsaXN0KSB7XG4gICAgY29uc3QgaSA9IGxpc3QuaW5kZXhPZihpZCk7XG4gICAgaWYgKGkgPj0gMCkgbGlzdC5zcGxpY2UoaSwgMSk7XG4gICAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoaWQpO1xuICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnRyZWVzIC0gMSk7XG4gIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyAtIDEpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBlbnRpdHlJZChjaHVuazogc3RyaW5nLCBpOiBudW1iZXIpOiBzdHJpbmcge1xuICByZXR1cm4gYGU6JHtjaHVua306JHtpfWA7XG59XG5cbmZ1bmN0aW9uIGZvcmVzdFNjb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGVhc3QgPSBNYXRoLmV4cCgtKCgod3ggLSAyMjApIC8gMjYwKSAqKiAyICsgKCh3eiArIDExMCkgLyAyMjApICoqIDIpKTtcbiAgY29uc3Qgbm9ydGggPSBNYXRoLmV4cCgtKCgod3ggLSAyMCkgLyAzMDApICoqIDIgKyAoKHd6ICsgMzAwKSAvIDE5MCkgKiogMikpO1xuICBjb25zdCB3ZXN0ID0gTWF0aC5leHAoLSgoKHd4ICsgMzQwKSAvIDIwMCkgKiogMiArICgod3ogLSAxMjApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IHNvdXRoID0gTWF0aC5leHAoLSgoKHd4IC0gMTIwKSAvIDI0MCkgKiogMiArICgod3ogLSAzMzApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IG1vaXN0dXJlID0gZmJtMih3eCAvIDI2MCwgd3ogLyAyNjAsIHNlZWQgKyAyMDEsIDQpO1xuICBjb25zdCB2YWxsZXkgPSBNYXRoLmV4cCgtKCh3eCAvIDE0MCkgKiogMiArICh3eiAvIDEwNSkgKiogMikpO1xuICByZXR1cm4gTWF0aC5tYXgoZWFzdCwgbm9ydGggKiAwLjkyLCB3ZXN0ICogMC44MCwgc291dGggKiAwLjc4KSAqIDAuODJcbiAgICArIG1vaXN0dXJlICogMC4zOCAtIDAuMjIgLSB2YWxsZXkgKiAwLjM0O1xufVxuXG5mdW5jdGlvbiByb2NrU2NvcmUod3g6IG51bWJlciwgd3o6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgbW91bnRhaW4gPSBmYm0yKHd4IC8gMzMwLCB3eiAvIDMzMCwgc2VlZCArIDIwMiwgMyk7XG4gIGNvbnN0IHJpZGdlID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMTQwLCB3eiAvIDE0MCwgc2VlZCArIDIwMywgMykgLSAxKTtcbiAgcmV0dXJuIG1vdW50YWluICogMC41NSArIHJpZGdlICogMC40NTtcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVFbnRpdGllcyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogdm9pZCB7XG4gIGdlbmVyYXRlRW50aXR5Q2h1bmsod29ybGQsIGNodW5rLmN4LCBjaHVuay5jeik7XG59XG5cbi8qKiBAaW50ZXJuYWwgUmVwbGF5cyBkZXRlcm1pbmlzdGljIGdlbmVyYXRpb24gZm9yIHNuYXBzaG90IGVudGl0eSBkZWx0YXMuICovXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVFbnRpdHlDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgaWYgKHdvcmxkLmVudGl0eUNodW5rcy5oYXMoa2V5KSkgcmV0dXJuO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm47XG5cbiAgY29uc3Qgcm5kID0gbXVsYmVycnkzMigoaGFzaDJpKGNodW5rLmN4LCBjaHVuay5jeiwgd29ybGQuc2VlZCArIDkwMCkgKiA0Mjk0OTY3Mjk2KSA+Pj4gMCk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICBjb25zdCBjb2x1bW5zID0gYmFzZUNvbHVtbnMod29ybGQsIGNodW5rKTtcbiAgbGV0IG4gPSAwO1xuICBsZXQgbmF0dXJhbFRyZWVzID0gMDtcbiAgbGV0IG5hdHVyYWxQaW5rVHJlZXMgPSAwO1xuXG4gIGNvbnN0IGxvY2FsU3VyZmFjZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICByZXR1cm4gY29sdW1ucy5oZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSArIFlfTUlOO1xuICB9O1xuICBjb25zdCBsb2NhbFRvcCA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogTWF0SWQgPT4ge1xuICAgIHJldHVybiBjb2x1bW5zLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gYXMgTWF0SWQ7XG4gIH07XG4gIGNvbnN0IGxvY2FsU2xvcGUgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgIHJldHVybiBNYXRoLm1heChcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggLSAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGNsYW1wKGx4ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpLCBseikpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogLSAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UobHgsIGNsYW1wKGx6ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpKSksXG4gICAgKTtcbiAgfTtcblxuICAvLyBBIGppdHRlcmVkIDggbSBsYXR0aWNlIGdpdmVzIGNvaGVyZW50IG1hc3NlcyBhbmQgYXZvaWRzIHBlci1mcmFtZSBzY2F0dGVyLlxuICBmb3IgKGxldCBneiA9IDA7IGd6IDwgQ0hVTktfU0laRTsgZ3ogKz0gOCkge1xuICAgIGZvciAobGV0IGd4ID0gMDsgZ3ggPCBDSFVOS19TSVpFOyBneCArPSA4KSB7XG4gICAgICBjb25zdCBseCA9IGNsYW1wKE1hdGguZmxvb3IoZ3ggKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCBseiA9IGNsYW1wKE1hdGguZmxvb3IoZ3ogKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBsb2NhbFN1cmZhY2UobHgsIGx6KTtcbiAgICAgIGlmIChoIDw9IFNFQV9MRVZFTCArIDEpIGNvbnRpbnVlO1xuICAgICAgY29uc3Qgc2xvcGUgPSBsb2NhbFNsb3BlKGx4LCBseik7XG4gICAgICBjb25zdCB0b3AgPSBsb2NhbFRvcChseCwgbHopO1xuICAgICAgaWYgKHRvcCA9PT0gTUFULldBVEVSKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGZvcmVzdCA9IGZvcmVzdFNjb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2NreSA9IHJvY2tTY29yZSh3eCwgd3osIHdvcmxkLnNlZWQpO1xuICAgICAgY29uc3Qgcm9sbCA9IHJuZCgpO1xuXG4gICAgICBjb25zdCB0cmVlQ2hhbmNlID0gZm9yZXN0ID4gMC41MCA/IDAuNzIgOiBmb3Jlc3QgPiAwLjMwID8gMC4yNSA6IDAuMDU7XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMiAmJiByb2xsIDwgdHJlZUNoYW5jZSkge1xuICAgICAgICAvLyBUaGUgY2FwIGlzIGEgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsLWdlbmVyYXRpb24gcHJvcGVydHkuIEl0IGNhbm5vdFxuICAgICAgICAvLyBkZXBlbmQgb24gd2hpY2ggY2h1bmtzIGEgcmVuZGVyZXIgbG9hZGVkIGJlZm9yZSB0aGlzIG9uZS5cbiAgICAgICAgbGV0IGtpbmQ6IEVudGl0eUtpbmQ7XG4gICAgICAgIGxldCB2YXJpYW50OiBudW1iZXI7XG4gICAgICAgIGNvbnN0IHNwZWNpZXNSb2xsID0gcm5kKCk7XG4gICAgICAgIGlmIChzcGVjaWVzUm9sbCA8IDAuMTIpIHtcbiAgICAgICAgICBpZiAoKG5hdHVyYWxQaW5rVHJlZXMgKyAxKSA+IDAuMjUgKiAobmF0dXJhbFRyZWVzICsgMSkpIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2NsdXN0ZXInO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAzKTtcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtPdmVyZmxvdysrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9ibG9zc29tJztcbiAgICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMik7XG4gICAgICAgICAgICBuYXR1cmFsUGlua1RyZWVzKys7XG4gICAgICAgICAgICB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoc3BlY2llc1JvbGwgPCAwLjQwKSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfc3BpcmUnO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogNCk7XG4gICAgICAgIH0gZWxzZSBpZiAoc3BlY2llc1JvbGwgPCAwLjc0KSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfdGFibGUnO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogNCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAzKTtcbiAgICAgICAgfVxuICAgICAgICBuYXR1cmFsVHJlZXMrKztcbiAgICAgICAgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuODggKyBybmQoKSAqIDAuMjQsIHZhcmlhbnQsXG4gICAgICAgICAgcmVzb3VyY2U6ICd3b29kJywgcmVtYWluaW5nOiAxMiwgeWllbGRQZXJIYXJ2ZXN0OiA0LFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiByb2NreSA+IDAuNDYgJiYgcm9sbCA8IDAuMzgpIHtcbiAgICAgICAgLy8gQ29uc3VtZSB0aGUgcmV0aXJlZCBzdG9uZSBmb3JtJ3MgcmFuZG9tIGRyYXdzIGFuZCBhbGxvY2F0ZSBpdHMgb2xkXG4gICAgICAgIC8vIHNlcXVlbmNlIElELCBidXQgZG8gbm90IGluc2VydCBhbiBlbnRpdHkuIExhdGVyIG5hdHVyYWwgcGxhY2VtZW50c1xuICAgICAgICAvLyB0aGVyZWZvcmUgcmVtYWluIGJ5dGUtZm9yLWJ5dGUgY29tcGF0aWJsZSB3aXRoIHJlY29yZGVkIHNhdmVzLlxuICAgICAgICBjb25zdCBzaXplUm9sbCA9IHJuZCgpO1xuICAgICAgICBjb25zdCBraW5kOiBFbnRpdHlLaW5kID0gc2l6ZVJvbGwgPCAwLjU1ID8gJ3N0eWxfcm9ja19zbWFsbCdcbiAgICAgICAgICA6IHNpemVSb2xsIDwgMC45MCA/ICdzdHlsX3JvY2tfbWVkaXVtJyA6ICdzdHlsX3JvY2tfbGFyZ2UnO1xuICAgICAgICBjb25zdCBpZCA9IGVudGl0eUlkKGNodW5rLmtleSwgbisrKTtcbiAgICAgICAgY29uc3QgcmVjb3JkID0ge1xuICAgICAgICAgIGlkLCBraW5kLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcmVzb3VyY2U6ICdzdG9uZScgYXMgY29uc3QsXG4gICAgICAgICAgcmVtYWluaW5nOiBraW5kID09PSAnc3R5bF9yb2NrX3NtYWxsJyA/IDQgOiBraW5kID09PSAnc3R5bF9yb2NrX21lZGl1bScgPyA4IDogMTIsXG4gICAgICAgICAgeWllbGRQZXJIYXJ2ZXN0OiAzLCBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjkgKyBybmQoKSAqIDAuMiwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDMpLFxuICAgICAgICB9O1xuICAgICAgICAvLyBPbmx5IGVudGl0aWVzIHRoYXQgZXhpc3RlZCBpbiBhbiBhY2NlcHRlZCBvbGQgc2F2ZSBnZXQgdG9tYnN0b25lcyxcbiAgICAgICAgLy8gZHVyaW5nIGV4cGxpY2l0IG1pZ3JhdGlvbi4gT3JkaW5hcnkgZ2VuZXJhdGlvbiBtdXN0IHJlc3RvcmUgZXhhY3RseS5cbiAgICAgICAgaWYgKGlzU3RvbmVSZXBsYXkod29ybGQpKSBhZGRFbnRpdHkod29ybGQsIHJlY29yZCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULlNUT05FICYmIHJvY2t5ID4gMC41OCAmJiByb2xsIDwgMC4xOCkge1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQ6ICdzdHlsX29yZScsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC45ICsgcm5kKCkgKiAwLjIsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAyKSxcbiAgICAgICAgICByZXNvdXJjZTogJ29yZScsIHJlbWFpbmluZzogOCwgeWllbGRQZXJIYXJ2ZXN0OiAyLFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiBzbG9wZSA8PSAxICYmIHJvbGwgPCAwLjMwKSB7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZDogJ3N0eWxfc2hydWInLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOCArIHJuZCgpICogMC40LCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgICAgcmVzb3VyY2U6ICdmaWJlcicsIHJlbWFpbmluZzogNCwgeWllbGRQZXJIYXJ2ZXN0OiAxLFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRBdXRob3JlZEVudGl0eSh3b3JsZDogV29ybGQsIGtpbmQ6IEVudGl0eUtpbmQsIHg6IG51bWJlciwgejogbnVtYmVyLCB2YXJpYW50OiBudW1iZXIsIHJvdDogbnVtYmVyLCBzY2FsZTogbnVtYmVyLCByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbCwgcmVtYWluaW5nOiBudW1iZXIsIHlpZWxkUGVySGFydmVzdDogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBpZiAoeSA8PSBTRUFfTEVWRUwpIHJldHVybjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIC8vIEEgaGVybyBhc3NldCBvd25zIGl0cyBzcG90OiBjbGVhciBhbnkgZ2VuZXJhdGVkIGVudGl0eSB0aGF0IHdvdWxkIG92ZXJsYXBcbiAgLy8gaXQsIHJhdGhlciB0aGFuIHNpbGVudGx5IGRyb3BwaW5nIHRoZSBhdXRob3JlZCBjb21wb3NpdGlvbi5cbiAgY29uc3QgaWRzID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpID8/IFtdO1xuICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkgcmV0dXJuO1xuICBmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgIGlmIChlICYmIE1hdGguaHlwb3QoZS54IC0geCwgZS56IC0geikgPCAyLjYpIHtcbiAgICAgIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gICAgICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnRyZWVzIC0gMSk7XG4gICAgICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy5waW5rVHJlZXMgLSAxKTtcbiAgICB9XG4gIH1cbiAgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGlkcy5maWx0ZXIoKGlkKSA9PiB3b3JsZC5lbnRpdGllcy5oYXMoaWQpKSk7XG4gIC8vIEF1dGhvcmVkIGNvbXBvc2l0aW9uIGlzIGR1cmFibGUgc3RhdGU6IGl0IGNhbiBjbGVhciBvdmVybGFwcGluZyBuYXR1cmFsXG4gIC8vIGVudGl0aWVzLCBzbyBzYXZlIHRoZSBjb21wbGV0ZSBhZmZlY3RlZCBjaHVuayByYXRoZXIgdGhhbiBvbmx5IGl0cyBoZXJvZXMuXG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGtleSk7XG5cbiAgY29uc3QgaWQgPSBgaGVybzoke2tpbmR9OiR7TWF0aC5yb3VuZCh4KX06JHtNYXRoLnJvdW5kKHopfWA7XG4gIGNvbnN0IGJlZm9yZSA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIGNvbnN0IGVudGl0eTogRW50aXR5ID0ge1xuICAgIGlkLCBraW5kLCBjaHVuazoga2V5LCB4OiB4ICsgMC41LCB5LCB6OiB6ICsgMC41LFxuICAgIHJvdCwgc2NhbGUsIHZhcmlhbnQsIHJlc291cmNlLCByZW1haW5pbmcsIHlpZWxkUGVySGFydmVzdCxcbiAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IHRydWUsXG4gIH07XG4gIGFkZEVudGl0eSh3b3JsZCwgZW50aXR5KTtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLnNpemUgPiBiZWZvcmUgJiYga2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkge1xuICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgaWYgKGtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGlmICh3b3JsZC5hdXRob3JlZFBsYWNlZCkgcmV0dXJuO1xuICB3b3JsZC5hdXRob3JlZFBsYWNlZCA9IHRydWU7XG5cbiAgY29uc3Qgc2l0ZXM6IEFycmF5PHsga2luZDogJ3dheXN0b25lJyB8ICdtYXJrZXInOyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcm90OiBudW1iZXIgfT4gPSBbXG4gICAgeyBraW5kOiAnd2F5c3RvbmUnLCB4OiAtMTAsIHo6IC0xNCwgcm90OiAwIH0sXG4gICAgeyBraW5kOiAnbWFya2VyJywgeDogLTMyLCB6OiAtOCwgcm90OiBNYXRoLlBJIC8gMiB9LFxuICBdO1xuICBmb3IgKGNvbnN0IHMgb2Ygc2l0ZXMpIHtcbiAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCBzLngsIHMueik7XG4gICAgaWYgKHkgPD0gU0VBX0xFVkVMKSBjb250aW51ZTtcbiAgICB3b3JsZC5zaXRlcy5wdXNoKHtcbiAgICAgIGlkOiBgc2l0ZToke3Mua2luZH1gLFxuICAgICAga2luZDogcy5raW5kLFxuICAgICAgeDogcy54ICsgMC41LCB5LCB6OiBzLnogKyAwLjUsXG4gICAgICByb3Q6IHMucm90LFxuICAgICAgcHJvdmlzaW9uYWw6IHRydWUsXG4gICAgfSk7XG4gIH1cblxuICAvLyBBIGhlcm8gZ3JvdmUgY29tcG9zZWQgaW4gdGhlIGRlZmF1bHQgY2FtZXJhJ3MgdmlldyBkaXJlY3Rpb24uIFRoZXNlIGFyZVxuICAvLyBTdHlsIG5hdHVyYWwgYXNzZXRzIChBUy0wMDEgdjIpLCBub3QgTm94ZWwgYXJjaGl0ZWN0dXJlOyB0aGUgTm94ZWxcbiAgLy8gd2F5c3RvbmUvbWFya2VyIGFib3ZlIHJlbWFpbiB0aGUgaHVtYW4tbWFkZSBsYW5kbWFya3MuXG4gIGNvbnN0IGdyb3ZlOiBBcnJheTxbRW50aXR5S2luZCwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXJdPiA9IFtcbiAgICBbJ3N0eWxfdHJlZV9zcGlyZScsIC0yMiwgLTI2LCAwLCAxLjAwLCAwXSxcbiAgICBbJ3N0eWxfdHJlZV90YWJsZScsIC0zNCwgLTE4LCAxLCAwLjk1LCBNYXRoLlBJIC8gMTJdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTYsIC0zNCwgMiwgMS4wMCwgTWF0aC5QSSAvIDZdLFxuICAgIFsnc3R5bF90cmVlX2Jsb3Nzb20nLCAtMjgsIC0zOCwgMCwgMC45MCwgTWF0aC5QSSAvIDRdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTQwLCAtMzAsIDIsIDEuMDUsIE1hdGguUEkgLyAzXSxcbiAgICBbJ3N0eWxfdHJlZV9jbHVzdGVyJywgLTEyLCAtMjQsIDAsIDAuOTAsIE1hdGguUEkgLyAyLjRdLFxuICBdO1xuICBmb3IgKGNvbnN0IFtraW5kLCB4LCB6LCB2YXJpYW50LCBzY2FsZSwgcm90XSBvZiBncm92ZSkge1xuICAgIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCBraW5kLCB4LCB6LCB2YXJpYW50LCByb3QsIHNjYWxlLCAnd29vZCcsIDEyLCA0KTtcbiAgfVxuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfcm9ja19tZWRpdW0nLCAtNiwgLTEwLCAwLCAwLCAxLjAsICdzdG9uZScsIDgsIDMpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfc2hydWInLCAtMTQsIC04LCAxLCBNYXRoLlBJIC8gMTIsIDEuMSwgJ2ZpYmVyJywgNCwgMSk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9jYWlybicsIC0yMCwgLTYsIDAsIDAsIDEuMCwgJ3N0b25lJywgNiwgMik7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9vcmUnLCAtMzgsIC00MiwgMCwgTWF0aC5QSSAvIDQsIDEuMSwgJ29yZScsIDgsIDIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbmVhcmVzdEhhcnZlc3RhYmxlKFxuICB3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCByYWRpdXM6IG51bWJlciwgcmVzb3VyY2U/OiBSZXNvdXJjZVR5cGUsXG4pOiBFbnRpdHkgfCBudWxsIHtcbiAgbGV0IGJlc3Q6IEVudGl0eSB8IG51bGwgPSBudWxsO1xuICBsZXQgYmVzdEQgPSByYWRpdXMgKiByYWRpdXM7XG4gIGZvciAoY29uc3QgZSBvZiB3b3JsZC5lbnRpdGllcy52YWx1ZXMoKSkge1xuICAgIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZClcbiAgICAgIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIGNvbnRpbnVlO1xuICAgIGlmIChyZXNvdXJjZSAmJiBlLnJlc291cmNlICE9PSByZXNvdXJjZSkgY29udGludWU7XG4gICAgY29uc3QgZCA9IChlLnggLSB4KSAqKiAyICsgKGUueiAtIHopICoqIDI7XG4gICAgaWYgKGQgPCBiZXN0RCkgeyBiZXN0RCA9IGQ7IGJlc3QgPSBlOyB9XG4gIH1cbiAgcmV0dXJuIGJlc3Q7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGFydmVzdFJlc3VsdCB7IGVudGl0eTogRW50aXR5OyByZXNvdXJjZTogUmVzb3VyY2VUeXBlOyBhbW91bnQ6IG51bWJlcjsgfVxuXG5leHBvcnQgZnVuY3Rpb24gaGFydmVzdEVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBIYXJ2ZXN0UmVzdWx0IHwgbnVsbCB7XG4gIGNvbnN0IGUgPSBsaXZlRW50aXR5KHdvcmxkLCBpZCk7XG4gIGlmICghZSB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgYW1vdW50ID0gTWF0aC5taW4oZS55aWVsZFBlckhhcnZlc3QsIGUucmVtYWluaW5nKTtcbiAgaWYgKHdvcmxkLmxpZmUgJiYgT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBuKSA9PiBzdW0gKyBuLCAwKSArIGFtb3VudCA+IDEyMCkgcmV0dXJuIG51bGw7XG4gIGUucmVtYWluaW5nIC09IGFtb3VudDtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgZS5oYXJ2ZXN0ZWRPbmNlID0gdHJ1ZTtcbiAgaWYgKGUucmVtYWluaW5nIDw9IDApIGUuaGFydmVzdGVkID0gdHJ1ZTtcbiAgd29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID0gKHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgZW50aXR5OiBlLCByZXNvdXJjZTogZS5yZXNvdXJjZSwgYW1vdW50IH07XG59XG5cbi8qKiBSZW1vdmUgZXZlcnkgcmV0aXJlZCBzb3VyY2UgYWZ0ZXIgdmVyaWZpZWQgaGlzdG9yaWNhbCByZXBsYXkuIFRoaXMgbWlncmF0aW9uXG4gKiBjcmVhdGVzIGRldGVybWluaXN0aWMgdG9tYnN0b25lcyBidXQgaXMgbm90IGEgcGxheWVyIGNvbW1hbmQgb3IgcmV2aXNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gcmV0aXJlU3RvbmVFbnRpdGllcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZm9yIChjb25zdCBlIG9mIFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0pIHtcbiAgICBpZiAoIWlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpKSBjb250aW51ZTtcbiAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoZS5pZCk7XG4gICAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoZS5pZCk7XG4gICAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gICAgaWYgKCF3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGUuY2h1bmspKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICBmb3IgKGNvbnN0IFtrZXksIGlkc10gb2Ygd29ybGQuZW50aXR5Q2h1bmtzKSB7XG4gICAgY29uc3QgYWN0aXZlID0gaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpO1xuICAgIGlmIChhY3RpdmUubGVuZ3RoID4gMCB8fCB3b3JsZC5lbnRpdHlDaGFuZ2VzLmhhcyhrZXkpKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgYWN0aXZlKTtcbiAgICBlbHNlIHdvcmxkLmVudGl0eUNodW5rcy5kZWxldGUoa2V5KTtcbiAgfVxuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcGVyc2lzdGVuY2UgLyBhdXRob3JpdHkgYm91bmRhcnkgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZE1hbmlmZXN0IHtcbiAgc2NoZW1hOiAxO1xuICBzZWVkOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIHBhcmFtc0hhc2g6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZm52MWEodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGggPSAweDgxMWM5ZGM1O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcbiAgICBoIF49IHRleHQuY2hhckNvZGVBdChpKTtcbiAgICBoID0gTWF0aC5pbXVsKGgsIDB4MDEwMDAxOTMpO1xuICB9XG4gIHJldHVybiAoaCA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3b3JsZE1hbmlmZXN0KHdvcmxkOiBXb3JsZCk6IFdvcmxkTWFuaWZlc3Qge1xuICBjb25zdCBwID0gd29ybGQucGFyYW1zO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBzZWVkOiB3b3JsZC5zZWVkLFxuICAgIGdlbmVyYXRvclZlcnNpb246IHAuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBzaXplOiBwLnNpemUsXG4gICAgY2h1bmtTaXplOiBwLmNodW5rU2l6ZSxcbiAgICB5TWluOiBwLnlNaW4sXG4gICAgeU1heDogcC55TWF4LFxuICAgIHNlYUxldmVsOiBwLnNlYUxldmVsLFxuICAgIHBhcmFtc0hhc2g6IGZudjFhKEpTT04uc3RyaW5naWZ5KHApKSxcbiAgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbEVkaXQgeyBpOiBudW1iZXI7IG06IG51bWJlcjsgfVxuZXhwb3J0IGludGVyZmFjZSBDaHVua0RlbHRhIHtcbiAgc2NoZW1hOiAxO1xuICBrZXk6IHN0cmluZztcbiAgYmFzZVZlcnNpb246IG51bWJlcjtcbiAgZWRpdHM6IFZveGVsRWRpdFtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwb3J0Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogQ2h1bmtEZWx0YSB7XG4gIGNvbnN0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGtleSk7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIGtleSxcbiAgICBiYXNlVmVyc2lvbjogd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sXG4gICAgZWRpdHM6IGVkaXRzID8gWy4uLmVkaXRzLmVudHJpZXMoKV0ubWFwKChbaSwgbV0pID0+ICh7IGksIG0gfSkpLnNvcnQoKGEsIGIpID0+IGEuaSAtIGIuaSkgOiBbXSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGRlbHRhOiBDaHVua0RlbHRhKTogdm9pZCB7XG4gIGNvbnN0IFtjeCwgY3pdID0gZGVsdGEua2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gIGZvciAoY29uc3QgZSBvZiBkZWx0YS5lZGl0cykge1xuICAgIGNvbnN0IHlJbmRleCA9IE1hdGguZmxvb3IoZS5pIC8gQ0hVTktfQVJFQSk7XG4gICAgY29uc3QgcmVtID0gZS5pICUgQ0hVTktfQVJFQTtcbiAgICBjb25zdCBseiA9IE1hdGguZmxvb3IocmVtIC8gQ0hVTktfU0laRSk7XG4gICAgY29uc3QgbHggPSByZW0gJSBDSFVOS19TSVpFO1xuICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY3gpICsgbHg7XG4gICAgY29uc3QgeSA9IFlfTUlOICsgeUluZGV4O1xuICAgIGNvbnN0IHogPSBjaHVua09yaWdpblooY3opICsgbHo7XG4gICAgc2V0Vm94ZWwod29ybGQsIHgsIHksIHosIGUubSBhcyBNYXRJZCk7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSB0aW1lIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgVGltZVN0YXRlIHsgdDogbnVtYmVyOyBkYXlMZW5ndGhTZWM6IG51bWJlcjsgcGF1c2VkOiBib29sZWFuOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBhZHZhbmNlVGltZShzOiBUaW1lU3RhdGUsIGR0OiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKHMucGF1c2VkKSByZXR1cm47XG4gIHMudCA9IChzLnQgKyBkdCAvIHMuZGF5TGVuZ3RoU2VjKSAlIDE7XG59XG4iLCAiLy8gUmVuZGVyLW9ubHkgc2V0dGxlbWVudCBsaWZlIHBhbmVsLiBUaGUgc2Vzc2lvbiBvd25zIGV2ZXJ5IHN0YXRlIHRyYW5zaXRpb247XG4vLyB0aGVzZSBjb250cm9scyBvbmx5IGVtaXQgaW50ZW50cyBhbmQgcmVuZGVyIHRoZSBsYXRlc3QgYXV0aG9yaXRhdGl2ZSB3b3JsZC5cbmltcG9ydCB7XG4gIENBUlJJRURfQ0FQQUNJVFksIENST1BfUExPVF9JRFMsIEZPVU5ERVJfU1RPQ0tQSUxFX0lELCBMSUZFX1JFU09VUkNFUyxcbiAgTGlmZVJlc291cmNlLCBNQVhfUFJPRFVDVElPTl9KT0JTLCBSRUNJUEVTLCBSZWNpcGVJZCwgU1RPQ0tQSUxFX0NBUEFDSVRZLFxuICBjcm9wUmVhZHksXG59IGZyb20gJy4uL3NpbS9lY29ub215JztcbmltcG9ydCB0eXBlIHsgV29ybGQgfSBmcm9tICcuLi9zaW0vd29ybGQnO1xuXG5leHBvcnQgdHlwZSBMaWZlSW50ZW50ID1cbiAgfCB7IHR5cGU6ICdkZXBvc2l0JyB8ICd3aXRoZHJhdyc7IHJlc291cmNlOiBMaWZlUmVzb3VyY2U7IGFtb3VudDogbnVtYmVyIH1cbiAgfCB7IHR5cGU6ICdwcm9kdWNlJzsgcmVjaXBlOiBSZWNpcGVJZCB9XG4gIHwgeyB0eXBlOiAndGljayc7IHRpY2tzOiBudW1iZXIgfVxuICB8IHsgdHlwZTogJ3BsYW50JyB8ICdoYXJ2ZXN0X2Nyb3AnOyBwbG90SWQ6IHN0cmluZyB9O1xuXG5leHBvcnQgaW50ZXJmYWNlIExpZmVQYW5lbENhbGxiYWNrcyB7XG4gIG9uSW50ZW50KGludGVudDogTGlmZUludGVudCk6IHZvaWQ7XG4gIG9uVG9hc3Q/KG1lc3NhZ2U6IHN0cmluZywga2luZDogJ2dvb2QnIHwgJ3dhcm4nIHwgJ2JhZCcpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgVHJhbnNmZXJDb250cm9scyB7XG4gIHNlbGVjdDogSFRNTFNlbGVjdEVsZW1lbnQ7XG4gIGlucHV0OiBIVE1MSW5wdXRFbGVtZW50O1xuICBidXR0b246IEhUTUxCdXR0b25FbGVtZW50O1xufVxuXG5mdW5jdGlvbiBlbGVtZW50PEsgZXh0ZW5kcyBrZXlvZiBIVE1MRWxlbWVudFRhZ05hbWVNYXA+KFxuICB0YWc6IEssIGNsYXNzTmFtZT86IHN0cmluZywgdGV4dD86IHN0cmluZyxcbik6IEhUTUxFbGVtZW50VGFnTmFtZU1hcFtLXSB7XG4gIGNvbnN0IG5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRhZyk7XG4gIGlmIChjbGFzc05hbWUpIG5vZGUuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICBpZiAodGV4dCAhPT0gdW5kZWZpbmVkKSBub2RlLnRleHRDb250ZW50ID0gdGV4dDtcbiAgcmV0dXJuIG5vZGU7XG59XG5cbmZ1bmN0aW9uIGJ1dHRvbih0ZXh0OiBzdHJpbmcsIGFjdGlvbjogc3RyaW5nKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICBjb25zdCBub2RlID0gZWxlbWVudCgnYnV0dG9uJywgdW5kZWZpbmVkLCB0ZXh0KTtcbiAgbm9kZS50eXBlID0gJ2J1dHRvbic7XG4gIG5vZGUuZGF0YXNldC5hY3Rpb24gPSBhY3Rpb247XG4gIHJldHVybiBub2RlO1xufVxuXG5leHBvcnQgY2xhc3MgTGlmZVBhbmVsIHtcbiAgcHJpdmF0ZSByZWFkb25seSByb290OiBIVE1MRWxlbWVudDtcbiAgcHJpdmF0ZSByZWFkb25seSBib2R5OiBIVE1MRWxlbWVudDtcbiAgcHJpdmF0ZSByZWFkb25seSB0b2FzdEVsOiBIVE1MRWxlbWVudDtcbiAgcHJpdmF0ZSByZWFkb25seSB0cmFuc2ZlckNvbnRyb2xzID0gbmV3IE1hcDwnZGVwb3NpdCcgfCAnd2l0aGRyYXcnLCBUcmFuc2ZlckNvbnRyb2xzPigpO1xuICBwcml2YXRlIHJlYWRvbmx5IGNhcnJpZWRWYWx1ZXMgPSBuZXcgTWFwPExpZmVSZXNvdXJjZSwgSFRNTEVsZW1lbnQ+KCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgc3RvY2tWYWx1ZXMgPSBuZXcgTWFwPExpZmVSZXNvdXJjZSwgSFRNTEVsZW1lbnQ+KCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjZUJ1dHRvbnMgPSBuZXcgTWFwPFJlY2lwZUlkLCBIVE1MQnV0dG9uRWxlbWVudD4oKTtcbiAgcHJpdmF0ZSByZWFkb25seSBjcm9wQnV0dG9ucyA9IG5ldyBNYXA8c3RyaW5nLCBIVE1MQnV0dG9uRWxlbWVudD4oKTtcbiAgcHJpdmF0ZSByZWFkb25seSB0aWNrQnV0dG9uczogSFRNTEJ1dHRvbkVsZW1lbnRbXSA9IFtdO1xuICBwcml2YXRlIGNhcnJpZWRDYXBhY2l0eSE6IEhUTUxFbGVtZW50O1xuICBwcml2YXRlIHN0b2NrQ2FwYWNpdHkhOiBIVE1MRWxlbWVudDtcbiAgcHJpdmF0ZSBqb2JzITogSFRNTEVsZW1lbnQ7XG4gIHByaXZhdGUgdGljayE6IEhUTUxFbGVtZW50O1xuICBwcml2YXRlIGZhcm1TdGF0dXMhOiBIVE1MRWxlbWVudDtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGNhbGxiYWNrczogTGlmZVBhbmVsQ2FsbGJhY2tzKSB7XG4gICAgdGhpcy5yb290ID0gZWxlbWVudCgnc2VjdGlvbicsICdsaWZlLXBhbmVsJyk7XG4gICAgdGhpcy5yb290LmlkID0gJ2xpZmUtcGFuZWwnO1xuICAgIHRoaXMucm9vdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnU2V0dGxlbWVudCcpO1xuICAgIC8vIFdvcmxkIG1vZGUgb3ducyB0aGUgcGFuZWwgYnkgZGVmYXVsdDsgY2xlYW4gbW9kZSBoaWRlcyBpdCBleHBsaWNpdGx5LlxuICAgIHRoaXMucm9vdC5oaWRkZW4gPSBmYWxzZTtcblxuICAgIGNvbnN0IGhlYWRlciA9IGVsZW1lbnQoJ2hlYWRlcicsICdsaWZlLWhlYWQnKTtcbiAgICBoZWFkZXIuYXBwZW5kKGVsZW1lbnQoJ2gyJywgdW5kZWZpbmVkLCAnU2V0dGxlbWVudCcpKTtcbiAgICB0aGlzLnJvb3QuYXBwZW5kKGhlYWRlcik7XG5cbiAgICB0aGlzLmJvZHkgPSBlbGVtZW50KCdkaXYnLCAnbGlmZS1ib2R5Jyk7XG4gICAgY29uc3QgdW5hdmFpbGFibGUgPSBlbGVtZW50KCdwJywgJ2xpZmUtdW5hdmFpbGFibGUnLFxuICAgICAgJ1NldHRsZW1lbnQgbGlmZSBpcyB1bmF2YWlsYWJsZSBpbiB0aGlzIGxlZ2FjeSB3b3JsZC4nKTtcbiAgICB0aGlzLmJvZHkuYXBwZW5kKHVuYXZhaWxhYmxlLCB0aGlzLm1ha2VCYWdTZWN0aW9uKCdjYXJyaWVkJywgJ0dhdGhlcmVkIFx1MDBCNyBjYXJyaWVkIGJhZycsXG4gICAgICBDQVJSSUVEX0NBUEFDSVRZLCB0aGlzLmNhcnJpZWRWYWx1ZXMpLCB0aGlzLm1ha2VCYWdTZWN0aW9uKCdzdG9ja3BpbGUnLCAnRm91bmRlciBzdG9ja3BpbGUnLFxuICAgICAgU1RPQ0tQSUxFX0NBUEFDSVRZLCB0aGlzLnN0b2NrVmFsdWVzKSwgdGhpcy5tYWtlVHJhbnNmZXJzKCksIHRoaXMubWFrZVByb2R1Y3Rpb24oKSxcbiAgICAgIHRoaXMubWFrZUNyb3BzKCkpO1xuICAgIHRoaXMucm9vdC5hcHBlbmQodGhpcy5ib2R5KTtcblxuICAgIHRoaXMudG9hc3RFbCA9IGVsZW1lbnQoJ2RpdicsICdsaWZlLXRvYXN0Jyk7XG4gICAgdGhpcy50b2FzdEVsLmlkID0gJ2xpZmUtdG9hc3QnO1xuICAgIHRoaXMudG9hc3RFbC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnc3RhdHVzJyk7XG4gICAgdGhpcy50b2FzdEVsLnNldEF0dHJpYnV0ZSgnYXJpYS1saXZlJywgJ3BvbGl0ZScpO1xuICAgIHRoaXMudG9hc3RFbC5oaWRkZW4gPSB0cnVlO1xuXG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmQodGhpcy5yb290LCB0aGlzLnRvYXN0RWwpO1xuICB9XG5cbiAgcHJpdmF0ZSBtYWtlQmFnU2VjdGlvbihcbiAgICBpZDogJ2NhcnJpZWQnIHwgJ3N0b2NrcGlsZScsIHRpdGxlOiBzdHJpbmcsIGNhcGFjaXR5OiBudW1iZXIsXG4gICAgdmFsdWVzOiBNYXA8TGlmZVJlc291cmNlLCBIVE1MRWxlbWVudD4sXG4gICk6IEhUTUxFbGVtZW50IHtcbiAgICBjb25zdCBzZWN0aW9uID0gZWxlbWVudCgnc2VjdGlvbicsIGBsaWZlLWJhZyBsaWZlLSR7aWR9YCk7XG4gICAgc2VjdGlvbi5kYXRhc2V0LmJhZyA9IGlkO1xuICAgIHNlY3Rpb24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGl0bGUpO1xuICAgIGNvbnN0IGhlYWRpbmcgPSBlbGVtZW50KCdoMycsIHVuZGVmaW5lZCwgdGl0bGUpO1xuICAgIGNvbnN0IHRvdGFsID0gZWxlbWVudCgnc3Ryb25nJywgJ2xpZmUtY2FwYWNpdHknLCBgMCAvICR7Y2FwYWNpdHl9YCk7XG4gICAgdG90YWwuZGF0YXNldC5jYXBhY2l0eSA9IGlkO1xuICAgIGlmIChpZCA9PT0gJ2NhcnJpZWQnKSB0aGlzLmNhcnJpZWRDYXBhY2l0eSA9IHRvdGFsO1xuICAgIGVsc2UgdGhpcy5zdG9ja0NhcGFjaXR5ID0gdG90YWw7XG4gICAgaGVhZGluZy5hcHBlbmQodG90YWwpO1xuICAgIHNlY3Rpb24uYXBwZW5kKGhlYWRpbmcpO1xuICAgIGNvbnN0IGxpc3QgPSBlbGVtZW50KCdkbCcsICdsaWZlLXJlc291cmNlcycpO1xuICAgIGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgTElGRV9SRVNPVVJDRVMpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gZWxlbWVudCgnZGQnLCAnbGlmZS1yZXNvdXJjZS12YWx1ZScsICcwJyk7XG4gICAgICB2YWx1ZS5kYXRhc2V0LnJlc291cmNlID0gcmVzb3VyY2U7XG4gICAgICB2YWx1ZXMuc2V0KHJlc291cmNlLCB2YWx1ZSk7XG4gICAgICBjb25zdCBsYWJlbCA9IGVsZW1lbnQoJ2R0JywgdW5kZWZpbmVkLCByZXNvdXJjZSk7XG4gICAgICBjb25zdCByb3cgPSBlbGVtZW50KCdkaXYnLCAnbGlmZS1yZXNvdXJjZScpO1xuICAgICAgcm93LmRhdGFzZXQucmVzb3VyY2UgPSByZXNvdXJjZTtcbiAgICAgIHJvdy5hcHBlbmQobGFiZWwsIHZhbHVlKTtcbiAgICAgIGxpc3QuYXBwZW5kKHJvdyk7XG4gICAgfVxuICAgIHNlY3Rpb24uYXBwZW5kKGxpc3QpO1xuICAgIHJldHVybiBzZWN0aW9uO1xuICB9XG5cbiAgcHJpdmF0ZSBtYWtlVHJhbnNmZXJzKCk6IEhUTUxFbGVtZW50IHtcbiAgICBjb25zdCBzZWN0aW9uID0gZWxlbWVudCgnc2VjdGlvbicsICdsaWZlLXRyYW5zZmVycycpO1xuICAgIHNlY3Rpb24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ01vdmUgcmVzb3VyY2VzJyk7XG4gICAgc2VjdGlvbi5hcHBlbmQoZWxlbWVudCgnaDMnLCB1bmRlZmluZWQsICdNb3ZlIHJlc291cmNlcycpKTtcbiAgICBzZWN0aW9uLmFwcGVuZCh0aGlzLm1ha2VUcmFuc2ZlcignZGVwb3NpdCcsICdmaWJlcicpKTtcbiAgICBzZWN0aW9uLmFwcGVuZCh0aGlzLm1ha2VUcmFuc2Zlcignd2l0aGRyYXcnLCAnZm9vZCcpKTtcbiAgICByZXR1cm4gc2VjdGlvbjtcbiAgfVxuXG4gIHByaXZhdGUgbWFrZVRyYW5zZmVyKHR5cGU6ICdkZXBvc2l0JyB8ICd3aXRoZHJhdycsIGRlZmF1bHRSZXNvdXJjZTogTGlmZVJlc291cmNlKTogSFRNTEVsZW1lbnQge1xuICAgIGNvbnN0IHJvdyA9IGVsZW1lbnQoJ2RpdicsIGBsaWZlLXRyYW5zZmVyIGxpZmUtJHt0eXBlfWApO1xuICAgIHJvdy5kYXRhc2V0LnRyYW5zZmVyID0gdHlwZTtcbiAgICBjb25zdCB0aXRsZSA9IHR5cGUgPT09ICdkZXBvc2l0JyA/ICdEZXBvc2l0IHRvIHN0b2NrcGlsZScgOiAnV2l0aGRyYXcgdG8gYmFnJztcbiAgICByb3cuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGl0bGUpO1xuICAgIGNvbnN0IGlkID0gYGxpZmUtJHt0eXBlfWA7XG4gICAgY29uc3QgcmVzb3VyY2VMYWJlbCA9IGVsZW1lbnQoJ2xhYmVsJywgdW5kZWZpbmVkLCBgJHt0aXRsZX0gcmVzb3VyY2VgKTtcbiAgICByZXNvdXJjZUxhYmVsLmh0bWxGb3IgPSBgJHtpZH0tcmVzb3VyY2VgO1xuICAgIGNvbnN0IHNlbGVjdCA9IGVsZW1lbnQoJ3NlbGVjdCcpO1xuICAgIHNlbGVjdC5pZCA9IGAke2lkfS1yZXNvdXJjZWA7XG4gICAgc2VsZWN0Lm5hbWUgPSBgJHt0eXBlfS1yZXNvdXJjZWA7XG4gICAgc2VsZWN0LmRhdGFzZXQucmVzb3VyY2UgPSB0eXBlO1xuICAgIHNlbGVjdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBgJHt0aXRsZX0gcmVzb3VyY2VgKTtcbiAgICBmb3IgKGNvbnN0IHJlc291cmNlIG9mIExJRkVfUkVTT1VSQ0VTKSB7XG4gICAgICBjb25zdCBvcHRpb24gPSBlbGVtZW50KCdvcHRpb24nLCB1bmRlZmluZWQsIHJlc291cmNlKTtcbiAgICAgIG9wdGlvbi52YWx1ZSA9IHJlc291cmNlO1xuICAgICAgc2VsZWN0LmFwcGVuZChvcHRpb24pO1xuICAgIH1cbiAgICBzZWxlY3QudmFsdWUgPSBkZWZhdWx0UmVzb3VyY2U7XG4gICAgcmVzb3VyY2VMYWJlbC5hcHBlbmQoc2VsZWN0KTtcblxuICAgIGNvbnN0IGFtb3VudExhYmVsID0gZWxlbWVudCgnbGFiZWwnLCB1bmRlZmluZWQsICdBbW91bnQnKTtcbiAgICBhbW91bnRMYWJlbC5odG1sRm9yID0gYCR7aWR9LWFtb3VudGA7XG4gICAgY29uc3QgaW5wdXQgPSBlbGVtZW50KCdpbnB1dCcpO1xuICAgIGlucHV0LmlkID0gYCR7aWR9LWFtb3VudGA7XG4gICAgaW5wdXQubmFtZSA9IGAke3R5cGV9LWFtb3VudGA7XG4gICAgaW5wdXQudHlwZSA9ICdudW1iZXInO1xuICAgIGlucHV0Lm1pbiA9ICcxJztcbiAgICBpbnB1dC5zdGVwID0gJzEnO1xuICAgIGlucHV0LnJlcXVpcmVkID0gdHJ1ZTtcbiAgICBpbnB1dC52YWx1ZSA9ICcyJztcbiAgICBpbnB1dC5kYXRhc2V0LmFtb3VudCA9IHR5cGU7XG4gICAgYW1vdW50TGFiZWwuYXBwZW5kKGlucHV0KTtcblxuICAgIGNvbnN0IGFjdGlvbiA9IGJ1dHRvbih0eXBlID09PSAnZGVwb3NpdCcgPyAnRGVwb3NpdCcgOiAnV2l0aGRyYXcnLCB0eXBlKTtcbiAgICBhY3Rpb24uZGF0YXNldC5yZXNvdXJjZSA9IHR5cGU7XG4gICAgYWN0aW9uLmRhdGFzZXQuYW1vdW50ID0gdHlwZTtcbiAgICBhY3Rpb24uZGlzYWJsZWQgPSB0cnVlO1xuICAgIGFjdGlvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgIGNvbnN0IHJlc291cmNlID0gc2VsZWN0LnZhbHVlIGFzIExpZmVSZXNvdXJjZTtcbiAgICAgIGNvbnN0IHJhdyA9IGlucHV0LnZhbHVlLnRyaW0oKTtcbiAgICAgIGNvbnN0IGFtb3VudCA9IE51bWJlcihyYXcpO1xuICAgICAgaWYgKCFMSUZFX1JFU09VUkNFUy5pbmNsdWRlcyhyZXNvdXJjZSkgfHwgcmF3ID09PSAnJ1xuICAgICAgICB8fCAhTnVtYmVyLmlzU2FmZUludGVnZXIoYW1vdW50KSB8fCBhbW91bnQgPD0gMCkge1xuICAgICAgICBpbnB1dC5zZXRDdXN0b21WYWxpZGl0eSgnRW50ZXIgYSBwb3NpdGl2ZSB3aG9sZS1udW1iZXIgYW1vdW50LicpO1xuICAgICAgICBpbnB1dC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaW52YWxpZCcsICd0cnVlJyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlucHV0LnNldEN1c3RvbVZhbGlkaXR5KCcnKTtcbiAgICAgIGlucHV0LnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1pbnZhbGlkJyk7XG4gICAgICB0aGlzLmNhbGxiYWNrcy5vbkludGVudCh7IHR5cGUsIHJlc291cmNlLCBhbW91bnQgfSk7XG4gICAgfSk7XG4gICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoKSA9PiB7XG4gICAgICBpbnB1dC5zZXRDdXN0b21WYWxpZGl0eSgnJyk7XG4gICAgICBpbnB1dC5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtaW52YWxpZCcpO1xuICAgIH0pO1xuICAgIHNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgICBhY3Rpb24uZGF0YXNldC5yZXNvdXJjZSA9IHNlbGVjdC52YWx1ZTtcbiAgICB9KTtcblxuICAgIHRoaXMudHJhbnNmZXJDb250cm9scy5zZXQodHlwZSwgeyBzZWxlY3QsIGlucHV0LCBidXR0b246IGFjdGlvbiB9KTtcbiAgICByb3cuYXBwZW5kKHJlc291cmNlTGFiZWwsIGFtb3VudExhYmVsLCBhY3Rpb24pO1xuICAgIHJldHVybiByb3c7XG4gIH1cblxuICBwcml2YXRlIG1ha2VQcm9kdWN0aW9uKCk6IEhUTUxFbGVtZW50IHtcbiAgICBjb25zdCBzZWN0aW9uID0gZWxlbWVudCgnc2VjdGlvbicsICdsaWZlLXByb2R1Y3Rpb24nKTtcbiAgICBzZWN0aW9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdQcm9jZXNzaW5nIGFuZCB0aWNrcycpO1xuICAgIHNlY3Rpb24uYXBwZW5kKGVsZW1lbnQoJ2gzJywgdW5kZWZpbmVkLCAnUHJvY2Vzc2luZycpKTtcbiAgICB0aGlzLmpvYnMgPSBlbGVtZW50KCdwJywgJ2xpZmUtam9icycpO1xuICAgIHRoaXMuam9icy5kYXRhc2V0LmpvYnMgPSAnJztcbiAgICB0aGlzLnRpY2sgPSBlbGVtZW50KCdwJywgJ2xpZmUtdGljaycpO1xuICAgIHRoaXMudGljay5kYXRhc2V0LnRpY2sgPSAnJztcbiAgICBzZWN0aW9uLmFwcGVuZCh0aGlzLmpvYnMsIHRoaXMudGljayk7XG5cbiAgICBmb3IgKGNvbnN0IHJlY2lwZUlkIG9mIFsnc2VlZCcsICdyYXRpb25zJ10gYXMgY29uc3QpIHtcbiAgICAgIGNvbnN0IHJlY2lwZSA9IFJFQ0lQRVNbcmVjaXBlSWRdO1xuICAgICAgY29uc3QgW2lucHV0LCBpbnB1dEFtb3VudF0gPSBPYmplY3QuZW50cmllcyhyZWNpcGUuaW5wdXQpWzBdO1xuICAgICAgY29uc3QgW291dHB1dCwgb3V0cHV0QW1vdW50XSA9IE9iamVjdC5lbnRyaWVzKHJlY2lwZS5vdXRwdXQpWzBdO1xuICAgICAgY29uc3QgYWN0aW9uID0gYnV0dG9uKFxuICAgICAgICBgTWFrZSAke3JlY2lwZUlkfTogJHtpbnB1dEFtb3VudH0gJHtpbnB1dH0gXHUyMTkyICR7b3V0cHV0QW1vdW50fSAke291dHB1dH0gXHUwMEI3ICR7cmVjaXBlLnRpY2tzfSAke3JlY2lwZS50aWNrcyA9PT0gMSA/ICd0aWNrJyA6ICd0aWNrcyd9YCxcbiAgICAgICAgJ3Byb2R1Y2UnLFxuICAgICAgKTtcbiAgICAgIGFjdGlvbi5kYXRhc2V0LnJlY2lwZSA9IHJlY2lwZUlkO1xuICAgICAgYWN0aW9uLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgIGFjdGlvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgdGhpcy5jYWxsYmFja3Mub25JbnRlbnQoeyB0eXBlOiAncHJvZHVjZScsIHJlY2lwZTogcmVjaXBlSWQgfSk7XG4gICAgICB9KTtcbiAgICAgIHRoaXMucHJvZHVjZUJ1dHRvbnMuc2V0KHJlY2lwZUlkLCBhY3Rpb24pO1xuICAgICAgc2VjdGlvbi5hcHBlbmQoYWN0aW9uKTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHRpY2tzIG9mIFsxLCA0XSkge1xuICAgICAgY29uc3QgYWN0aW9uID0gYnV0dG9uKGArJHt0aWNrc30gJHt0aWNrcyA9PT0gMSA/ICd0aWNrJyA6ICd0aWNrcyd9YCwgJ3RpY2snKTtcbiAgICAgIGFjdGlvbi5kYXRhc2V0LnRpY2tzID0gU3RyaW5nKHRpY2tzKTtcbiAgICAgIGFjdGlvbi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICBhY3Rpb24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB0aGlzLmNhbGxiYWNrcy5vbkludGVudCh7IHR5cGU6ICd0aWNrJywgdGlja3MgfSkpO1xuICAgICAgdGhpcy50aWNrQnV0dG9ucy5wdXNoKGFjdGlvbik7XG4gICAgICBzZWN0aW9uLmFwcGVuZChhY3Rpb24pO1xuICAgIH1cbiAgICByZXR1cm4gc2VjdGlvbjtcbiAgfVxuXG4gIHByaXZhdGUgbWFrZUNyb3BzKCk6IEhUTUxFbGVtZW50IHtcbiAgICBjb25zdCBzZWN0aW9uID0gZWxlbWVudCgnc2VjdGlvbicsICdsaWZlLWNyb3BzJyk7XG4gICAgc2VjdGlvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnVGVycmFjZWQgZmFybSBjcm9wcycpO1xuICAgIHNlY3Rpb24uYXBwZW5kKGVsZW1lbnQoJ2gzJywgdW5kZWZpbmVkLCAnVGVycmFjZWQgZmFybSBjcm9wcycpKTtcbiAgICB0aGlzLmZhcm1TdGF0dXMgPSBlbGVtZW50KCdwJywgJ2xpZmUtZmFybS1zdGF0dXMnKTtcbiAgICB0aGlzLmZhcm1TdGF0dXMuZGF0YXNldC5mYXJtID0gJyc7XG4gICAgc2VjdGlvbi5hcHBlbmQodGhpcy5mYXJtU3RhdHVzKTtcbiAgICBjb25zdCBwbG90cyA9IGVsZW1lbnQoJ2RpdicsICdsaWZlLXBsb3RzJyk7XG4gICAgZm9yIChjb25zdCBwbG90SWQgb2YgQ1JPUF9QTE9UX0lEUykge1xuICAgICAgY29uc3QgYWN0aW9uID0gYnV0dG9uKCdQbGFudCAxIHNlZWQnLCAncGxhbnQnKTtcbiAgICAgIGFjdGlvbi5kYXRhc2V0LnBsb3QgPSBwbG90SWQ7XG4gICAgICBhY3Rpb24uZGF0YXNldC5hY3Rpb24gPSAncGxhbnQnO1xuICAgICAgYWN0aW9uLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgIGFjdGlvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgdGhpcy5jYWxsYmFja3Mub25JbnRlbnQoe1xuICAgICAgICAgIHR5cGU6IGFjdGlvbi5kYXRhc2V0LmFjdGlvbiA9PT0gJ2hhcnZlc3RfY3JvcCcgPyAnaGFydmVzdF9jcm9wJyA6ICdwbGFudCcsIHBsb3RJZCxcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICAgIHRoaXMuY3JvcEJ1dHRvbnMuc2V0KHBsb3RJZCwgYWN0aW9uKTtcbiAgICAgIHBsb3RzLmFwcGVuZChhY3Rpb24pO1xuICAgIH1cbiAgICBzZWN0aW9uLmFwcGVuZChwbG90cyk7XG4gICAgcmV0dXJuIHNlY3Rpb247XG4gIH1cblxuICByZW5kZXIod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gICAgY29uc3QgbGlmZSA9IHdvcmxkLmxpZmU7XG4gICAgdGhpcy5ib2R5LmRhdGFzZXQuYXZhaWxhYmxlID0gU3RyaW5nKEJvb2xlYW4obGlmZSkpO1xuICAgIHRoaXMucm9vdC5jbGFzc0xpc3QudG9nZ2xlKCdpcy1sZWdhY3knLCAhbGlmZSk7XG4gICAgY29uc3QgdW5hdmFpbGFibGUgPSB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5saWZlLXVuYXZhaWxhYmxlJyk7XG4gICAgaWYgKHVuYXZhaWxhYmxlKSB1bmF2YWlsYWJsZS5oaWRkZW4gPSBCb29sZWFuKGxpZmUpO1xuXG4gICAgY29uc3QgY2FycmllZFZhbHVlczogUmVjb3JkPHN0cmluZywgbnVtYmVyIHwgbnVsbD4gPSB7fTtcbiAgICBjb25zdCBzdG9ja1ZhbHVlczogUmVjb3JkPHN0cmluZywgbnVtYmVyIHwgbnVsbD4gPSB7fTtcbiAgICBpZiAobGlmZSkge1xuICAgICAgY29uc3Qgc3RvY2sgPSBsaWZlLnN0b2NrcGlsZXMuZ2V0KEZPVU5ERVJfU1RPQ0tQSUxFX0lEKTtcbiAgICAgIGNvbnN0IGludmVudG9yeSA9IHN0b2NrPy5pbnZlbnRvcnkgPz8ge307XG4gICAgICBmb3IgKGNvbnN0IHJlc291cmNlIG9mIExJRkVfUkVTT1VSQ0VTKSB7XG4gICAgICAgIGNhcnJpZWRWYWx1ZXNbcmVzb3VyY2VdID0gd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwO1xuICAgICAgICBzdG9ja1ZhbHVlc1tyZXNvdXJjZV0gPSBzdG9jayA/IGludmVudG9yeVtyZXNvdXJjZV0gPz8gMCA6IG51bGw7XG4gICAgICB9XG4gICAgICB0aGlzLmNhcnJpZWRDYXBhY2l0eS50ZXh0Q29udGVudCA9IGAke09iamVjdC52YWx1ZXMod29ybGQuaW52ZW50b3J5KS5yZWR1Y2UoKHN1bSwgbikgPT4gc3VtICsgbiwgMCl9IC8gJHtDQVJSSUVEX0NBUEFDSVRZfWA7XG4gICAgICB0aGlzLnN0b2NrQ2FwYWNpdHkudGV4dENvbnRlbnQgPSBzdG9ja1xuICAgICAgICA/IGAke09iamVjdC52YWx1ZXMoaW52ZW50b3J5KS5yZWR1Y2UoKHN1bSwgbikgPT4gc3VtICsgbiwgMCl9IC8gJHtTVE9DS1BJTEVfQ0FQQUNJVFl9YFxuICAgICAgICA6ICdVbmF2YWlsYWJsZSc7XG4gICAgICB0aGlzLmpvYnMudGV4dENvbnRlbnQgPSBgJHtsaWZlLmpvYnMuc2l6ZX0gLyAke01BWF9QUk9EVUNUSU9OX0pPQlN9IGFjdGl2ZSBqb2JzYDtcbiAgICAgIHRoaXMudGljay50ZXh0Q29udGVudCA9IGBTZXR0bGVtZW50IHRpY2sgJHtsaWZlLnRpY2t9YDtcbiAgICAgIGNvbnN0IGhhc0Zhcm0gPSBbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV0uc29tZSgoc3RydWN0dXJlKSA9PiBzdHJ1Y3R1cmUua2luZCA9PT0gJ3RlcnJhY2UnKTtcbiAgICAgIHRoaXMuZmFybVN0YXR1cy50ZXh0Q29udGVudCA9IGhhc0Zhcm0gPyAnRm91bmRlciB0ZXJyYWNlZCBmYXJtIFx1MDBCNyA5IHBsb3RzJyA6ICdGYXJtIG1pc3NpbmcnO1xuICAgICAgdGhpcy5mYXJtU3RhdHVzLmRhdGFzZXQuZmFybSA9IGhhc0Zhcm0gPyAncHJlc2VudCcgOiAnbWlzc2luZyc7XG5cbiAgICAgIGZvciAoY29uc3QgW3JlY2lwZUlkLCBhY3Rpb25dIG9mIHRoaXMucHJvZHVjZUJ1dHRvbnMpIHtcbiAgICAgICAgY29uc3QgZW5vdWdoSW5wdXQgPSBPYmplY3QuZW50cmllcyhSRUNJUEVTW3JlY2lwZUlkXS5pbnB1dClcbiAgICAgICAgICAuZXZlcnkoKFtyZXNvdXJjZSwgYW1vdW50XSkgPT4gKGludmVudG9yeVtyZXNvdXJjZV0gPz8gMCkgPj0gKGFtb3VudCA/PyAwKSk7XG4gICAgICAgIGFjdGlvbi5kaXNhYmxlZCA9ICFzdG9jayB8fCBsaWZlLmpvYnMuc2l6ZSA+PSBNQVhfUFJPRFVDVElPTl9KT0JTIHx8ICFlbm91Z2hJbnB1dDtcbiAgICAgIH1cbiAgICAgIGZvciAoY29uc3QgYWN0aW9uIG9mIHRoaXMudGlja0J1dHRvbnMpIGFjdGlvbi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgZm9yIChjb25zdCBwbG90SWQgb2YgQ1JPUF9QTE9UX0lEUykge1xuICAgICAgICBjb25zdCBhY3Rpb24gPSB0aGlzLmNyb3BCdXR0b25zLmdldChwbG90SWQpITtcbiAgICAgICAgY29uc3QgY3JvcCA9IGxpZmUuY3JvcHMuZ2V0KHBsb3RJZCk7XG4gICAgICAgIGlmICghY3JvcCkge1xuICAgICAgICAgIGFjdGlvbi5kYXRhc2V0LmFjdGlvbiA9ICdwbGFudCc7XG4gICAgICAgICAgYWN0aW9uLnRleHRDb250ZW50ID0gJ1BsYW50IDEgc2VlZCc7XG4gICAgICAgICAgYWN0aW9uLmRpc2FibGVkID0gIWhhc0Zhcm0gfHwgKGludmVudG9yeS5zZWVkID8/IDApIDwgMTtcbiAgICAgICAgfSBlbHNlIGlmIChjcm9wUmVhZHkoY3JvcCwgbGlmZS50aWNrKSkge1xuICAgICAgICAgIGFjdGlvbi5kYXRhc2V0LmFjdGlvbiA9ICdoYXJ2ZXN0X2Nyb3AnO1xuICAgICAgICAgIGFjdGlvbi50ZXh0Q29udGVudCA9ICdIYXJ2ZXN0IGNyb3AnO1xuICAgICAgICAgIGFjdGlvbi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFjdGlvbi5kYXRhc2V0LmFjdGlvbiA9ICdwbGFudCc7XG4gICAgICAgICAgY29uc3QgcmVtYWluaW5nID0gTWF0aC5tYXgoMCwgY3JvcC5wbGFudGVkVGljayArIGNyb3AuZ3Jvd3RoVGlja3MgLSBsaWZlLnRpY2spO1xuICAgICAgICAgIGFjdGlvbi50ZXh0Q29udGVudCA9IGBHcm93aW5nICR7cmVtYWluaW5nfS8ke2Nyb3AuZ3Jvd3RoVGlja3N9IHRpY2tzYDtcbiAgICAgICAgICBhY3Rpb24uZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuY2FycmllZENhcGFjaXR5LnRleHRDb250ZW50ID0gYFVuYXZhaWxhYmxlIC8gJHtDQVJSSUVEX0NBUEFDSVRZfWA7XG4gICAgICB0aGlzLnN0b2NrQ2FwYWNpdHkudGV4dENvbnRlbnQgPSBgVW5hdmFpbGFibGUgLyAke1NUT0NLUElMRV9DQVBBQ0lUWX1gO1xuICAgICAgdGhpcy5qb2JzLnRleHRDb250ZW50ID0gJ0pvYnMgdW5hdmFpbGFibGUnO1xuICAgICAgdGhpcy50aWNrLnRleHRDb250ZW50ID0gJ1NldHRsZW1lbnQgdGljayB1bmF2YWlsYWJsZSc7XG4gICAgICB0aGlzLmZhcm1TdGF0dXMudGV4dENvbnRlbnQgPSAnRmFybSBtaXNzaW5nIFx1MDBCNyBzZXR0bGVtZW50IGxpZmUgdW5hdmFpbGFibGUnO1xuICAgICAgdGhpcy5mYXJtU3RhdHVzLmRhdGFzZXQuZmFybSA9ICdtaXNzaW5nJztcbiAgICAgIGZvciAoY29uc3QgYWN0aW9uIG9mIHRoaXMucHJvZHVjZUJ1dHRvbnMudmFsdWVzKCkpIGFjdGlvbi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICBmb3IgKGNvbnN0IGFjdGlvbiBvZiB0aGlzLnRpY2tCdXR0b25zKSBhY3Rpb24uZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgZm9yIChjb25zdCBwbG90SWQgb2YgQ1JPUF9QTE9UX0lEUykge1xuICAgICAgICBjb25zdCBhY3Rpb24gPSB0aGlzLmNyb3BCdXR0b25zLmdldChwbG90SWQpITtcbiAgICAgICAgYWN0aW9uLmRhdGFzZXQuYWN0aW9uID0gJ3BsYW50JztcbiAgICAgICAgYWN0aW9uLnRleHRDb250ZW50ID0gJ1BsYW50IDEgc2VlZCc7XG4gICAgICAgIGFjdGlvbi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCByZXNvdXJjZSBvZiBMSUZFX1JFU09VUkNFUykge1xuICAgICAgY29uc3QgY2FycmllZCA9IHRoaXMuY2FycmllZFZhbHVlcy5nZXQocmVzb3VyY2UpITtcbiAgICAgIGNvbnN0IHN0b2NrID0gdGhpcy5zdG9ja1ZhbHVlcy5nZXQocmVzb3VyY2UpITtcbiAgICAgIGNhcnJpZWQudGV4dENvbnRlbnQgPSAhbGlmZSA/ICdVbmF2YWlsYWJsZScgOiBTdHJpbmcoY2FycmllZFZhbHVlc1tyZXNvdXJjZV0gPz8gMCk7XG4gICAgICBzdG9jay50ZXh0Q29udGVudCA9ICFsaWZlIHx8IHN0b2NrVmFsdWVzW3Jlc291cmNlXSA9PT0gbnVsbCA/ICdVbmF2YWlsYWJsZScgOiBTdHJpbmcoc3RvY2tWYWx1ZXNbcmVzb3VyY2VdKTtcbiAgICAgIGNhcnJpZWQuZGF0YXNldC52YWx1ZSA9ICFsaWZlID8gJ3VuYXZhaWxhYmxlJyA6IFN0cmluZyhjYXJyaWVkVmFsdWVzW3Jlc291cmNlXSA/PyAwKTtcbiAgICAgIHN0b2NrLmRhdGFzZXQudmFsdWUgPSAhbGlmZSB8fCBzdG9ja1ZhbHVlc1tyZXNvdXJjZV0gPT09IG51bGwgPyAndW5hdmFpbGFibGUnIDogU3RyaW5nKHN0b2NrVmFsdWVzW3Jlc291cmNlXSk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgY29udHJvbHMgb2YgdGhpcy50cmFuc2ZlckNvbnRyb2xzLnZhbHVlcygpKSB7XG4gICAgICBjb250cm9scy5idXR0b24uZGlzYWJsZWQgPSAhbGlmZTtcbiAgICAgIGNvbnRyb2xzLnNlbGVjdC5kaXNhYmxlZCA9ICFsaWZlO1xuICAgICAgY29udHJvbHMuaW5wdXQuZGlzYWJsZWQgPSAhbGlmZTtcbiAgICB9XG4gIH1cblxuICBzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICB0aGlzLnJvb3QuaGlkZGVuID0gIXZpc2libGU7XG4gIH1cblxuICB0b2FzdChtZXNzYWdlOiBzdHJpbmcsIGtpbmQ6ICdnb29kJyB8ICd3YXJuJyB8ICdiYWQnID0gJ2dvb2QnKTogdm9pZCB7XG4gICAgdGhpcy50b2FzdEVsLnRleHRDb250ZW50ID0gbWVzc2FnZTtcbiAgICB0aGlzLnRvYXN0RWwuY2xhc3NOYW1lID0gYGxpZmUtdG9hc3Qgc2hvdyAke2tpbmR9YDtcbiAgICB0aGlzLnRvYXN0RWwuaGlkZGVuID0gZmFsc2U7XG4gICAgdGhpcy5jYWxsYmFja3Mub25Ub2FzdD8uKG1lc3NhZ2UsIGtpbmQpO1xuICB9XG59XG4iLCAiLy8gUGxheWFibGUgc2NoZW1hLTMgbGlmZSBsb29wLiBFdmVyeSB3cml0ZSBpcyBhIEdhbWVTZXNzaW9uIGNvbW1hbmQ7IHRoZSBVSSxcbi8vIG1lc2hlcyBhbmQgcGVyc2lzdGVuY2UgYXJlIGRlcml2ZWQgZnJvbSB0aGUgcmVzdWx0aW5nIGF1dGhvcml0YXRpdmUgd29ybGQuXG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSc7XG5pbXBvcnQgeyBGT1VOREVSX1NUT0NLUElMRV9JRCwgTGlmZVJlc291cmNlLCBjcm9wUmVhZHkgfSBmcm9tICcuLi9zaW0vZWNvbm9teSc7XG5pbXBvcnQgeyBXb3JsZCB9IGZyb20gJy4uL3NpbS93b3JsZCc7XG5pbXBvcnQgeyBidWlsZExpZmVNZXNoZXMsIGRpc3Bvc2VMaWZlTWVzaGVzIH0gZnJvbSAnLi4vcmVuZGVyL2xpZmUnO1xuaW1wb3J0IHsgTGlmZUludGVudCwgTGlmZVBhbmVsIH0gZnJvbSAnLi4vdWkvbGlmZSc7XG5pbXBvcnQgeyBCcm93c2VyU2F2ZVN0b3JlIH0gZnJvbSAnLi9wZXJzaXN0ZW5jZSc7XG5pbXBvcnQgeyBDb21tYW5kLCBHYW1lU2Vzc2lvbiB9IGZyb20gJy4vc2Vzc2lvbic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTGlmZUdhbWVPcHRpb25zIHtcbiAgc2Vzc2lvbjogR2FtZVNlc3Npb247XG4gIHN0b3JlOiBCcm93c2VyU2F2ZVN0b3JlO1xuICBzY2VuZTogVEhSRUUuU2NlbmU7XG4gIHRvYXN0OiAobWVzc2FnZTogc3RyaW5nLCBraW5kOiAnZ29vZCcgfCAnd2FybicgfCAnYmFkJykgPT4gdm9pZDtcbn1cblxuLyoqIEEgc25hcHNob3QgZm9yIHRoZSByZWFkLW9ubHkgYnJvd3NlciBldmlkZW5jZSBzdXJmYWNlLCBuZXZlciBhIHdyaXRlIEFQSS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBsaWZlTWV0cmljcyh3b3JsZDogV29ybGQpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IG51bGwge1xuICBjb25zdCBsaWZlID0gd29ybGQubGlmZTtcbiAgaWYgKCFsaWZlKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgc3RvY2sgPSBsaWZlLnN0b2NrcGlsZXMuZ2V0KEZPVU5ERVJfU1RPQ0tQSUxFX0lEKTtcbiAgcmV0dXJuIHtcbiAgICB0aWNrOiBsaWZlLnRpY2ssXG4gICAgc3RvY2twaWxlOiBzdG9jayA/IHsgLi4uc3RvY2ssIGludmVudG9yeTogeyAuLi5zdG9jay5pbnZlbnRvcnkgfSB9IDogbnVsbCxcbiAgICBqb2JzOiBbLi4ubGlmZS5qb2JzLnZhbHVlcygpXS5tYXAoKGpvYikgPT4gKHsgLi4uam9iIH0pKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSksXG4gICAgY3JvcHM6IEFycmF5LmZyb20oeyBsZW5ndGg6IDkgfSwgKF8sIGluZGV4KSA9PiB7XG4gICAgICBjb25zdCBpZCA9IGBjcm9wOiR7aW5kZXh9YDtcbiAgICAgIGNvbnN0IGNyb3AgPSBsaWZlLmNyb3BzLmdldChpZCk7XG4gICAgICByZXR1cm4gY3JvcCA/IHsgLi4uY3JvcCwgcmVhZHk6IGNyb3BSZWFkeShjcm9wLCBsaWZlLnRpY2spIH1cbiAgICAgICAgOiB7IGlkLCBwbGFudGVkVGljazogbnVsbCwgZ3Jvd3RoVGlja3M6IG51bGwsIHJlYWR5OiBmYWxzZSB9O1xuICAgIH0pLFxuICB9O1xufVxuXG5leHBvcnQgY2xhc3MgTGlmZUdhbWUge1xuICBwcml2YXRlIHJlYWRvbmx5IHBhbmVsOiBMaWZlUGFuZWw7XG4gIHByaXZhdGUgcmVhZG9ubHkgbWVzaGVzOiBUSFJFRS5Hcm91cDtcbiAgcHJpdmF0ZSBsYXN0UmV2aXNpb24gPSAtMTtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IExpZmVHYW1lT3B0aW9ucykge1xuICAgIHRoaXMubWVzaGVzID0gYnVpbGRMaWZlTWVzaGVzKG9wdGlvbnMuc2Vzc2lvbi53b3JsZCk7XG4gICAgb3B0aW9ucy5zY2VuZS5hZGQodGhpcy5tZXNoZXMpO1xuICAgIHRoaXMubGFzdFJldmlzaW9uID0gb3B0aW9ucy5zZXNzaW9uLndvcmxkLnJldmlzaW9uO1xuICAgIHRoaXMucGFuZWwgPSBuZXcgTGlmZVBhbmVsKHtcbiAgICAgIG9uSW50ZW50OiAoaW50ZW50KSA9PiB0aGlzLnN1Ym1pdChpbnRlbnQpLFxuICAgIH0pO1xuICAgIHRoaXMucGFuZWwucmVuZGVyKG9wdGlvbnMuc2Vzc2lvbi53b3JsZCk7XG4gIH1cblxuICBwcml2YXRlIHN1Ym1pdChpbnRlbnQ6IExpZmVJbnRlbnQpOiB2b2lkIHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5vcHRpb25zLnNlc3Npb247XG4gICAgaWYgKHNlc3Npb24uam91cm5hbC5zY2hlbWEgIT09IDMpIHJldHVybjtcbiAgICBjb25zdCB0YXJnZXQgPSBpbnRlbnQudHlwZSA9PT0gJ2RlcG9zaXQnIHx8IGludGVudC50eXBlID09PSAnd2l0aGRyYXcnID8gaW50ZW50LnJlc291cmNlXG4gICAgICA6IGludGVudC50eXBlID09PSAncHJvZHVjZScgPyBpbnRlbnQucmVjaXBlXG4gICAgICAgIDogaW50ZW50LnR5cGUgPT09ICd0aWNrJyA/IFN0cmluZyhpbnRlbnQudGlja3MpXG4gICAgICAgICAgOiBpbnRlbnQudHlwZSA9PT0gJ3BsYW50JyB8fCBpbnRlbnQudHlwZSA9PT0gJ2hhcnZlc3RfY3JvcCcgPyBpbnRlbnQucGxvdElkIDogJyc7XG4gICAgY29uc3QgYmFzZSA9IHtcbiAgICAgIHNjaGVtYTogMyBhcyBjb25zdCxcbiAgICAgIGlkOiBzZXNzaW9uLmNvbW1hbmRJZChpbnRlbnQudHlwZSwgdGFyZ2V0KSxcbiAgICAgIGV4cGVjdGVkUmV2aXNpb246IHNlc3Npb24ud29ybGQucmV2aXNpb24sXG4gICAgfTtcbiAgICBsZXQgY29tbWFuZDogQ29tbWFuZDtcbiAgICBpZiAoaW50ZW50LnR5cGUgPT09ICdkZXBvc2l0JyB8fCBpbnRlbnQudHlwZSA9PT0gJ3dpdGhkcmF3Jykge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogaW50ZW50LnR5cGUsIHN0b2NrcGlsZUlkOiBGT1VOREVSX1NUT0NLUElMRV9JRCxcbiAgICAgICAgcmVzb3VyY2VzOiB7IFtpbnRlbnQucmVzb3VyY2VdOiBpbnRlbnQuYW1vdW50IH0gYXMgUGFydGlhbDxSZWNvcmQ8TGlmZVJlc291cmNlLCBudW1iZXI+PiB9O1xuICAgIH0gZWxzZSBpZiAoaW50ZW50LnR5cGUgPT09ICdwcm9kdWNlJykge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogaW50ZW50LnR5cGUsIHN0b2NrcGlsZUlkOiBGT1VOREVSX1NUT0NLUElMRV9JRCxcbiAgICAgICAgcmVjaXBlOiBpbnRlbnQucmVjaXBlIH07XG4gICAgfSBlbHNlIGlmIChpbnRlbnQudHlwZSA9PT0gJ3RpY2snKSB7XG4gICAgICBjb21tYW5kID0geyAuLi5iYXNlLCB0eXBlOiBpbnRlbnQudHlwZSwgdGlja3M6IGludGVudC50aWNrcyB9O1xuICAgIH0gZWxzZSBpZiAoaW50ZW50LnR5cGUgPT09ICdwbGFudCcgfHwgaW50ZW50LnR5cGUgPT09ICdoYXJ2ZXN0X2Nyb3AnKSB7XG4gICAgICBjb21tYW5kID0geyAuLi5iYXNlLCB0eXBlOiBpbnRlbnQudHlwZSwgcGxvdElkOiBpbnRlbnQucGxvdElkIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQgbGlmZSBpbnRlbnQnKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gc2Vzc2lvbi5kaXNwYXRjaChjb21tYW5kKTtcbiAgICBpZiAoIXJlc3VsdC5vaykge1xuICAgICAgdGhpcy5vcHRpb25zLnRvYXN0KGAke2ludGVudC50eXBlLnJlcGxhY2UoJ18nLCAnICcpfTogJHtyZXN1bHQucmVhc29ucy5qb2luKCc7ICcpfWAsICdiYWQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGV0IHNhdmVkOiB7IG9rOiBib29sZWFuOyBtZXNzYWdlOiBzdHJpbmcgfSB8IG51bGwgPSBudWxsO1xuICAgIGlmICghcmVzdWx0LmR1cGxpY2F0ZSkgc2F2ZWQgPSB0aGlzLm9wdGlvbnMuc3RvcmUuc2F2ZShzZXNzaW9uKTtcbiAgICBjb25zdCBtZXNzYWdlID0gbGlmZU1lc3NhZ2UoaW50ZW50KSArIChzYXZlZCA/IGAgXHUwMEI3ICR7c2F2ZWQubWVzc2FnZX1gIDogJycpO1xuICAgIHRoaXMub3B0aW9ucy50b2FzdChtZXNzYWdlLCBzYXZlZD8ub2sgPT09IGZhbHNlID8gJ2JhZCcgOiAnZ29vZCcpO1xuICAgIC8vIFJlamVjdGVkIGNvbW1hbmRzIGFuZCBkdXBsaWNhdGUgcmVjZWlwdHMgY2Fubm90IHJlZnJlc2ggYXV0aG9yaXRhdGl2ZSBsaWZlLlxuICAgIGlmICghcmVzdWx0LmR1cGxpY2F0ZSkgdGhpcy5yZWZyZXNoKCk7XG4gIH1cblxuICByZWZyZXNoKCk6IHZvaWQge1xuICAgIGNvbnN0IHdvcmxkID0gdGhpcy5vcHRpb25zLnNlc3Npb24ud29ybGQ7XG4gICAgLy8gUmVuZGVyaW5nIGFuZCBjb250cm9scyBjb25zdW1lIGNvbW1pdHRlZCByZXZpc2lvbnM7IGF2b2lkIHJlYnVpbGRpbmcgYVxuICAgIC8vIGZ1bGwgc25hcHNob3QgZHVyaW5nIGV2ZXJ5IGFuaW1hdGlvbiBmcmFtZS5cbiAgICBpZiAod29ybGQucmV2aXNpb24gPT09IHRoaXMubGFzdFJldmlzaW9uKSByZXR1cm47XG4gICAgdGhpcy5wYW5lbC5yZW5kZXIod29ybGQpO1xuICAgIGNvbnN0IG5leHQgPSBidWlsZExpZmVNZXNoZXMod29ybGQpO1xuICAgIC8vIFRoZSBudW1iZXIgb2YgY2hpbGRyZW4gZ3Jvd3Mgd2hlbiB0aGUgZmFybSBpcyBmaXJzdCBidWlsdC4gRGlzcG9zZSB0aGVcbiAgICAvLyBjb21taXR0ZWQgb3ZlcmxheSBhcyBhIGdyb3VwIHJhdGhlciB0aGFuIGFzc3VtaW5nIG1hdGNoaW5nIGNoaWxkIGNvdW50cy5cbiAgICBkaXNwb3NlTGlmZU1lc2hlcyh0aGlzLm1lc2hlcyk7XG4gICAgdGhpcy5tZXNoZXMuYWRkKC4uLm5leHQuY2hpbGRyZW4pO1xuICAgIGRpc3Bvc2VMaWZlTWVzaGVzKG5leHQpO1xuICAgIHRoaXMubGFzdFJldmlzaW9uID0gd29ybGQucmV2aXNpb247XG4gIH1cblxuICBnZXQgaW5zcGVjdGFibGVSb290KCk6IFRIUkVFLkdyb3VwIHsgcmV0dXJuIHRoaXMubWVzaGVzOyB9XG5cbiAgc2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG4gICAgdGhpcy5wYW5lbC5zZXRWaXNpYmxlKHZpc2libGUpO1xuICAgIHRoaXMubWVzaGVzLnZpc2libGUgPSB2aXNpYmxlIHx8ICFkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5jb250YWlucygnY2xlYW4nKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBsaWZlTWVzc2FnZShpbnRlbnQ6IExpZmVJbnRlbnQpOiBzdHJpbmcge1xuICBpZiAoaW50ZW50LnR5cGUgPT09ICdkZXBvc2l0JyB8fCBpbnRlbnQudHlwZSA9PT0gJ3dpdGhkcmF3Jykge1xuICAgIHJldHVybiBgJHtpbnRlbnQudHlwZSA9PT0gJ2RlcG9zaXQnID8gJ1N0b3JlZCcgOiAnQ29sbGVjdGVkJ30gJHtpbnRlbnQuYW1vdW50fSAke2ludGVudC5yZXNvdXJjZX1gO1xuICB9XG4gIGlmIChpbnRlbnQudHlwZSA9PT0gJ3Byb2R1Y2UnKSByZXR1cm4gYFN0YXJ0ZWQgJHtpbnRlbnQucmVjaXBlfSBwcm9kdWN0aW9uYDtcbiAgaWYgKGludGVudC50eXBlID09PSAndGljaycpIHJldHVybiBgQWR2YW5jZWQgJHtpbnRlbnQudGlja3N9IHNpbXVsYXRpb24gdGljayR7aW50ZW50LnRpY2tzID09PSAxID8gJycgOiAncyd9YDtcbiAgaWYgKGludGVudC50eXBlID09PSAncGxhbnQnIHx8IGludGVudC50eXBlID09PSAnaGFydmVzdF9jcm9wJykge1xuICAgIHJldHVybiBpbnRlbnQudHlwZSA9PT0gJ3BsYW50JyA/IGBQbGFudGVkICR7aW50ZW50LnBsb3RJZH1gXG4gICAgICA6IGBIYXJ2ZXN0ZWQgJHtpbnRlbnQucGxvdElkfTogNiBmb29kICsgMSBmaWJlcmA7XG4gIH1cbiAgcmV0dXJuICcnO1xufVxuIiwgIi8vIFRlcnJhaW4gcXVlcnkgbGF5ZXIgXHUyMDE0IHB1cmUgc2ltdWxhdGlvbiwgbm8gdGhyZWUuanMgaW1wb3J0cyAoRC0wMDUpLlxuLy9cbi8vIE0wMDIgU3lzdGVtIDE6IG9uZSBzaGFyZWQsIGNhY2hlZCBjb250cmFjdCBmb3IgY29uc3RydWN0aW9uLCBmYXJtaW5nLFxuLy8gbW92ZW1lbnQsIG5hdmlnYXRpb24gYW5kIHRoZSBBSSBhZ2VudC4gVGhlc2UgcXVlcmllcyBkZXNjcmliZSB0aGVcbi8vIGF1dGhvcml0YXRpdmUgdm94ZWwgdm9sdW1lOyB0aGV5IG5ldmVyIG11dGF0ZSBpdCBhbmQgbmV2ZXIgY3JlYXRlIGEgc2Vjb25kXG4vLyB0ZXJyYWluIHJlcHJlc2VudGF0aW9uLlxuLy9cbi8vIENvbnZlbnRpb25zOlxuLy8gICAqIHgveiBhcmUgaW50ZWdlciBjb2x1bW4gY29vcmRpbmF0ZXMgaW4gWy0xMDI0LCAxMDI0KS5cbi8vICAgKiB5IGlzIGFuIGludGVnZXIgdm94ZWwgY29vcmRpbmF0ZSBpbiBbLTE2LCAxMTIpLlxuLy8gICAqIHN1cmZhY2VZIGlzIHRoZSBleHBvc2VkIHRvcCBmYWNlICh0b3BTb2xpZCArIDEpLCBtYXRjaGluZyBNMDAxLlxuLy8gICAqIEEgcmVjdCBpcyBpbmNsdXNpdmUgb24gYWxsIGZvdXIgZWRnZXMuXG5pbXBvcnQge1xuICBXb3JsZCwgTWF0SWQsIE1BVCwgU0VBX0xFVkVMLCBZX01JTiwgWV9NQVgsIEhBTEYsXG4gIHN1cmZhY2VBdCwgdG9wTWF0ZXJpYWxBdFdvcmxkLCBnZXRWb3hlbCwgaXNTb2xpZCxcbiAgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG4gIEFjdGl2ZUVudGl0eUtpbmQsIEVudGl0eUtpbmQsIGlzUmV0aXJlZFN0b25lS2luZCxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBpc1N0b25lUmVwbGF5IH0gZnJvbSAnLi9zdG9uZS1jb21wYXQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJlY3Qge1xuICB4MDogbnVtYmVyO1xuICB6MDogbnVtYmVyO1xuICB4MTogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsUmVnaW9uIGV4dGVuZHMgUmVjdCB7XG4gIHkwOiBudW1iZXI7XG4gIHkxOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVSZWN0KHJlY3Q6IFJlY3QpOiBSZWN0IHtcbiAgcmV0dXJuIHtcbiAgICB4MDogTWF0aC5taW4ocmVjdC54MCwgcmVjdC54MSksXG4gICAgejA6IE1hdGgubWluKHJlY3QuejAsIHJlY3QuejEpLFxuICAgIHgxOiBNYXRoLm1heChyZWN0LngwLCByZWN0LngxKSxcbiAgICB6MTogTWF0aC5tYXgocmVjdC56MCwgcmVjdC56MSksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0Q29sdW1ucyhyZWN0OiBSZWN0KTogbnVtYmVyIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIHJldHVybiAoci54MSAtIHIueDAgKyAxKSAqIChyLnoxIC0gci56MCArIDEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjdENvbnRhaW5zKHJlY3Q6IFJlY3QsIHg6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB4ID49IHJlY3QueDAgJiYgeCA8PSByZWN0LngxICYmIHogPj0gcmVjdC56MCAmJiB6IDw9IHJlY3QuejE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBhbmRSZWN0KHJlY3Q6IFJlY3QsIGFtb3VudDogbnVtYmVyKTogUmVjdCB7XG4gIHJldHVybiB7XG4gICAgeDA6IHJlY3QueDAgLSBhbW91bnQsXG4gICAgejA6IHJlY3QuejAgLSBhbW91bnQsXG4gICAgeDE6IHJlY3QueDEgKyBhbW91bnQsXG4gICAgejE6IHJlY3QuejEgKyBhbW91bnQsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0VG9SZWdpb24ocmVjdDogUmVjdCwgeTAgPSBZX01JTiwgeTEgPSBZX01BWCAtIDEpOiBWb3hlbFJlZ2lvbiB7XG4gIHJldHVybiB7IC4uLm5vcm1hbGl6ZVJlY3QocmVjdCksIHkwLCB5MSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaW9uc092ZXJsYXAoYTogVm94ZWxSZWdpb24sIGI6IFZveGVsUmVnaW9uKTogYm9vbGVhbiB7XG4gIHJldHVybiBhLngwIDw9IGIueDEgJiYgYS54MSA+PSBiLngwICYmIGEuejAgPD0gYi56MSAmJiBhLnoxID49IGIuejBcbiAgICAmJiBhLnkwIDw9IGIueTEgJiYgYS55MSA+PSBiLnkwO1xufVxuXG4vKiogSW5jbHVzaXZlIGNvbnRhaW5tZW50IG9mIGEgdm94ZWwgaW4gYSB3b3JrIGVudmVsb3BlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVudmVsb3BlQ29udGFpbnMocmVjdHM6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10sIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgZm9yIChjb25zdCByIG9mIHJlY3RzKSB7XG4gICAgaWYgKHggPj0gci54MCAmJiB4IDw9IHIueDEgJiYgeSA+PSByLnkwICYmIHkgPD0gci55MSAmJiB6ID49IHIuejAgJiYgeiA8PSByLnoxKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVycmFpbkNvbHVtbiB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICAvKiogRXhwb3NlZCB0b3AgZmFjZSBvZiB0aGUgc29saWQgY29sdW1uOyB0aGUgZmlyc3QgYWlyIGNlbGwgYWJvdmUgaXQuICovXG4gIHN1cmZhY2VZOiBudW1iZXI7XG4gIC8qKiBUaGUgaGlnaGVzdCBzb2xpZCB2b3hlbCwgb3IgWV9NSU4gLSAxIGlmIHRoZSBjb2x1bW4gaGFzIG5vIHNvbGlkLiAqL1xuICB0b3BTb2xpZFk6IG51bWJlcjtcbiAgdG9wTWF0ZXJpYWw6IE1hdElkO1xuICBzb2xpZDogYm9vbGVhbjtcbiAgLyoqIFdhdGVyIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlLCB1cCB0byBzZWEgbGV2ZWwuIDAgb24gZHJ5IGxhbmQuICovXG4gIHdhdGVyRGVwdGg6IG51bWJlcjtcbiAgdW5kZXJ3YXRlcjogYm9vbGVhbjtcbiAgLyoqIExhcmdlc3QgNC1uZWlnaGJvdXIgc3VyZmFjZSBzdGVwIGluIG1ldHJlcyAoMSA9IGEgc2luZ2xlIHZveGVsIHJpc2VyKS4gKi9cbiAgc2xvcGU6IG51bWJlcjtcbiAgLyoqIEZyZWUgYWlyIGNlbGxzIGFib3ZlIHRoZSBzdXJmYWNlLCBjYXBwZWQgYXQgQ0xFQVJBTkNFX1BST0JFLiAqL1xuICBjbGVhcmFuY2U6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IENMRUFSQU5DRV9QUk9CRSA9IDg7XG5cbmZ1bmN0aW9uIHN1cmZhY2VBdFNhZmUod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgZmFsbGJhY2s6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBmYWxsYmFjaztcbiAgcmV0dXJuIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbi8qKiBXYXRlciBkZXB0aCB0aGF0IHJlc3BlY3RzIGEgZHJ5IHBpdCBiZWxvdyBzZWEgbGV2ZWwgKHVubGlrZSBoZWlnaHQgYWxvbmUpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyRGVwdGhBdENvbHVtbih3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmIChzdXJmYWNlID49IFNFQV9MRVZFTCkgcmV0dXJuIDA7XG4gIGlmIChnZXRWb3hlbCh3b3JsZCwgeCwgU0VBX0xFVkVMIC0gMSwgeikgIT09IE1BVC5XQVRFUikgcmV0dXJuIDA7XG4gIHJldHVybiBTRUFfTEVWRUwgLSBzdXJmYWNlO1xufVxuXG4vKiogVHJ1ZSB3aGVuIGBoZWlnaHRgIGFpciBjZWxscyBhYm92ZSB0aGUgc3VyZmFjZSBhcmUgZnJlZSBvZiBzb2xpZCBvciB3YXRlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjbGVhcmFuY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBoZWlnaHQ7IGkrKykge1xuICAgIGlmIChnZXRWb3hlbCh3b3JsZCwgeCwgc3VyZmFjZSArIGksIHopICE9PSBNQVQuQUlSKSByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2x1bW5BdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogVGVycmFpbkNvbHVtbiB7XG4gIGNvbnN0IGN4ID0gTWF0aC5mbG9vcih4KSwgY3ogPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCBzdXJmYWNlWSA9IHN1cmZhY2VBdCh3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3QgdG9wTWF0ZXJpYWwgPSB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQsIGN4LCBjeik7XG4gIGNvbnN0IHNvbGlkID0gc3VyZmFjZVkgPiBZX01JTiAmJiBpc1NvbGlkKHRvcE1hdGVyaWFsKTtcbiAgY29uc3Qgd2F0ZXJEZXB0aCA9IHdhdGVyRGVwdGhBdENvbHVtbih3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4IC0gMSwgY3osIHN1cmZhY2VZKSksXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCArIDEsIGN6LCBzdXJmYWNlWSkpLFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3gsIGN6IC0gMSwgc3VyZmFjZVkpKSxcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4LCBjeiArIDEsIHN1cmZhY2VZKSksXG4gICk7XG4gIGxldCBjbGVhcmFuY2UgPSAwO1xuICB3aGlsZSAoY2xlYXJhbmNlIDwgQ0xFQVJBTkNFX1BST0JFICYmIGdldFZveGVsKHdvcmxkLCBjeCwgc3VyZmFjZVkgKyBjbGVhcmFuY2UsIGN6KSA9PT0gTUFULkFJUikge1xuICAgIGNsZWFyYW5jZSsrO1xuICB9XG4gIHJldHVybiB7XG4gICAgeDogY3gsIHo6IGN6LCBzdXJmYWNlWSwgdG9wU29saWRZOiBzdXJmYWNlWSAtIDEsIHRvcE1hdGVyaWFsLFxuICAgIHNvbGlkLCB3YXRlckRlcHRoLCB1bmRlcndhdGVyOiB3YXRlckRlcHRoID4gMCwgc2xvcGUsIGNsZWFyYW5jZSxcbiAgfTtcbn1cblxuLy8gRW50aXR5IGZvb3RwcmludHMgYXJlIGRlbGliZXJhdGVseSBleHBsaWNpdC4gQSB0cmVlIG9jY3VwaWVzIG1vcmUgc2l0ZSB0aGFuXG4vLyBpdHMgdHJ1bms7IGEgcGViYmxlIG9jY3VwaWVzIGxlc3MgdGhhbiBhIGJvdWxkZXIuIFRoZXNlIGFyZSBzaW11bGF0aW9uXG4vLyBjbGVhcmFuY2UgcmFkaWksIG5vdCByZW5kZXIgYm91bmRzLlxuZXhwb3J0IGNvbnN0IE9CU1RSVUNUSU9OX1JBRElVUzogUmVjb3JkPEFjdGl2ZUVudGl0eUtpbmQsIG51bWJlcj4gPSB7XG4gIHN0eWxfdHJlZV9zcGlyZTogMS41LFxuICBzdHlsX3RyZWVfdGFibGU6IDEuOCxcbiAgc3R5bF90cmVlX2NsdXN0ZXI6IDEuOSxcbiAgc3R5bF90cmVlX2Jsb3Nzb206IDEuNixcbiAgc3R5bF9zaHJ1YjogMC42LFxuICBzdHlsX29yZTogMC45LFxuICBzdHlsX2NhaXJuOiAwLjgsXG4gIHdheXN0b25lOiAxLjQsXG4gIG1hcmtlcjogMC41LFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBPYnN0cnVjdGlvbiB7XG4gIGVudGl0eUlkOiBzdHJpbmc7XG4gIGtpbmQ6IEVudGl0eUtpbmQ7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByYWRpdXM6IG51bWJlcjtcbiAgLyoqIEZvb3RwcmludCBjZWxscyBvdmVybGFwcGVkIGJ5IHRoaXMgZW50aXR5LiAqL1xuICBjZWxsczogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBlbnRpdHlDaHVua3NGb3JSZWN0KHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCk6IHN0cmluZ1tdIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIC8vIEEgcmVjdCBvd25zIHdob2xlIHZveGVsIGNlbGxzLiBJbmNsdWRlIGV2ZXJ5IGNodW5rIHdob3NlIHJvb3QgY291bGQgb3ZlcmxhcFxuICAvLyB0aG9zZSBjZWxscywgd2l0aG91dCBzY2FubmluZyB0aGUgZW50aXJlIDIwNDggbSB3b3JsZC5cbiAgY29uc3QgcmFkaXVzID0gTWF0aC5tYXgoLi4uT2JqZWN0LnZhbHVlcyhPQlNUUlVDVElPTl9SQURJVVMpLCAxLjUpO1xuICBjb25zdCBtaW5DZWxsWCA9IE1hdGguZmxvb3Ioci54MCArIDAuNSAtIHJhZGl1cyk7XG4gIGNvbnN0IG1heENlbGxYID0gTWF0aC5jZWlsKHIueDEgKyAwLjUgKyByYWRpdXMpIC0gMTtcbiAgY29uc3QgbWluQ2VsbFogPSBNYXRoLmZsb29yKHIuejAgKyAwLjUgLSByYWRpdXMpO1xuICBjb25zdCBtYXhDZWxsWiA9IE1hdGguY2VpbChyLnoxICsgMC41ICsgcmFkaXVzKSAtIDE7XG4gIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGN4MCA9IE1hdGgubWF4KDAsIHdvcmxkVG9DaHVua1gobWluQ2VsbFgpKSwgY3gxID0gd29ybGRUb0NodW5rWChtYXhDZWxsWCk7XG4gIGNvbnN0IGN6MCA9IE1hdGgubWF4KDAsIHdvcmxkVG9DaHVua1oobWluQ2VsbFopKSwgY3oxID0gd29ybGRUb0NodW5rWihtYXhDZWxsWik7XG4gIGZvciAobGV0IGN6ID0gY3owOyBjeiA8PSBjejE7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGN4MDsgY3ggPD0gY3gxOyBjeCsrKSBrZXlzLnB1c2goY2h1bmtLZXkoY3gsIGN6KSk7XG4gIH1cbiAgcmV0dXJuIGtleXM7XG59XG5cbi8qKiBFbnRpdGllcyB3aG9zZSBzaW11bGF0aW9uIGZvb3RwcmludCBvdmVybGFwcyB0aGUgcmVjdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvYnN0cnVjdGlvbnNJbih3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QpOiBPYnN0cnVjdGlvbltdIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3Qgb3V0OiBPYnN0cnVjdGlvbltdID0gW107XG4gIGZvciAoY29uc3Qga2V5IG9mIGVudGl0eUNodW5rc0ZvclJlY3Qod29ybGQsIHIpKSB7XG4gICAgY29uc3QgaWRzID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpO1xuICAgIGlmICghaWRzKSBjb250aW51ZTtcbiAgICBmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuICAgICAgaWYgKHNlZW4uaGFzKGlkKSkgY29udGludWU7XG4gICAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICAgIGlmICghZSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZCkpIGNvbnRpbnVlO1xuICAgICAgc2Vlbi5hZGQoaWQpO1xuICAgICAgY29uc3QgcmFkaXVzID0gaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZClcbiAgICAgICAgPyBlLmtpbmQgPT09ICdzdHlsX3JvY2tfc21hbGwnID8gMC42IDogZS5raW5kID09PSAnc3R5bF9yb2NrX21lZGl1bScgPyAxLjEgOiAxLjVcbiAgICAgICAgOiBPQlNUUlVDVElPTl9SQURJVVNbZS5raW5kIGFzIEFjdGl2ZUVudGl0eUtpbmRdO1xuICAgICAgbGV0IGNlbGxzID0gMDtcbiAgICAgIGNvbnN0IGV4MCA9IE1hdGgubWF4KHIueDAsIE1hdGguZmxvb3IoZS54IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBleDEgPSBNYXRoLm1pbihyLngxLCBNYXRoLmNlaWwoZS54ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejAgPSBNYXRoLm1heChyLnowLCBNYXRoLmZsb29yKGUueiAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXoxID0gTWF0aC5taW4oci56MSwgTWF0aC5jZWlsKGUueiArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgZm9yIChsZXQgeiA9IGV6MDsgeiA8PSBlejE7IHorKykge1xuICAgICAgICBmb3IgKGxldCB4ID0gZXgwOyB4IDw9IGV4MTsgeCsrKSB7XG4gICAgICAgICAgaWYgKE1hdGguaHlwb3QoZS54IC0gKHggKyAwLjUpLCBlLnogLSAoeiArIDAuNSkpIDw9IHJhZGl1cykgY2VsbHMrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGNlbGxzID4gMCkge1xuICAgICAgICBvdXQucHVzaCh7IGVudGl0eUlkOiBlLmlkLCBraW5kOiBlLmtpbmQsIHg6IGUueCwgejogZS56LCByYWRpdXMsIGNlbGxzIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBvdXQuc29ydCgoYSwgYikgPT4gKGEuZW50aXR5SWQgPCBiLmVudGl0eUlkID8gLTEgOiBhLmVudGl0eUlkID4gYi5lbnRpdHlJZCA/IDEgOiAwKSk7XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXJlYVN0YXRzIHtcbiAgcmVjdDogUmVjdDtcbiAgY29sdW1uczogbnVtYmVyO1xuICBtaW5ZOiBudW1iZXI7XG4gIG1heFk6IG51bWJlcjtcbiAgbWVhblk6IG51bWJlcjtcbiAgcmVsaWVmOiBudW1iZXI7XG4gIG1heFN0ZXA6IG51bWJlcjtcbiAgd2F0ZXJDb2x1bW5zOiBudW1iZXI7XG4gIHN0b25lQ29sdW1uczogbnVtYmVyO1xuICBtYXRlcmlhbHM6IFJlY29yZDxudW1iZXIsIG51bWJlcj47XG4gIG9ic3RydWN0aW9uczogT2JzdHJ1Y3Rpb25bXTtcbiAgb2JzdHJ1Y3RlZENvbHVtbnM6IG51bWJlcjtcbiAgLyoqIEN1dC9maWxsIHJlbGF0aXZlIHRvIGZsb29yWSB3aGVuIHN1cHBsaWVkLCBvdGhlcndpc2UgMC4gKi9cbiAgZmxvb3JZOiBudW1iZXIgfCBudWxsO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cHBvcnRTdW1tYXJ5IHtcbiAgdG90YWw6IG51bWJlcjtcbiAgbGV2ZWw6IG51bWJlcjtcbiAgY3V0OiBudW1iZXI7XG4gIGZpbGw6IG51bWJlcjtcbiAgd2F0ZXI6IG51bWJlcjtcbiAgLyoqIEZpbGwgZGVlcGVyIHRoYW4gOCBtOyBhIHZhbGlkYXRvciBtYXkgcmVqZWN0IHRoZXNlIGFzIHVuc3VwcG9ydGVkLiAqL1xuICBkZWVwRmlsbDogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEZvb3RwcmludFF1ZXJ5IHtcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHN0YXRzOiBBcmVhU3RhdHM7XG4gIHN1cHBvcnQ6IFN1cHBvcnRTdW1tYXJ5O1xuICBvYnN0cnVjdGlvbnM6IE9ic3RydWN0aW9uW107XG4gIC8qKiBDZWxscyBpbiB0aGUgYnVpbGRpbmcgdm9sdW1lIGFib3ZlIHRoZSBwcmVwYXJlZCBmbG9vciB0aGF0IGFyZSBub3QgYWlyLiAqL1xuICBvdmVyaGFuZ0NlbGxzOiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IG1hdGVyaWFsOiBNYXRJZCB9Pjtcbn1cblxuLyoqXG4gKiBDYWNoZWQgcXVlcnkgY29udGV4dC4gQ2FjaGVzIGFyZSBrZXllZCBvbiB3b3JsZC5yZXZpc2lvbjogYSB2b3hlbCBvciBlbnRpdHlcbiAqIGVkaXQgaW52YWxpZGF0ZXMgdGhlbSwgd2hpbGUgbWVzaC9uYXYgcmVidWlsZHMgZG8gbm90LiBVc2Ugb25lIGNvbnRleHQgZm9yIGFcbiAqIHNpdGUgc2VhcmNoIG9yIGEgZm9vdHByaW50IGV2YWx1YXRpb24sIHRoZW4gZGlzY2FyZCBpdC5cbiAqL1xuZXhwb3J0IGNsYXNzIFRlcnJhaW5RdWVyeSB7XG4gIHByaXZhdGUgY2FjaGUgPSBuZXcgTWFwPHN0cmluZywgVGVycmFpbkNvbHVtbj4oKTtcbiAgcHJpdmF0ZSBvYnN0cnVjdGlvbkNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIE9ic3RydWN0aW9uW10+KCk7XG4gIHByaXZhdGUgcmV2aXNpb246IG51bWJlcjtcblxuICBjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgd29ybGQ6IFdvcmxkKSB7XG4gICAgdGhpcy5yZXZpc2lvbiA9IHdvcmxkLnJldmlzaW9uO1xuICB9XG5cbiAgcHJpdmF0ZSBzeW5jKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnJldmlzaW9uICE9PSB0aGlzLndvcmxkLnJldmlzaW9uKSB7XG4gICAgICB0aGlzLmNhY2hlLmNsZWFyKCk7XG4gICAgICB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuY2xlYXIoKTtcbiAgICAgIHRoaXMucmV2aXNpb24gPSB0aGlzLndvcmxkLnJldmlzaW9uO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBDYWNoZWQgZW50aXR5IG9ic3RydWN0aW9ucyBmb3Igb25lIGZvb3RwcmludC4gKi9cbiAgb2JzdHJ1Y3Rpb25zRm9yKHJlY3Q6IFJlY3QpOiBPYnN0cnVjdGlvbltdIHtcbiAgICB0aGlzLnN5bmMoKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBjb25zdCBrZXkgPSBgJHtyLngwfSwke3IuejB9LCR7ci54MX0sJHtyLnoxfWA7XG4gICAgbGV0IGxpc3QgPSB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuZ2V0KGtleSk7XG4gICAgaWYgKCFsaXN0KSB7XG4gICAgICBsaXN0ID0gb2JzdHJ1Y3Rpb25zSW4odGhpcy53b3JsZCwgcik7XG4gICAgICB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuc2V0KGtleSwgbGlzdCk7XG4gICAgfVxuICAgIHJldHVybiBsaXN0O1xuICB9XG5cbiAgY29sdW1uKHg6IG51bWJlciwgejogbnVtYmVyKTogVGVycmFpbkNvbHVtbiB7XG4gICAgdGhpcy5zeW5jKCk7XG4gICAgY29uc3QgY3ggPSBNYXRoLmZsb29yKHgpLCBjeiA9IE1hdGguZmxvb3Ioeik7XG4gICAgY29uc3Qga2V5ID0gYCR7Y3h9LCR7Y3p9YDtcbiAgICBsZXQgY29sID0gdGhpcy5jYWNoZS5nZXQoa2V5KTtcbiAgICBpZiAoIWNvbCkge1xuICAgICAgY29sID0gY29sdW1uQXQodGhpcy53b3JsZCwgY3gsIGN6KTtcbiAgICAgIHRoaXMuY2FjaGUuc2V0KGtleSwgY29sKTtcbiAgICB9XG4gICAgcmV0dXJuIGNvbDtcbiAgfVxuXG4gIGFyZWEocmVjdDogUmVjdCwgZmxvb3JZPzogbnVtYmVyKTogQXJlYVN0YXRzIHtcbiAgICB0aGlzLnN5bmMoKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBsZXQgbWluWSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgICBsZXQgbWF4WSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgICBsZXQgc3VtID0gMDtcbiAgICBsZXQgbWF4U3RlcCA9IDA7XG4gICAgbGV0IHdhdGVyQ29sdW1ucyA9IDA7XG4gICAgbGV0IHN0b25lQ29sdW1ucyA9IDA7XG4gICAgbGV0IGN1dFZvbHVtZSA9IDA7XG4gICAgbGV0IGZpbGxWb2x1bWUgPSAwO1xuICAgIGxldCBtYXhDdXQgPSAwO1xuICAgIGxldCBtYXhGaWxsID0gMDtcbiAgICBjb25zdCBtYXRlcmlhbHM6IFJlY29yZDxudW1iZXIsIG51bWJlcj4gPSB7fTtcblxuICAgIGZvciAobGV0IHogPSByLnowOyB6IDw9IHIuejE7IHorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHIueDA7IHggPD0gci54MTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IHRoaXMuY29sdW1uKHgsIHopO1xuICAgICAgICBtaW5ZID0gTWF0aC5taW4obWluWSwgY29sLnN1cmZhY2VZKTtcbiAgICAgICAgbWF4WSA9IE1hdGgubWF4KG1heFksIGNvbC5zdXJmYWNlWSk7XG4gICAgICAgIHN1bSArPSBjb2wuc3VyZmFjZVk7XG4gICAgICAgIG1heFN0ZXAgPSBNYXRoLm1heChtYXhTdGVwLCBjb2wuc2xvcGUpO1xuICAgICAgICBpZiAoY29sLndhdGVyRGVwdGggPiAwKSB3YXRlckNvbHVtbnMrKztcbiAgICAgICAgaWYgKGNvbC50b3BNYXRlcmlhbCA9PT0gTUFULlNUT05FKSBzdG9uZUNvbHVtbnMrKztcbiAgICAgICAgbWF0ZXJpYWxzW2NvbC50b3BNYXRlcmlhbF0gPSAobWF0ZXJpYWxzW2NvbC50b3BNYXRlcmlhbF0gPz8gMCkgKyAxO1xuICAgICAgICBpZiAoZmxvb3JZICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBjb25zdCBkeSA9IGNvbC5zdXJmYWNlWSAtIGZsb29yWTtcbiAgICAgICAgICBpZiAoZHkgPiAwKSB7XG4gICAgICAgICAgICBjdXRWb2x1bWUgKz0gZHk7XG4gICAgICAgICAgICBtYXhDdXQgPSBNYXRoLm1heChtYXhDdXQsIGR5KTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGR5IDwgMCkge1xuICAgICAgICAgICAgZmlsbFZvbHVtZSArPSAtZHk7XG4gICAgICAgICAgICBtYXhGaWxsID0gTWF0aC5tYXgobWF4RmlsbCwgLWR5KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBvYnN0cnVjdGlvbnMgPSB0aGlzLm9ic3RydWN0aW9uc0ZvcihyKTtcbiAgICBjb25zdCBvYnN0cnVjdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCBvIG9mIG9ic3RydWN0aW9ucykge1xuICAgICAgY29uc3QgcmFkaXVzID0gby5yYWRpdXM7XG4gICAgICBjb25zdCBleDAgPSBNYXRoLm1heChyLngwLCBNYXRoLmZsb29yKG8ueCAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXgxID0gTWF0aC5taW4oci54MSwgTWF0aC5jZWlsKG8ueCArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXowID0gTWF0aC5tYXgoci56MCwgTWF0aC5mbG9vcihvLnogLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MSA9IE1hdGgubWluKHIuejEsIE1hdGguY2VpbChvLnogKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGZvciAobGV0IHogPSBlejA7IHogPD0gZXoxOyB6KyspIHtcbiAgICAgICAgZm9yIChsZXQgeCA9IGV4MDsgeCA8PSBleDE7IHgrKykge1xuICAgICAgICAgIGlmIChNYXRoLmh5cG90KG8ueCAtICh4ICsgMC41KSwgby56IC0gKHogKyAwLjUpKSA8PSByYWRpdXMpIG9ic3RydWN0ZWQuYWRkKGAke3h9LCR7en1gKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGNvbHVtbnMgPSAoci54MSAtIHIueDAgKyAxKSAqIChyLnoxIC0gci56MCArIDEpO1xuICAgIHJldHVybiB7XG4gICAgICByZWN0OiByLFxuICAgICAgY29sdW1ucyxcbiAgICAgIG1pblksIG1heFksXG4gICAgICBtZWFuWTogTWF0aC5yb3VuZCgoc3VtIC8gY29sdW1ucykgKiAxMDAwKSAvIDEwMDAsXG4gICAgICByZWxpZWY6IG1heFkgLSBtaW5ZLFxuICAgICAgbWF4U3RlcCxcbiAgICAgIHdhdGVyQ29sdW1ucyxcbiAgICAgIHN0b25lQ29sdW1ucyxcbiAgICAgIG1hdGVyaWFscyxcbiAgICAgIG9ic3RydWN0aW9ucyxcbiAgICAgIG9ic3RydWN0ZWRDb2x1bW5zOiBvYnN0cnVjdGVkLnNpemUsXG4gICAgICBmbG9vclk6IGZsb29yWSA/PyBudWxsLFxuICAgICAgY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dCxcbiAgICAgIG1heEZpbGwsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFdmFsdWF0ZSBhIGNvbXBsZXRlIGJ1aWxkaW5nIGZvb3RwcmludC4gYGZsb29yWWAgaXMgdGhlIHByZXBhcmVkIHdhbGtpbmdcbiAgICogZmxvb3I6IHRlcnJhaW4gYWJvdmUgaXQgaXMgY3V0LCB0ZXJyYWluIGJlbG93IGl0IGlzIGZpbGxlZC4gVGhlIHJlc3VsdCBpc1xuICAgKiByYXcgc2l0ZSBkYXRhOyBjb25zdHJ1Y3Rpb24gcnVsZXMgbGl2ZSBpbiBjb25zdHJ1Y3Rpb24udHMuXG4gICAqL1xuICBmb290cHJpbnQocmVjdDogUmVjdCwgZmxvb3JZOiBudW1iZXIpOiBGb290cHJpbnRRdWVyeSB7XG4gICAgY29uc3Qgc3RhdHMgPSB0aGlzLmFyZWEocmVjdCwgZmxvb3JZKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBjb25zdCBzdXBwb3J0OiBTdXBwb3J0U3VtbWFyeSA9IHtcbiAgICAgIHRvdGFsOiBzdGF0cy5jb2x1bW5zLCBsZXZlbDogMCwgY3V0OiAwLCBmaWxsOiAwLCB3YXRlcjogMCwgZGVlcEZpbGw6IDAsXG4gICAgICBtYXhDdXQ6IDAsIG1heEZpbGw6IDAsIGN1dFZvbHVtZTogMCwgZmlsbFZvbHVtZTogMCxcbiAgICB9O1xuICAgIGNvbnN0IG92ZXJoYW5nQ2VsbHM6IEZvb3RwcmludFF1ZXJ5WydvdmVyaGFuZ0NlbGxzJ10gPSBbXTtcblxuICAgIGZvciAobGV0IHogPSByLnowOyB6IDw9IHIuejE7IHorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHIueDA7IHggPD0gci54MTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IHRoaXMuY29sdW1uKHgsIHopO1xuICAgICAgICBjb25zdCBkeSA9IGNvbC5zdXJmYWNlWSAtIGZsb29yWTtcbiAgICAgICAgaWYgKGR5ID4gMCkge1xuICAgICAgICAgIHN1cHBvcnQuY3V0Kys7XG4gICAgICAgICAgc3VwcG9ydC5jdXRWb2x1bWUgKz0gZHk7XG4gICAgICAgICAgc3VwcG9ydC5tYXhDdXQgPSBNYXRoLm1heChzdXBwb3J0Lm1heEN1dCwgZHkpO1xuICAgICAgICB9IGVsc2UgaWYgKGR5IDwgMCkge1xuICAgICAgICAgIHN1cHBvcnQuZmlsbCsrO1xuICAgICAgICAgIHN1cHBvcnQuZmlsbFZvbHVtZSArPSAtZHk7XG4gICAgICAgICAgc3VwcG9ydC5tYXhGaWxsID0gTWF0aC5tYXgoc3VwcG9ydC5tYXhGaWxsLCAtZHkpO1xuICAgICAgICAgIGlmICgtZHkgPiA4KSBzdXBwb3J0LmRlZXBGaWxsKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3VwcG9ydC5sZXZlbCsrO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjb2wud2F0ZXJEZXB0aCA+IDApIHN1cHBvcnQud2F0ZXIrKztcblxuICAgICAgICAvLyBBbiBvdmVyaGFuZyBpcyB0ZXJyYWluIGFib3ZlIHRoZSBmbG9vciB0aGF0IHN1cnZpdmVzIHRoZSBjdXQgcGxhbmUuXG4gICAgICAgIC8vIEZvciBhIGNvbHVtbiBiZWxvdyB0aGUgZmxvb3IsIGl0cyBzb2xpZCBib2R5IGlzIGZpbGwsIG5vdCBvdmVyaGFuZy5cbiAgICAgICAgY29uc3Qgc3RhcnQgPSBNYXRoLm1heChmbG9vclksIGNvbC5zdXJmYWNlWSk7XG4gICAgICAgIGZvciAobGV0IHkgPSBzdGFydDsgeSA8IHN0YXJ0ICsgNDsgeSsrKSB7XG4gICAgICAgICAgY29uc3QgbSA9IGdldFZveGVsKHRoaXMud29ybGQsIHgsIHksIHopIGFzIE1hdElkO1xuICAgICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSBvdmVyaGFuZ0NlbGxzLnB1c2goeyB4LCB5LCB6LCBtYXRlcmlhbDogbSB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7IHJlY3Q6IHIsIGZsb29yWSwgc3RhdHMsIHN1cHBvcnQsIG9ic3RydWN0aW9uczogc3RhdHMub2JzdHJ1Y3Rpb25zLCBvdmVyaGFuZ0NlbGxzIH07XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSBtb3ZlbWVudCBjb250cmFjdCAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdhbGtQYXJhbXMge1xuICBtYXhTdGVwVXA6IG51bWJlcjtcbiAgbWF4U3RlcERvd246IG51bWJlcjtcbiAgbWF4V2F0ZXJEZXB0aDogbnVtYmVyO1xuICAvKiogTWF4aW11bSBhZGphY2VudCBzdXJmYWNlIHN0ZXA7IDEuMCBpcyBhIDQ1IGRlZ3JlZSB2b3hlbCByaXNlci4gKi9cbiAgbWF4U2xvcGU6IG51bWJlcjtcbiAgY2xlYXJhbmNlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1dBTEs6IFdhbGtQYXJhbXMgPSB7XG4gIG1heFN0ZXBVcDogMS4wLFxuICBtYXhTdGVwRG93bjogMS41LFxuICBtYXhXYXRlckRlcHRoOiAwLjQsXG4gIG1heFNsb3BlOiAxLjAsXG4gIGNsZWFyYW5jZTogMi4wLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBXYWxrUmVzdWx0IHtcbiAgb2s6IGJvb2xlYW47XG4gIHJlYXNvbjogJ29rJyB8ICdub3RfYWRqYWNlbnQnIHwgJ3N0ZXBfdXAnIHwgJ2ZhbGwnIHwgJ3dhdGVyJyB8ICdzbG9wZScgfCAnY2xlYXJhbmNlJztcbiAgc3RlcDogbnVtYmVyO1xuICB3YXRlckRlcHRoOiBudW1iZXI7XG59XG5cbi8qKiBFdmFsdWF0ZSBvbmUgZ3JpZCBzdGVwLiBQYXRocyBhcmUgdmFsaWRhdGVkIHdpdGggdGhlIHNhbWUgY29udHJhY3QuICovXG5leHBvcnQgZnVuY3Rpb24gd2Fsa1N0ZXAoXG4gIHdvcmxkOiBXb3JsZCwgZnJvbVg6IG51bWJlciwgZnJvbVo6IG51bWJlciwgdG9YOiBudW1iZXIsIHRvWjogbnVtYmVyLFxuICBwYXJhbXM6IFdhbGtQYXJhbXMgPSBERUZBVUxUX1dBTEssXG4pOiBXYWxrUmVzdWx0IHtcbiAgY29uc3QgZHggPSBNYXRoLmFicyhNYXRoLmZsb29yKHRvWCkgLSBNYXRoLmZsb29yKGZyb21YKSk7XG4gIGNvbnN0IGR6ID0gTWF0aC5hYnMoTWF0aC5mbG9vcih0b1opIC0gTWF0aC5mbG9vcihmcm9tWikpO1xuICBpZiAoZHggKyBkeiAhPT0gMSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnbm90X2FkamFjZW50Jywgc3RlcDogMCwgd2F0ZXJEZXB0aDogMCB9O1xuICB9XG4gIGNvbnN0IGZyb20gPSBjb2x1bW5BdCh3b3JsZCwgZnJvbVgsIGZyb21aKTtcbiAgY29uc3QgdG8gPSBjb2x1bW5BdCh3b3JsZCwgdG9YLCB0b1opO1xuICBjb25zdCBzdGVwID0gdG8uc3VyZmFjZVkgLSBmcm9tLnN1cmZhY2VZO1xuICBpZiAoc3RlcCA+IHBhcmFtcy5tYXhTdGVwVXApIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc3RlcF91cCcsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKC1zdGVwID4gcGFyYW1zLm1heFN0ZXBEb3duKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ2ZhbGwnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICh0by53YXRlckRlcHRoID4gcGFyYW1zLm1heFdhdGVyRGVwdGgpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnd2F0ZXInLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICh0by5zbG9wZSA+IHBhcmFtcy5tYXhTbG9wZSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdzbG9wZScsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKCFjbGVhcmFuY2VBdCh3b3JsZCwgdG9YLCB0b1osIHBhcmFtcy5jbGVhcmFuY2UpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdjbGVhcmFuY2UnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIH1cbiAgcmV0dXJuIHsgb2s6IHRydWUsIHJlYXNvbjogJ29rJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xufVxuXG4vKiogRWZmZWN0aXZlIGdyYWRlIG9mIGEgc3RyYWlnaHQgcGF0aCBzZWdtZW50LCB1c2VkIGJ5IHBhdGggdmFsaWRhdGlvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZmZlY3RpdmVHcmFkZSh3b3JsZDogV29ybGQsIHgwOiBudW1iZXIsIHowOiBudW1iZXIsIHgxOiBudW1iZXIsIHoxOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBhID0gY29sdW1uQXQod29ybGQsIHgwLCB6MCk7XG4gIGNvbnN0IGIgPSBjb2x1bW5BdCh3b3JsZCwgeDEsIHoxKTtcbiAgY29uc3QgcnVuID0gTWF0aC5oeXBvdCh4MSAtIHgwLCB6MSAtIHowKTtcbiAgaWYgKHJ1biA9PT0gMCkgcmV0dXJuIE1hdGguYWJzKGIuc3VyZmFjZVkgLSBhLnN1cmZhY2VZKTtcbiAgcmV0dXJuIE1hdGguYWJzKGIuc3VyZmFjZVkgLSBhLnN1cmZhY2VZKSAvIHJ1bjtcbn1cbiIsICIvLyBNMDAyIHNpdGUgdmFsaWRhdGlvbiwgY2FuZGlkYXRlIHNlYXJjaCBhbmQgcHJldmlldyBcdTIwMTQgcHVyZSBzaW11bGF0aW9uLlxuLy9cbi8vIFRoaXMgaXMgdGhlIHNoYXJlZCBnYXRlIGZvciB0aGUgcGxheWVyIGFuZCB0aGUgQUkgYWdlbnQuIE5laXRoZXIgbWF5IHBsYWNlIGFcbi8vIHN0cnVjdHVyZSBieSBhbnkgb3RoZXIgcGF0aDogYm90aCBzdWJtaXQgYSBTaXRlUHJvcG9zYWwsIGJvdGggcmVjZWl2ZSB0aGVcbi8vIHNhbWUgU2l0ZVZhbGlkYXRpb24sIGFuZCBib3RoIG11c3QgcGFzcyB0aGUgQXV0aG9yaXplciBiZWZvcmUgZXhlY3V0aW9uLlxuLy9cbi8vIFRoZSB2YWxpZGF0b3IgZGVzY3JpYmVzIHRoZSBzaXRlIGFzIGl0IGlzLiBJdCBkb2VzIG5vdCBlZGl0IHZveGVscywgcmVtb3ZlXG4vLyBlbnRpdGllcyBvciBzcGVuZCByZXNvdXJjZXMuIFByZXBhcmF0aW9uIGlzIGEgc2VwYXJhdGUsIGF1dGhvcml6ZWQgc3RlcC5cbmltcG9ydCB7IFdvcmxkLCBIQUxGLCBZX01JTiwgWV9NQVgsIHN1cmZhY2VBdCB9IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHtcbiAgUmVjdCwgVm94ZWxSZWdpb24sIEZvb3RwcmludFF1ZXJ5LCBUZXJyYWluUXVlcnksIEFyZWFTdGF0cyxcbiAgbm9ybWFsaXplUmVjdCwgZXhwYW5kUmVjdCwgcmVjdENvbHVtbnMsIGVmZmVjdGl2ZUdyYWRlLCB3YWxrU3RlcCwgV2Fsa1BhcmFtcyxcbiAgREVGQVVMVF9XQUxLLCBjb2x1bW5BdCxcbn0gZnJvbSAnLi90ZXJyYWluJztcblxuZXhwb3J0IHR5cGUgU2l0ZVN0YXRlID0gJ3ZhbGlkJyB8ICd2YWxpZF93aXRoX3ByZXBhcmF0aW9uJyB8ICdpbnZhbGlkJztcblxuZXhwb3J0IHR5cGUgVmFsaWRhdGlvbkNvZGUgPVxuICB8ICdvdXRfb2ZfYm91bmRzJ1xuICB8ICdmb290cHJpbnRfbWlzbWF0Y2gnXG4gIHwgJ3Nsb3BlX2V4Y2VlZGVkJ1xuICB8ICdzdGVwX2V4Y2VlZGVkJ1xuICB8ICdjdXRfZXhjZWVkZWQnXG4gIHwgJ2ZpbGxfZXhjZWVkZWQnXG4gIHwgJ2N1dF92b2x1bWVfZXhjZWVkZWQnXG4gIHwgJ2ZpbGxfdm9sdW1lX2V4Y2VlZGVkJ1xuICB8ICdmb290cHJpbnRfb2JzdHJ1Y3RlZCdcbiAgfCAnd2F0ZXInXG4gIHwgJ292ZXJoYW5nJ1xuICB8ICduZWVkc19ncmFkaW5nJ1xuICB8ICduZWVkc19jbGVhcmluZyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVmFsaWRhdGlvblJlYXNvbiB7XG4gIGNvZGU6IFZhbGlkYXRpb25Db2RlO1xuICBzZXZlcml0eTogJ2Vycm9yJyB8ICdwcmVwYXJhdGlvbic7XG4gIG1lc3NhZ2U6IHN0cmluZztcbiAgdmFsdWU/OiBudW1iZXI7XG4gIGxpbWl0PzogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBGb3VuZGF0aW9uVHlwZSA9ICdncmFkZWRfcGFkJyB8ICdzdGVwcGVkX3BsaW50aCcgfCAnZGVjayc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQnVpbGRpbmdSdWxlcyB7XG4gIGlkOiBzdHJpbmc7XG4gIHdpZHRoOiBudW1iZXI7XG4gIGRlcHRoOiBudW1iZXI7XG4gIHdhbGxIZWlnaHQ6IG51bWJlcjtcbiAgY2xlYXJhbmNlOiBudW1iZXI7XG4gIC8qKiBSZWxpZWYgYXQgb3IgYmVsb3cgdGhpcyBuZWVkcyBubyBncmFkaW5nIHRvIGJlIGNhbGxlZCB2YWxpZC4gKi9cbiAgbWF4UmVsaWVmTm9QcmVwOiBudW1iZXI7XG4gIC8qKiBSZWxpZWYgYWJvdmUgdGhpcyBjYW5ub3QgYmUgcHJlcGFyZWQgYnkgdGhpcyBidWlsZGluZyB0eXBlLiAqL1xuICBtYXhSZWxpZWZQcmVwYXJlZDogbnVtYmVyO1xuICBtYXhTdGVwOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIG1heEN1dFZvbHVtZTogbnVtYmVyO1xuICBtYXhGaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heE9ic3RydWN0aW9uczogbnVtYmVyO1xuICByZXF1aXJlc0RyeTogYm9vbGVhbjtcbiAgZm91bmRhdGlvbjogRm91bmRhdGlvblR5cGU7XG59XG5cbmV4cG9ydCBjb25zdCBIT1VTRV9SVUxFUzogQnVpbGRpbmdSdWxlcyA9IHtcbiAgaWQ6ICdob3VzZS04eDYnLFxuICB3aWR0aDogOCxcbiAgZGVwdGg6IDYsXG4gIHdhbGxIZWlnaHQ6IDMsXG4gIGNsZWFyYW5jZTogMyxcbiAgbWF4UmVsaWVmTm9QcmVwOiAxLjIsXG4gIG1heFJlbGllZlByZXBhcmVkOiA0LjAsXG4gIG1heFN0ZXA6IDEsXG4gIG1heEN1dDogMixcbiAgbWF4RmlsbDogMixcbiAgbWF4Q3V0Vm9sdW1lOiA0OCxcbiAgbWF4RmlsbFZvbHVtZTogNDgsXG4gIG1heE9ic3RydWN0aW9uczogMCxcbiAgcmVxdWlyZXNEcnk6IHRydWUsXG4gIGZvdW5kYXRpb246ICdncmFkZWRfcGFkJyxcbn07XG5cbmV4cG9ydCBjb25zdCBGQVJNX1JVTEVTOiBCdWlsZGluZ1J1bGVzID0ge1xuICBpZDogJ2Zhcm0tMTJ4OCcsXG4gIHdpZHRoOiAxMixcbiAgZGVwdGg6IDgsXG4gIHdhbGxIZWlnaHQ6IDAsXG4gIGNsZWFyYW5jZTogMSxcbiAgbWF4UmVsaWVmTm9QcmVwOiAxLjIsXG4gIG1heFJlbGllZlByZXBhcmVkOiA2LjAsXG4gIG1heFN0ZXA6IDEsXG4gIG1heEN1dDogMixcbiAgbWF4RmlsbDogMixcbiAgbWF4Q3V0Vm9sdW1lOiA5NixcbiAgbWF4RmlsbFZvbHVtZTogOTYsXG4gIG1heE9ic3RydWN0aW9uczogNCxcbiAgcmVxdWlyZXNEcnk6IHRydWUsXG4gIGZvdW5kYXRpb246ICdzdGVwcGVkX3BsaW50aCcsXG59O1xuXG5leHBvcnQgY29uc3QgUEFUSF9SVUxFUzogQnVpbGRpbmdSdWxlcyA9IHtcbiAgaWQ6ICdwYXRoLTl4MycsXG4gIHdpZHRoOiA5LFxuICBkZXB0aDogMyxcbiAgd2FsbEhlaWdodDogMCxcbiAgY2xlYXJhbmNlOiAxLFxuICBtYXhSZWxpZWZOb1ByZXA6IDIuMCxcbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IDQuMCxcbiAgbWF4U3RlcDogMSxcbiAgbWF4Q3V0OiAxLFxuICBtYXhGaWxsOiAxLFxuICBtYXhDdXRWb2x1bWU6IDMyLFxuICBtYXhGaWxsVm9sdW1lOiAzMixcbiAgbWF4T2JzdHJ1Y3Rpb25zOiAyLFxuICByZXF1aXJlc0RyeTogdHJ1ZSxcbiAgZm91bmRhdGlvbjogJ2RlY2snLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBTaXRlUHJvcG9zYWwge1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHJ1bGVzOiBCdWlsZGluZ1J1bGVzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uU3VtbWFyeSB7XG4gIG5lZWRzR3JhZGluZzogYm9vbGVhbjtcbiAgbmVlZHNDbGVhcmluZzogYm9vbGVhbjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgb2JzdHJ1Y3Rpb25JZHM6IHN0cmluZ1tdO1xuICBmb3VuZGF0aW9uOiBGb3VuZGF0aW9uVHlwZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlVmFsaWRhdGlvbiB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBzdGF0ZTogU2l0ZVN0YXRlO1xuICByZWFzb25zOiBWYWxpZGF0aW9uUmVhc29uW107XG4gIHF1ZXJ5OiBGb290cHJpbnRRdWVyeTtcbiAgcHJlcGFyYXRpb246IFByZXBhcmF0aW9uU3VtbWFyeTtcbn1cblxuZnVuY3Rpb24gZXJyb3IoY29kZTogVmFsaWRhdGlvbkNvZGUsIG1lc3NhZ2U6IHN0cmluZywgdmFsdWU/OiBudW1iZXIsIGxpbWl0PzogbnVtYmVyKTogVmFsaWRhdGlvblJlYXNvbiB7XG4gIHJldHVybiB7IGNvZGUsIHNldmVyaXR5OiAnZXJyb3InLCBtZXNzYWdlLCB2YWx1ZSwgbGltaXQgfTtcbn1cblxuZnVuY3Rpb24gcHJlcChjb2RlOiBWYWxpZGF0aW9uQ29kZSwgbWVzc2FnZTogc3RyaW5nLCB2YWx1ZT86IG51bWJlciwgbGltaXQ/OiBudW1iZXIpOiBWYWxpZGF0aW9uUmVhc29uIHtcbiAgcmV0dXJuIHsgY29kZSwgc2V2ZXJpdHk6ICdwcmVwYXJhdGlvbicsIG1lc3NhZ2UsIHZhbHVlLCBsaW1pdCB9O1xufVxuXG4vKipcbiAqIFZhbGlkYXRlIGEgcHJvcG9zZWQgc2l0ZSBhZ2FpbnN0IGl0cyBidWlsZGluZyBydWxlcy4gUHVyZTogbm8gdm94ZWxzLFxuICogZW50aXRpZXMgb3IgcmVzb3VyY2VzIGNoYW5nZS4gYHF1ZXJ5YCBtYXkgYmUgc3VwcGxpZWQgYnkgYSBzZWFyY2ggdG8gcmV1c2VcbiAqIHRoZSBjYWNoZWQgY29sdW1ucywgYW5kIGBmb290cHJpbnRgIG1heSBiZSBzdXBwbGllZCB3aGVuIHRoZSBjYWxsZXIgYWxyZWFkeVxuICogZXZhbHVhdGVkIHRoZSBzYW1lIHJlY3QvZmxvb3IgcGFpci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlU2l0ZShcbiAgd29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLCBxdWVyeSA9IG5ldyBUZXJyYWluUXVlcnkod29ybGQpLFxuICBmb290cHJpbnQ/OiBGb290cHJpbnRRdWVyeSxcbik6IFNpdGVWYWxpZGF0aW9uIHtcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHJ1bGVzID0gcHJvcG9zYWwucnVsZXM7XG4gIGNvbnN0IHJlYXNvbnM6IFZhbGlkYXRpb25SZWFzb25bXSA9IFtdO1xuICBjb25zdCBmcCA9IGZvb3RwcmludCA/PyBxdWVyeS5mb290cHJpbnQocmVjdCwgcHJvcG9zYWwuZmxvb3JZKTtcbiAgY29uc3Qgc3RhdHMgPSBmcC5zdGF0cztcblxuICBpZiAocmVjdC54MCA8IC1IQUxGIHx8IHJlY3QuejAgPCAtSEFMRiB8fCByZWN0LngxID49IEhBTEYgfHwgcmVjdC56MSA+PSBIQUxGKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKCdvdXRfb2ZfYm91bmRzJywgYGZvb3RwcmludCAke3JlY3QueDB9LCR7cmVjdC56MH0uLiR7cmVjdC54MX0sJHtyZWN0LnoxfSBpcyBvdXRzaWRlIHRoZSB3b3JsZGApKTtcbiAgfVxuICBpZiAocmVjdC54MSAtIHJlY3QueDAgKyAxICE9PSBydWxlcy53aWR0aCB8fCByZWN0LnoxIC0gcmVjdC56MCArIDEgIT09IHJ1bGVzLmRlcHRoKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2Zvb3RwcmludF9taXNtYXRjaCcsXG4gICAgICBgZm9vdHByaW50IGlzICR7cmVjdC54MSAtIHJlY3QueDAgKyAxfSB4ICR7cmVjdC56MSAtIHJlY3QuejAgKyAxfSBtLCAke3J1bGVzLndpZHRofSB4ICR7cnVsZXMuZGVwdGh9IG0gcmVxdWlyZWRgLFxuICAgICkpO1xuICB9XG5cbiAgaWYgKHN0YXRzLnJlbGllZiA+IHJ1bGVzLm1heFJlbGllZlByZXBhcmVkKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ3Nsb3BlX2V4Y2VlZGVkJyxcbiAgICAgIGByZWxpZWYgJHtzdGF0cy5yZWxpZWZ9IG0gZXhjZWVkcyB0aGUgJHtydWxlcy5tYXhSZWxpZWZQcmVwYXJlZH0gbSBwcmVwYXJlZCBsaW1pdGAsXG4gICAgICBzdGF0cy5yZWxpZWYsIHJ1bGVzLm1heFJlbGllZlByZXBhcmVkLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5tYXhTdGVwID4gcnVsZXMubWF4U3RlcCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdzdGVwX2V4Y2VlZGVkJyxcbiAgICAgIGBzdXJmYWNlIHN0ZXAgJHtzdGF0cy5tYXhTdGVwfSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhTdGVwfSBtYCxcbiAgICAgIHN0YXRzLm1heFN0ZXAsIHJ1bGVzLm1heFN0ZXAsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEN1dCA+IHJ1bGVzLm1heEN1dCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdjdXRfZXhjZWVkZWQnLFxuICAgICAgYGN1dCAke3N0YXRzLm1heEN1dH0gbSBleGNlZWRzICR7cnVsZXMubWF4Q3V0fSBtYCxcbiAgICAgIHN0YXRzLm1heEN1dCwgcnVsZXMubWF4Q3V0LFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5tYXhGaWxsID4gcnVsZXMubWF4RmlsbCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdmaWxsX2V4Y2VlZGVkJyxcbiAgICAgIGBmaWxsICR7c3RhdHMubWF4RmlsbH0gbSBleGNlZWRzICR7cnVsZXMubWF4RmlsbH0gbWAsXG4gICAgICBzdGF0cy5tYXhGaWxsLCBydWxlcy5tYXhGaWxsLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5jdXRWb2x1bWUgPiBydWxlcy5tYXhDdXRWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnY3V0X3ZvbHVtZV9leGNlZWRlZCcsXG4gICAgICBgY3V0IHZvbHVtZSAke3N0YXRzLmN1dFZvbHVtZX0gbVx1MDBCMyBleGNlZWRzICR7cnVsZXMubWF4Q3V0Vm9sdW1lfSBtXHUwMEIzYCxcbiAgICAgIHN0YXRzLmN1dFZvbHVtZSwgcnVsZXMubWF4Q3V0Vm9sdW1lLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5maWxsVm9sdW1lID4gcnVsZXMubWF4RmlsbFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdmaWxsX3ZvbHVtZV9leGNlZWRlZCcsXG4gICAgICBgZmlsbCB2b2x1bWUgJHtzdGF0cy5maWxsVm9sdW1lfSBtXHUwMEIzIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsVm9sdW1lfSBtXHUwMEIzYCxcbiAgICAgIHN0YXRzLmZpbGxWb2x1bWUsIHJ1bGVzLm1heEZpbGxWb2x1bWUsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHJ1bGVzLnJlcXVpcmVzRHJ5ICYmIHN0YXRzLndhdGVyQ29sdW1ucyA+IDApIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnd2F0ZXInLFxuICAgICAgYCR7c3RhdHMud2F0ZXJDb2x1bW5zfSBmb290cHJpbnQgY29sdW1ucyBhcmUgdW5kZXJ3YXRlcmAsXG4gICAgICBzdGF0cy53YXRlckNvbHVtbnMsIDAsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGggPiBydWxlcy5tYXhPYnN0cnVjdGlvbnMpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnZm9vdHByaW50X29ic3RydWN0ZWQnLFxuICAgICAgYCR7c3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zIGV4Y2VlZCB0aGUgJHtydWxlcy5tYXhPYnN0cnVjdGlvbnN9IGFsbG93YW5jZWAsXG4gICAgICBzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoLCBydWxlcy5tYXhPYnN0cnVjdGlvbnMsXG4gICAgKSk7XG4gIH1cbiAgaWYgKGZwLm92ZXJoYW5nQ2VsbHMubGVuZ3RoID4gMCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdvdmVyaGFuZycsXG4gICAgICBgJHtmcC5vdmVyaGFuZ0NlbGxzLmxlbmd0aH0gY2VsbHMgYWJvdmUgdGhlIGZsb29yIGFyZSBibG9ja2VkYCxcbiAgICAgIGZwLm92ZXJoYW5nQ2VsbHMubGVuZ3RoLCAwLFxuICAgICkpO1xuICB9XG5cbiAgY29uc3QgbmVlZHNHcmFkaW5nID0gc3RhdHMucmVsaWVmID4gcnVsZXMubWF4UmVsaWVmTm9QcmVwXG4gICAgfHwgc3RhdHMuY3V0Vm9sdW1lID4gMCB8fCBzdGF0cy5maWxsVm9sdW1lID4gMDtcbiAgY29uc3QgbmVlZHNDbGVhcmluZyA9IHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGggPiAwXG4gICAgJiYgc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCA8PSBydWxlcy5tYXhPYnN0cnVjdGlvbnM7XG5cbiAgaWYgKG5lZWRzR3JhZGluZykge1xuICAgIHJlYXNvbnMucHVzaChwcmVwKFxuICAgICAgJ25lZWRzX2dyYWRpbmcnLFxuICAgICAgYGdyYWRpbmcgcmVxdWlyZWQ6ICR7c3RhdHMuY3V0Vm9sdW1lfSBtXHUwMEIzIGN1dCwgJHtzdGF0cy5maWxsVm9sdW1lfSBtXHUwMEIzIGZpbGxgLFxuICAgICAgc3RhdHMuY3V0Vm9sdW1lICsgc3RhdHMuZmlsbFZvbHVtZSxcbiAgICApKTtcbiAgfVxuICBpZiAobmVlZHNDbGVhcmluZykge1xuICAgIHJlYXNvbnMucHVzaChwcmVwKFxuICAgICAgJ25lZWRzX2NsZWFyaW5nJyxcbiAgICAgIGAke3N0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGh9IG9ic3RydWN0aW9ucyB0byBjbGVhcmAsXG4gICAgICBzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoLCBydWxlcy5tYXhPYnN0cnVjdGlvbnMsXG4gICAgKSk7XG4gIH1cblxuICBjb25zdCBoYXNFcnJvciA9IHJlYXNvbnMuc29tZSgocikgPT4gci5zZXZlcml0eSA9PT0gJ2Vycm9yJyk7XG4gIGNvbnN0IGhhc1ByZXAgPSByZWFzb25zLnNvbWUoKHIpID0+IHIuc2V2ZXJpdHkgPT09ICdwcmVwYXJhdGlvbicpO1xuICBjb25zdCBzdGF0ZTogU2l0ZVN0YXRlID0gaGFzRXJyb3IgPyAnaW52YWxpZCcgOiBoYXNQcmVwID8gJ3ZhbGlkX3dpdGhfcHJlcGFyYXRpb24nIDogJ3ZhbGlkJztcblxuICByZXR1cm4ge1xuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHN0YXRlLFxuICAgIHJlYXNvbnMsXG4gICAgcXVlcnk6IGZwLFxuICAgIHByZXBhcmF0aW9uOiB7XG4gICAgICBuZWVkc0dyYWRpbmcsXG4gICAgICBuZWVkc0NsZWFyaW5nLFxuICAgICAgY3V0Vm9sdW1lOiBzdGF0cy5jdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lOiBzdGF0cy5maWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0OiBzdGF0cy5tYXhDdXQsXG4gICAgICBtYXhGaWxsOiBzdGF0cy5tYXhGaWxsLFxuICAgICAgb2JzdHJ1Y3Rpb25JZHM6IHN0YXRzLm9ic3RydWN0aW9ucy5tYXAoKG8pID0+IG8uZW50aXR5SWQpLFxuICAgICAgZm91bmRhdGlvbjogcnVsZXMuZm91bmRhdGlvbixcbiAgICB9LFxuICB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIGNhbmRpZGF0ZSBzZWFyY2ggLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBTZWFyY2hPcHRpb25zIHtcbiAgLyoqIENhbmRpZGF0ZSBncmlkIHN0ZXAgaW4gbWV0cmVzLiBEZWZhdWx0IDIuICovXG4gIHN0ZXA/OiBudW1iZXI7XG4gIG1heFJlc3VsdHM/OiBudW1iZXI7XG4gIGFuY2hvcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgbWF4RGlzdGFuY2U/OiBudW1iZXI7XG4gIC8qKiBIYXJkIGNvbnN0cmFpbnQ6IGNhbmRpZGF0ZSBjZW50cmUgbXVzdCBsaWUgd2l0aGluIHRoaXMgcmFkaXVzIG9mIGEgcG9pbnQuICovXG4gIG5lYXI/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyBtYXhEaXN0YW5jZTogbnVtYmVyIH07XG4gIC8qKiBEbyBub3QgcmV0dXJuIHR3byBjYW5kaWRhdGVzIHdob3NlIGZvb3RwcmludHMgb3ZlcmxhcC4gRGVmYXVsdCB0cnVlLiAqL1xuICBkaXN0aW5jdD86IGJvb2xlYW47XG4gIC8qKiBXYWxsLWNsb2NrIGJ1ZGdldCBmb3IgdGhlIHNjYW4uIERlZmF1bHQgMTAwIG1zLiAqL1xuICBidWRnZXRNcz86IG51bWJlcjtcbiAgd2Fsaz86IFdhbGtQYXJhbXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZUNhbmRpZGF0ZSB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgc3RhdGU6ICd2YWxpZCcgfCAndmFsaWRfd2l0aF9wcmVwYXJhdGlvbic7XG4gIHZhbGlkYXRpb246IFNpdGVWYWxpZGF0aW9uO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBvYnN0cnVjdGlvbkNvdW50OiBudW1iZXI7XG4gIGRpc3RhbmNlOiBudW1iZXI7XG4gIHNjb3JlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVNlYXJjaFJlc3VsdCB7XG4gIGNhbmRpZGF0ZXM6IFNpdGVDYW5kaWRhdGVbXTtcbiAgZXZhbHVhdGVkOiBudW1iZXI7XG4gIHJlamVjdGVkOiBudW1iZXI7XG4gIGVsYXBzZWRNczogbnVtYmVyO1xuICBidWRnZXRNczogbnVtYmVyO1xuICAvKiogVHJ1ZSB3aGVuIHRoZSB3YWxsLWNsb2NrIGJ1ZGdldCBzdG9wcGVkIHRoZSBzY2FuIGJlZm9yZSB0aGUgYXJlYSB3YXMgZXhoYXVzdGVkLiAqL1xuICB0cnVuY2F0ZWQ6IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIGZsb29yQ2FuZGlkYXRlcyhzdGF0czogQXJlYVN0YXRzKTogbnVtYmVyW10ge1xuICBjb25zdCBtZWFuID0gTWF0aC5yb3VuZChzdGF0cy5tZWFuWSk7XG4gIGNvbnN0IHNldCA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICBmb3IgKGxldCBkID0gLTE7IGQgPD0gMTsgZCsrKSBzZXQuYWRkKG1lYW4gKyBkKTtcbiAgc2V0LmFkZChzdGF0cy5taW5ZKTtcbiAgc2V0LmFkZChzdGF0cy5tYXhZKTtcbiAgcmV0dXJuIFsuLi5zZXRdLmZpbHRlcigoeSkgPT4geSA+PSBZX01JTiAmJiB5IDwgWV9NQVgpLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcbn1cblxuZnVuY3Rpb24gb3ZlcmxhcHMoYTogUmVjdCwgYjogUmVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gYS54MCA8PSBiLngxICYmIGEueDEgPj0gYi54MCAmJiBhLnowIDw9IGIuejEgJiYgYS56MSA+PSBiLnowO1xufVxuXG5mdW5jdGlvbiBjYW5kaWRhdGVTY29yZSh2OiBTaXRlVmFsaWRhdGlvbiwgZGlzdGFuY2U6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHByZXBQZW5hbHR5ID0gdi5zdGF0ZSA9PT0gJ3ZhbGlkJyA/IDAgOiAyNTtcbiAgY29uc3QgZ3JhZGluZyA9IHYucHJlcGFyYXRpb24uY3V0Vm9sdW1lICsgdi5wcmVwYXJhdGlvbi5maWxsVm9sdW1lO1xuICBjb25zdCBjbGVhcmluZyA9IHYucHJlcGFyYXRpb24ub2JzdHJ1Y3Rpb25JZHMubGVuZ3RoICogNDtcbiAgcmV0dXJuIHByZXBQZW5hbHR5ICsgZ3JhZGluZyArIGNsZWFyaW5nICsgZGlzdGFuY2UgKiAwLjI1O1xufVxuXG4vKipcbiAqIFNlYXJjaCBhIGJvdW5kZWQgYXJlYSBmb3IgdmlhYmxlIGZvb3RwcmludHMuIFRoZSBzYW1lIHZhbGlkYXRvciBhbmQgdGhlIHNhbWVcbiAqIGZsb29yLXNlbGVjdGlvbiBwb2xpY3kgYXJlIHVzZWQgYnkgdGhlIEFJIGFnZW50IGFuZCB0aGUgcGxheWVyJ3MgYnVpbGRcbiAqIHByZXZpZXcuIFNlYXJjaCBpcyByZWFkLW9ubHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZWFyY2hTaXRlcyhcbiAgd29ybGQ6IFdvcmxkLCBydWxlczogQnVpbGRpbmdSdWxlcywgYXJlYTogUmVjdCwgb3B0aW9uczogU2VhcmNoT3B0aW9ucyA9IHt9LFxuKTogU2l0ZVNlYXJjaFJlc3VsdCB7XG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IHN0ZXAgPSBNYXRoLm1heCgxLCBNYXRoLmZsb29yKG9wdGlvbnMuc3RlcCA/PyAyKSk7XG4gIGNvbnN0IG1heFJlc3VsdHMgPSBNYXRoLm1heCgxLCBvcHRpb25zLm1heFJlc3VsdHMgPz8gOCk7XG4gIGNvbnN0IGRpc3RpbmN0ID0gb3B0aW9ucy5kaXN0aW5jdCAhPT0gZmFsc2U7XG4gIGNvbnN0IG1heERpc3RhbmNlID0gb3B0aW9ucy5tYXhEaXN0YW5jZSA/PyBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gIGNvbnN0IGJ1ZGdldE1zID0gb3B0aW9ucy5idWRnZXRNcyA/PyAxMDA7XG4gIGNvbnN0IGFuY2hvciA9IG9wdGlvbnMuYW5jaG9yID8/IHsgeDogKGFyZWEueDAgKyBhcmVhLngxKSAvIDIsIHo6IChhcmVhLnowICsgYXJlYS56MSkgLyAyIH07XG4gIGNvbnN0IHF1ZXJ5ID0gbmV3IFRlcnJhaW5RdWVyeSh3b3JsZCk7XG4gIGNvbnN0IGFsbDogU2l0ZUNhbmRpZGF0ZVtdID0gW107XG4gIGxldCBldmFsdWF0ZWQgPSAwO1xuICBsZXQgcmVqZWN0ZWQgPSAwO1xuICBsZXQgdHJ1bmNhdGVkID0gZmFsc2U7XG5cbiAgY29uc3QgeDFNYXggPSBhcmVhLngxIC0gcnVsZXMud2lkdGggKyAxO1xuICBjb25zdCB6MU1heCA9IGFyZWEuejEgLSBydWxlcy5kZXB0aCArIDE7XG4gIHNjYW46IGZvciAobGV0IHogPSBhcmVhLnowOyB6IDw9IHoxTWF4OyB6ICs9IHN0ZXApIHtcbiAgICBmb3IgKGxldCB4ID0gYXJlYS54MDsgeCA8PSB4MU1heDsgeCArPSBzdGVwKSB7XG4gICAgICBjb25zdCByZWN0ID0geyB4MDogeCwgejA6IHosIHgxOiB4ICsgcnVsZXMud2lkdGggLSAxLCB6MTogeiArIHJ1bGVzLmRlcHRoIC0gMSB9O1xuICAgICAgY29uc3QgY3ggPSAocmVjdC54MCArIHJlY3QueDEpIC8gMjtcbiAgICAgIGNvbnN0IGN6ID0gKHJlY3QuejAgKyByZWN0LnoxKSAvIDI7XG4gICAgICBjb25zdCBkaXN0YW5jZSA9IE1hdGguaHlwb3QoY3ggLSBhbmNob3IueCwgY3ogLSBhbmNob3Iueik7XG4gICAgICBpZiAoZGlzdGFuY2UgPiBtYXhEaXN0YW5jZSkgY29udGludWU7XG4gICAgICBpZiAob3B0aW9ucy5uZWFyKSB7XG4gICAgICAgIGNvbnN0IG5lYXJEaXN0YW5jZSA9IE1hdGguaHlwb3QoY3ggLSBvcHRpb25zLm5lYXIueCwgY3ogLSBvcHRpb25zLm5lYXIueik7XG4gICAgICAgIGlmIChuZWFyRGlzdGFuY2UgPiBvcHRpb25zLm5lYXIubWF4RGlzdGFuY2UpIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzdGF0cyA9IHF1ZXJ5LmFyZWEocmVjdCk7XG4gICAgICBsZXQgYmVzdDogU2l0ZUNhbmRpZGF0ZSB8IG51bGwgPSBudWxsO1xuICAgICAgZm9yIChjb25zdCBmbG9vclkgb2YgZmxvb3JDYW5kaWRhdGVzKHN0YXRzKSkge1xuICAgICAgICBldmFsdWF0ZWQrKztcbiAgICAgICAgY29uc3QgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCA9IHtcbiAgICAgICAgICBzaXRlSWQ6IGAke3J1bGVzLmlkfToke3h9LCR7en0sJHtmbG9vcll9YCxcbiAgICAgICAgICByZWN0LCBmbG9vclksIHJ1bGVzLFxuICAgICAgICB9O1xuICAgICAgICBjb25zdCBmb290cHJpbnQgPSBxdWVyeS5mb290cHJpbnQocmVjdCwgZmxvb3JZKTtcbiAgICAgICAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlU2l0ZSh3b3JsZCwgcHJvcG9zYWwsIHF1ZXJ5LCBmb290cHJpbnQpO1xuICAgICAgICBpZiAodmFsaWRhdGlvbi5zdGF0ZSA9PT0gJ2ludmFsaWQnKSB7XG4gICAgICAgICAgcmVqZWN0ZWQrKztcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzY29yZSA9IGNhbmRpZGF0ZVNjb3JlKHZhbGlkYXRpb24sIGRpc3RhbmNlKTtcbiAgICAgICAgY29uc3QgY2FuZGlkYXRlOiBTaXRlQ2FuZGlkYXRlID0ge1xuICAgICAgICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgICAgICAgIHJlY3QsXG4gICAgICAgICAgZmxvb3JZLFxuICAgICAgICAgIHN0YXRlOiB2YWxpZGF0aW9uLnN0YXRlLFxuICAgICAgICAgIHZhbGlkYXRpb24sXG4gICAgICAgICAgY3V0Vm9sdW1lOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLmN1dFZvbHVtZSxcbiAgICAgICAgICBmaWxsVm9sdW1lOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLmZpbGxWb2x1bWUsXG4gICAgICAgICAgb2JzdHJ1Y3Rpb25Db3VudDogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5vYnN0cnVjdGlvbklkcy5sZW5ndGgsXG4gICAgICAgICAgZGlzdGFuY2UsXG4gICAgICAgICAgc2NvcmUsXG4gICAgICAgIH07XG4gICAgICAgIGlmICghYmVzdFxuICAgICAgICAgIHx8IChjYW5kaWRhdGUuc3RhdGUgPT09ICd2YWxpZCcgJiYgYmVzdC5zdGF0ZSAhPT0gJ3ZhbGlkJylcbiAgICAgICAgICB8fCAoY2FuZGlkYXRlLnN0YXRlID09PSBiZXN0LnN0YXRlICYmIGNhbmRpZGF0ZS5zY29yZSA8IGJlc3Quc2NvcmUpKSB7XG4gICAgICAgICAgYmVzdCA9IGNhbmRpZGF0ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGJlc3QpIGFsbC5wdXNoKGJlc3QpO1xuICAgIH1cbiAgICBpZiAocGVyZm9ybWFuY2Uubm93KCkgLSB0MCA+IGJ1ZGdldE1zKSB7XG4gICAgICB0cnVuY2F0ZWQgPSB0cnVlO1xuICAgICAgYnJlYWsgc2NhbjtcbiAgICB9XG4gIH1cblxuICBhbGwuc29ydCgoYSwgYikgPT4gYS5zY29yZSAtIGIuc2NvcmUgfHwgYS5kaXN0YW5jZSAtIGIuZGlzdGFuY2VcbiAgICB8fCBhLnJlY3QueDAgLSBiLnJlY3QueDAgfHwgYS5yZWN0LnowIC0gYi5yZWN0LnowKTtcbiAgY29uc3Qgc2VsZWN0ZWQ6IFNpdGVDYW5kaWRhdGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBhbGwpIHtcbiAgICBpZiAoZGlzdGluY3QgJiYgc2VsZWN0ZWQuc29tZSgocykgPT4gb3ZlcmxhcHMocy5yZWN0LCBjYW5kaWRhdGUucmVjdCkpKSBjb250aW51ZTtcbiAgICBzZWxlY3RlZC5wdXNoKGNhbmRpZGF0ZSk7XG4gICAgaWYgKHNlbGVjdGVkLmxlbmd0aCA+PSBtYXhSZXN1bHRzKSBicmVhaztcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2FuZGlkYXRlczogc2VsZWN0ZWQsXG4gICAgZXZhbHVhdGVkLFxuICAgIHJlamVjdGVkLFxuICAgIGVsYXBzZWRNczogTWF0aC5yb3VuZCgocGVyZm9ybWFuY2Uubm93KCkgLSB0MCkgKiAxMDApIC8gMTAwLFxuICAgIGJ1ZGdldE1zLFxuICAgIHRydW5jYXRlZCxcbiAgfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwcmV2aWV3IC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgRm91bmRhdGlvblByZXZpZXcge1xuICB0eXBlOiBGb3VuZGF0aW9uVHlwZTtcbiAgLyoqIFN0b25lIGZsb29yIHNsYWIgcGx1cyBmaWxsIHVuZGVyIHRoZSBwcmVwYXJlZCBmbG9vci4gKi9cbiAgcGxpbnRoQ2VsbHM6IG51bWJlcjtcbiAgLyoqIFBlcmltZXRlciBjZWxscyB0aGF0IG5lZWQgYSByZXRhaW5pbmcgZmFjZSBiZWNhdXNlIG9mIGN1dCBvciBmaWxsLiAqL1xuICByZXRhaW5pbmdXYWxsQ2VsbHM6IG51bWJlcjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBY2Nlc3NQcmV2aWV3IHtcbiAgZG9vcjogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBhcHByb2FjaDogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBkaXN0YW5jZTogbnVtYmVyO1xuICBncmFkZTogbnVtYmVyO1xuICB3YWxrYWJsZTogYm9vbGVhbjtcbiAgcmVhc29uczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVByZXZpZXcge1xuICBzaXRlSWQ6IHN0cmluZztcbiAgc3RhdGU6IFNpdGVTdGF0ZTtcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHJ1bGVzOiBCdWlsZGluZ1J1bGVzO1xuICByZWFzb25zOiBWYWxpZGF0aW9uUmVhc29uW107XG4gIHRlcnJhaW46IHtcbiAgICBtaW5ZOiBudW1iZXI7XG4gICAgbWF4WTogbnVtYmVyO1xuICAgIG1lYW5ZOiBudW1iZXI7XG4gICAgcmVsaWVmOiBudW1iZXI7XG4gICAgbWF4U3RlcDogbnVtYmVyO1xuICAgIGN1dFZvbHVtZTogbnVtYmVyO1xuICAgIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgICBtYXhDdXQ6IG51bWJlcjtcbiAgICBtYXhGaWxsOiBudW1iZXI7XG4gIH07XG4gIGZvdW5kYXRpb246IEZvdW5kYXRpb25QcmV2aWV3O1xuICBvYnN0cnVjdGlvbnM6IEFycmF5PHtcbiAgICBlbnRpdHlJZDogc3RyaW5nO1xuICAgIGtpbmQ6IHN0cmluZztcbiAgICB4OiBudW1iZXI7XG4gICAgejogbnVtYmVyO1xuICAgIGFjdGlvbjogJ2NsZWFyJyB8ICdibG9ja2VkJztcbiAgfT47XG4gIGFjY2VzczogQWNjZXNzUHJldmlldyB8IG51bGw7XG4gIC8qKiBDb21wbGV0ZSB3b3JrIGVudmVsb3BlIHRoaXMgcHJldmlldyB3b3VsZCBhdXRob3JpemUuICovXG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXZpZXdPcHRpb25zIHtcbiAgZG9vcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgYXBwcm9hY2g/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIHdhbGs/OiBXYWxrUGFyYW1zO1xufVxuXG4vKipcbiAqIEJ1aWxkIHRoZSB0aHJlZS1zdGF0ZSBwcmV2aWV3LiBJdCBpcyBkZWxpYmVyYXRlbHkgZGF0YS1vbmx5OiB0aGUgcmVuZGVyZXJcbiAqIGNhbiBkcmF3IGl0LCBidXQgaXQgbmV2ZXIgZWRpdHMgdGVycmFpbiBvciBzcGVuZHMgcmVzb3VyY2VzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJldmlld1NpdGUoXG4gIHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCwgb3B0aW9uczogUHJldmlld09wdGlvbnMgPSB7fSxcbik6IFNpdGVQcmV2aWV3IHtcbiAgY29uc3QgcXVlcnkgPSBuZXcgVGVycmFpblF1ZXJ5KHdvcmxkKTtcbiAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlU2l0ZSh3b3JsZCwgcHJvcG9zYWwsIHF1ZXJ5KTtcbiAgY29uc3QgZnAgPSB2YWxpZGF0aW9uLnF1ZXJ5O1xuICBjb25zdCBzdGF0cyA9IGZwLnN0YXRzO1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgcnVsZXMgPSBwcm9wb3NhbC5ydWxlcztcblxuICBsZXQgcGVyaW1ldGVyID0gMDtcbiAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSB7XG4gICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgICBpZiAoeCAhPT0gcmVjdC54MCAmJiB4ICE9PSByZWN0LngxICYmIHogIT09IHJlY3QuejAgJiYgeiAhPT0gcmVjdC56MSkgY29udGludWU7XG4gICAgICBpZiAoY29sdW1uQXQod29ybGQsIHgsIHopLnN1cmZhY2VZICE9PSBwcm9wb3NhbC5mbG9vclkpIHBlcmltZXRlcisrO1xuICAgIH1cbiAgfVxuICBjb25zdCBmb3VuZGF0aW9uOiBGb3VuZGF0aW9uUHJldmlldyA9IHtcbiAgICB0eXBlOiBydWxlcy5mb3VuZGF0aW9uLFxuICAgIHBsaW50aENlbGxzOiByZWN0Q29sdW1ucyhyZWN0KSArIHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgcmV0YWluaW5nV2FsbENlbGxzOiBwZXJpbWV0ZXIsXG4gICAgY3V0Vm9sdW1lOiBzdGF0cy5jdXRWb2x1bWUsXG4gICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgfTtcblxuICBsZXQgYWNjZXNzOiBBY2Nlc3NQcmV2aWV3IHwgbnVsbCA9IG51bGw7XG4gIGlmIChvcHRpb25zLmRvb3IgJiYgb3B0aW9ucy5hcHByb2FjaCkge1xuICAgIGNvbnN0IGRvb3IgPSBvcHRpb25zLmRvb3I7XG4gICAgY29uc3QgYXBwcm9hY2ggPSBvcHRpb25zLmFwcHJvYWNoO1xuICAgIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLmh5cG90KGRvb3IueCAtIGFwcHJvYWNoLngsIGRvb3IueiAtIGFwcHJvYWNoLnopO1xuICAgIGNvbnN0IHN0ZXBzID0gTWF0aC5tYXgoMSwgTWF0aC5jZWlsKGRpc3RhbmNlKSk7XG4gICAgbGV0IHByZXZYID0gYXBwcm9hY2gueCwgcHJldlogPSBhcHByb2FjaC56O1xuICAgIGZvciAobGV0IGkgPSAxOyBpIDw9IHN0ZXBzOyBpKyspIHtcbiAgICAgIGNvbnN0IHQgPSBpIC8gc3RlcHM7XG4gICAgICBjb25zdCB4ID0gTWF0aC5yb3VuZChhcHByb2FjaC54ICsgKGRvb3IueCAtIGFwcHJvYWNoLngpICogdCk7XG4gICAgICBjb25zdCB6ID0gTWF0aC5yb3VuZChhcHByb2FjaC56ICsgKGRvb3IueiAtIGFwcHJvYWNoLnopICogdCk7XG4gICAgICBpZiAoeCA9PT0gcHJldlggJiYgeiA9PT0gcHJldlopIGNvbnRpbnVlO1xuICAgICAgY29uc3QgcmVzdWx0ID0gd2Fsa1N0ZXAod29ybGQsIHByZXZYLCBwcmV2WiwgeCwgeiwgb3B0aW9ucy53YWxrID8/IERFRkFVTFRfV0FMSyk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykgcmVhc29ucy5wdXNoKGAke3Jlc3VsdC5yZWFzb259IGF0ICR7eH0sJHt6fWApO1xuICAgICAgcHJldlggPSB4OyBwcmV2WiA9IHo7XG4gICAgfVxuICAgIGFjY2VzcyA9IHtcbiAgICAgIGRvb3IsIGFwcHJvYWNoLCBkaXN0YW5jZSxcbiAgICAgIGdyYWRlOiBlZmZlY3RpdmVHcmFkZSh3b3JsZCwgYXBwcm9hY2gueCwgYXBwcm9hY2gueiwgZG9vci54LCBkb29yLnopLFxuICAgICAgd2Fsa2FibGU6IHJlYXNvbnMubGVuZ3RoID09PSAwLFxuICAgICAgcmVhc29ucyxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgeTAgPSBwcm9wb3NhbC5mbG9vclkgLSBNYXRoLm1heCgxLCBzdGF0cy5tYXhDdXQpIC0gMTtcbiAgY29uc3QgeTEgPSBwcm9wb3NhbC5mbG9vclkgKyBNYXRoLm1heChydWxlcy53YWxsSGVpZ2h0LCAxKSArIDE7XG4gIGNvbnN0IGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdID0gW1xuICAgIHtcbiAgICAgIC4uLmV4cGFuZFJlY3QocmVjdCwgMiksXG4gICAgICB5MDogTWF0aC5tYXgoWV9NSU4sIHkwKSxcbiAgICAgIHkxOiBNYXRoLm1pbihZX01BWCAtIDEsIHkxKSxcbiAgICB9LFxuICBdO1xuICBpZiAoYWNjZXNzKSB7XG4gICAgY29uc3QgYXgwID0gTWF0aC5taW4oYWNjZXNzLmRvb3IueCwgYWNjZXNzLmFwcHJvYWNoLngpIC0gMTtcbiAgICBjb25zdCBheDEgPSBNYXRoLm1heChhY2Nlc3MuZG9vci54LCBhY2Nlc3MuYXBwcm9hY2gueCkgKyAxO1xuICAgIGNvbnN0IGF6MCA9IE1hdGgubWluKGFjY2Vzcy5kb29yLnosIGFjY2Vzcy5hcHByb2FjaC56KSAtIDE7XG4gICAgY29uc3QgYXoxID0gTWF0aC5tYXgoYWNjZXNzLmRvb3IueiwgYWNjZXNzLmFwcHJvYWNoLnopICsgMTtcbiAgICBjb25zdCBhTWluID0gTWF0aC5taW4oc3VyZmFjZUF0KHdvcmxkLCBheDAsIGF6MCksIHN1cmZhY2VBdCh3b3JsZCwgYXgxLCBhejEpKTtcbiAgICBjb25zdCBhTWF4ID0gTWF0aC5tYXgoc3VyZmFjZUF0KHdvcmxkLCBheDAsIGF6MCksIHN1cmZhY2VBdCh3b3JsZCwgYXgxLCBhejEpKTtcbiAgICBlbnZlbG9wZS5wdXNoKHtcbiAgICAgIHgwOiBheDAsIHgxOiBheDEsIHowOiBhejAsIHoxOiBhejEsXG4gICAgICB5MDogTWF0aC5tYXgoWV9NSU4sIGFNaW4gLSAyKSxcbiAgICAgIHkxOiBNYXRoLm1pbihZX01BWCAtIDEsIGFNYXggKyAyKSxcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgc3RhdGU6IHZhbGlkYXRpb24uc3RhdGUsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHByb3Bvc2FsLmZsb29yWSxcbiAgICBydWxlcyxcbiAgICByZWFzb25zOiB2YWxpZGF0aW9uLnJlYXNvbnMsXG4gICAgdGVycmFpbjoge1xuICAgICAgbWluWTogc3RhdHMubWluWSxcbiAgICAgIG1heFk6IHN0YXRzLm1heFksXG4gICAgICBtZWFuWTogc3RhdHMubWVhblksXG4gICAgICByZWxpZWY6IHN0YXRzLnJlbGllZixcbiAgICAgIG1heFN0ZXA6IHN0YXRzLm1heFN0ZXAsXG4gICAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWU6IHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHN0YXRzLm1heEN1dCxcbiAgICAgIG1heEZpbGw6IHN0YXRzLm1heEZpbGwsXG4gICAgfSxcbiAgICBmb3VuZGF0aW9uLFxuICAgIG9ic3RydWN0aW9uczogc3RhdHMub2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gKHtcbiAgICAgIGVudGl0eUlkOiBvLmVudGl0eUlkLFxuICAgICAga2luZDogby5raW5kLFxuICAgICAgeDogby54LFxuICAgICAgejogby56LFxuICAgICAgYWN0aW9uOiB2YWxpZGF0aW9uLnN0YXRlID09PSAnaW52YWxpZCcgPyAnYmxvY2tlZCcgOiAnY2xlYXInLFxuICAgIH0pKSxcbiAgICBhY2Nlc3MsXG4gICAgZW52ZWxvcGUsXG4gIH07XG59XG5cbiIsICIvLyBNMDAyIHN0YWdlIDM6IGJvdW5kZWQsIGF1dGhvcml6ZWQgdGVycmFpbiBwcmVwYXJhdGlvbi5cbi8vXG4vLyBUaGUgcGlwZWxpbmUgaXMgZGVsaWJlcmF0ZWx5IG9uZS13YXkgYW5kIHNoYXJlZCBieSB0aGUgcGxheWVyIGFuZCB0aGUgQUk6XG4vL1xuLy8gICBwcm9wb3NhbCAtPiB2YWxpZGF0ZVNpdGUgLT4gcGxhblByZXBhcmF0aW9uIC0+IEF1dGhvcml6ZXIgLT4gZXhlY3V0ZVxuLy9cbi8vIGBleGVjdXRlUHJlcGFyYXRpb25gIGlzIHRoZSBvbmx5IGZ1bmN0aW9uIGluIE0wMDIgdGhhdCBlZGl0cyB0ZXJyYWluIGZvclxuLy8gY29uc3RydWN0aW9uLiBJdCByZWZ1c2VzIHRvIHJ1biB3aXRob3V0IGFuIGF1dGhvcml6YXRpb24gdG9rZW4gd2hvc2UgZGlnZXN0XG4vLyBtYXRjaGVzIHRoZSBwbGFuLCB3aG9zZSBlbnZlbG9wZSBjb3ZlcnMgZXZlcnkgdm94ZWwgaXQgd291bGQgdG91Y2gsIGFuZCB3aG9zZVxuLy8gYmFzZSByZXZpc2lvbiBzdGlsbCBtYXRjaGVzIHRoZSB3b3JsZC4gQWxsIGVkaXRzIGFyZSBjb21wdXRlZCBhbmQgY2hlY2tlZFxuLy8gYmVmb3JlIHRoZSBmaXJzdCBieXRlIGlzIHdyaXR0ZW4sIHNvIGEgcmVqZWN0ZWQgcGxhbiBjYW5ub3QgbGVhdmUgYSBwYXJ0aWFsXG4vLyBwYWQgYmVoaW5kLlxuLy9cbi8vIFRoZSBhdXRob3JpemVyIGluIHRoaXMgZmlsZSBpcyBhIGxvY2FsIHBvbGljeSBzdHViLiBJdCBwcm92ZXMgdGhhdCB0aGVcbi8vIHBpcGVsaW5lIGFuZCB0aGUgZW52ZWxvcGUgY2hlY2tzIGV4aXN0OyBpdCBpcyBOT1QgTWFnaWNCbG9jayBlbmZvcmNlbWVudC5cbi8vIE5vIGNoYWluIHByb2dyYW0sIFNESyBjYWxsLCBzZXR0bGVtZW50IG9yIHJvbGxiYWNrIGd1YXJhbnRlZSBpcyBwcmVzZW50LlxuaW1wb3J0IHtcbiAgV29ybGQsIE1BVCwgTWF0SWQsIFlfTUlOLCBZX01BWCwgSEFMRiwgaXNTb2xpZCxcbiAgZ2V0Vm94ZWwsIHNldFZveGVsLCByZW1vdmVFbnRpdHksIHN1cmZhY2VBdCxcbiAgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG4gIEVudGl0eUtpbmQsIFJlc291cmNlVHlwZSxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQge1xuICBSZWN0LCBWb3hlbFJlZ2lvbiwgbm9ybWFsaXplUmVjdCwgcmVjdENvbHVtbnMsIGV4cGFuZFJlY3QsXG4gIGVudmVsb3BlQ29udGFpbnMsIG9ic3RydWN0aW9uc0luLFxufSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHtcbiAgU2l0ZVByb3Bvc2FsLCBTaXRlVmFsaWRhdGlvbiwgQnVpbGRpbmdSdWxlcywgdmFsaWRhdGVTaXRlLFxufSBmcm9tICcuL2NvbnN0cnVjdGlvbic7XG5pbXBvcnQge1xuICBpbnZlbnRvcnlTbmFwc2hvdCwgbm9ybWFsaXplRW52ZWxvcGUsXG59IGZyb20gJy4vY2Fub25pY2FsJztcblxuZXhwb3J0IGNvbnN0IExPQ0FMX0FVVEhPUklUWSA9ICdsb2NhbC1zdHViJyBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBMT0NBTF9FTkZPUkNFTUVOVCA9ICdsb2NhbC1zaW11bGF0aW9uLW9ubHknIGFzIGNvbnN0O1xuXG5leHBvcnQgaW50ZXJmYWNlIENvbHVtblRhcmdldCB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGxhbkV4cGVjdGF0aW9uIHtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgb2JzdHJ1Y3Rpb25zOiBudW1iZXI7XG4gIHN1cmZhY2VFZGl0czogbnVtYmVyO1xuICB0b3RhbEVkaXRzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25QbGFuIHtcbiAgaWQ6IHN0cmluZztcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBydWxlczogQnVpbGRpbmdSdWxlcztcbiAgLyoqIEV4YWN0bHkgb25lIHRhcmdldCB3YWxraW5nIGhlaWdodCBwZXIgZm9vdHByaW50IGNvbHVtbiwgc29ydGVkIGJ5IHosIHguICovXG4gIHRhcmdldHM6IENvbHVtblRhcmdldFtdO1xuICAvKiogQXV0aG9yaXRhdGl2ZSBlbnRpdHkgaWRzIHRoaXMgcGxhbiBtYXkgcmVtb3ZlLiAqL1xuICBjbGVhckVudGl0eUlkczogc3RyaW5nW107XG4gIC8qKiBNYXRlcmlhbCBmb3IgdGhlIHRvcCBzb2xpZCB2b3hlbCBhZnRlciBncmFkaW5nLCBvciBudWxsIHRvIGtlZXAgaXQuICovXG4gIHN1cmZhY2VNYXRlcmlhbDogTWF0SWQgfCBudWxsO1xuICAvKiogVGlnaHQgZW52ZWxvcGUgY292ZXJpbmcgZXZlcnkgcGxhbm5lZCB2b3hlbCBjaGFuZ2UuICovXG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICBleHBlY3RlZDogUGxhbkV4cGVjdGF0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uT3B0aW9ucyB7XG4gIC8qKiBQZXItY29sdW1uIHRhcmdldHMgZm9yIHRlcnJhY2VzIG9yIHN0ZXBwZWQgcGF0aHMuIERlZmF1bHRzIHRvIGZsb29yWS4gKi9cbiAgdGFyZ2V0cz86IENvbHVtblRhcmdldFtdO1xuICAvKiogYG5vbmVgIGlzIG9ubHkgbGVnYWwgd2hlbiB0aGUgc2l0ZSBoYXMgbm8gb2JzdHJ1Y3Rpb25zLiAqL1xuICBjbGVhcj86ICdvYnN0cnVjdGlvbnMnIHwgJ25vbmUnO1xuICAvKiogU2V0IHRoZSB0b3Agc29saWQgdm94ZWwgb2YgZXZlcnkgdGFyZ2V0IGNvbHVtbiAocGF0aHMsIGZpZWxkcykuICovXG4gIHN1cmZhY2VNYXRlcmlhbD86IE1hdElkO1xuICAvKiogRXhwbGljaXQgd29yayBlbnZlbG9wZS4gRGVmYXVsdHMgdG8gYSB0aWdodCBlbnZlbG9wZSBhcm91bmQgdGhlIGVkaXRzLiAqL1xuICBlbnZlbG9wZT86IFZveGVsUmVnaW9uW107XG59XG5cbi8vIC0tLS0tLS0tLS0gc3RhYmxlIGRpZ2VzdCAtLS0tLS0tLS0tXG5mdW5jdGlvbiBkaWdlc3QoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBhID0gMHg4MTFjOWRjNTtcbiAgbGV0IGIgPSAweDllMzc3OWI5O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGlucHV0Lmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgYyA9IGlucHV0LmNoYXJDb2RlQXQoaSk7XG4gICAgYSA9IE1hdGguaW11bChhIF4gYywgMHgwMTAwMDE5Myk7XG4gICAgYiA9IE1hdGguaW11bChiIF4gKGMgKyAweDllKSwgMHg4NWViY2E2Yik7XG4gICAgYiBePSBiID4+PiAxMztcbiAgfVxuICByZXR1cm4gKGEgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpXG4gICAgKyAoYiA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbi8qKiBEaWdlc3Qgb2YgZXZlcnl0aGluZyB0aGF0IGNoYW5nZXMgdGhlIHNldCBvZiBlZGl0cyBvciByZW1vdmFscy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGFuRGlnZXN0KHBsYW46IFByZXBhcmF0aW9uUGxhbik6IHN0cmluZyB7XG4gIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtcbiAgICAnbTAwMjpwcmVwLXBsYW46djEnLFxuICAgIHBsYW4uc2l0ZUlkLFxuICAgIGAke3BsYW4ucmVjdC54MH0sJHtwbGFuLnJlY3QuejB9LCR7cGxhbi5yZWN0LngxfSwke3BsYW4ucmVjdC56MX1gLFxuICAgIFN0cmluZyhwbGFuLmZsb29yWSksXG4gICAgcGxhbi5ydWxlcy5pZCxcbiAgICBTdHJpbmcocGxhbi50YXJnZXRzLmxlbmd0aCksXG4gICAgcGxhbi5zdXJmYWNlTWF0ZXJpYWwgPT09IG51bGwgPyAnc3VyZmFjZTprZWVwJyA6IGBzdXJmYWNlOiR7cGxhbi5zdXJmYWNlTWF0ZXJpYWx9YCxcbiAgXTtcbiAgZm9yIChjb25zdCB0IG9mIHBsYW4udGFyZ2V0cykgbGluZXMucHVzaChgdDoke3QueH0sJHt0Lnp9LCR7dC55fWApO1xuICBjb25zdCBjbGVhcnMgPSBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpO1xuICBsaW5lcy5wdXNoKGBjOiR7Y2xlYXJzLmxlbmd0aH1gKTtcbiAgZm9yIChjb25zdCBpZCBvZiBjbGVhcnMpIGxpbmVzLnB1c2goYGM6JHtpZH1gKTtcbiAgZm9yIChjb25zdCBlIG9mIG5vcm1hbGl6ZUVudmVsb3BlKHBsYW4uZW52ZWxvcGUpKSB7XG4gICAgbGluZXMucHVzaChgZToke2UueDB9LCR7ZS56MH0sJHtlLnkwfSwke2UueDF9LCR7ZS56MX0sJHtlLnkxfWApO1xuICB9XG4gIGNvbnN0IHggPSBwbGFuLmV4cGVjdGVkO1xuICBsaW5lcy5wdXNoKGB4OiR7eC5jdXRWb2x1bWV9LCR7eC5maWxsVm9sdW1lfSwke3gubWF4Q3V0fSwke3gubWF4RmlsbH0sJHt4Lm9ic3RydWN0aW9uc30sJHt4LnN1cmZhY2VFZGl0c30sJHt4LnRvdGFsRWRpdHN9YCk7XG4gIHJldHVybiBkaWdlc3QobGluZXMuam9pbignXFxuJykpO1xufVxuXG4vLyAtLS0tLS0tLS0tIHBsYW5uaW5nIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgUGxhblN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcGxhbjogUHJlcGFyYXRpb25QbGFuO1xuICB2YWxpZGF0aW9uOiBTaXRlVmFsaWRhdGlvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvbkZhaWx1cmUge1xuICBvazogZmFsc2U7XG4gIHN0YWdlOiAncGxhbicgfCAnYXV0aG9yaXplJyB8ICdleGVjdXRlJztcbiAgY29kZTogc3RyaW5nO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbiAgdmFsaWRhdGlvbj86IFNpdGVWYWxpZGF0aW9uO1xufVxuXG5leHBvcnQgdHlwZSBQbGFuUmVzdWx0ID0gUGxhblN1Y2Nlc3MgfCBQcmVwYXJhdGlvbkZhaWx1cmU7XG5cbmZ1bmN0aW9uIGRlZmF1bHRUYXJnZXRzKHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCwgZmxvb3JZOiBudW1iZXIpOiBDb2x1bW5UYXJnZXRbXSB7XG4gIGNvbnN0IG91dDogQ29sdW1uVGFyZ2V0W10gPSBbXTtcbiAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSB7XG4gICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSBvdXQucHVzaCh7IHgsIHosIHk6IGZsb29yWSB9KTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBzb3J0ZWRUYXJnZXRzKHRhcmdldHM6IHJlYWRvbmx5IENvbHVtblRhcmdldFtdKTogQ29sdW1uVGFyZ2V0W10ge1xuICByZXR1cm4gWy4uLnRhcmdldHNdLnNvcnQoKGEsIGIpID0+IGEueiAtIGIueiB8fCBhLnggLSBiLnggfHwgYS55IC0gYi55KTtcbn1cblxuaW50ZXJmYWNlIFRhcmdldFN0YXRzIHtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgcmVsaWVmOiBudW1iZXI7XG59XG5cbi8qKiBDdXQvZmlsbCBpbXBsaWVkIGJ5IGV4cGxpY2l0IHRhcmdldHMsIGluZGVwZW5kZW50IG9mIHRoZSBmbGF0IGZsb29yWS4gKi9cbmZ1bmN0aW9uIHRhcmdldFN0YXRzKHdvcmxkOiBXb3JsZCwgdGFyZ2V0czogcmVhZG9ubHkgQ29sdW1uVGFyZ2V0W10pOiBUYXJnZXRTdGF0cyB7XG4gIGxldCBjdXRWb2x1bWUgPSAwLCBmaWxsVm9sdW1lID0gMCwgbWF4Q3V0ID0gMCwgbWF4RmlsbCA9IDA7XG4gIGxldCBtaW5ZID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLCBtYXhZID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBmb3IgKGNvbnN0IHQgb2YgdGFyZ2V0cykge1xuICAgIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHQueCwgdC56KTtcbiAgICBtaW5ZID0gTWF0aC5taW4obWluWSwgc3VyZmFjZSwgdC55KTtcbiAgICBtYXhZID0gTWF0aC5tYXgobWF4WSwgc3VyZmFjZSwgdC55KTtcbiAgICBpZiAoc3VyZmFjZSA+IHQueSkge1xuICAgICAgY29uc3QgZCA9IHN1cmZhY2UgLSB0Lnk7XG4gICAgICBjdXRWb2x1bWUgKz0gZDtcbiAgICAgIG1heEN1dCA9IE1hdGgubWF4KG1heEN1dCwgZCk7XG4gICAgfSBlbHNlIGlmIChzdXJmYWNlIDwgdC55KSB7XG4gICAgICBjb25zdCBkID0gdC55IC0gc3VyZmFjZTtcbiAgICAgIGZpbGxWb2x1bWUgKz0gZDtcbiAgICAgIG1heEZpbGwgPSBNYXRoLm1heChtYXhGaWxsLCBkKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHsgY3V0Vm9sdW1lLCBmaWxsVm9sdW1lLCBtYXhDdXQsIG1heEZpbGwsIHJlbGllZjogbWF4WSAtIG1pblkgfTtcbn1cblxuZnVuY3Rpb24gdGFyZ2V0UnVsZVJlYXNvbnMoc3RhdHM6IFRhcmdldFN0YXRzLCBydWxlczogQnVpbGRpbmdSdWxlcyk6IHN0cmluZ1tdIHtcbiAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgaWYgKHN0YXRzLnJlbGllZiA+IHJ1bGVzLm1heFJlbGllZlByZXBhcmVkKSB7XG4gICAgcmVhc29ucy5wdXNoKGByZWxpZWYgJHtzdGF0cy5yZWxpZWZ9IG0gZXhjZWVkcyB0aGUgJHtydWxlcy5tYXhSZWxpZWZQcmVwYXJlZH0gbSBwcmVwYXJlZCBsaW1pdGApO1xuICB9XG4gIGlmIChzdGF0cy5tYXhDdXQgPiBydWxlcy5tYXhDdXQpIHtcbiAgICByZWFzb25zLnB1c2goYGN1dCAke3N0YXRzLm1heEN1dH0gbSBleGNlZWRzICR7cnVsZXMubWF4Q3V0fSBtYCk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEZpbGwgPiBydWxlcy5tYXhGaWxsKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmaWxsICR7c3RhdHMubWF4RmlsbH0gbSBleGNlZWRzICR7cnVsZXMubWF4RmlsbH0gbWApO1xuICB9XG4gIGlmIChzdGF0cy5jdXRWb2x1bWUgPiBydWxlcy5tYXhDdXRWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goYGN1dCB2b2x1bWUgJHtzdGF0cy5jdXRWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEN1dFZvbHVtZX0gbVx1MDBCM2ApO1xuICB9XG4gIGlmIChzdGF0cy5maWxsVm9sdW1lID4gcnVsZXMubWF4RmlsbFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChgZmlsbCB2b2x1bWUgJHtzdGF0cy5maWxsVm9sdW1lfSBtXHUwMEIzIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsVm9sdW1lfSBtXHUwMEIzYCk7XG4gIH1cbiAgcmV0dXJuIHJlYXNvbnM7XG59XG5cbi8qKlxuICogVHVybiBhIHByb3Bvc2FsIGludG8gYW4gZXhwbGljaXQsIGNoZWNrYWJsZSBwbGFuLiBSZWFkLW9ubHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGFuUHJlcGFyYXRpb24oXG4gIHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCwgb3B0aW9uczogUHJlcGFyYXRpb25PcHRpb25zID0ge30sXG4pOiBQbGFuUmVzdWx0IHtcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZVNpdGUod29ybGQsIHByb3Bvc2FsKTtcblxuICBpZiAodmFsaWRhdGlvbi5zdGF0ZSA9PT0gJ2ludmFsaWQnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIHN0YWdlOiAncGxhbicsXG4gICAgICBjb2RlOiAnc2l0ZV9pbnZhbGlkJyxcbiAgICAgIHJlYXNvbnM6IHZhbGlkYXRpb24ucmVhc29ucy5tYXAoKHIpID0+IGAke3IuY29kZX06ICR7ci5tZXNzYWdlfWApLFxuICAgICAgdmFsaWRhdGlvbixcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgdGFyZ2V0cyA9IHNvcnRlZFRhcmdldHMob3B0aW9ucy50YXJnZXRzID8/IGRlZmF1bHRUYXJnZXRzKHdvcmxkLCByZWN0LCBwcm9wb3NhbC5mbG9vclkpKTtcbiAgY29uc3QgY29sdW1ucyA9IHJlY3RDb2x1bW5zKHJlY3QpO1xuICBpZiAodGFyZ2V0cy5sZW5ndGggIT09IGNvbHVtbnMpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgIGNvZGU6ICd0YXJnZXRfY291bnQnLFxuICAgICAgcmVhc29uczogW2BwbGFuIGhhcyAke3RhcmdldHMubGVuZ3RofSB0YXJnZXRzIGZvciAke2NvbHVtbnN9IGNvbHVtbnNgXSxcbiAgICAgIHZhbGlkYXRpb24sXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCB0IG9mIHRhcmdldHMpIHtcbiAgICBjb25zdCBrZXkgPSBgJHt0Lnh9LCR7dC56fWA7XG4gICAgaWYgKHNlZW4uaGFzKGtleSkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSwgc3RhZ2U6ICdwbGFuJywgY29kZTogJ2R1cGxpY2F0ZV90YXJnZXQnLFxuICAgICAgICByZWFzb25zOiBbYGR1cGxpY2F0ZSB0YXJnZXQgYXQgJHtrZXl9YF0sIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgICBzZWVuLmFkZChrZXkpO1xuICAgIGlmICh0LnggPCByZWN0LngwIHx8IHQueCA+IHJlY3QueDEgfHwgdC56IDwgcmVjdC56MCB8fCB0LnogPiByZWN0LnoxKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsIHN0YWdlOiAncGxhbicsIGNvZGU6ICd0YXJnZXRfb3V0c2lkZV9mb290cHJpbnQnLFxuICAgICAgICByZWFzb25zOiBbYHRhcmdldCAke2tleX0gaXMgb3V0c2lkZSAke3JlY3QueDB9LCR7cmVjdC56MH0uLiR7cmVjdC54MX0sJHtyZWN0LnoxfWBdLFxuICAgICAgICB2YWxpZGF0aW9uLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKHQueSkgfHwgdC55IDwgWV9NSU4gfHwgdC55ID49IFlfTUFYKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsIHN0YWdlOiAncGxhbicsIGNvZGU6ICd0YXJnZXRfaGVpZ2h0JyxcbiAgICAgICAgcmVhc29uczogW2B0YXJnZXQgJHtrZXl9IGhhcyBpbnZhbGlkIGhlaWdodCAke3QueX1gXSwgdmFsaWRhdGlvbixcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5vYnN0cnVjdGlvbklkcztcbiAgY29uc3QgY2xlYXIgPSBvcHRpb25zLmNsZWFyID8/ICdvYnN0cnVjdGlvbnMnO1xuICBpZiAoY2xlYXIgPT09ICdub25lJyAmJiBvYnN0cnVjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBzdGFnZTogJ3BsYW4nLFxuICAgICAgY29kZTogJ3VuY2xlYXJlZF9vYnN0cnVjdGlvbnMnLFxuICAgICAgcmVhc29uczogW2Ake29ic3RydWN0aW9ucy5sZW5ndGh9IG9ic3RydWN0aW9ucyB3b3VsZCByZW1haW5gXSxcbiAgICAgIHZhbGlkYXRpb24sXG4gICAgfTtcbiAgfVxuICBjb25zdCBjbGVhckVudGl0eUlkcyA9IGNsZWFyID09PSAnbm9uZScgPyBbXSA6IFsuLi5uZXcgU2V0KG9ic3RydWN0aW9ucyldLnNvcnQoKTtcbiAgY29uc3Qgc3VyZmFjZU1hdGVyaWFsID0gb3B0aW9ucy5zdXJmYWNlTWF0ZXJpYWwgPz8gbnVsbDtcblxuICBjb25zdCBjdXN0b21UYXJnZXRzID0gb3B0aW9ucy50YXJnZXRzICE9PSB1bmRlZmluZWQ7XG4gIGNvbnN0IHN0YXRzID0gY3VzdG9tVGFyZ2V0c1xuICAgID8gdGFyZ2V0U3RhdHMod29ybGQsIHRhcmdldHMpXG4gICAgOiB7XG4gICAgICBjdXRWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5maWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0OiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm1heEN1dCxcbiAgICAgIG1heEZpbGw6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24ubWF4RmlsbCxcbiAgICAgIHJlbGllZjogdmFsaWRhdGlvbi5xdWVyeS5zdGF0cy5yZWxpZWYsXG4gICAgfTtcbiAgaWYgKGN1c3RvbVRhcmdldHMpIHtcbiAgICBjb25zdCByZWFzb25zID0gdGFyZ2V0UnVsZVJlYXNvbnMoc3RhdHMsIHByb3Bvc2FsLnJ1bGVzKTtcbiAgICBpZiAocmVhc29ucy5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsXG4gICAgICAgIHN0YWdlOiAncGxhbicsXG4gICAgICAgIGNvZGU6ICd0YXJnZXRfcnVsZXMnLFxuICAgICAgICByZWFzb25zLFxuICAgICAgICB2YWxpZGF0aW9uLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBsZXQgbG8gPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gIGxldCBoaSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgZm9yIChjb25zdCB0IG9mIHRhcmdldHMpIHtcbiAgICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB0LngsIHQueik7XG4gICAgbG8gPSBNYXRoLm1pbihsbywgc3VyZmFjZSwgdC55KTtcbiAgICBoaSA9IE1hdGgubWF4KGhpLCBzdXJmYWNlIC0gMSwgdC55IC0gMSk7XG4gIH1cbiAgY29uc3QgYnVmZmVyZWQgPSBleHBhbmRSZWN0KHJlY3QsIDEpO1xuICBjb25zdCBkZXJpdmVkOiBWb3hlbFJlZ2lvbiA9IHtcbiAgICB4MDogTWF0aC5tYXgoLUhBTEYsIGJ1ZmZlcmVkLngwKSxcbiAgICB6MDogTWF0aC5tYXgoLUhBTEYsIGJ1ZmZlcmVkLnowKSxcbiAgICB4MTogTWF0aC5taW4oSEFMRiAtIDEsIGJ1ZmZlcmVkLngxKSxcbiAgICB6MTogTWF0aC5taW4oSEFMRiAtIDEsIGJ1ZmZlcmVkLnoxKSxcbiAgICB5MDogTWF0aC5tYXgoWV9NSU4sIGxvIC0gMSksXG4gICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgaGkgKyAxKSxcbiAgfTtcbiAgLy8gQW4gZXhwbGljaXQgZW52ZWxvcGUgcmVwbGFjZXMgdGhlIGRlcml2ZWQgb25lLiBDYWxsZXJzIHRoYXQgcGluIGFuIGV4YWN0XG4gIC8vIHdvcmsgZW52ZWxvcGUgKHBhdGggcHJlcGFyYXRpb24pIG11c3Qgbm90IHNpbGVudGx5IHdpZGVuIGl0IHdpdGggdGhlXG4gIC8vIGRlZmF1bHQgMSBtIGJ1ZmZlci5cbiAgY29uc3QgZW52ZWxvcGUgPSBub3JtYWxpemVFbnZlbG9wZShvcHRpb25zLmVudmVsb3BlID8/IFtkZXJpdmVkXSk7XG4gIGNvbnN0IHN1cmZhY2VFZGl0cyA9IHN1cmZhY2VNYXRlcmlhbCA9PT0gbnVsbCA/IDAgOiB0YXJnZXRzLmxlbmd0aDtcblxuICBjb25zdCBwbGFuOiBQcmVwYXJhdGlvblBsYW4gPSB7XG4gICAgaWQ6ICcnLFxuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwcm9wb3NhbC5mbG9vclksXG4gICAgcnVsZXM6IHByb3Bvc2FsLnJ1bGVzLFxuICAgIHRhcmdldHMsXG4gICAgY2xlYXJFbnRpdHlJZHMsXG4gICAgc3VyZmFjZU1hdGVyaWFsLFxuICAgIGVudmVsb3BlLFxuICAgIGV4cGVjdGVkOiB7XG4gICAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWU6IHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHN0YXRzLm1heEN1dCxcbiAgICAgIG1heEZpbGw6IHN0YXRzLm1heEZpbGwsXG4gICAgICBvYnN0cnVjdGlvbnM6IGNsZWFyRW50aXR5SWRzLmxlbmd0aCxcbiAgICAgIHN1cmZhY2VFZGl0cyxcbiAgICAgIHRvdGFsRWRpdHM6IHN0YXRzLmN1dFZvbHVtZSArIHN0YXRzLmZpbGxWb2x1bWUgKyBzdXJmYWNlRWRpdHMsXG4gICAgfSxcbiAgfTtcbiAgcGxhbi5pZCA9IGBwcmVwOiR7cGxhbkRpZ2VzdChwbGFuKX1gO1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiwgdmFsaWRhdGlvbiB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIGF1dGhvcml6YXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBBdXRob3JpemF0aW9uTGltaXRzIHtcbiAgbWF4Q3V0Vm9sdW1lOiBudW1iZXI7XG4gIG1heEZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Vm94ZWxFZGl0czogbnVtYmVyO1xuICBtYXhFbnRpdHlSZW1vdmFsczogbnVtYmVyO1xuICBtYXhUYXJnZXRzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0xJTUlUUzogQXV0aG9yaXphdGlvbkxpbWl0cyA9IHtcbiAgbWF4Q3V0Vm9sdW1lOiAyNTYsXG4gIG1heEZpbGxWb2x1bWU6IDI1NixcbiAgbWF4Vm94ZWxFZGl0czogMTAyNCxcbiAgbWF4RW50aXR5UmVtb3ZhbHM6IDE2LFxuICBtYXhUYXJnZXRzOiA1MTIsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmtBdXRob3JpemF0aW9uIHtcbiAgaWQ6IHN0cmluZztcbiAgYXV0aG9yaXR5OiB0eXBlb2YgTE9DQUxfQVVUSE9SSVRZO1xuICBlbmZvcmNlbWVudDogdHlwZW9mIExPQ0FMX0VORk9SQ0VNRU5UO1xuICBwbGFuRGlnZXN0OiBzdHJpbmc7XG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICBiYXNlUmV2aXNpb246IG51bWJlcjtcbiAgbGltaXRzOiBBdXRob3JpemF0aW9uTGltaXRzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhvcml6YXRpb25EZWNpc2lvbiB7XG4gIG9rOiBib29sZWFuO1xuICBhdXRob3JpemF0aW9uOiBXb3JrQXV0aG9yaXphdGlvbiB8IG51bGw7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhvcml6YXRpb25Qb2xpY3kge1xuICAvKiogVGhlIG9ubHkgcmVnaW9ucyB0aGlzIGdvdmVybm9yIHBlcm1pdHMgZm9yIHRoZSBmaXJzdCBzbGljZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIGxpbWl0cz86IFBhcnRpYWw8QXV0aG9yaXphdGlvbkxpbWl0cz47XG59XG5cbmZ1bmN0aW9uIHJlZ2lvbkNvbnRhaW5lZChyZWdpb246IFZveGVsUmVnaW9uLCBwb2xpY3k6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBib29sZWFuIHtcbiAgcmV0dXJuIHBvbGljeS5zb21lKChwKSA9PiByZWdpb24ueDAgPj0gcC54MCAmJiByZWdpb24ueDEgPD0gcC54MVxuICAgICYmIHJlZ2lvbi56MCA+PSBwLnowICYmIHJlZ2lvbi56MSA8PSBwLnoxXG4gICAgJiYgcmVnaW9uLnkwID49IHAueTAgJiYgcmVnaW9uLnkxIDw9IHAueTEpO1xufVxuXG4vKipcbiAqIExvY2FsIGdvdmVybm9yIHN0dWIuIEl0IGVuZm9yY2VzIGEgZml4ZWQgZW52ZWxvcGUgYW5kIGhhcmQgdm9sdW1lIGxpbWl0cyxcbiAqIGJpbmRzIGEgdG9rZW4gdG8gdGhlIGV4YWN0IHBsYW4gZGlnZXN0IGFuZCB3b3JsZCByZXZpc2lvbiwgYW5kIHJlZnVzZXMgdG9cbiAqIHByZXRlbmQgaXQgaXMgYW4gb24tY2hhaW4gYXV0aG9yaXR5LlxuICovXG5leHBvcnQgY2xhc3MgTG9jYWxBdXRob3JpemVyIHtcbiAgcmVhZG9ubHkgYXV0aG9yaXR5ID0gTE9DQUxfQVVUSE9SSVRZO1xuICByZWFkb25seSBlbmZvcmNlbWVudCA9IExPQ0FMX0VORk9SQ0VNRU5UO1xuICByZWFkb25seSBsaW1pdHM6IEF1dGhvcml6YXRpb25MaW1pdHM7XG5cbiAgY29uc3RydWN0b3IocmVhZG9ubHkgcG9saWN5OiBBdXRob3JpemF0aW9uUG9saWN5KSB7XG4gICAgdGhpcy5saW1pdHMgPSB7IC4uLkRFRkFVTFRfTElNSVRTLCAuLi4ocG9saWN5LmxpbWl0cyA/PyB7fSkgfTtcbiAgfVxuXG4gIGF1dGhvcml6ZSh3b3JsZDogV29ybGQsIHBsYW46IFByZXBhcmF0aW9uUGxhbik6IEF1dGhvcml6YXRpb25EZWNpc2lvbiB7XG4gICAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwbGFuLnJlY3QpO1xuXG4gICAgaWYgKHBsYW4udGFyZ2V0cy5sZW5ndGggIT09IHJlY3RDb2x1bW5zKHJlY3QpKSB7XG4gICAgICByZWFzb25zLnB1c2goYHBsYW4gaGFzICR7cGxhbi50YXJnZXRzLmxlbmd0aH0gdGFyZ2V0cyBmb3IgJHtyZWN0Q29sdW1ucyhyZWN0KX0gY29sdW1uc2ApO1xuICAgIH1cbiAgICBpZiAocGxhbi50YXJnZXRzLmxlbmd0aCA+IHRoaXMubGltaXRzLm1heFRhcmdldHMpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgJHtwbGFuLnRhcmdldHMubGVuZ3RofSB0YXJnZXRzIGV4Y2VlZCBsaW1pdCAke3RoaXMubGltaXRzLm1heFRhcmdldHN9YCk7XG4gICAgfVxuICAgIGlmIChwbGFuLmV4cGVjdGVkLmN1dFZvbHVtZSA+IHRoaXMubGltaXRzLm1heEN1dFZvbHVtZSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBjdXQgJHtwbGFuLmV4cGVjdGVkLmN1dFZvbHVtZX0gZXhjZWVkcyBsaW1pdCAke3RoaXMubGltaXRzLm1heEN1dFZvbHVtZX1gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uZXhwZWN0ZWQuZmlsbFZvbHVtZSA+IHRoaXMubGltaXRzLm1heEZpbGxWb2x1bWUpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgZmlsbCAke3BsYW4uZXhwZWN0ZWQuZmlsbFZvbHVtZX0gZXhjZWVkcyBsaW1pdCAke3RoaXMubGltaXRzLm1heEZpbGxWb2x1bWV9YCk7XG4gICAgfVxuICAgIGlmIChwbGFuLmV4cGVjdGVkLnRvdGFsRWRpdHMgPiB0aGlzLmxpbWl0cy5tYXhWb3hlbEVkaXRzKSB7XG4gICAgICByZWFzb25zLnB1c2goYHBsYW5uZWQgZWRpdHMgZXhjZWVkIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4Vm94ZWxFZGl0c31gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RoID4gdGhpcy5saW1pdHMubWF4RW50aXR5UmVtb3ZhbHMpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgJHtwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aH0gcmVtb3ZhbHMgZXhjZWVkIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4RW50aXR5UmVtb3ZhbHN9YCk7XG4gICAgfVxuICAgIGlmIChuZXcgU2V0KHBsYW4uY2xlYXJFbnRpdHlJZHMpLnNpemUgIT09IHBsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RoKSB7XG4gICAgICByZWFzb25zLnB1c2goJ2R1cGxpY2F0ZSBlbnRpdHkgcmVtb3ZhbCBpZHMnKTtcbiAgICB9XG5cbiAgICBpZiAocGxhbi5lbnZlbG9wZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHJlYXNvbnMucHVzaCgncGxhbiBoYXMgbm8gd29yayBlbnZlbG9wZScpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHJlZ2lvbiBvZiBwbGFuLmVudmVsb3BlKSB7XG4gICAgICBpZiAoIXJlZ2lvbkNvbnRhaW5lZChyZWdpb24sIHRoaXMucG9saWN5LmVudmVsb3BlKSkge1xuICAgICAgICByZWFzb25zLnB1c2goYGVudmVsb3BlICR7cmVnaW9uLngwfSwke3JlZ2lvbi56MH0sJHtyZWdpb24ueTB9Li4ke3JlZ2lvbi54MX0sJHtyZWdpb24uejF9LCR7cmVnaW9uLnkxfSBpcyBvdXRzaWRlIHRoZSBsb2NhbCBwb2xpY3lgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCB0IG9mIHBsYW4udGFyZ2V0cykge1xuICAgICAgaWYgKCFlbnZlbG9wZUNvbnRhaW5zKHBsYW4uZW52ZWxvcGUsIHQueCwgdC55LCB0LnopXG4gICAgICAgIHx8ICh0LnkgPiBZX01JTiAmJiAhZW52ZWxvcGVDb250YWlucyhwbGFuLmVudmVsb3BlLCB0LngsIHQueSAtIDEsIHQueikpKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgdGFyZ2V0ICR7dC54fSwke3Quen0sJHt0Lnl9IGlzIG5vdCBjb3ZlcmVkIGJ5IHRoZSB3b3JrIGVudmVsb3BlYCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gRXZlcnkgb2JzdHJ1Y3Rpb24gY3VycmVudGx5IG9uIHRoZSBmb290cHJpbnQgbXVzdCBiZSBpbiB0aGUgcGxhbiwgYW5kXG4gICAgLy8gdGhlIHBsYW4gbWF5IG5vdCByZW1vdmUgYW55dGhpbmcgdGhhdCBpcyBub3QgYW4gb2JzdHJ1Y3Rpb24gdGhlcmUuXG4gICAgY29uc3QgY3VycmVudCA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KS5tYXAoKG8pID0+IG8uZW50aXR5SWQpLnNvcnQoKTtcbiAgICBjb25zdCBwbGFubmVkID0gWy4uLnBsYW4uY2xlYXJFbnRpdHlJZHNdLnNvcnQoKTtcbiAgICBpZiAoY3VycmVudC5sZW5ndGggIT09IHBsYW5uZWQubGVuZ3RoIHx8IGN1cnJlbnQuc29tZSgoaWQsIGkpID0+IGlkICE9PSBwbGFubmVkW2ldKSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBwbGFuIHJlbW92YWxzIFske3BsYW5uZWQuam9pbignLCcpfV0gZG8gbm90IG1hdGNoIGZvb3RwcmludCBvYnN0cnVjdGlvbnMgWyR7Y3VycmVudC5qb2luKCcsJyl9XWApO1xuICAgIH1cblxuICAgIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHJldHVybiB7IG9rOiBmYWxzZSwgYXV0aG9yaXphdGlvbjogbnVsbCwgcmVhc29ucyB9O1xuXG4gICAgY29uc3QgdG9rZW46IFdvcmtBdXRob3JpemF0aW9uID0ge1xuICAgICAgaWQ6IGBsb2NhbC1zdHViOiR7cGxhbkRpZ2VzdChwbGFuKX1gLFxuICAgICAgYXV0aG9yaXR5OiBMT0NBTF9BVVRIT1JJVFksXG4gICAgICBlbmZvcmNlbWVudDogTE9DQUxfRU5GT1JDRU1FTlQsXG4gICAgICBwbGFuRGlnZXN0OiBwbGFuRGlnZXN0KHBsYW4pLFxuICAgICAgZW52ZWxvcGU6IG5vcm1hbGl6ZUVudmVsb3BlKHBsYW4uZW52ZWxvcGUpLFxuICAgICAgYmFzZVJldmlzaW9uOiB3b3JsZC5yZXZpc2lvbixcbiAgICAgIGxpbWl0czogeyAuLi50aGlzLmxpbWl0cyB9LFxuICAgIH07XG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIGF1dGhvcml6YXRpb246IHRva2VuLCByZWFzb25zOiBbXSB9O1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gZXhlY3V0aW9uIC0tLS0tLS0tLS1cbmludGVyZmFjZSBQZW5kaW5nRWRpdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIGJlZm9yZTogTWF0SWQ7XG4gIGFmdGVyOiBNYXRJZDtcbiAgLyoqIFRydWUgZm9yIGEgbWF0ZXJpYWwtb25seSB0b3Atc3VyZmFjZSBjaGFuZ2UuICovXG4gIHN1cmZhY2U/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENodW5rRGVsdGEge1xuICBjaHVuazogc3RyaW5nO1xuICBjaGFuZ2VkOiBudW1iZXI7XG4gIGFkZGVkOiBudW1iZXI7XG4gIHJlbW92ZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDbGVhcmVkRW50aXR5IHtcbiAgZW50aXR5SWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGw7XG4gIGFtb3VudDogbnVtYmVyO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uTGVkZ2VyIHtcbiAgYXV0aG9yaXR5OiB0eXBlb2YgTE9DQUxfQVVUSE9SSVRZO1xuICBlbmZvcmNlbWVudDogdHlwZW9mIExPQ0FMX0VORk9SQ0VNRU5UO1xuICBhdXRob3JpemF0aW9uSWQ6IHN0cmluZztcbiAgcGxhbkRpZ2VzdDogc3RyaW5nO1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG5ldFNwb2lsOiBudW1iZXI7XG4gIGJvcnJvd2VkRmlsbDogbnVtYmVyO1xuICBjdXRCeU1hdGVyaWFsOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBmaWxsQnlNYXRlcmlhbDogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgdm94ZWxFZGl0czogbnVtYmVyO1xuICBzdXJmYWNlRWRpdHM6IG51bWJlcjtcbiAgZW50aXRpZXNDbGVhcmVkOiBDbGVhcmVkRW50aXR5W107XG4gIHJlc291cmNlc0dhaW5lZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgaW52ZW50b3J5QmVmb3JlOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBpbnZlbnRvcnlBZnRlcjogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgY2h1bmtEZWx0YXM6IENodW5rRGVsdGFbXTtcbiAgcmV2aXNpb25CZWZvcmU6IG51bWJlcjtcbiAgcmV2aXNpb25BZnRlcjogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uU3VjY2VzcyB7XG4gIG9rOiB0cnVlO1xuICBwbGFuOiBQcmVwYXJhdGlvblBsYW47XG4gIGF1dGhvcml6YXRpb246IFdvcmtBdXRob3JpemF0aW9uO1xuICBsZWRnZXI6IFByZXBhcmF0aW9uTGVkZ2VyO1xufVxuXG5leHBvcnQgdHlwZSBQcmVwYXJhdGlvbk91dGNvbWUgPSBQcmVwYXJhdGlvblN1Y2Nlc3MgfCBQcmVwYXJhdGlvbkZhaWx1cmU7XG5cbmNvbnN0IE1BVEVSSUFMX05BTUVTOiBSZWNvcmQ8bnVtYmVyLCBzdHJpbmc+ID0ge1xuICBbTUFULkdSQVNTXTogJ2dyYXNzJyxcbiAgW01BVC5TT0lMXTogJ3NvaWwnLFxuICBbTUFULlNBTkRdOiAnc2FuZCcsXG4gIFtNQVQuR1JBVkVMXTogJ2dyYXZlbCcsXG4gIFtNQVQuU1RPTkVdOiAnc3RvbmUnLFxuICBbTUFULk9SRV06ICdvcmUnLFxuICBbTUFULldBVEVSXTogJ3dhdGVyJyxcbiAgW01BVC5CRURST0NLXTogJ2JlZHJvY2snLFxuICBbTUFULk1PU1NdOiAnbW9zcycsXG59O1xuXG5mdW5jdGlvbiBtYXRlcmlhbE5hbWUobTogTWF0SWQpOiBzdHJpbmcge1xuICByZXR1cm4gTUFURVJJQUxfTkFNRVNbbV0gPz8gYG1hdF8ke219YDtcbn1cblxuZnVuY3Rpb24gZmlsbE1hdGVyaWFsKHk6IG51bWJlciwgdGFyZ2V0OiBudW1iZXIpOiBNYXRJZCB7XG4gIHJldHVybiB5ID09PSB0YXJnZXQgLSAxID8gTUFULkdSQVNTIDogTUFULlNPSUw7XG59XG5cbmZ1bmN0aW9uIGZhaWwoc3RhZ2U6IFByZXBhcmF0aW9uRmFpbHVyZVsnc3RhZ2UnXSwgY29kZTogc3RyaW5nLCByZWFzb25zOiBzdHJpbmdbXSk6IFByZXBhcmF0aW9uRmFpbHVyZSB7XG4gIHJldHVybiB7IG9rOiBmYWxzZSwgc3RhZ2UsIGNvZGUsIHJlYXNvbnMgfTtcbn1cblxuLyoqXG4gKiBBcHBseSBhbiBhdXRob3JpemVkIHBsYW4uIE5vIHZveGVsIGlzIHdyaXR0ZW4gdW50aWwgZXZlcnkgZWRpdCBhbmQgcmVtb3ZhbFxuICogaGFzIGJlZW4gY2hlY2tlZCBhZ2FpbnN0IHRoZSB0b2tlbiwgdGhlIHBsYW4gZW52ZWxvcGUgYW5kIHRoZSBoYXJkIGxpbWl0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV4ZWN1dGVQcmVwYXJhdGlvbihcbiAgd29ybGQ6IFdvcmxkLCBwbGFuOiBQcmVwYXJhdGlvblBsYW4sIGF1dGhvcml6YXRpb246IFdvcmtBdXRob3JpemF0aW9uLFxuKTogUHJlcGFyYXRpb25PdXRjb21lIHtcbiAgaWYgKGF1dGhvcml6YXRpb24uYXV0aG9yaXR5ICE9PSBMT0NBTF9BVVRIT1JJVFlcbiAgICB8fCBhdXRob3JpemF0aW9uLmVuZm9yY2VtZW50ICE9PSBMT0NBTF9FTkZPUkNFTUVOVCkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3Vuc3VwcG9ydGVkX2F1dGhvcml0eScsIFtcbiAgICAgIGBhdXRob3JpdHkgJHthdXRob3JpemF0aW9uLmF1dGhvcml0eX0vJHthdXRob3JpemF0aW9uLmVuZm9yY2VtZW50fSBpcyBub3QgdGhlIGxvY2FsIHN0dWJgLFxuICAgIF0pO1xuICB9XG4gIGlmIChhdXRob3JpemF0aW9uLnBsYW5EaWdlc3QgIT09IHBsYW5EaWdlc3QocGxhbikpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdkaWdlc3RfbWlzbWF0Y2gnLCBbJ2F1dGhvcml6YXRpb24gZG9lcyBub3QgbWF0Y2ggdGhpcyBwbGFuJ10pO1xuICB9XG4gIGlmIChhdXRob3JpemF0aW9uLmJhc2VSZXZpc2lvbiAhPT0gd29ybGQucmV2aXNpb24pIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdzdGFsZV9hdXRob3JpemF0aW9uJywgW1xuICAgICAgYGF1dGhvcml6YXRpb24gd2FzIGlzc3VlZCBhdCByZXZpc2lvbiAke2F1dGhvcml6YXRpb24uYmFzZVJldmlzaW9ufSwgd29ybGQgaXMgYXQgJHt3b3JsZC5yZXZpc2lvbn1gLFxuICAgIF0pO1xuICB9XG4gIGlmIChwbGFuLmVudmVsb3BlLnNvbWUoKHIpID0+ICFyZWdpb25Db250YWluZWQociwgYXV0aG9yaXphdGlvbi5lbnZlbG9wZSkpKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnZW52ZWxvcGVfbWlzbWF0Y2gnLCBbJ3BsYW4gZW52ZWxvcGUgaXMgd2lkZXIgdGhhbiB0aGUgYXV0aG9yaXphdGlvbiddKTtcbiAgfVxuXG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHBsYW4ucmVjdCk7XG4gIGNvbnN0IGVkaXRzOiBQZW5kaW5nRWRpdFtdID0gW107XG4gIGZvciAoY29uc3QgdCBvZiBwbGFuLnRhcmdldHMpIHtcbiAgICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB0LngsIHQueik7XG4gICAgaWYgKHQueSA8IHN1cmZhY2UpIHtcbiAgICAgIGZvciAobGV0IHkgPSB0Lnk7IHkgPCBzdXJmYWNlOyB5KyspIHtcbiAgICAgICAgY29uc3QgYmVmb3JlID0gZ2V0Vm94ZWwod29ybGQsIHQueCwgeSwgdC56KTtcbiAgICAgICAgaWYgKGlzU29saWQoYmVmb3JlKSkgZWRpdHMucHVzaCh7IHg6IHQueCwgeSwgejogdC56LCBiZWZvcmUsIGFmdGVyOiBNQVQuQUlSIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodC55ID4gc3VyZmFjZSkge1xuICAgICAgZm9yIChsZXQgeSA9IHN1cmZhY2U7IHkgPCB0Lnk7IHkrKykge1xuICAgICAgICBjb25zdCBiZWZvcmUgPSBnZXRWb3hlbCh3b3JsZCwgdC54LCB5LCB0LnopO1xuICAgICAgICBpZiAoIWlzU29saWQoYmVmb3JlKSkge1xuICAgICAgICAgIGNvbnN0IGFmdGVyID0gcGxhbi5zdXJmYWNlTWF0ZXJpYWwgIT09IG51bGwgJiYgeSA9PT0gdC55IC0gMVxuICAgICAgICAgICAgPyBwbGFuLnN1cmZhY2VNYXRlcmlhbFxuICAgICAgICAgICAgOiBmaWxsTWF0ZXJpYWwoeSwgdC55KTtcbiAgICAgICAgICBlZGl0cy5wdXNoKHsgeDogdC54LCB5LCB6OiB0LnosIGJlZm9yZSwgYWZ0ZXIgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgLy8gTWF0ZXJpYWwtb25seSBzdXJmYWNlIGNoYW5nZSBmb3IgY3V0IG9yIGFscmVhZHktbGV2ZWwgY29sdW1ucy4gRmlsbFxuICAgIC8vIGNvbHVtbnMgYWxyZWFkeSByZWNlaXZlIHRoZSBzdXJmYWNlIG1hdGVyaWFsIGluIHRoZSBmaWxsIGxvb3AgYWJvdmUuXG4gICAgaWYgKHBsYW4uc3VyZmFjZU1hdGVyaWFsICE9PSBudWxsKSB7XG4gICAgICBjb25zdCB0b3BZID0gdC55IC0gMTtcbiAgICAgIGNvbnN0IGJlZm9yZSA9IGdldFZveGVsKHdvcmxkLCB0LngsIHRvcFksIHQueik7XG4gICAgICBpZiAoaXNTb2xpZChiZWZvcmUpICYmIGJlZm9yZSAhPT0gcGxhbi5zdXJmYWNlTWF0ZXJpYWwpIHtcbiAgICAgICAgZWRpdHMucHVzaCh7XG4gICAgICAgICAgeDogdC54LCB5OiB0b3BZLCB6OiB0LnosIGJlZm9yZSwgYWZ0ZXI6IHBsYW4uc3VyZmFjZU1hdGVyaWFsLCBzdXJmYWNlOiB0cnVlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBDaGVjayBldmVyeSBlZGl0IGJlZm9yZSBtdXRhdGluZyBhbnl0aGluZy5cbiAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBlIG9mIGVkaXRzKSB7XG4gICAgaWYgKGUueCA8IHJlY3QueDAgfHwgZS54ID4gcmVjdC54MSB8fCBlLnogPCByZWN0LnowIHx8IGUueiA+IHJlY3QuejEpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgZWRpdCAke2UueH0sJHtlLnl9LCR7ZS56fSBpcyBvdXRzaWRlIHRoZSBmb290cHJpbnRgKTtcbiAgICB9XG4gICAgaWYgKCFlbnZlbG9wZUNvbnRhaW5zKGF1dGhvcml6YXRpb24uZW52ZWxvcGUsIGUueCwgZS55LCBlLnopKSB7XG4gICAgICByZWFzb25zLnB1c2goYGVkaXQgJHtlLnh9LCR7ZS55fSwke2Uuen0gaXMgb3V0c2lkZSB0aGUgYXV0aG9yaXplZCBlbnZlbG9wZWApO1xuICAgIH1cbiAgfVxuICBjb25zdCBjdXRWb2x1bWUgPSBlZGl0cy5maWx0ZXIoKGUpID0+IGUuYWZ0ZXIgPT09IE1BVC5BSVIgJiYgaXNTb2xpZChlLmJlZm9yZSkpLmxlbmd0aDtcbiAgY29uc3QgZmlsbFZvbHVtZSA9IGVkaXRzLmZpbHRlcigoZSkgPT4gZS5hZnRlciAhPT0gTUFULkFJUiAmJiAhaXNTb2xpZChlLmJlZm9yZSkpLmxlbmd0aDtcbiAgaWYgKGN1dFZvbHVtZSA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heEN1dFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChgY3V0ICR7Y3V0Vm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7YXV0aG9yaXphdGlvbi5saW1pdHMubWF4Q3V0Vm9sdW1lfWApO1xuICB9XG4gIGlmIChmaWxsVm9sdW1lID4gYXV0aG9yaXphdGlvbi5saW1pdHMubWF4RmlsbFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChgZmlsbCAke2ZpbGxWb2x1bWV9IGV4Y2VlZHMgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhGaWxsVm9sdW1lfWApO1xuICB9XG4gIGlmIChlZGl0cy5sZW5ndGggPiBhdXRob3JpemF0aW9uLmxpbWl0cy5tYXhWb3hlbEVkaXRzKSB7XG4gICAgcmVhc29ucy5wdXNoKGAke2VkaXRzLmxlbmd0aH0gZWRpdHMgZXhjZWVkIGxpbWl0ICR7YXV0aG9yaXphdGlvbi5saW1pdHMubWF4Vm94ZWxFZGl0c31gKTtcbiAgfVxuXG4gIGNvbnN0IGN1cnJlbnQgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCkubWFwKChvKSA9PiBvLmVudGl0eUlkKS5zb3J0KCk7XG4gIGNvbnN0IHBsYW5uZWQgPSBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpO1xuICBpZiAoY3VycmVudC5sZW5ndGggIT09IHBsYW5uZWQubGVuZ3RoIHx8IGN1cnJlbnQuc29tZSgoaWQsIGkpID0+IGlkICE9PSBwbGFubmVkW2ldKSkge1xuICAgIHJlYXNvbnMucHVzaCgnZm9vdHByaW50IG9ic3RydWN0aW9ucyBjaGFuZ2VkIGFmdGVyIGF1dGhvcml6YXRpb24nKTtcbiAgfVxuICBpZiAocGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGggPiBhdXRob3JpemF0aW9uLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFscykge1xuICAgIHJlYXNvbnMucHVzaChgJHtwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aH0gcmVtb3ZhbHMgZXhjZWVkIGxpbWl0ICR7YXV0aG9yaXphdGlvbi5saW1pdHMubWF4RW50aXR5UmVtb3ZhbHN9YCk7XG4gIH1cbiAgZm9yIChjb25zdCBpZCBvZiBwbGFuLmNsZWFyRW50aXR5SWRzKSB7XG4gICAgaWYgKCF3b3JsZC5lbnRpdGllcy5oYXMoaWQpKSByZWFzb25zLnB1c2goYGVudGl0eSAke2lkfSBubyBsb25nZXIgZXhpc3RzYCk7XG4gIH1cbiAgaWYgKHdvcmxkLmxpZmUpIHtcbiAgICBsZXQgcmVjb3ZlcmVkID0gMDtcbiAgICBmb3IgKGNvbnN0IGlkIG9mIHBsYW4uY2xlYXJFbnRpdHlJZHMpIHtcbiAgICAgIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgICBpZiAoZW50aXR5Py5yZXNvdXJjZSAmJiBlbnRpdHkucmVtYWluaW5nID4gMCkgcmVjb3ZlcmVkICs9IGVudGl0eS5yZW1haW5pbmc7XG4gICAgfVxuICAgIC8vIENoZWNrIGJlZm9yZSBhbnkgdm94ZWwgb3IgZW50aXR5IGNoYW5nZXMsIHByZXNlcnZpbmcgbGVnYWN5IHVuYm91bmRlZFxuICAgIC8vIGNvbnN0cnVjdGlvbiBiZWhhdmlvciBhbmQgc2NoZW1hLTMgY2FycmllZC1jYXBhY2l0eSBjb25zZXJ2YXRpb24uXG4gICAgaWYgKE9iamVjdC52YWx1ZXMod29ybGQuaW52ZW50b3J5KS5yZWR1Y2UoKHN1bSwgYW1vdW50KSA9PiBzdW0gKyBhbW91bnQsIDApICsgcmVjb3ZlcmVkID4gMTIwKSB7XG4gICAgICByZWFzb25zLnB1c2goJ3Jlc291cmNlcyByZWNvdmVyZWQgZHVyaW5nIHNpdGUgY2xlYXJpbmcgd291bGQgZXhjZWVkIGNhcnJpZWQgY2FwYWNpdHkgMTIwJyk7XG4gICAgfVxuICB9XG4gIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3VuYXV0aG9yaXplZF9lZGl0cycsIHJlYXNvbnMpO1xuXG4gIGNvbnN0IGludmVudG9yeUJlZm9yZSA9IGludmVudG9yeVNuYXBzaG90KHdvcmxkKTtcbiAgY29uc3QgcmV2aXNpb25CZWZvcmUgPSB3b3JsZC5yZXZpc2lvbjtcbiAgY29uc3QgY2h1bmtEZWx0YXMgPSBuZXcgTWFwPHN0cmluZywgQ2h1bmtEZWx0YT4oKTtcbiAgY29uc3QgY3V0QnlNYXRlcmlhbDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICBjb25zdCBmaWxsQnlNYXRlcmlhbDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICBsZXQgYXBwbGllZCA9IDA7XG4gIGxldCBzdXJmYWNlRWRpdHMgPSAwO1xuXG4gIGZvciAoY29uc3QgZSBvZiBlZGl0cykge1xuICAgIGlmICghc2V0Vm94ZWwod29ybGQsIGUueCwgZS55LCBlLnosIGUuYWZ0ZXIpKSBjb250aW51ZTtcbiAgICBhcHBsaWVkKys7XG4gICAgaWYgKGUuc3VyZmFjZSkgc3VyZmFjZUVkaXRzKys7XG4gICAgY29uc3Qga2V5ID0gY2h1bmtLZXkod29ybGRUb0NodW5rWChlLngpLCB3b3JsZFRvQ2h1bmtaKGUueikpO1xuICAgIGxldCBkZWx0YSA9IGNodW5rRGVsdGFzLmdldChrZXkpO1xuICAgIGlmICghZGVsdGEpIHtcbiAgICAgIGRlbHRhID0geyBjaHVuazoga2V5LCBjaGFuZ2VkOiAwLCBhZGRlZDogMCwgcmVtb3ZlZDogMCB9O1xuICAgICAgY2h1bmtEZWx0YXMuc2V0KGtleSwgZGVsdGEpO1xuICAgIH1cbiAgICBkZWx0YS5jaGFuZ2VkKys7XG4gICAgY29uc3Qgd2FzU29saWQgPSBpc1NvbGlkKGUuYmVmb3JlKTtcbiAgICBjb25zdCBpc05vd1NvbGlkID0gaXNTb2xpZChlLmFmdGVyKTtcbiAgICBpZiAoIXdhc1NvbGlkICYmIGlzTm93U29saWQpIGRlbHRhLmFkZGVkKys7XG4gICAgaWYgKHdhc1NvbGlkICYmICFpc05vd1NvbGlkKSBkZWx0YS5yZW1vdmVkKys7XG4gICAgY29uc3QgbmFtZSA9IG1hdGVyaWFsTmFtZShlLmJlZm9yZSk7XG4gICAgaWYgKHdhc1NvbGlkICYmICFpc05vd1NvbGlkKSBjdXRCeU1hdGVyaWFsW25hbWVdID0gKGN1dEJ5TWF0ZXJpYWxbbmFtZV0gPz8gMCkgKyAxO1xuICAgIGlmICghd2FzU29saWQgJiYgaXNOb3dTb2xpZCkgZmlsbEJ5TWF0ZXJpYWxbbWF0ZXJpYWxOYW1lKGUuYWZ0ZXIpXSA9IChmaWxsQnlNYXRlcmlhbFttYXRlcmlhbE5hbWUoZS5hZnRlcildID8/IDApICsgMTtcbiAgfVxuXG4gIGNvbnN0IGVudGl0aWVzQ2xlYXJlZDogQ2xlYXJlZEVudGl0eVtdID0gW107XG4gIGNvbnN0IHJlc291cmNlc0dhaW5lZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiA9IHt9O1xuICBmb3IgKGNvbnN0IGlkIG9mIFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCkpIHtcbiAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICBpZiAoIWUpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGFtb3VudCA9IGUucmVzb3VyY2UgJiYgZS5yZW1haW5pbmcgPiAwID8gZS5yZW1haW5pbmcgOiAwO1xuICAgIGlmIChlLnJlc291cmNlICYmIGFtb3VudCA+IDApIHtcbiAgICAgIHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA9ICh3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gICAgICByZXNvdXJjZXNHYWluZWRbZS5yZXNvdXJjZV0gPSAocmVzb3VyY2VzR2FpbmVkW2UucmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICAgIH1cbiAgICByZW1vdmVFbnRpdHkod29ybGQsIGlkKTtcbiAgICBlbnRpdGllc0NsZWFyZWQucHVzaCh7XG4gICAgICBlbnRpdHlJZDogaWQsIGtpbmQ6IGUua2luZCwgcmVzb3VyY2U6IGUucmVzb3VyY2UsIGFtb3VudCwgeDogZS54LCB5OiBlLnksIHo6IGUueixcbiAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IGN1dCA9IGFwcGxpZWQgPiAwID8gT2JqZWN0LnZhbHVlcyhjdXRCeU1hdGVyaWFsKS5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKSA6IDA7XG4gIGNvbnN0IGZpbGwgPSBhcHBsaWVkID4gMCA/IE9iamVjdC52YWx1ZXMoZmlsbEJ5TWF0ZXJpYWwpLnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIDApIDogMDtcbiAgY29uc3QgbGVkZ2VyOiBQcmVwYXJhdGlvbkxlZGdlciA9IHtcbiAgICBhdXRob3JpdHk6IExPQ0FMX0FVVEhPUklUWSxcbiAgICBlbmZvcmNlbWVudDogTE9DQUxfRU5GT1JDRU1FTlQsXG4gICAgYXV0aG9yaXphdGlvbklkOiBhdXRob3JpemF0aW9uLmlkLFxuICAgIHBsYW5EaWdlc3Q6IGF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCxcbiAgICBzaXRlSWQ6IHBsYW4uc2l0ZUlkLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwbGFuLmZsb29yWSxcbiAgICBjdXRWb2x1bWU6IGN1dCxcbiAgICBmaWxsVm9sdW1lOiBmaWxsLFxuICAgIG5ldFNwb2lsOiBjdXQgLSBmaWxsLFxuICAgIGJvcnJvd2VkRmlsbDogTWF0aC5tYXgoMCwgZmlsbCAtIGN1dCksXG4gICAgY3V0QnlNYXRlcmlhbCxcbiAgICBmaWxsQnlNYXRlcmlhbCxcbiAgICB2b3hlbEVkaXRzOiBhcHBsaWVkLFxuICAgIHN1cmZhY2VFZGl0cyxcbiAgICBlbnRpdGllc0NsZWFyZWQsXG4gICAgcmVzb3VyY2VzR2FpbmVkLFxuICAgIGludmVudG9yeUJlZm9yZSxcbiAgICBpbnZlbnRvcnlBZnRlcjogaW52ZW50b3J5U25hcHNob3Qod29ybGQpLFxuICAgIGNodW5rRGVsdGFzOiBbLi4uY2h1bmtEZWx0YXMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuY2h1bmsubG9jYWxlQ29tcGFyZShiLmNodW5rKSksXG4gICAgcmV2aXNpb25CZWZvcmUsXG4gICAgcmV2aXNpb25BZnRlcjogd29ybGQucmV2aXNpb24sXG4gIH07XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuLCBhdXRob3JpemF0aW9uLCBsZWRnZXIgfTtcbn1cblxuLyoqXG4gKiBUaGUgc2hhcmVkIHBsYXllci9BSSBlbnRyeSBwb2ludC4gVGhlcmUgaXMgbm8gb3RoZXIgY29uc3RydWN0aW9uIHBhdGguXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmVwYXJlU2l0ZShcbiAgd29ybGQ6IFdvcmxkLFxuICBhdXRob3JpemVyOiBMb2NhbEF1dGhvcml6ZXIsXG4gIHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwsXG4gIG9wdGlvbnM6IFByZXBhcmF0aW9uT3B0aW9ucyA9IHt9LFxuKTogUHJlcGFyYXRpb25PdXRjb21lIHtcbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwgcHJvcG9zYWwsIG9wdGlvbnMpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybiBwbGFubmVkO1xuICBjb25zdCBkZWNpc2lvbiA9IGF1dGhvcml6ZXIuYXV0aG9yaXplKHdvcmxkLCBwbGFubmVkLnBsYW4pO1xuICBpZiAoIWRlY2lzaW9uLm9rIHx8ICFkZWNpc2lvbi5hdXRob3JpemF0aW9uKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2F1dGhvcml6ZScsICdub3RfYXV0aG9yaXplZCcsIGRlY2lzaW9uLnJlYXNvbnMpO1xuICB9XG4gIHJldHVybiBleGVjdXRlUHJlcGFyYXRpb24od29ybGQsIHBsYW5uZWQucGxhbiwgZGVjaXNpb24uYXV0aG9yaXphdGlvbik7XG59XG4iLCAiLy8gTTAwMiBzdGFnZSA0OiBhdXRob3JpdGF0aXZlIGhvdXNlLCBwYXRoIGFuZCB0ZXJyYWNlIHN0cnVjdHVyZXMuXG4vL1xuLy8gU3RydWN0dXJlcyBhcmUgc2ltdWxhdGlvbiByZWNvcmRzLCBub3QgcmVuZGVyZXItb25seSBtZXNoZXMuIEEgc3RydWN0dXJlIGlzXG4vLyBwbGFubmVkIGZyb20gdGhlIHByZXBhcmVkIHRlcnJhaW4sIGF1dGhvcml6ZWQgYWdhaW5zdCB0aGUgc2FtZSBsb2NhbCBwb2xpY3lcbi8vIGVudmVsb3BlIGFzIHRlcnJhaW4gcHJlcGFyYXRpb24sIHBhaWQgZm9yIGZyb20gaW52ZW50b3J5LCBhbmQgdGhlbiBzdG9yZWQgaW5cbi8vIFdvcmxkLnN0cnVjdHVyZXMuIFRoZSByZW5kZXJlciByZWFkcyB0aG9zZSByZWNvcmRzOyBpdCBuZXZlciBpbnZlbnRzIGFcbi8vIGJ1aWxkaW5nIHRoYXQgdGhlIHNpbXVsYXRpb24gZG9lcyBub3Qgb3duLlxuaW1wb3J0IHtcbiAgV29ybGQsIFJlc291cmNlVHlwZSwgTUFULCBzdXJmYWNlQXQsIGdldFZveGVsLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7XG4gIFJlY3QsIFZveGVsUmVnaW9uLCBub3JtYWxpemVSZWN0LCBleHBhbmRSZWN0LFxuICBlbnZlbG9wZUNvbnRhaW5zLCBvYnN0cnVjdGlvbnNJbixcbn0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7XG4gIEF1dGhvcml6YXRpb25Qb2xpY3ksIExPQ0FMX0FVVEhPUklUWSwgTE9DQUxfRU5GT1JDRU1FTlQsXG59IGZyb20gJy4vcHJlcGFyYXRpb24nO1xuaW1wb3J0IHsgRkFSTV9SVUxFUyB9IGZyb20gJy4vY29uc3RydWN0aW9uJztcbmltcG9ydCB7IGludmVudG9yeVNuYXBzaG90IH0gZnJvbSAnLi9jYW5vbmljYWwnO1xuXG5leHBvcnQgdHlwZSBTdHJ1Y3R1cmVLaW5kID0gJ2hvdXNlJyB8ICdwYXRoJyB8ICd0ZXJyYWNlJztcbi8qKiBNMDAyIGRlc2lnbiAxIGlzIGltbXV0YWJsZSByZXBsYXkgY29udGVudDsgZGVzaWduIDIgaXMgdGhlIGZvdW5kZXIgY2FuZGlkYXRlLiAqL1xuZXhwb3J0IGNvbnN0IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gPSAyIGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgU3RydWN0dXJlRGVzaWduVmVyc2lvbiA9IHR5cGVvZiBGT1VOREVSX0RFU0lHTl9WRVJTSU9OO1xuXG5leHBvcnQgdHlwZSBNb2R1bGVLaW5kID1cbiAgfCAnZmxvb3InXG4gIHwgJ3dhbGwnXG4gIHwgJ3Bvc3QnXG4gIHwgJ2xpbnRlbCdcbiAgfCAncm9vZidcbiAgfCAncGFyYXBldCdcbiAgfCAnd2luZG93J1xuICB8ICdkb29yJ1xuICB8ICd0aHJlc2hvbGQnXG4gIHwgJ3BhdGgnXG4gIHwgJ2N1cmInXG4gIHwgJ3NvaWxfYmVkJ1xuICB8ICdyZXRhaW5pbmdfd2FsbCdcbiAgfCAnY3JvcF9yb3cnO1xuXG5leHBvcnQgdHlwZSBNb2R1bGVUb25lID1cbiAgfCAnc3RvbmUnXG4gIHwgJ3N0b25lX2InXG4gIHwgJ29jaHJlJ1xuICB8ICd0aW1iZXInXG4gIHwgJ2FjY2VudCdcbiAgfCAnc29pbCdcbiAgfCAnY3JvcCdcbiAgfCAnZ3JhdmVsJztcblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVNb2R1bGUge1xuICBraW5kOiBNb2R1bGVLaW5kO1xuICAvKiogQ2VudHJlIGluIHdvcmxkIHgveiwgYm90dG9tIGluIHdvcmxkIHkuICovXG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHc6IG51bWJlcjtcbiAgaDogbnVtYmVyO1xuICBkOiBudW1iZXI7XG4gIHJvdD86IG51bWJlcjtcbiAgdG9uZT86IE1vZHVsZVRvbmU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogU3RydWN0dXJlS2luZDtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIC8qKiBPcmlnaW46IGNlbnRyZSBvZiB0aGUgcHJlcGFyZWQgZm9vdHByaW50IGF0IGZsb29yIGhlaWdodC4gKi9cbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdO1xuICBjb3N0OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBidWlsdFJldmlzaW9uOiBudW1iZXI7XG4gIC8qKiBBYnNlbnQgbWVhbnMgbGVnYWN5IE0wMDIgZGVzaWduIDE7IG5ldmVyIGluZmVyIGl0IGZyb20gdGhlIHJlbmRlcmVyLiAqL1xuICBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbjtcbiAgcHJvdmlzaW9uYWw6IHRydWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVycmFjZUJhbmQge1xuICB6MDogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlUHJvcG9zYWwge1xuICBzaXRlSWQ6IHN0cmluZztcbiAga2luZDogU3RydWN0dXJlS2luZDtcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIC8qKiBSZXF1aXJlZCBmb3IgaG91c2VzOiB2b3hlbCBjb2x1bW4gb2YgdGhlIGRvb3Igb24gdGhlIGVhc3Qgd2FsbC4gKi9cbiAgZG9vcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgLyoqIE9wdGlvbmFsIHBhdGggbWV0YWRhdGE7IHRoZSBwYXRoIGlzIGxhaWQgYWxvbmcgdGhlIHJlY3QgY2VudHJlbGluZS4gKi9cbiAgYXBwcm9hY2g/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIHRlcnJhY2VzPzogbnVtYmVyO1xuICAvKiogRGVsaWJlcmF0ZSBjb250ZW50IHNlbGVjdGlvbiBjYXJyaWVkIGJ5IHNjaGVtYS0yIGNvbW1hbmRzLiAqL1xuICBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbjtcbn1cblxuLyoqXG4gKiBTaW5nbGUgc291cmNlIG9mIHRydXRoIGZvciBzdHJ1Y3R1cmUgY29zdHMuIFRoZSBwbGFubmVycyBhbmQgdGhlIGJ1aWxkIFVJXG4gKiBib3RoIHJlYWQgdGhlc2U7IGEgYnVpbGRpbmcgY2Fubm90IGFkdmVydGlzZSBvbmUgcHJpY2UgYW5kIGNoYXJnZSBhbm90aGVyLlxuICovXG5leHBvcnQgY29uc3QgSE9VU0VfQ09TVDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiA9IHsgd29vZDogMTAsIHN0b25lOiAxOCB9O1xuZXhwb3J0IGNvbnN0IFRFUlJBQ0VfQ09TVDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiA9IHsgd29vZDogNiwgc3RvbmU6IDEyIH07XG5cbi8qKiBBIHBhdGggcGF5cyBvbmUgc3RvbmUgcGVyIG1ldHJlIG9mIGNvcnJpZG9yIHdpZHRoLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhdGhDb3N0KHdpZHRoOiBudW1iZXIpOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+IHtcbiAgcmV0dXJuIHsgc3RvbmU6IHdpZHRoIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VyZmFjZVNhbXBsZSB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlUGxhbiB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6IFN0cnVjdHVyZUtpbmQ7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgb3JpZ2luOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgcm90OiBudW1iZXI7XG4gIG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdO1xuICBjb3N0OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgLyoqIEV4cGVjdGVkIHByZXBhcmVkIHN1cmZhY2UsIGNoZWNrZWQgYWdhaW4gYXQgZXhlY3V0aW9uIHRpbWUuICovXG4gIHN1cmZhY2U6IFN1cmZhY2VTYW1wbGVbXTtcbiAgZGVzaWduVmVyc2lvbj86IFN0cnVjdHVyZURlc2lnblZlcnNpb247XG4gIHRlcnJhY2VzPzogVGVycmFjZUJhbmRbXTtcbn1cblxuLy8gLS0tLS0tLS0tLSBzdGFibGUgZGlnZXN0IC0tLS0tLS0tLS1cbmZ1bmN0aW9uIGRpZ2VzdChpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGEgPSAweDgxMWM5ZGM1O1xuICBsZXQgYiA9IDB4OWUzNzc5Yjk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaW5wdXQubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBjID0gaW5wdXQuY2hhckNvZGVBdChpKTtcbiAgICBhID0gTWF0aC5pbXVsKGEgXiBjLCAweDAxMDAwMTkzKTtcbiAgICBiID0gTWF0aC5pbXVsKGIgXiAoYyArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICBiIF49IGIgPj4+IDEzO1xuICB9XG4gIHJldHVybiAoYSA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJylcbiAgICArIChiID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cnVjdHVyZURpZ2VzdChwbGFuOiBTdHJ1Y3R1cmVQbGFuKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW1xuICAgICdtMDAyOnN0cnVjdHVyZS1wbGFuOnYxJyxcbiAgICBwbGFuLmtpbmQsXG4gICAgcGxhbi5zaXRlSWQsXG4gICAgYCR7cGxhbi5yZWN0LngwfSwke3BsYW4ucmVjdC56MH0sJHtwbGFuLnJlY3QueDF9LCR7cGxhbi5yZWN0LnoxfWAsXG4gICAgU3RyaW5nKHBsYW4uZmxvb3JZKSxcbiAgICBgJHtwbGFuLm9yaWdpbi54fSwke3BsYW4ub3JpZ2luLnl9LCR7cGxhbi5vcmlnaW4uen1gLFxuICAgIFN0cmluZyhwbGFuLnJvdCksXG4gICAgLi4uKHBsYW4uZGVzaWduVmVyc2lvbiA9PT0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTiA/IFsnZGVzaWduOjInXSA6IFtdKSxcbiAgICBgbToke3BsYW4ubW9kdWxlcy5sZW5ndGh9YCxcbiAgXTtcbiAgZm9yIChjb25zdCBtIG9mIHBsYW4ubW9kdWxlcykge1xuICAgIGxpbmVzLnB1c2goYG06JHttLmtpbmR9LCR7bS54fSwke20ueX0sJHttLnp9LCR7bS53fSwke20uaH0sJHttLmR9LCR7bS5yb3QgPz8gMH0sJHttLnRvbmUgPz8gJyd9YCk7XG4gIH1cbiAgY29uc3QgY29zdEtleXMgPSBPYmplY3Qua2V5cyhwbGFuLmNvc3QpLnNvcnQoKTtcbiAgbGluZXMucHVzaChgY29zdDoke2Nvc3RLZXlzLmxlbmd0aH1gKTtcbiAgZm9yIChjb25zdCBrZXkgb2YgY29zdEtleXMpIGxpbmVzLnB1c2goYGNvc3Q6JHtrZXl9LCR7cGxhbi5jb3N0W2tleSBhcyBSZXNvdXJjZVR5cGVdID8/IDB9YCk7XG4gIGZvciAoY29uc3QgcyBvZiBwbGFuLnN1cmZhY2UpIGxpbmVzLnB1c2goYHM6JHtzLnh9LCR7cy56fSwke3MueX1gKTtcbiAgZm9yIChjb25zdCB0IG9mIHBsYW4udGVycmFjZXMgPz8gW10pIGxpbmVzLnB1c2goYHQ6JHt0LnowfSwke3QuejF9LCR7dC55fWApO1xuICByZXR1cm4gZGlnZXN0KGxpbmVzLmpvaW4oJ1xcbicpKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwbGFubmluZyBoZWxwZXJzIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlRmFpbHVyZSB7XG4gIG9rOiBmYWxzZTtcbiAgc3RhZ2U6ICdwbGFuJyB8ICdhdXRob3JpemUnIHwgJ2V4ZWN1dGUnO1xuICBjb2RlOiBzdHJpbmc7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZVBsYW5TdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHBsYW46IFN0cnVjdHVyZVBsYW47XG59XG5cbmV4cG9ydCB0eXBlIFN0cnVjdHVyZVBsYW5SZXN1bHQgPSBTdHJ1Y3R1cmVQbGFuU3VjY2VzcyB8IFN0cnVjdHVyZUZhaWx1cmU7XG5cbmZ1bmN0aW9uIGZhaWwoc3RhZ2U6IFN0cnVjdHVyZUZhaWx1cmVbJ3N0YWdlJ10sIGNvZGU6IHN0cmluZywgcmVhc29uczogc3RyaW5nW10pOiBTdHJ1Y3R1cmVGYWlsdXJlIHtcbiAgcmV0dXJuIHsgb2s6IGZhbHNlLCBzdGFnZSwgY29kZSwgcmVhc29ucyB9O1xufVxuXG5mdW5jdGlvbiBzdXJmYWNlTWlzbWF0Y2hlcyh3b3JsZDogV29ybGQsIHNhbXBsZXM6IHJlYWRvbmx5IFN1cmZhY2VTYW1wbGVbXSkge1xuICBjb25zdCBvdXQ6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IGV4cGVjdGVkOiBudW1iZXI7IGFjdHVhbDogbnVtYmVyIH0+ID0gW107XG4gIGZvciAoY29uc3QgcyBvZiBzYW1wbGVzKSB7XG4gICAgY29uc3QgYWN0dWFsID0gc3VyZmFjZUF0KHdvcmxkLCBzLngsIHMueik7XG4gICAgaWYgKGFjdHVhbCAhPT0gcy55KSBvdXQucHVzaCh7IHg6IHMueCwgejogcy56LCBleHBlY3RlZDogcy55LCBhY3R1YWwgfSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gZm9vdHByaW50U3VyZmFjZSh3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QsIHk6IG51bWJlcik6IFN1cmZhY2VTYW1wbGVbXSB7XG4gIGNvbnN0IG91dDogU3VyZmFjZVNhbXBsZVtdID0gW107XG4gIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykge1xuICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykgb3V0LnB1c2goeyB4LCB6LCB5IH0pO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGZvb3RwcmludEVudmVsb3BlKHJlY3Q6IFJlY3QsIHkwOiBudW1iZXIsIHkxOiBudW1iZXIsIG1hcmdpbiA9IDEpOiBWb3hlbFJlZ2lvbltdIHtcbiAgY29uc3QgciA9IGV4cGFuZFJlY3QocmVjdCwgbWFyZ2luKTtcbiAgcmV0dXJuIFt7IC4uLnIsIHkwLCB5MSB9XTtcbn1cblxuZnVuY3Rpb24gbW9kdWxlQm91bmRzKG06IFN0cnVjdHVyZU1vZHVsZSk6IHsgeDA6IG51bWJlcjsgeDE6IG51bWJlcjsgeTA6IG51bWJlcjsgeTE6IG51bWJlcjsgejA6IG51bWJlcjsgejE6IG51bWJlciB9IHtcbiAgY29uc3QgciA9IE1hdGguaHlwb3QobS53LCBtLmQpIC8gMjtcbiAgY29uc3QgaGFsZlcgPSAobS5yb3QgPz8gMCkgPT09IDAgPyBtLncgLyAyIDogcjtcbiAgY29uc3QgaGFsZkQgPSAobS5yb3QgPz8gMCkgPT09IDAgPyBtLmQgLyAyIDogcjtcbiAgcmV0dXJuIHtcbiAgICB4MDogbS54IC0gaGFsZlcsIHgxOiBtLnggKyBoYWxmVyxcbiAgICB5MDogbS55LCB5MTogbS55ICsgbS5oLFxuICAgIHowOiBtLnogLSBoYWxmRCwgejE6IG0ueiArIGhhbGZELFxuICB9O1xufVxuXG5mdW5jdGlvbiBtb2R1bGVJbnNpZGVFbnZlbG9wZShtOiBTdHJ1Y3R1cmVNb2R1bGUsIGVudmVsb3BlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogYm9vbGVhbiB7XG4gIGNvbnN0IGIgPSBtb2R1bGVCb3VuZHMobSk7XG4gIHJldHVybiBlbnZlbG9wZS5zb21lKChlKSA9PiBiLngwID49IGUueDAgLSAxZS02ICYmIGIueDEgPD0gZS54MSArIDEgKyAxZS02XG4gICAgJiYgYi55MCA+PSBlLnkwIC0gMWUtNiAmJiBiLnkxIDw9IGUueTEgKyAxICsgMWUtNlxuICAgICYmIGIuejAgPj0gZS56MCAtIDFlLTYgJiYgYi56MSA8PSBlLnoxICsgMSArIDFlLTYpO1xufVxuXG5mdW5jdGlvbiBjb3N0VG90YWwoY29zdDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+Pik6IG51bWJlciB7XG4gIHJldHVybiBPYmplY3QudmFsdWVzKGNvc3QpLnJlZHVjZSgoYSwgYikgPT4gYSArIChiID8/IDApLCAwKTtcbn1cblxuZnVuY3Rpb24gbWVkaWFuKHZhbHVlczogbnVtYmVyW10pOiBudW1iZXIge1xuICBjb25zdCBzb3J0ZWQgPSBbLi4udmFsdWVzXS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG4gIHJldHVybiBzb3J0ZWRbTWF0aC5mbG9vcihzb3J0ZWQubGVuZ3RoIC8gMildO1xufVxuXG4vLyAtLS0tLS0tLS0tIGhvdXNlIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIHBsYW5Ib3VzZSh3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3Qgd2lkdGggPSByZWN0LngxIC0gcmVjdC54MCArIDE7XG4gIGNvbnN0IGRlcHRoID0gcmVjdC56MSAtIHJlY3QuejAgKyAxO1xuICBpZiAod2lkdGggIT09IDggfHwgZGVwdGggIT09IDYpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdmb290cHJpbnRfbWlzbWF0Y2gnLCBbYGhvdXNlIG5lZWRzIDggeCA2IG0sIGdvdCAke3dpZHRofSB4ICR7ZGVwdGh9IG1gXSk7XG4gIH1cbiAgaWYgKCFwcm9wb3NhbC5kb29yKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnbWlzc2luZ19kb29yJywgWydob3VzZSBwbGFuIG5lZWRzIGEgZG9vciBjb2x1bW4nXSk7XG4gIH1cbiAgaWYgKHByb3Bvc2FsLmRvb3IueiA8IHJlY3QuejAgfHwgcHJvcG9zYWwuZG9vci56ID4gcmVjdC56MSkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ2Rvb3Jfb3V0c2lkZScsIFtgZG9vciB6ICR7cHJvcG9zYWwuZG9vci56fSBpcyBvdXRzaWRlICR7cmVjdC56MH0uLiR7cmVjdC56MX1gXSk7XG4gIH1cblxuICBjb25zdCBzdXJmYWNlID0gZm9vdHByaW50U3VyZmFjZSh3b3JsZCwgcmVjdCwgcHJvcG9zYWwuZmxvb3JZKTtcbiAgY29uc3QgbWlzbWF0Y2hlcyA9IHN1cmZhY2VNaXNtYXRjaGVzKHdvcmxkLCBzdXJmYWNlKTtcbiAgaWYgKG1pc21hdGNoZXMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3NpdGVfbm90X3ByZXBhcmVkJywgbWlzbWF0Y2hlcy5zbGljZSgwLCA0KS5tYXAoXG4gICAgICAobSkgPT4gYGNvbHVtbiAke20ueH0sJHttLnp9IGlzIGF0ICR7bS5hY3R1YWx9LCBleHBlY3RlZCAke20uZXhwZWN0ZWR9YCxcbiAgICApKTtcbiAgfVxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCk7XG4gIGlmIChvYnN0cnVjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3NpdGVfb2JzdHJ1Y3RlZCcsIG9ic3RydWN0aW9ucy5tYXAoKG8pID0+IG8uZW50aXR5SWQpKTtcbiAgfVxuXG4gIGNvbnN0IGZsb29yWSA9IHByb3Bvc2FsLmZsb29yWTtcbiAgY29uc3QgeDAgPSByZWN0LngwLCB4MSA9IHJlY3QueDEgKyAxO1xuICBjb25zdCB6MCA9IHJlY3QuejAsIHoxID0gcmVjdC56MSArIDE7XG4gIGNvbnN0IGN4ID0gKHgwICsgeDEpIC8gMjtcbiAgY29uc3QgY3ogPSAoejAgKyB6MSkgLyAyO1xuICBjb25zdCBkb29yWiA9IHByb3Bvc2FsLmRvb3IueiArIDAuNTtcbiAgY29uc3QgZG9vckhhbGYgPSAwLjY7XG4gIGNvbnN0IHdhbGxIID0gMy4wO1xuICBjb25zdCB3YWxsVCA9IDAuNTtcbiAgY29uc3QgZG9vckggPSAyLjI7XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdID0gW107XG5cbiAgLy8gRmxvb3Igc2xhYiBhbmQgcm9vZiBwbGF0ZS5cbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ2Zsb29yJywgeDogY3gsIHk6IGZsb29yWSwgejogY3osIHc6IDguMCwgaDogMC4zLCBkOiA2LjAsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3Jvb2YnLCB4OiBjeCwgeTogZmxvb3JZICsgd2FsbEgsIHo6IGN6LCB3OiA4LjQsIGg6IDAuMywgZDogNi40LCB0b25lOiAnc3RvbmUnIH0pO1xuXG4gIC8vIE5vcnRoIGFuZCBzb3V0aCB3YWxscy5cbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3dhbGwnLCB4OiBjeCwgeTogZmxvb3JZLCB6OiB6MCArIHdhbGxUIC8gMiwgdzogOC4wLCBoOiB3YWxsSCwgZDogd2FsbFQsIHRvbmU6ICdzdG9uZScgfSk7XG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICd3YWxsJywgeDogY3gsIHk6IGZsb29yWSwgejogejEgLSB3YWxsVCAvIDIsIHc6IDguMCwgaDogd2FsbEgsIGQ6IHdhbGxULCB0b25lOiAnc3RvbmUnIH0pO1xuXG4gIC8vIFdlc3Qgd2FsbC5cbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3dhbGwnLCB4OiB4MCArIHdhbGxUIC8gMiwgeTogZmxvb3JZLCB6OiBjeiwgdzogd2FsbFQsIGg6IHdhbGxILCBkOiA2LjAsIHRvbmU6ICdzdG9uZScgfSk7XG5cbiAgLy8gRWFzdCB3YWxsIHdpdGggYSByZWFsIGRvb3J3YXkgZ2FwLlxuICBjb25zdCBlYXN0WCA9IHgxIC0gd2FsbFQgLyAyO1xuICBjb25zdCBnYXAwID0gZG9vclogLSBkb29ySGFsZjtcbiAgY29uc3QgZ2FwMSA9IGRvb3JaICsgZG9vckhhbGY7XG4gIGNvbnN0IGxlZnRMZW4gPSBnYXAwIC0gejA7XG4gIGNvbnN0IHJpZ2h0TGVuID0gejEgLSBnYXAxO1xuICBpZiAobGVmdExlbiA+IDAuMDUpIHtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3dhbGwnLCB4OiBlYXN0WCwgeTogZmxvb3JZLCB6OiB6MCArIGxlZnRMZW4gLyAyLFxuICAgICAgdzogd2FsbFQsIGg6IHdhbGxILCBkOiBsZWZ0TGVuLCB0b25lOiAnc3RvbmUnLFxuICAgIH0pO1xuICB9XG4gIGlmIChyaWdodExlbiA+IDAuMDUpIHtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3dhbGwnLCB4OiBlYXN0WCwgeTogZmxvb3JZLCB6OiBnYXAxICsgcmlnaHRMZW4gLyAyLFxuICAgICAgdzogd2FsbFQsIGg6IHdhbGxILCBkOiByaWdodExlbiwgdG9uZTogJ3N0b25lJyxcbiAgICB9KTtcbiAgfVxuICBtb2R1bGVzLnB1c2goe1xuICAgIGtpbmQ6ICdsaW50ZWwnLCB4OiBlYXN0WCwgeTogZmxvb3JZICsgZG9vckgsIHo6IGRvb3JaLFxuICAgIHc6IHdhbGxULCBoOiB3YWxsSCAtIGRvb3JILCBkOiBkb29ySGFsZiAqIDIsIHRvbmU6ICdzdG9uZV9iJyxcbiAgfSk7XG4gIG1vZHVsZXMucHVzaCh7XG4gICAga2luZDogJ2Rvb3InLCB4OiBlYXN0WCwgeTogZmxvb3JZLCB6OiBnYXAwLFxuICAgIHc6IDAuMTgsIGg6IGRvb3JILCBkOiAwLjE2LCB0b25lOiAndGltYmVyJyxcbiAgfSk7XG4gIG1vZHVsZXMucHVzaCh7XG4gICAga2luZDogJ2Rvb3InLCB4OiBlYXN0WCwgeTogZmxvb3JZLCB6OiBnYXAxLFxuICAgIHc6IDAuMTgsIGg6IGRvb3JILCBkOiAwLjE2LCB0b25lOiAndGltYmVyJyxcbiAgfSk7XG4gIG1vZHVsZXMucHVzaCh7XG4gICAga2luZDogJ3RocmVzaG9sZCcsIHg6IHgxICsgMC4zNSwgeTogZmxvb3JZLCB6OiBkb29yWixcbiAgICB3OiAwLjksIGg6IDAuMTYsIGQ6IDEuMywgdG9uZTogJ29jaHJlJyxcbiAgfSk7XG5cbiAgLy8gVHdvIHdpbmRvd3Mgb24gdGhlIHNvdXRoIHdhbGwsIHNsaWdodGx5IHByb3VkIG9mIHRoZSBvdXRlciBmYWNlLlxuICBmb3IgKGNvbnN0IHd4IG9mIFtjeCAtIDIuMiwgY3ggKyAyLjJdKSB7XG4gICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgIGtpbmQ6ICd3aW5kb3cnLCB4OiB3eCwgeTogZmxvb3JZICsgMS40NSwgejogejEgLSAwLjAyLFxuICAgICAgdzogMS4wLCBoOiAxLjAsIGQ6IDAuMDgsIHRvbmU6ICdhY2NlbnQnLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gUGFyYXBldCBhcm91bmQgdGhlIGZsYXQgTm94ZWwgcm9vZi5cbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhcmFwZXQnLCB4OiBjeCwgeTogZmxvb3JZICsgd2FsbEggKyAwLjMsIHo6IGN6IC0gMy4wNSwgdzogOC40LCBoOiAwLjQsIGQ6IDAuMywgdG9uZTogJ3N0b25lX2InIH0pO1xuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGFyYXBldCcsIHg6IGN4LCB5OiBmbG9vclkgKyB3YWxsSCArIDAuMywgejogY3ogKyAzLjA1LCB3OiA4LjQsIGg6IDAuNCwgZDogMC4zLCB0b25lOiAnc3RvbmVfYicgfSk7XG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXJhcGV0JywgeDogY3ggLSA0LjA1LCB5OiBmbG9vclkgKyB3YWxsSCArIDAuMywgejogY3osIHc6IDAuMywgaDogMC40LCBkOiA2LjQsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhcmFwZXQnLCB4OiBjeCArIDQuMDUsIHk6IGZsb29yWSArIHdhbGxIICsgMC4zLCB6OiBjeiwgdzogMC4zLCBoOiAwLjQsIGQ6IDYuNCwgdG9uZTogJ3N0b25lX2InIH0pO1xuXG4gIGNvbnN0IHBsYW46IFN0cnVjdHVyZVBsYW4gPSB7XG4gICAgaWQ6ICcnLFxuICAgIGtpbmQ6ICdob3VzZScsXG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclksXG4gICAgb3JpZ2luOiB7IHg6IGN4LCB5OiBmbG9vclksIHo6IGN6IH0sXG4gICAgcm90OiAwLFxuICAgIG1vZHVsZXMsXG4gICAgY29zdDogeyAuLi5IT1VTRV9DT1NUIH0sXG4gICAgZW52ZWxvcGU6IGZvb3RwcmludEVudmVsb3BlKHJlY3QsIGZsb29yWSwgZmxvb3JZICsgNCwgMiksXG4gICAgc3VyZmFjZSxcbiAgfTtcbiAgcGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbil9YDtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4gfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwYXRoIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIHBsYW5QYXRoKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB3aWR0aCA9IHJlY3QueDEgLSByZWN0LngwICsgMTtcbiAgY29uc3QgZGVwdGggPSByZWN0LnoxIC0gcmVjdC56MCArIDE7XG4gIGlmIChkZXB0aCAhPT0gMyB8fCB3aWR0aCA8IDMpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdmb290cHJpbnRfbWlzbWF0Y2gnLCBbYHBhdGggbmVlZHMgYSAzIG0gd2lkZSBjb3JyaWRvciwgZ290ICR7d2lkdGh9IHggJHtkZXB0aH0gbWBdKTtcbiAgfVxuXG4gIGNvbnN0IGNlbnRlclogPSByZWN0LnowICsgMTtcbiAgY29uc3Qgc3VyZmFjZTogU3VyZmFjZVNhbXBsZVtdID0gW107XG4gIGNvbnN0IGhlaWdodHM6IG51bWJlcltdID0gW107XG4gIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykge1xuICAgIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIGNlbnRlclopO1xuICAgIGhlaWdodHMucHVzaCh5KTtcbiAgICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHN1cmZhY2UucHVzaCh7IHgsIHosIHkgfSk7XG4gIH1cbiAgY29uc3QgbWlzbWF0Y2hlcyA9IHN1cmZhY2VNaXNtYXRjaGVzKHdvcmxkLCBzdXJmYWNlKTtcbiAgaWYgKG1pc21hdGNoZXMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3BhdGhfbm90X3ByZXBhcmVkJywgbWlzbWF0Y2hlcy5zbGljZSgwLCA0KS5tYXAoXG4gICAgICAobSkgPT4gYGNvbHVtbiAke20ueH0sJHttLnp9IGlzIGF0ICR7bS5hY3R1YWx9LCBleHBlY3RlZCAke20uZXhwZWN0ZWR9YCxcbiAgICApKTtcbiAgfVxuICBmb3IgKGxldCBpID0gMTsgaSA8IGhlaWdodHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBzdGVwID0gaGVpZ2h0c1tpXSAtIGhlaWdodHNbaSAtIDFdO1xuICAgIGlmIChNYXRoLmFicyhzdGVwKSA+IDEpIHtcbiAgICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3BhdGhfc3RlcCcsIFtgc3RlcCAke3N0ZXB9IG0gYXQgeD0ke3JlY3QueDAgKyBpfWBdKTtcbiAgICB9XG4gIH1cbiAgZm9yIChjb25zdCBzIG9mIHN1cmZhY2UpIHtcbiAgICBjb25zdCB0b3AgPSBnZXRWb3hlbCh3b3JsZCwgcy54LCBzLnkgLSAxLCBzLnopO1xuICAgIGlmICh0b3AgPT09IE1BVC5XQVRFUikge1xuICAgICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF93ZXQnLCBbYGNvbHVtbiAke3MueH0sJHtzLnp9IGlzIHdldGBdKTtcbiAgICB9XG4gICAgaWYgKHRvcCAhPT0gTUFULkdSQVZFTCkge1xuICAgICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF9zdXJmYWNlJywgW1xuICAgICAgICBgY29sdW1uICR7cy54fSwke3Muen0gdG9wIGlzICR7dG9wfSwgZXhwZWN0ZWQgZ3JhdmVsYCxcbiAgICAgIF0pO1xuICAgIH1cbiAgfVxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCk7XG4gIGlmIChvYnN0cnVjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3BhdGhfb2JzdHJ1Y3RlZCcsIG9ic3RydWN0aW9ucy5tYXAoKG8pID0+IG8uZW50aXR5SWQpKTtcbiAgfVxuXG4gIGNvbnN0IGN6ID0gY2VudGVyWiArIDAuNTtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcbiAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgY2VudGVyWik7XG4gICAgY29uc3QgbXggPSB4ICsgMC41O1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXRoJywgeDogbXgsIHksIHo6IGN6LCB3OiAxLjAsIGg6IDAuMTIsIGQ6IDMuMCwgdG9uZTogJ2dyYXZlbCcgfSk7XG4gICAgbW9kdWxlcy5wdXNoKHsga2luZDogJ2N1cmInLCB4OiBteCwgeSwgejogcmVjdC56MCArIDAuMDc1LCB3OiAxLjAsIGg6IDAuMjIsIGQ6IDAuMTUsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAnY3VyYicsIHg6IG14LCB5LCB6OiByZWN0LnoxICsgMSAtIDAuMDc1LCB3OiAxLjAsIGg6IDAuMjIsIGQ6IDAuMTUsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgfVxuXG4gIGNvbnN0IG1pblkgPSBNYXRoLm1pbiguLi5oZWlnaHRzKTtcbiAgY29uc3QgbWF4WSA9IE1hdGgubWF4KC4uLmhlaWdodHMpO1xuICBjb25zdCBwbGFuOiBTdHJ1Y3R1cmVQbGFuID0ge1xuICAgIGlkOiAnJyxcbiAgICBraW5kOiAncGF0aCcsXG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHByb3Bvc2FsLmZsb29yWSxcbiAgICBvcmlnaW46IHsgeDogKHJlY3QueDAgKyByZWN0LngxICsgMSkgLyAyLCB5OiBtaW5ZLCB6OiBjeiB9LFxuICAgIHJvdDogMCxcbiAgICBtb2R1bGVzLFxuICAgIGNvc3Q6IHBhdGhDb3N0KHdpZHRoKSxcbiAgICBlbnZlbG9wZTogZm9vdHByaW50RW52ZWxvcGUocmVjdCwgbWluWSAtIDEsIG1heFkgKyAyLCAwKSxcbiAgICBzdXJmYWNlLFxuICB9O1xuICBwbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFuKX1gO1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIHRlcnJhY2VzIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIHBsYW5UZXJyYWNlcyh3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3Qgd2lkdGggPSByZWN0LngxIC0gcmVjdC54MCArIDE7XG4gIGNvbnN0IGRlcHRoID0gcmVjdC56MSAtIHJlY3QuejAgKyAxO1xuICBjb25zdCBjb3VudCA9IHByb3Bvc2FsLnRlcnJhY2VzID8/IDM7XG4gIGlmICh3aWR0aCAhPT0gMTIgfHwgZGVwdGggIT09IDgpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdmb290cHJpbnRfbWlzbWF0Y2gnLCBbYHRlcnJhY2VzIG5lZWQgMTIgeCA4IG0sIGdvdCAke3dpZHRofSB4ICR7ZGVwdGh9IG1gXSk7XG4gIH1cbiAgaWYgKGNvdW50IDwgMiB8fCBjb3VudCA+IDQpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICd0ZXJyYWNlX2NvdW50JywgW2Ake2NvdW50fSB0ZXJyYWNlcyBpcyBvdXRzaWRlIDIuLjRgXSk7XG4gIH1cblxuICAvLyBTcGxpdCBkZXB0aCBpbnRvIG5lYXItZXF1YWwgYmFuZHMsIGhpZ2ggc2lkZSBmaXJzdC5cbiAgY29uc3QgYmFzZSA9IE1hdGguZmxvb3IoZGVwdGggLyBjb3VudCk7XG4gIGNvbnN0IGV4dHJhID0gZGVwdGggJSBjb3VudDtcbiAgY29uc3QgYmFuZHM6IFRlcnJhY2VCYW5kW10gPSBbXTtcbiAgbGV0IHogPSByZWN0LnowO1xuICBjb25zdCBtZWRpYW5zOiBudW1iZXJbXSA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICBjb25zdCBzaXplID0gYmFzZSArIChpIDwgZXh0cmEgPyAxIDogMCk7XG4gICAgY29uc3QgejAgPSB6LCB6MSA9IHogKyBzaXplIC0gMTtcbiAgICBjb25zdCB2YWx1ZXM6IG51bWJlcltdID0gW107XG4gICAgZm9yIChsZXQgYnogPSB6MDsgYnogPD0gejE7IGJ6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykgdmFsdWVzLnB1c2goc3VyZmFjZUF0KHdvcmxkLCB4LCBieikpO1xuICAgIH1cbiAgICBtZWRpYW5zLnB1c2gobWVkaWFuKHZhbHVlcykpO1xuICAgIGJhbmRzLnB1c2goeyB6MCwgejEsIHk6IDAgfSk7XG4gICAgeiA9IHoxICsgMTtcbiAgfVxuICAvLyBFYWNoIHRlcnJhY2Ugc2l0cyBleGFjdGx5IG9uZSBtZXRyZSBiZWxvdyB0aGUgcHJldmlvdXMgb25lLlxuICBmb3IgKGxldCBpID0gMDsgaSA8IGJhbmRzLmxlbmd0aDsgaSsrKSB7XG4gICAgYmFuZHNbaV0ueSA9IGkgPT09IDAgPyBtZWRpYW5zWzBdIDogTWF0aC5taW4obWVkaWFuc1tpXSwgYmFuZHNbaSAtIDFdLnkgLSAxKTtcbiAgfVxuXG4gIGxldCBtYXhDdXQgPSAwLCBtYXhGaWxsID0gMCwgY3V0Vm9sdW1lID0gMCwgZmlsbFZvbHVtZSA9IDA7XG4gIGNvbnN0IHN1cmZhY2U6IFN1cmZhY2VTYW1wbGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGIgb2YgYmFuZHMpIHtcbiAgICBmb3IgKGxldCBieiA9IGIuejA7IGJ6IDw9IGIuejE7IGJ6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykge1xuICAgICAgICBjb25zdCBzID0gc3VyZmFjZUF0KHdvcmxkLCB4LCBieik7XG4gICAgICAgIHN1cmZhY2UucHVzaCh7IHgsIHo6IGJ6LCB5OiBiLnkgfSk7XG4gICAgICAgIGNvbnN0IGQgPSBzIC0gYi55O1xuICAgICAgICBpZiAoZCA+IDApIHsgY3V0Vm9sdW1lICs9IGQ7IG1heEN1dCA9IE1hdGgubWF4KG1heEN1dCwgZCk7IH1cbiAgICAgICAgaWYgKGQgPCAwKSB7IGZpbGxWb2x1bWUgKz0gLWQ7IG1heEZpbGwgPSBNYXRoLm1heChtYXhGaWxsLCAtZCk7IH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKG1heEN1dCA+IEZBUk1fUlVMRVMubWF4Q3V0IHx8IG1heEZpbGwgPiBGQVJNX1JVTEVTLm1heEZpbGxcbiAgICB8fCBjdXRWb2x1bWUgPiBGQVJNX1JVTEVTLm1heEN1dFZvbHVtZSB8fCBmaWxsVm9sdW1lID4gRkFSTV9SVUxFUy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAndGVycmFjZV9lYXJ0aHdvcmsnLCBbXG4gICAgICBgY3V0ICR7Y3V0Vm9sdW1lfSBtXHUwMEIzIC8gZmlsbCAke2ZpbGxWb2x1bWV9IG1cdTAwQjMsIG1heCAke21heEN1dH0vJHttYXhGaWxsfSBtYCxcbiAgICBdKTtcbiAgfVxuICBjb25zdCBtaXNtYXRjaGVzID0gc3VyZmFjZU1pc21hdGNoZXMod29ybGQsIHN1cmZhY2UpO1xuICBpZiAobWlzbWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnc2l0ZV9ub3RfcHJlcGFyZWQnLCBtaXNtYXRjaGVzLnNsaWNlKDAsIDQpLm1hcChcbiAgICAgIChtKSA9PiBgY29sdW1uICR7bS54fSwke20uen0gaXMgYXQgJHttLmFjdHVhbH0sIGV4cGVjdGVkICR7bS5leHBlY3RlZH1gLFxuICAgICkpO1xuICB9XG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KTtcbiAgaWYgKG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnc2l0ZV9vYnN0cnVjdGVkJywgb2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gby5lbnRpdHlJZCkpO1xuICB9XG4gIGZvciAoY29uc3QgcyBvZiBzdXJmYWNlKSB7XG4gICAgY29uc3QgdG9wID0gZ2V0Vm94ZWwod29ybGQsIHMueCwgcy55IC0gMSwgcy56KTtcbiAgICBpZiAodG9wICE9PSBNQVQuU09JTCkge1xuICAgICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAndGVycmFjZV9zdXJmYWNlJywgW1xuICAgICAgICBgY29sdW1uICR7cy54fSwke3Muen0gdG9wIGlzICR7dG9wfSwgZXhwZWN0ZWQgc29pbGAsXG4gICAgICBdKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBjeCA9IChyZWN0LngwICsgcmVjdC54MSArIDEpIC8gMjtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcbiAgZm9yIChjb25zdCBiIG9mIGJhbmRzKSB7XG4gICAgY29uc3QgYnogPSAoYi56MCArIGIuejEgKyAxKSAvIDI7XG4gICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgIGtpbmQ6ICdzb2lsX2JlZCcsIHg6IGN4LCB5OiBiLnksIHo6IGJ6LFxuICAgICAgdzogd2lkdGgsIGg6IDAuMTgsIGQ6IGIuejEgLSBiLnowICsgMSwgdG9uZTogJ3NvaWwnLFxuICAgIH0pO1xuICAgIC8vIFRocmVlIGNyb3Agcm93cyBwZXIgdGVycmFjZSwgaW5zZXQgZnJvbSB0aGUgcmV0YWluaW5nIHdhbGxzLlxuICAgIGNvbnN0IHJvd0RlcHRoID0gYi56MSAtIGIuejAgKyAxO1xuICAgIGZvciAobGV0IHIgPSAwOyByIDwgMzsgcisrKSB7XG4gICAgICBjb25zdCB0ID0gKHIgKyAxKSAvIDQ7XG4gICAgICBtb2R1bGVzLnB1c2goe1xuICAgICAgICBraW5kOiAnY3JvcF9yb3cnLCB4OiBjeCwgeTogYi55ICsgMC4xOCwgejogYi56MCArIHJvd0RlcHRoICogdCxcbiAgICAgICAgdzogd2lkdGggLSAxLjIsIGg6IDAuMjgsIGQ6IDAuMzYsIHRvbmU6ICdjcm9wJyxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBmb3IgKGxldCBpID0gMTsgaSA8IGJhbmRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgdXBwZXIgPSBiYW5kc1tpIC0gMV07XG4gICAgY29uc3QgbG93ZXIgPSBiYW5kc1tpXTtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3JldGFpbmluZ193YWxsJywgeDogY3gsIHk6IGxvd2VyLnksIHo6IHVwcGVyLnoxICsgMC41LFxuICAgICAgdzogd2lkdGgsIGg6IHVwcGVyLnkgLSBsb3dlci55LCBkOiAwLjQsIHRvbmU6ICdzdG9uZV9iJyxcbiAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IG1pblkgPSBNYXRoLm1pbiguLi5iYW5kcy5tYXAoKGIpID0+IGIueSkpO1xuICBjb25zdCBtYXhZID0gTWF0aC5tYXgoLi4uYmFuZHMubWFwKChiKSA9PiBiLnkpKTtcbiAgY29uc3QgcGxhbjogU3RydWN0dXJlUGxhbiA9IHtcbiAgICBpZDogJycsXG4gICAga2luZDogJ3RlcnJhY2UnLFxuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwcm9wb3NhbC5mbG9vclksXG4gICAgb3JpZ2luOiB7IHg6IGN4LCB5OiBtaW5ZLCB6OiAocmVjdC56MCArIHJlY3QuejEgKyAxKSAvIDIgfSxcbiAgICByb3Q6IDAsXG4gICAgbW9kdWxlcyxcbiAgICBjb3N0OiB7IC4uLlRFUlJBQ0VfQ09TVCB9LFxuICAgIGVudmVsb3BlOiBmb290cHJpbnRFbnZlbG9wZShyZWN0LCBtaW5ZIC0gMSwgbWF4WSArIDIsIDEpLFxuICAgIHN1cmZhY2UsXG4gICAgdGVycmFjZXM6IGJhbmRzLFxuICB9O1xuICBwbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFuKX1gO1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxhblN0cnVjdHVyZSh3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBpZiAocHJvcG9zYWwuZGVzaWduVmVyc2lvbiA9PT0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTikgcmV0dXJuIHBsYW5Gb3VuZGVyRGVzaWduKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmIChwcm9wb3NhbC5kZXNpZ25WZXJzaW9uICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICd1bnN1cHBvcnRlZF9kZXNpZ24nLCBbYHVuc3VwcG9ydGVkIHN0cnVjdHVyZSBkZXNpZ24gJHtTdHJpbmcocHJvcG9zYWwuZGVzaWduVmVyc2lvbil9YF0pO1xuICB9XG4gIGlmIChwcm9wb3NhbC5raW5kID09PSAnaG91c2UnKSByZXR1cm4gcGxhbkhvdXNlKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmIChwcm9wb3NhbC5raW5kID09PSAncGF0aCcpIHJldHVybiBwbGFuUGF0aCh3b3JsZCwgcHJvcG9zYWwpO1xuICByZXR1cm4gcGxhblRlcnJhY2VzKHdvcmxkLCBwcm9wb3NhbCk7XG59XG5cbi8vIC0tLS0tLS0tLS0gZGVzaWduIDI6IGJvdW5kZWQgZm91bmRlciBjYW5kaWRhdGUgLS0tLS0tLS0tLVxuLy8gVGhpcyBkZWxpYmVyYXRlbHkgbGVhdmVzIGV2ZXJ5IGxlZ2FjeSBwbGFubmVyIGFib3ZlIHVudG91Y2hlZC4gVGhlIGV4dHJhIHdhbGxcbi8vIHByaW1pdGl2ZXMgcmVwcmVzZW50IHZvaWRzLCBub3QgZGVjb3JhdGl2ZSB3aW5kb3dzOyB0aGVpciBhc3NldC1sZXZlbCB2b2x1bWVcbi8vIGludGVycHJldGF0aW9uIHJlbWFpbnMgUmV2aWV3IFJlcXVpcmVkICh0aGUgZm91bmRlciA0XHUyMDEzOSB2b2x1bWUgdGFyZ2V0KS5cbmZ1bmN0aW9uIHBsYW5Gb3VuZGVyRGVzaWduKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGlmIChwcm9wb3NhbC5raW5kID09PSAncGF0aCcpIHJldHVybiBwbGFuRm91bmRlclBhdGgod29ybGQsIHByb3Bvc2FsKTtcbiAgY29uc3QgcGxhbm5lZCA9IHByb3Bvc2FsLmtpbmQgPT09ICdob3VzZScgPyBwbGFuSG91c2Uod29ybGQsIHByb3Bvc2FsKSA6IHBsYW5UZXJyYWNlcyh3b3JsZCwgcHJvcG9zYWwpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybiBwbGFubmVkO1xuICBpZiAocHJvcG9zYWwua2luZCA9PT0gJ3RlcnJhY2UnKSB7XG4gICAgLy8gQ3JvcCByb3dzIHN0YXkgY29tcGFjdCBhdXRob3JpdGF0aXZlIGFnZ3JlZ2F0ZXMuIFRoZWlyIGZhY2V0ZWQgZm9saWFnZSBpc1xuICAgIC8vIGRlcml2ZWQgcHJlc2VudGF0aW9uIG9ubHk7IG5vIHBsYW50LWxldmVsIGV4aXN0ZW5jZSBvciB5aWVsZCBpcyBpbnZlbnRlZC5cbiAgICBwbGFubmVkLnBsYW4uZGVzaWduVmVyc2lvbiA9IEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG4gICAgcGxhbm5lZC5wbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFubmVkLnBsYW4pfWA7XG4gICAgcmV0dXJuIHBsYW5uZWQ7XG4gIH1cbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHgwID0gcmVjdC54MCwgeDEgPSByZWN0LngxICsgMTtcbiAgY29uc3QgejAgPSByZWN0LnowLCB6MSA9IHJlY3QuejEgKyAxO1xuICBjb25zdCB5ID0gcHJvcG9zYWwuZmxvb3JZLCBjeCA9ICh4MCArIHgxKSAvIDIsIGN6ID0gKHowICsgejEpIC8gMjtcbiAgY29uc3QgdCA9IDAuNiwgaCA9IDMuMjtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcbiAgLy8gT25lIHN0cnVjdHVyYWwgc3RvbmUgZmFtaWx5OiBsaWdodGluZywgbm90IHBhaW50ZWQgZmFjZSB2YXJpYXRpb24sIHNoYWRlcyBpdC5cbiAgY29uc3Qgd2FsbCA9ICh4OiBudW1iZXIsIGJvdHRvbTogbnVtYmVyLCB6OiBudW1iZXIsIHc6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGQ6IG51bWJlciwga2luZDogU3RydWN0dXJlTW9kdWxlWydraW5kJ10gPSAnd2FsbCcpID0+IHtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kLCB4LCB5OiBib3R0b20sIHosIHcsIGg6IGhlaWdodCwgZCwgdG9uZTogJ3N0b25lJyB9KTtcbiAgfTtcbiAgd2FsbChjeCwgeSAtIDAuNCwgY3osIDgsIDAuNCwgNiwgJ2Zsb29yJyk7XG4gIHdhbGwoY3gsIHksIHowICsgdCAvIDIsIDgsIGgsIHQpO1xuICBjb25zdCBpbm5lclowID0gejAgKyB0LCBpbm5lcloxID0gejEgLSB0O1xuICB3YWxsKHgwICsgdCAvIDIsIHksIChpbm5lclowICsgaW5uZXJaMSkgLyAyLCB0LCBoLCBpbm5lcloxIC0gaW5uZXJaMCk7XG4gIGNvbnN0IGRvb3JaID0gKHByb3Bvc2FsLmRvb3I/LnogPz8gcmVjdC56MCkgKyAwLjU7XG4gIGNvbnN0IGRvb3IwID0gZG9vclogLSAwLjYsIGRvb3IxID0gZG9vclogKyAwLjY7XG4gIGNvbnN0IGVhc3RYID0geDEgLSB0IC8gMjtcbiAgd2FsbChlYXN0WCwgeSwgKGlubmVyWjAgKyBkb29yMCkgLyAyLCB0LCBoLCBkb29yMCAtIGlubmVyWjApO1xuICB3YWxsKGVhc3RYLCB5LCAoZG9vcjEgKyBpbm5lcloxKSAvIDIsIHQsIGgsIGlubmVyWjEgLSBkb29yMSk7XG4gIHdhbGwoZWFzdFgsIHkgKyAyLjIsIGRvb3JaLCB0LCAwLjQsIDEuMiwgJ2xpbnRlbCcpO1xuICB3YWxsKGVhc3RYLCB5ICsgMi42LCBkb29yWiwgdCwgMC42LCAxLjIpO1xuICBjb25zdCBzb3V0aFogPSB6MSAtIHQgLyAyO1xuICBmb3IgKGNvbnN0IFthLCBiXSBvZiBbW3gwICsgdCwgY3ggLSAyLjZdLCBbY3ggLSAxLjQsIGN4ICsgMS40XSwgW2N4ICsgMi42LCB4MSAtIHRdXSkge1xuICAgIHdhbGwoKGEgKyBiKSAvIDIsIHksIHNvdXRoWiwgYiAtIGEsIGgsIHQpO1xuICB9XG4gIGZvciAoY29uc3Qgd3ggb2YgW2N4IC0gMiwgY3ggKyAyXSkge1xuICAgIHdhbGwod3gsIHksIHNvdXRoWiwgMS4yLCAxLCB0KTtcbiAgICB3YWxsKHd4LCB5ICsgMi40LCBzb3V0aFosIDEuMiwgMC44LCB0LCAnbGludGVsJyk7XG4gIH1cbiAgd2FsbChjeCwgeSArIGgsIGN6LCA4LCAwLjQsIDYsICdyb29mJyk7XG4gIHdhbGwoY3gsIHkgKyBoICsgMC40LCB6MCArIDAuMTUsIDgsIDAuMywgMC4zLCAncGFyYXBldCcpO1xuICB3YWxsKGN4LCB5ICsgaCArIDAuNCwgejEgLSAwLjE1LCA4LCAwLjMsIDAuMywgJ3BhcmFwZXQnKTtcbiAgd2FsbChjeCAtIDMuODUsIHkgKyBoICsgMC40LCBjeiwgMC4zLCAwLjMsIDUuNCwgJ3BhcmFwZXQnKTtcbiAgd2FsbChjeCArIDMuODUsIHkgKyBoICsgMC40LCBjeiwgMC4zLCAwLjMsIDUuNCwgJ3BhcmFwZXQnKTtcbiAgcGxhbm5lZC5wbGFuLm1vZHVsZXMgPSBtb2R1bGVzO1xuICBwbGFubmVkLnBsYW4uZGVzaWduVmVyc2lvbiA9IEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG4gIHBsYW5uZWQucGxhbi5lbnZlbG9wZSA9IGZvb3RwcmludEVudmVsb3BlKHJlY3QsIHkgLSAxLCB5ICsgNCwgMik7XG4gIHBsYW5uZWQucGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbm5lZC5wbGFuKX1gO1xuICByZXR1cm4gcGxhbm5lZDtcbn1cblxuZnVuY3Rpb24gcGxhbkZvdW5kZXJQYXRoKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGNvbnN0IHBsYW5uZWQgPSBwbGFuUGF0aCh3b3JsZCwgcHJvcG9zYWwpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybiBwbGFubmVkO1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuICBjb25zdCBoZWlnaHRzID0gcGxhbm5lZC5wbGFuLm1vZHVsZXMuZmlsdGVyKChtKSA9PiBtLmtpbmQgPT09ICdwYXRoJykubWFwKChtKSA9PiBtLnkpO1xuICBjb25zdCB6MCA9IHBsYW5uZWQucGxhbi5yZWN0LnowLCB6MSA9IHBsYW5uZWQucGxhbi5yZWN0LnoxICsgMTtcbiAgbGV0IHN0YXJ0ID0gMDtcbiAgZm9yIChsZXQgZW5kID0gMTsgZW5kIDw9IGhlaWdodHMubGVuZ3RoOyBlbmQrKykge1xuICAgIGlmIChlbmQgPCBoZWlnaHRzLmxlbmd0aCAmJiBoZWlnaHRzW2VuZF0gPT09IGhlaWdodHNbc3RhcnRdKSBjb250aW51ZTtcbiAgICBjb25zdCB4ID0gcGxhbm5lZC5wbGFuLnJlY3QueDAgKyBzdGFydCwgd2lkdGggPSBlbmQgLSBzdGFydDtcbiAgICBjb25zdCBjeCA9IHggKyB3aWR0aCAvIDIsIHkgPSBoZWlnaHRzW3N0YXJ0XTtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGF0aCcsIHg6IGN4LCB5LCB6OiAoejAgKyB6MSkgLyAyLCB3OiB3aWR0aCwgaDogMC4xMiwgZDogMywgdG9uZTogJ2dyYXZlbCcgfSk7XG4gICAgZm9yIChjb25zdCB6IG9mIFt6MCArIDAuMDc1LCB6MSAtIDAuMDc1XSkge1xuICAgICAgbW9kdWxlcy5wdXNoKHsga2luZDogJ2N1cmInLCB4OiBjeCwgeSwgeiwgdzogd2lkdGgsIGg6IDAuMjIsIGQ6IDAuMTUsIHRvbmU6ICdzdG9uZScgfSk7XG4gICAgfVxuICAgIHN0YXJ0ID0gZW5kO1xuICB9XG4gIHBsYW5uZWQucGxhbi5tb2R1bGVzID0gbW9kdWxlcztcbiAgcGxhbm5lZC5wbGFuLmRlc2lnblZlcnNpb24gPSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OO1xuICBwbGFubmVkLnBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW5uZWQucGxhbil9YDtcbiAgcmV0dXJuIHBsYW5uZWQ7XG59XG5cblxuLy8gLS0tLS0tLS0tLSBhdXRob3JpemF0aW9uIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlTGltaXRzIHtcbiAgbWF4TW9kdWxlczogbnVtYmVyO1xuICBtYXhDb3N0OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1NUUlVDVFVSRV9MSU1JVFM6IFN0cnVjdHVyZUxpbWl0cyA9IHtcbiAgbWF4TW9kdWxlczogNjQsXG4gIG1heENvc3Q6IDEyOCxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlQXV0aG9yaXphdGlvbiB7XG4gIGlkOiBzdHJpbmc7XG4gIGF1dGhvcml0eTogdHlwZW9mIExPQ0FMX0FVVEhPUklUWTtcbiAgZW5mb3JjZW1lbnQ6IHR5cGVvZiBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgcGxhbkRpZ2VzdDogc3RyaW5nO1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgYmFzZVJldmlzaW9uOiBudW1iZXI7XG4gIGxpbWl0czogU3RydWN0dXJlTGltaXRzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZURlY2lzaW9uIHtcbiAgb2s6IGJvb2xlYW47XG4gIGF1dGhvcml6YXRpb246IFN0cnVjdHVyZUF1dGhvcml6YXRpb24gfCBudWxsO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIExvY2FsU3RydWN0dXJlQXV0aG9yaXplciB7XG4gIHJlYWRvbmx5IGF1dGhvcml0eSA9IExPQ0FMX0FVVEhPUklUWTtcbiAgcmVhZG9ubHkgZW5mb3JjZW1lbnQgPSBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgcmVhZG9ubHkgbGltaXRzOiBTdHJ1Y3R1cmVMaW1pdHM7XG5cbiAgY29uc3RydWN0b3IocmVhZG9ubHkgcG9saWN5OiBBdXRob3JpemF0aW9uUG9saWN5LCBsaW1pdHM6IFBhcnRpYWw8U3RydWN0dXJlTGltaXRzPiA9IHt9KSB7XG4gICAgdGhpcy5saW1pdHMgPSB7IC4uLkRFRkFVTFRfU1RSVUNUVVJFX0xJTUlUUywgLi4ubGltaXRzIH07XG4gIH1cblxuICBhdXRob3JpemUod29ybGQ6IFdvcmxkLCBwbGFuOiBTdHJ1Y3R1cmVQbGFuKTogU3RydWN0dXJlRGVjaXNpb24ge1xuICAgIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKHBsYW4ubW9kdWxlcy5sZW5ndGggPT09IDApIHJlYXNvbnMucHVzaCgncGxhbiBoYXMgbm8gbW9kdWxlcycpO1xuICAgIGlmIChwbGFuLm1vZHVsZXMubGVuZ3RoID4gdGhpcy5saW1pdHMubWF4TW9kdWxlcykge1xuICAgICAgcmVhc29ucy5wdXNoKGAke3BsYW4ubW9kdWxlcy5sZW5ndGh9IG1vZHVsZXMgZXhjZWVkIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4TW9kdWxlc31gKTtcbiAgICB9XG4gICAgaWYgKGNvc3RUb3RhbChwbGFuLmNvc3QpID4gdGhpcy5saW1pdHMubWF4Q29zdCkge1xuICAgICAgcmVhc29ucy5wdXNoKGBjb3N0ICR7Y29zdFRvdGFsKHBsYW4uY29zdCl9IGV4Y2VlZHMgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhDb3N0fWApO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhwbGFuLmNvc3QpKSB7XG4gICAgICBpZiAoIU51bWJlci5pc0ludGVnZXIoYW1vdW50KSB8fCAoYW1vdW50ID8/IDApIDwgMCkge1xuICAgICAgICByZWFzb25zLnB1c2goYGNvc3QgJHtyZXNvdXJjZX09JHthbW91bnR9IGlzIG5vdCBhIG5vbi1uZWdhdGl2ZSBpbnRlZ2VyYCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChwbGFuLmVudmVsb3BlLmxlbmd0aCA9PT0gMCkgcmVhc29ucy5wdXNoKCdwbGFuIGhhcyBubyB3b3JrIGVudmVsb3BlJyk7XG4gICAgZm9yIChjb25zdCByZWdpb24gb2YgcGxhbi5lbnZlbG9wZSkge1xuICAgICAgaWYgKCF0aGlzLnBvbGljeS5lbnZlbG9wZS5zb21lKChwKSA9PiByZWdpb24ueDAgPj0gcC54MCAmJiByZWdpb24ueDEgPD0gcC54MVxuICAgICAgICAmJiByZWdpb24uejAgPj0gcC56MCAmJiByZWdpb24uejEgPD0gcC56MVxuICAgICAgICAmJiByZWdpb24ueTAgPj0gcC55MCAmJiByZWdpb24ueTEgPD0gcC55MSkpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBlbnZlbG9wZSAke3JlZ2lvbi54MH0sJHtyZWdpb24uejB9LCR7cmVnaW9uLnkwfS4uJHtyZWdpb24ueDF9LCR7cmVnaW9uLnoxfSwke3JlZ2lvbi55MX0gaXMgb3V0c2lkZSB0aGUgbG9jYWwgcG9saWN5YCk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgbSBvZiBwbGFuLm1vZHVsZXMpIHtcbiAgICAgIGlmICghbW9kdWxlSW5zaWRlRW52ZWxvcGUobSwgcGxhbi5lbnZlbG9wZSkpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBtb2R1bGUgJHttLmtpbmR9IGF0ICR7bS54fSwke20ueX0sJHttLnp9IGlzIG91dHNpZGUgdGhlIHBsYW4gZW52ZWxvcGVgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHBsYW4uc3VyZmFjZS5sZW5ndGggPT09IDApIHJlYXNvbnMucHVzaCgncGxhbiBoYXMgbm8gc3VyZmFjZSBzYW1wbGVzJyk7XG4gICAgZm9yIChjb25zdCBzIG9mIHBsYW4uc3VyZmFjZSkge1xuICAgICAgaWYgKCFlbnZlbG9wZUNvbnRhaW5zKHBsYW4uZW52ZWxvcGUsIHMueCwgcy55LCBzLnopKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgc3VyZmFjZSAke3MueH0sJHtzLnp9LCR7cy55fSBpcyBvdXRzaWRlIHRoZSBwbGFuIGVudmVsb3BlYCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHJldHVybiB7IG9rOiBmYWxzZSwgYXV0aG9yaXphdGlvbjogbnVsbCwgcmVhc29ucyB9O1xuXG4gICAgY29uc3QgdG9rZW46IFN0cnVjdHVyZUF1dGhvcml6YXRpb24gPSB7XG4gICAgICBpZDogYGxvY2FsLXN0dWI6c3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW4pfWAsXG4gICAgICBhdXRob3JpdHk6IExPQ0FMX0FVVEhPUklUWSxcbiAgICAgIGVuZm9yY2VtZW50OiBMT0NBTF9FTkZPUkNFTUVOVCxcbiAgICAgIHBsYW5EaWdlc3Q6IHN0cnVjdHVyZURpZ2VzdChwbGFuKSxcbiAgICAgIGVudmVsb3BlOiBwbGFuLmVudmVsb3BlLm1hcCgoZSkgPT4gKHsgLi4uZSB9KSksXG4gICAgICBiYXNlUmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgICAgbGltaXRzOiB7IC4uLnRoaXMubGltaXRzIH0sXG4gICAgfTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgYXV0aG9yaXphdGlvbjogdG9rZW4sIHJlYXNvbnM6IFtdIH07XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSBleGVjdXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVMZWRnZXIge1xuICBhdXRob3JpdHk6IHR5cGVvZiBMT0NBTF9BVVRIT1JJVFk7XG4gIGVuZm9yY2VtZW50OiB0eXBlb2YgTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIGF1dGhvcml6YXRpb25JZDogc3RyaW5nO1xuICBwbGFuRGlnZXN0OiBzdHJpbmc7XG4gIHN0cnVjdHVyZUlkOiBzdHJpbmc7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBraW5kOiBTdHJ1Y3R1cmVLaW5kO1xuICBtb2R1bGVDb3VudDogbnVtYmVyO1xuICBjb3N0UGFpZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgaW52ZW50b3J5QmVmb3JlOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBpbnZlbnRvcnlBZnRlcjogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgcmV2aXNpb25CZWZvcmU6IG51bWJlcjtcbiAgcmV2aXNpb25BZnRlcjogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZVN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcGxhbjogU3RydWN0dXJlUGxhbjtcbiAgYXV0aG9yaXphdGlvbjogU3RydWN0dXJlQXV0aG9yaXphdGlvbjtcbiAgbGVkZ2VyOiBTdHJ1Y3R1cmVMZWRnZXI7XG59XG5cbmV4cG9ydCB0eXBlIFN0cnVjdHVyZU91dGNvbWUgPSBTdHJ1Y3R1cmVTdWNjZXNzIHwgU3RydWN0dXJlRmFpbHVyZTtcblxuZXhwb3J0IGZ1bmN0aW9uIGV4ZWN1dGVTdHJ1Y3R1cmUoXG4gIHdvcmxkOiBXb3JsZCwgcGxhbjogU3RydWN0dXJlUGxhbiwgYXV0aG9yaXphdGlvbjogU3RydWN0dXJlQXV0aG9yaXphdGlvbixcbik6IFN0cnVjdHVyZU91dGNvbWUge1xuICBpZiAoYXV0aG9yaXphdGlvbi5hdXRob3JpdHkgIT09IExPQ0FMX0FVVEhPUklUWVxuICAgIHx8IGF1dGhvcml6YXRpb24uZW5mb3JjZW1lbnQgIT09IExPQ0FMX0VORk9SQ0VNRU5UKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAndW5zdXBwb3J0ZWRfYXV0aG9yaXR5JywgW1xuICAgICAgYGF1dGhvcml0eSAke2F1dGhvcml6YXRpb24uYXV0aG9yaXR5fS8ke2F1dGhvcml6YXRpb24uZW5mb3JjZW1lbnR9IGlzIG5vdCB0aGUgbG9jYWwgc3R1YmAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCAhPT0gc3RydWN0dXJlRGlnZXN0KHBsYW4pKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnZGlnZXN0X21pc21hdGNoJywgWydhdXRob3JpemF0aW9uIGRvZXMgbm90IG1hdGNoIHRoaXMgc3RydWN0dXJlIHBsYW4nXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24uYmFzZVJldmlzaW9uICE9PSB3b3JsZC5yZXZpc2lvbikge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3N0YWxlX2F1dGhvcml6YXRpb24nLCBbXG4gICAgICBgYXV0aG9yaXphdGlvbiB3YXMgaXNzdWVkIGF0IHJldmlzaW9uICR7YXV0aG9yaXphdGlvbi5iYXNlUmV2aXNpb259LCB3b3JsZCBpcyBhdCAke3dvcmxkLnJldmlzaW9ufWAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKHBsYW4uZW52ZWxvcGUuc29tZSgocikgPT4gIWF1dGhvcml6YXRpb24uZW52ZWxvcGUuc29tZSgoYSkgPT4gci54MCA+PSBhLngwXG4gICAgJiYgci54MSA8PSBhLngxICYmIHIuejAgPj0gYS56MCAmJiByLnoxIDw9IGEuejEgJiYgci55MCA+PSBhLnkwICYmIHIueTEgPD0gYS55MSkpKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnZW52ZWxvcGVfbWlzbWF0Y2gnLCBbJ3BsYW4gZW52ZWxvcGUgaXMgd2lkZXIgdGhhbiB0aGUgYXV0aG9yaXphdGlvbiddKTtcbiAgfVxuXG4gIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgbSBvZiBwbGFuLm1vZHVsZXMpIHtcbiAgICBpZiAoIW1vZHVsZUluc2lkZUVudmVsb3BlKG0sIGF1dGhvcml6YXRpb24uZW52ZWxvcGUpKSB7XG4gICAgICByZWFzb25zLnB1c2goYG1vZHVsZSAke20ua2luZH0gYXQgJHttLnh9LCR7bS55fSwke20uen0gaXMgb3V0c2lkZSB0aGUgYXV0aG9yaXplZCBlbnZlbG9wZWApO1xuICAgIH1cbiAgfVxuICBjb25zdCBtaXNtYXRjaGVzID0gc3VyZmFjZU1pc21hdGNoZXMod29ybGQsIHBsYW4uc3VyZmFjZSk7XG4gIGlmIChtaXNtYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICByZWFzb25zLnB1c2goLi4ubWlzbWF0Y2hlcy5zbGljZSgwLCA0KS5tYXAoXG4gICAgICAobSkgPT4gYGNvbHVtbiAke20ueH0sJHttLnp9IGlzIGF0ICR7bS5hY3R1YWx9LCBleHBlY3RlZCAke20uZXhwZWN0ZWR9YCxcbiAgICApKTtcbiAgfVxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcGxhbi5yZWN0KTtcbiAgaWYgKG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmb290cHJpbnQgaGFzICR7b2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zYCk7XG4gIH1cbiAgaWYgKHdvcmxkLnN0cnVjdHVyZXMuaGFzKHBsYW4uaWQpKSB7XG4gICAgcmVhc29ucy5wdXNoKGBzdHJ1Y3R1cmUgJHtwbGFuLmlkfSBhbHJlYWR5IGV4aXN0c2ApO1xuICB9XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHBsYW4uY29zdCkpIHtcbiAgICBjb25zdCBoYXZlID0gd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwO1xuICAgIGlmIChoYXZlIDwgKGFtb3VudCA/PyAwKSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBuZWVkICR7YW1vdW50fSAke3Jlc291cmNlfSwgaGF2ZSAke2hhdmV9YCk7XG4gICAgfVxuICB9XG4gIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3VuYXV0aG9yaXplZF9zdHJ1Y3R1cmUnLCByZWFzb25zKTtcblxuICBjb25zdCBpbnZlbnRvcnlCZWZvcmUgPSBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCk7XG4gIGNvbnN0IHJldmlzaW9uQmVmb3JlID0gd29ybGQucmV2aXNpb247XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHBsYW4uY29zdCkpIHtcbiAgICBjb25zdCBsZWZ0ID0gKHdvcmxkLmludmVudG9yeVtyZXNvdXJjZV0gPz8gMCkgLSAoYW1vdW50ID8/IDApO1xuICAgIGlmIChsZWZ0ID4gMCkgd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA9IGxlZnQ7XG4gICAgZWxzZSBkZWxldGUgd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXTtcbiAgfVxuXG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIGNvbnN0IHN0cnVjdHVyZTogU3RydWN0dXJlID0ge1xuICAgIGlkOiBwbGFuLmlkLFxuICAgIGtpbmQ6IHBsYW4ua2luZCxcbiAgICBzaXRlSWQ6IHBsYW4uc2l0ZUlkLFxuICAgIHg6IHBsYW4ub3JpZ2luLngsXG4gICAgeTogcGxhbi5vcmlnaW4ueSxcbiAgICB6OiBwbGFuLm9yaWdpbi56LFxuICAgIHJvdDogcGxhbi5yb3QsXG4gICAgbW9kdWxlczogcGxhbi5tb2R1bGVzLm1hcCgobSkgPT4gKHsgLi4ubSB9KSksXG4gICAgY29zdDogeyAuLi5wbGFuLmNvc3QgfSxcbiAgICBidWlsdFJldmlzaW9uOiB3b3JsZC5yZXZpc2lvbixcbiAgICAuLi4ocGxhbi5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OID8geyBkZXNpZ25WZXJzaW9uOiBGT1VOREVSX0RFU0lHTl9WRVJTSU9OIH0gOiB7fSksXG4gICAgcHJvdmlzaW9uYWw6IHRydWUsXG4gIH07XG4gIHdvcmxkLnN0cnVjdHVyZXMuc2V0KHN0cnVjdHVyZS5pZCwgc3RydWN0dXJlKTtcblxuICBjb25zdCBsZWRnZXI6IFN0cnVjdHVyZUxlZGdlciA9IHtcbiAgICBhdXRob3JpdHk6IExPQ0FMX0FVVEhPUklUWSxcbiAgICBlbmZvcmNlbWVudDogTE9DQUxfRU5GT1JDRU1FTlQsXG4gICAgYXV0aG9yaXphdGlvbklkOiBhdXRob3JpemF0aW9uLmlkLFxuICAgIHBsYW5EaWdlc3Q6IGF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCxcbiAgICBzdHJ1Y3R1cmVJZDogc3RydWN0dXJlLmlkLFxuICAgIHNpdGVJZDogcGxhbi5zaXRlSWQsXG4gICAga2luZDogcGxhbi5raW5kLFxuICAgIG1vZHVsZUNvdW50OiBzdHJ1Y3R1cmUubW9kdWxlcy5sZW5ndGgsXG4gICAgY29zdFBhaWQ6IHsgLi4ucGxhbi5jb3N0IH0sXG4gICAgaW52ZW50b3J5QmVmb3JlLFxuICAgIGludmVudG9yeUFmdGVyOiBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCksXG4gICAgcmV2aXNpb25CZWZvcmUsXG4gICAgcmV2aXNpb25BZnRlcjogd29ybGQucmV2aXNpb24sXG4gIH07XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuLCBhdXRob3JpemF0aW9uLCBsZWRnZXIgfTtcbn1cblxuLyoqXG4gKiBUaGUgc2hhcmVkIHBsYXllci9BSSBzdHJ1Y3R1cmUgZW50cnkgcG9pbnQuIFRlcnJhaW4gbXVzdCBhbHJlYWR5IGJlIHByZXBhcmVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRTdHJ1Y3R1cmUoXG4gIHdvcmxkOiBXb3JsZCxcbiAgYXV0aG9yaXplcjogTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyLFxuICBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwsXG4pOiBTdHJ1Y3R1cmVPdXRjb21lIHtcbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5TdHJ1Y3R1cmUod29ybGQsIHByb3Bvc2FsKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm4gcGxhbm5lZDtcbiAgY29uc3QgZGVjaXNpb24gPSBhdXRob3JpemVyLmF1dGhvcml6ZSh3b3JsZCwgcGxhbm5lZC5wbGFuKTtcbiAgaWYgKCFkZWNpc2lvbi5vayB8fCAhZGVjaXNpb24uYXV0aG9yaXphdGlvbikge1xuICAgIHJldHVybiBmYWlsKCdhdXRob3JpemUnLCAnbm90X2F1dGhvcml6ZWQnLCBkZWNpc2lvbi5yZWFzb25zKTtcbiAgfVxuICByZXR1cm4gZXhlY3V0ZVN0cnVjdHVyZSh3b3JsZCwgcGxhbm5lZC5wbGFuLCBkZWNpc2lvbi5hdXRob3JpemF0aW9uKTtcbn1cbiIsICIvLyBDYW5vbmljYWwgc3RhdGUgaGFzaGluZyBcdTIwMTQgcHVyZSBzaW11bGF0aW9uLCBubyB0aHJlZS5qcyBpbXBvcnRzLlxuLy9cbi8vIFRoZSBuby1mbGF0dGVuIHByb29mIGNvbXBhcmVzIHRoZSBhdXRob3JpdGF0aXZlIHZveGVsIHZvbHVtZSBvdXRzaWRlIHRoZVxuLy8gY29tcGxldGUgYXV0aG9yaXplZCB3b3JrIGVudmVsb3BlLiBJdCBkZWxpYmVyYXRlbHkgZG9lcyBub3QgaGFzaCBjaHVua1xuLy8gaGVpZ2h0cy90b3BNYXRlcmlhbHMgKGRlcml2ZWQgY2FjaGVzKSwgbWVzaCBnZW9tZXRyeSwgc3RyZWFtaW5nIHN0YXRlIG9yXG4vLyBuYXZpZ2F0aW9uIGRhdGEuIFRob3NlIGFyZSBjaGVja2VkIHNlcGFyYXRlbHkgYXMgZGVyaXZlZCBzdGF0ZSwgc28gYSBjYWNoZVxuLy8gb3IgbWVzaCByZWJ1aWxkIGNhbiBuZXZlciBiZSBtaXN0YWtlbiBmb3IgYSB0ZXJyYWluIG11dGF0aW9uLlxuaW1wb3J0IHtcbiAgV29ybGQsIFlfTUlOLCBZX01BWCwgSEFMRiwgQ0hVTktfU0laRSwgQ0hVTktfQVJFQSxcbiAgZW5zdXJlQ2h1bmssIHdvcmxkVG9DaHVua1gsIHdvcmxkVG9DaHVua1osIGNodW5rS2V5LFxuICBjaHVua09yaWdpblgsIGNodW5rT3JpZ2luWiwgbG9jYWxJbmRleCwgeVRvSW5kZXgsIGlzU29saWQsXG4gIEVudGl0eSxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBWb3hlbFJlZ2lvbiwgZW52ZWxvcGVDb250YWlucyB9IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQgeyBGT1VOREVSX0RFU0lHTl9WRVJTSU9OIH0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcblxuZXhwb3J0IGludGVyZmFjZSBTdGF0ZUhhc2gge1xuICAvKiogMTYgaGV4IGNoYXJhY3RlcnM6IHR3byBpbmRlcGVuZGVudCAzMi1iaXQgbGFuZXMuICovXG4gIGhhc2g6IHN0cmluZztcbiAgY2VsbHM6IG51bWJlcjtcbiAgZXhjbHVkZWRDZWxsczogbnVtYmVyO1xuICBjaHVua3M6IG51bWJlcjtcbiAgcmVnaW9uOiBWb3hlbFJlZ2lvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDYWNoZU1pc21hdGNoIHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIGZpZWxkOiAnaGVpZ2h0JyB8ICdtYXRlcmlhbCc7XG4gIGV4cGVjdGVkOiBudW1iZXI7XG4gIGFjdHVhbDogbnVtYmVyO1xufVxuXG5jbGFzcyBIYXNoZXIge1xuICBwcml2YXRlIGEgPSAweDgxMWM5ZGM1O1xuICBwcml2YXRlIGIgPSAweDllMzc3OWI5O1xuXG4gIGJ5dGUodjogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3QgeCA9IHYgJiAweGZmO1xuICAgIHRoaXMuYSA9IE1hdGguaW11bCh0aGlzLmEgXiB4LCAweDAxMDAwMTkzKTtcbiAgICB0aGlzLmIgPSBNYXRoLmltdWwodGhpcy5iIF4gKHggKyAweDllKSwgMHg4NWViY2E2Yik7XG4gICAgdGhpcy5iIF49IHRoaXMuYiA+Pj4gMTM7XG4gIH1cblxuICB1MzIodjogbnVtYmVyKTogdm9pZCB7XG4gICAgbGV0IG4gPSB2ID4+PiAwO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNDsgaSsrKSB7XG4gICAgICB0aGlzLmJ5dGUobik7XG4gICAgICBuID4+Pj0gODtcbiAgICB9XG4gIH1cblxuICBzdHJpbmcoczogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy51MzIocy5sZW5ndGgpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcy5sZW5ndGg7IGkrKykgdGhpcy5ieXRlKHMuY2hhckNvZGVBdChpKSk7XG4gIH1cblxuICBoZXgoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gKHRoaXMuYSA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJylcbiAgICAgICsgKHRoaXMuYiA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsYW1wUmVnaW9uKHJlZ2lvbjogVm94ZWxSZWdpb24pOiBWb3hlbFJlZ2lvbiB7XG4gIGNvbnN0IHI6IFZveGVsUmVnaW9uID0ge1xuICAgIHgwOiBNYXRoLm1heCgtSEFMRiwgTWF0aC5mbG9vcihyZWdpb24ueDApKSxcbiAgICB6MDogTWF0aC5tYXgoLUhBTEYsIE1hdGguZmxvb3IocmVnaW9uLnowKSksXG4gICAgeDE6IE1hdGgubWluKEhBTEYgLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi54MSkpLFxuICAgIHoxOiBNYXRoLm1pbihIQUxGIC0gMSwgTWF0aC5mbG9vcihyZWdpb24uejEpKSxcbiAgICB5MDogTWF0aC5tYXgoWV9NSU4sIE1hdGguZmxvb3IocmVnaW9uLnkwKSksXG4gICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgTWF0aC5mbG9vcihyZWdpb24ueTEpKSxcbiAgfTtcbiAgaWYgKHIueDAgPiByLngxIHx8IHIuejAgPiByLnoxIHx8IHIueTAgPiByLnkxKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBlbXB0eSB2b3hlbCByZWdpb24gJHtKU09OLnN0cmluZ2lmeShyZWdpb24pfWApO1xuICB9XG4gIHJldHVybiByO1xufVxuXG4vKiogU29ydCBhbiBlbnZlbG9wZSBzbyBpdHMgaGFzaCBpcyBpbmRlcGVuZGVudCBvZiByZWN0IG9yZGVyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUVudmVsb3BlKHJlY3RzOiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogVm94ZWxSZWdpb25bXSB7XG4gIHJldHVybiByZWN0c1xuICAgIC5tYXAoKHIpID0+ICh7XG4gICAgICB4MDogTWF0aC5mbG9vcihyLngwKSwgejA6IE1hdGguZmxvb3Ioci56MCksIHgxOiBNYXRoLmZsb29yKHIueDEpLCB6MTogTWF0aC5mbG9vcihyLnoxKSxcbiAgICAgIHkwOiBNYXRoLmZsb29yKHIueTApLCB5MTogTWF0aC5mbG9vcihyLnkxKSxcbiAgICB9KSlcbiAgICAuc29ydCgoYSwgYikgPT4gYS54MCAtIGIueDAgfHwgYS56MCAtIGIuejAgfHwgYS55MCAtIGIueTBcbiAgICAgIHx8IGEueDEgLSBiLngxIHx8IGEuejEgLSBiLnoxIHx8IGEueTEgLSBiLnkxKTtcbn1cblxuLyoqIE1hdGVyaWFsaXNlIGV2ZXJ5IGNodW5rIHRoYXQgb3ZlcmxhcHMgdGhlIHJlZ2lvbiBhbmQgcmV0dXJuIHNvcnRlZCBrZXlzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZDogV29ybGQsIHJlZ2lvbjogVm94ZWxSZWdpb24pOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHIgPSBjbGFtcFJlZ2lvbihyZWdpb24pO1xuICBjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBjeDAgPSB3b3JsZFRvQ2h1bmtYKHIueDApLCBjeDEgPSB3b3JsZFRvQ2h1bmtYKHIueDEpO1xuICBjb25zdCBjejAgPSB3b3JsZFRvQ2h1bmtaKHIuejApLCBjejEgPSB3b3JsZFRvQ2h1bmtaKHIuejEpO1xuICBmb3IgKGxldCBjeiA9IGN6MDsgY3ogPD0gY3oxOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjeDA7IGN4IDw9IGN4MTsgY3grKykge1xuICAgICAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgICAgIGlmICghY2h1bmspIHRocm93IG5ldyBFcnJvcihgY2h1bmsgJHtjeH0sJHtjen0gaXMgb3V0c2lkZSB0aGUgd29ybGRgKTtcbiAgICAgIGtleXMucHVzaChjaHVua0tleShjeCwgY3opKTtcbiAgICB9XG4gIH1cbiAga2V5cy5zb3J0KCk7XG4gIHJldHVybiBrZXlzO1xufVxuXG4vKipcbiAqIEhhc2ggdGhlIGF1dGhvcml0YXRpdmUgbWF0ZXJpYWwgYnl0ZSBvZiBldmVyeSB2b3hlbCBpbiBgcmVnaW9uYCwgZXhjbHVkaW5nXG4gKiBldmVyeSB2b3hlbCBpbnNpZGUgYGV4Y2x1ZGVgLiBUd28gY2FsbHMgd2l0aCB0aGUgc2FtZSByZWdpb24gYW5kIGVudmVsb3BlXG4gKiBhcmUgZGlyZWN0bHkgY29tcGFyYWJsZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbFJlZ2lvbkhhc2goXG4gIHdvcmxkOiBXb3JsZCxcbiAgcmVnaW9uOiBWb3hlbFJlZ2lvbixcbiAgZXhjbHVkZTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSA9IFtdLFxuKTogU3RhdGVIYXNoIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGVudmVsb3BlID0gbm9ybWFsaXplRW52ZWxvcGUoZXhjbHVkZSk7XG4gIGNvbnN0IGtleXMgPSBlbnN1cmVSZWdpb25DaHVua3Mod29ybGQsIHIpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjp2b3hlbC1zdGF0ZTp2MScpO1xuICBoLnUzMihyLngwKTsgaC51MzIoci56MCk7IGgudTMyKHIueDEpOyBoLnUzMihyLnoxKTsgaC51MzIoci55MCk7IGgudTMyKHIueTEpO1xuICBoLnUzMihlbnZlbG9wZS5sZW5ndGgpO1xuICBmb3IgKGNvbnN0IGUgb2YgZW52ZWxvcGUpIHtcbiAgICBoLnUzMihlLngwKTsgaC51MzIoZS56MCk7IGgudTMyKGUueDEpOyBoLnUzMihlLnoxKTsgaC51MzIoZS55MCk7IGgudTMyKGUueTEpO1xuICB9XG5cbiAgbGV0IGNlbGxzID0gMDtcbiAgbGV0IGV4Y2x1ZGVkQ2VsbHMgPSAwO1xuICBjb25zdCB5aTAgPSByLnkwIC0gWV9NSU47XG4gIGNvbnN0IHlpMSA9IHIueTEgLSBZX01JTjtcblxuICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKCFjaHVuaykgdGhyb3cgbmV3IEVycm9yKGBjaHVuayAke2tleX0gd2FzIG5vdCBnZW5lcmF0ZWRgKTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBseDAgPSBNYXRoLm1heCgwLCByLngwIC0gb3gpLCBseDEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci54MSAtIG94KTtcbiAgICBjb25zdCBsejAgPSBNYXRoLm1heCgwLCByLnowIC0gb3opLCBsejEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci56MSAtIG96KTtcbiAgICBoLnN0cmluZygnY2h1bmsnKTtcbiAgICBoLnUzMihjaHVuay5jeCk7IGgudTMyKGNodW5rLmN6KTtcbiAgICBmb3IgKGxldCB5aSA9IHlpMDsgeWkgPD0geWkxOyB5aSsrKSB7XG4gICAgICBjb25zdCB5ID0gWV9NSU4gKyB5aTtcbiAgICAgIGZvciAobGV0IGx6ID0gbHowOyBseiA8PSBsejE7IGx6KyspIHtcbiAgICAgICAgY29uc3QgeiA9IG96ICsgbHo7XG4gICAgICAgIGZvciAobGV0IGx4ID0gbHgwOyBseCA8PSBseDE7IGx4KyspIHtcbiAgICAgICAgICBjb25zdCB4ID0gb3ggKyBseDtcbiAgICAgICAgICBpZiAoZW52ZWxvcGUubGVuZ3RoID4gMCAmJiBlbnZlbG9wZUNvbnRhaW5zKGVudmVsb3BlLCB4LCB5LCB6KSkge1xuICAgICAgICAgICAgZXhjbHVkZWRDZWxscysrO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGguYnl0ZShjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlpLCBseildKTtcbiAgICAgICAgICBjZWxscysrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgaGFzaDogaC5oZXgoKSwgY2VsbHMsIGV4Y2x1ZGVkQ2VsbHMsIGNodW5rczoga2V5cy5sZW5ndGgsIHJlZ2lvbjogciB9O1xufVxuXG4vKiogQ2Fub25pY2FsIGludmVudG9yeSBoYXNoOyBrZXkgb3JkZXIgY2Fubm90IGFmZmVjdCB0aGUgcmVzdWx0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbEludmVudG9yeUhhc2god29ybGQ6IFdvcmxkKTogc3RyaW5nIHtcbiAgY29uc3QgaCA9IG5ldyBIYXNoZXIoKTtcbiAgaC5zdHJpbmcoJ20wMDI6aW52ZW50b3J5OnYxJyk7XG4gIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh3b3JsZC5pbnZlbnRvcnkpLnNvcnQoKTtcbiAgaC51MzIoa2V5cy5sZW5ndGgpO1xuICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgaC5zdHJpbmcoa2V5KTtcbiAgICBoLnUzMih3b3JsZC5pbnZlbnRvcnlba2V5XSk7XG4gIH1cbiAgcmV0dXJuIGguaGV4KCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZDogV29ybGQpOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgY29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHdvcmxkLmludmVudG9yeSkuc29ydCgpKSBvdXRba2V5XSA9IHdvcmxkLmludmVudG9yeVtrZXldO1xuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBoYXNoRW50aXR5KGg6IEhhc2hlciwgZTogRW50aXR5KTogdm9pZCB7XG4gIGguc3RyaW5nKGUuaWQpO1xuICBoLnN0cmluZyhlLmtpbmQpO1xuICBoLnN0cmluZyhlLmNodW5rKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnggKiAxMDAwKSk7XG4gIGgudTMyKE1hdGgucm91bmQoZS55ICogMTAwMCkpO1xuICBoLnUzMihNYXRoLnJvdW5kKGUueiAqIDEwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnJvdCAqIDEwMDAwKSk7XG4gIGgudTMyKE1hdGgucm91bmQoZS5zY2FsZSAqIDEwMDApKTtcbiAgaC51MzIoZS52YXJpYW50KTtcbiAgaC5zdHJpbmcoZS5yZXNvdXJjZSA/PyAnJyk7XG4gIGgudTMyKGUucmVtYWluaW5nKTtcbiAgaC51MzIoZS5oYXJ2ZXN0ZWQgPyAxIDogMCk7XG4gIGgudTMyKGUuaGFydmVzdGVkT25jZSA/IDEgOiAwKTtcbn1cblxuLyoqIEhhc2ggZW50aXR5IHN0YXRlOyB3aXRoIGEgcmVnaW9uLCBvbmx5IGVudGl0aWVzIHJvb3RlZCBpbnNpZGUgaXQuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsRW50aXR5SGFzaCh3b3JsZDogV29ybGQsIHJlZ2lvbj86IFZveGVsUmVnaW9uKTogc3RyaW5nIHtcbiAgbGV0IGVudGl0aWVzOiBFbnRpdHlbXTtcbiAgaWYgKHJlZ2lvbikge1xuICAgIGNvbnN0IHIgPSBjbGFtcFJlZ2lvbihyZWdpb24pO1xuICAgIGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gICAgZW50aXRpZXMgPSBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldLmZpbHRlcihcbiAgICAgIChlKSA9PiBlLnggPj0gci54MCAmJiBlLnggPCByLngxICsgMSAmJiBlLnogPj0gci56MCAmJiBlLnogPCByLnoxICsgMSxcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGVudGl0aWVzID0gWy4uLndvcmxkLmVudGl0aWVzLnZhbHVlcygpXTtcbiAgfVxuICBlbnRpdGllcy5zb3J0KChhLCBiKSA9PiAoYS5pZCA8IGIuaWQgPyAtMSA6IGEuaWQgPiBiLmlkID8gMSA6IDApKTtcbiAgY29uc3QgaCA9IG5ldyBIYXNoZXIoKTtcbiAgaC5zdHJpbmcoJ20wMDI6ZW50aXR5LXN0YXRlOnYxJyk7XG4gIGgudTMyKGVudGl0aWVzLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgZSBvZiBlbnRpdGllcykgaGFzaEVudGl0eShoLCBlKTtcbiAgcmV0dXJuIGguaGV4KCk7XG59XG5cbi8qKlxuICogQ2Fub25pY2FsIGhhc2ggb2YgYnVpbHQgc3RydWN0dXJlcy4gTGF5b3V0IG1vZHVsZXMgYW5kIHBhaWQgY29zdHMgYXJlXG4gKiBhdXRob3JpdGF0aXZlIHNpbXVsYXRpb24gc3RhdGU7IHJlbmRlcmVyIG1lc2hlcyBhcmUgbm90LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsU3RydWN0dXJlSGFzaCh3b3JsZDogV29ybGQpOiBzdHJpbmcge1xuICBjb25zdCBzdHJ1Y3R1cmVzID0gWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldXG4gICAgLnNvcnQoKGEsIGIpID0+IChhLmlkIDwgYi5pZCA/IC0xIDogYS5pZCA+IGIuaWQgPyAxIDogMCkpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjpzdHJ1Y3R1cmUtc3RhdGU6djEnKTtcbiAgaC51MzIoc3RydWN0dXJlcy5sZW5ndGgpO1xuICBmb3IgKGNvbnN0IHMgb2Ygc3RydWN0dXJlcykge1xuICAgIGguc3RyaW5nKHMuaWQpO1xuICAgIGguc3RyaW5nKHMua2luZCk7XG4gICAgaC5zdHJpbmcocy5zaXRlSWQpO1xuICAgIGgudTMyKE1hdGgucm91bmQocy54ICogMTAwMCkpO1xuICAgIGgudTMyKE1hdGgucm91bmQocy55ICogMTAwMCkpO1xuICAgIGgudTMyKE1hdGgucm91bmQocy56ICogMTAwMCkpO1xuICAgIGgudTMyKE1hdGgucm91bmQocy5yb3QgKiAxMDAwMCkpO1xuICAgIC8vIExlZ2FjeSBoYXNoIGlucHV0IGlzIGJ5dGUtaWRlbnRpY2FsLiBEZXNpZ24gMiBhZGRzIGFuIGV4cGxpY2l0IHRhZy5cbiAgICBpZiAocy5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OKSBoLnN0cmluZygnZGVzaWduOjInKTtcbiAgICBoLnUzMihzLm1vZHVsZXMubGVuZ3RoKTtcbiAgICBmb3IgKGNvbnN0IG0gb2Ygcy5tb2R1bGVzKSB7XG4gICAgICBoLnN0cmluZyhtLmtpbmQpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLnggKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0ueSAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS56ICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLncgKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0uaCAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS5kICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZCgobS5yb3QgPz8gMCkgKiAxMDAwMCkpO1xuICAgICAgaC5zdHJpbmcobS50b25lID8/ICcnKTtcbiAgICB9XG4gICAgY29uc3QgY29zdEtleXMgPSBPYmplY3Qua2V5cyhzLmNvc3QpLnNvcnQoKTtcbiAgICBoLnUzMihjb3N0S2V5cy5sZW5ndGgpO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIGNvc3RLZXlzKSB7XG4gICAgICBoLnN0cmluZyhrZXkpO1xuICAgICAgaC51MzIocy5jb3N0W2tleSBhcyBrZXlvZiB0eXBlb2Ygcy5jb3N0XSA/PyAwKTtcbiAgICB9XG4gICAgaC51MzIocy5idWlsdFJldmlzaW9uKTtcbiAgfVxuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDYWNoZUhhc2gge1xuICBoYXNoOiBzdHJpbmc7XG4gIGNvbHVtbnM6IG51bWJlcjtcbiAgY2h1bmtzOiBudW1iZXI7XG59XG5cbi8qKiBEZXJpdmVkIGNvbHVtbi1jYWNoZSBoYXNoLiBOb3QgYXV0aG9yaXRhdGl2ZSB0ZXJyYWluIHN0YXRlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlcml2ZWRDYWNoZUhhc2god29ybGQ6IFdvcmxkLCByZWdpb246IFZveGVsUmVnaW9uKTogQ2FjaGVIYXNoIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGtleXMgPSBlbnN1cmVSZWdpb25DaHVua3Mod29ybGQsIHIpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjpkZXJpdmVkLWNvbHVtbi1jYWNoZTp2MScpO1xuICBoLnUzMihyLngwKTsgaC51MzIoci56MCk7IGgudTMyKHIueDEpOyBoLnUzMihyLnoxKTtcbiAgbGV0IGNvbHVtbnMgPSAwO1xuICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKCFjaHVuaykgdGhyb3cgbmV3IEVycm9yKGBjaHVuayAke2tleX0gd2FzIG5vdCBnZW5lcmF0ZWRgKTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBseDAgPSBNYXRoLm1heCgwLCByLngwIC0gb3gpLCBseDEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci54MSAtIG94KTtcbiAgICBjb25zdCBsejAgPSBNYXRoLm1heCgwLCByLnowIC0gb3opLCBsejEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci56MSAtIG96KTtcbiAgICBoLnN0cmluZygnY2h1bmsnKTtcbiAgICBoLnUzMihjaHVuay5jeCk7IGgudTMyKGNodW5rLmN6KTtcbiAgICBmb3IgKGxldCBseiA9IGx6MDsgbHogPD0gbHoxOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IGx4MDsgbHggPD0gbHgxOyBseCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgICBoLnUzMihjaHVuay5oZWlnaHRzW2NvbF0pO1xuICAgICAgICBoLnUzMihjaHVuay50b3BNYXRlcmlhbHNbY29sXSk7XG4gICAgICAgIGNvbHVtbnMrKztcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHsgaGFzaDogaC5oZXgoKSwgY29sdW1ucywgY2h1bmtzOiBrZXlzLmxlbmd0aCB9O1xufVxuXG4vKipcbiAqIFJlY29tcHV0ZSBldmVyeSBjb2x1bW4gY2FjaGUgZnJvbSB0aGUgYXV0aG9yaXRhdGl2ZSB2b3hlbCBkYXRhIGFuZCByZXBvcnRcbiAqIG1pc21hdGNoZXMuIFRoaXMgcHJvdmVzIGhlaWdodHMvdG9wTWF0ZXJpYWxzIGFyZSBkZXJpdmVkLCBub3QgYSBzZWNvbmRcbiAqIHRlcnJhaW4gcmVwcmVzZW50YXRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjaGVja0Rlcml2ZWRDYWNoZXMod29ybGQ6IFdvcmxkLCByZWdpb246IFZveGVsUmVnaW9uLCBsaW1pdCA9IDY0KTogQ2FjaGVNaXNtYXRjaFtdIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGtleXMgPSBlbnN1cmVSZWdpb25DaHVua3Mod29ybGQsIHIpO1xuICBjb25zdCBvdXQ6IENhY2hlTWlzbWF0Y2hbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKCFjaHVuaykgY29udGludWU7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3QgbHgwID0gTWF0aC5tYXgoMCwgci54MCAtIG94KSwgbHgxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIueDEgLSBveCk7XG4gICAgY29uc3QgbHowID0gTWF0aC5tYXgoMCwgci56MCAtIG96KSwgbHoxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIuejEgLSBveik7XG4gICAgZm9yIChsZXQgbHogPSBsejA7IGx6IDw9IGx6MTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSBseDA7IGx4IDw9IGx4MTsgbHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgICAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gICAgICAgIGxldCB0b3BNYXQgPSBjaHVuay50b3BNYXRlcmlhbHNbY29sXTtcbiAgICAgICAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgICAgICAgY29uc3QgbSA9IGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV07XG4gICAgICAgICAgaWYgKGlzU29saWQobSkpIHsgdG9wU29saWQgPSB5OyB0b3BNYXQgPSBtOyBicmVhazsgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkSGVpZ2h0ID0gdG9wU29saWQgLSBZX01JTjtcbiAgICAgICAgaWYgKGNodW5rLmhlaWdodHNbY29sXSAhPT0gZXhwZWN0ZWRIZWlnaHQpIHtcbiAgICAgICAgICBvdXQucHVzaCh7IHg6IG94ICsgbHgsIHo6IG96ICsgbHosIGZpZWxkOiAnaGVpZ2h0JywgZXhwZWN0ZWQ6IGV4cGVjdGVkSGVpZ2h0LCBhY3R1YWw6IGNodW5rLmhlaWdodHNbY29sXSB9KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF0gIT09IHRvcE1hdCkge1xuICAgICAgICAgIG91dC5wdXNoKHsgeDogb3ggKyBseCwgejogb3ogKyBseiwgZmllbGQ6ICdtYXRlcmlhbCcsIGV4cGVjdGVkOiB0b3BNYXQsIGFjdHVhbDogY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF0gfSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG91dC5sZW5ndGggPj0gbGltaXQpIHJldHVybiBvdXQ7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRWRpdE91dHNpZGUge1xuICBjaHVuazogc3RyaW5nO1xuICBpbmRleDogbnVtYmVyO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICBtYXRlcmlhbDogbnVtYmVyO1xufVxuXG4vKiogRXZlcnkgcmVjb3JkZWQgdm94ZWwgZWRpdCBvdXRzaWRlIHRoZSBhdXRob3JpemVkIHdvcmsgZW52ZWxvcGUuICovXG5leHBvcnQgZnVuY3Rpb24gZWRpdHNPdXRzaWRlRW52ZWxvcGUod29ybGQ6IFdvcmxkLCBlbnZlbG9wZTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSk6IEVkaXRPdXRzaWRlW10ge1xuICBjb25zdCBvdXQ6IEVkaXRPdXRzaWRlW10gPSBbXTtcbiAgZm9yIChjb25zdCBba2V5LCBlZGl0c10gb2Ygd29ybGQuZWRpdHMpIHtcbiAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGN4KSwgb3ogPSBjaHVua09yaWdpblooY3opO1xuICAgIGZvciAoY29uc3QgW2luZGV4LCBtYXRlcmlhbF0gb2YgZWRpdHMpIHtcbiAgICAgIGNvbnN0IGx4ID0gaW5kZXggJSBDSFVOS19TSVpFO1xuICAgICAgY29uc3QgbHogPSBNYXRoLmZsb29yKChpbmRleCAlIENIVU5LX0FSRUEpIC8gQ0hVTktfU0laRSk7XG4gICAgICBjb25zdCB5aSA9IE1hdGguZmxvb3IoaW5kZXggLyBDSFVOS19BUkVBKTtcbiAgICAgIGNvbnN0IHggPSBveCArIGx4LCB6ID0gb3ogKyBseiwgeSA9IFlfTUlOICsgeWk7XG4gICAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMoZW52ZWxvcGUsIHgsIHksIHopKSB7XG4gICAgICAgIG91dC5wdXNoKHsgY2h1bms6IGtleSwgaW5kZXgsIHgsIHksIHosIG1hdGVyaWFsIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBvdXQuc29ydCgoYSwgYikgPT4gYS5jaHVuay5sb2NhbGVDb21wYXJlKGIuY2h1bmspIHx8IGEuaW5kZXggLSBiLmluZGV4KTtcbiAgcmV0dXJuIG91dDtcbn1cblxuLyoqIE5ldyBjaHVua3MgZ2VuZXJhdGVkIHNpbmNlIHRoZSBiYXNlbGluZSB0aGF0IGRvIG5vdCBvdmVybGFwIHRoZSBlbnZlbG9wZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBuZXdDaHVua3NPdXRzaWRlRW52ZWxvcGUoXG4gIHdvcmxkOiBXb3JsZCwgYmFzZWxpbmVLZXlzOiBJdGVyYWJsZTxzdHJpbmc+LCBlbnZlbG9wZTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSxcbik6IHN0cmluZ1tdIHtcbiAgY29uc3QgYmFzZWxpbmUgPSBuZXcgU2V0KGJhc2VsaW5lS2V5cyk7XG4gIGNvbnN0IG91dDogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBba2V5LCBjaHVua10gb2Ygd29ybGQuY2h1bmtzKSB7XG4gICAgaWYgKGJhc2VsaW5lLmhhcyhrZXkpKSBjb250aW51ZTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBvdmVybGFwcyA9IGVudmVsb3BlLnNvbWUoXG4gICAgICAocikgPT4gb3ggPD0gci54MSAmJiBveCArIENIVU5LX1NJWkUgLSAxID49IHIueDAgJiYgb3ogPD0gci56MSAmJiBveiArIENIVU5LX1NJWkUgLSAxID49IHIuejAsXG4gICAgKTtcbiAgICBpZiAoIW92ZXJsYXBzKSBvdXQucHVzaChrZXkpO1xuICB9XG4gIHJldHVybiBvdXQuc29ydCgpO1xufVxuXG4vKiogQWxsIGNodW5rIGtleXMgY3VycmVudGx5IG1hdGVyaWFsaXNlZCwgc29ydGVkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNodW5rS2V5cyh3b3JsZDogV29ybGQpOiBzdHJpbmdbXSB7XG4gIHJldHVybiBbLi4ud29ybGQuY2h1bmtzLmtleXMoKV0uc29ydCgpO1xufVxuXG4vKiogQm91bmRpbmcgdm94ZWwgcmVnaW9uIGNvdmVyaW5nIGV2ZXJ5IG1hdGVyaWFsaXNlZCBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3b3JsZENodW5rUmVnaW9uKHdvcmxkOiBXb3JsZCk6IFZveGVsUmVnaW9uIHtcbiAgaWYgKHdvcmxkLmNodW5rcy5zaXplID09PSAwKSB0aHJvdyBuZXcgRXJyb3IoJ3dvcmxkIGhhcyBubyBjaHVua3MnKTtcbiAgbGV0IG1pbkN4ID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLCBtYXhDeCA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgbGV0IG1pbkN6ID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLCBtYXhDeiA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgZm9yIChjb25zdCBjaHVuayBvZiB3b3JsZC5jaHVua3MudmFsdWVzKCkpIHtcbiAgICBtaW5DeCA9IE1hdGgubWluKG1pbkN4LCBjaHVuay5jeCk7IG1heEN4ID0gTWF0aC5tYXgobWF4Q3gsIGNodW5rLmN4KTtcbiAgICBtaW5DeiA9IE1hdGgubWluKG1pbkN6LCBjaHVuay5jeik7IG1heEN6ID0gTWF0aC5tYXgobWF4Q3osIGNodW5rLmN6KTtcbiAgfVxuICByZXR1cm4ge1xuICAgIHgwOiBjaHVua09yaWdpblgobWluQ3gpLFxuICAgIHowOiBjaHVua09yaWdpbloobWluQ3opLFxuICAgIHgxOiBjaHVua09yaWdpblgobWF4Q3gpICsgQ0hVTktfU0laRSAtIDEsXG4gICAgejE6IGNodW5rT3JpZ2luWihtYXhDeikgKyBDSFVOS19TSVpFIC0gMSxcbiAgICB5MDogWV9NSU4sXG4gICAgeTE6IFlfTUFYIC0gMSxcbiAgfTtcbn1cbiIsICIvLyBNMDAyIGRldGVybWluaXN0aWMgZml4dHVyZSBhbmQgbGl2ZS13b3JsZCBsYXlvdXQuXG4vL1xuLy8gVGhlIGZpeHR1cmUgaXMgYSBib3VuZGVkIHNsaWNlIG9mIHRoZSByZWFsIDIwNDggbSB3b3JsZCAoc2VlZCAxMzM3KSwgbm90IGFcbi8vIHN5bnRoZXRpYyBoZWlnaHRmaWVsZC4gSXQgY29udGFpbnM6XG4vLyAgICogYSByZWplY3RlZCBob3VzZSBzaXRlIG9uIGEgNyBtIHJpdmVyLWJhbmsgc2xvcGU7XG4vLyAgICogYSB2aWFibGUgaG91c2Ugc2hlbGYgMjAgbSBhd2F5IHdpdGggMiBtIHJlbGllZiBhbmQgbm8gY2xlYXJpbmcgbmVlZGVkO1xuLy8gICAqIGEgMyBtIGZhcm0gc2xvcGUgMjcgbSBmcm9tIHRoZSBob3VzZSB3aXRoIGEgbmF0dXJhbCBibG9zc29tIHRyZWUgYW5kIG9yZS5cbi8vXG4vLyBUaGUgc2FtZSBjb29yZGluYXRlcywgcXVlcmllcyBhbmQgdmFsaWRhdG9ycyBhcmUgdXNlZCBieSB0aGUgbGl2ZS13b3JsZFxuLy8gYWNjZXB0YW5jZSB0ZXN0LiBUaGUgb25seSBkaWZmZXJlbmNlIGlzIGhvdyBtYW55IGNodW5rcyBhcmUgbWF0ZXJpYWxpc2VkLlxuaW1wb3J0IHtcbiAgV29ybGQsIGNyZWF0ZVdvcmxkLCBnZW5lcmF0ZVdvcmxkLCBnZW5lcmF0ZUNodW5rLCBwbGFjZUF1dGhvcmVkU2l0ZXMsXG4gIFlfTUlOLCBZX01BWCwgY2h1bmtPcmlnaW5YLCBjaHVua09yaWdpblosXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgUmVjdCwgVm94ZWxSZWdpb24gfSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHsgY2h1bmtLZXlzIH0gZnJvbSAnLi9jYW5vbmljYWwnO1xuXG5leHBvcnQgY29uc3QgTTAwMl9TRUVEID0gMTMzNztcblxuLyoqIFBpbm5lZCBwYXRoIHNpdGUgaWQgZm9yIHRoZSBkb29yLXRvLWFwcHJvYWNoIGNvcnJpZG9yLiAqL1xuZXhwb3J0IGNvbnN0IE0wMDJfUEFUSF9TSVRFX0lEID0gJ3BhdGgtaG91c2UtZmFybSc7XG5cbi8qKlxuICogUGlubmVkIHN0ZXBwZWQgcHJvZmlsZSBmb3IgdGhlIDkgbSBwYXRoIGZyb20gdGhlIGhvdXNlIGRvb3IgKHggPSAtNTMpIHRvIHRoZVxuICogYXBwcm9hY2ggKHggPSAtNDUpLiBUaGUgcmlzZSBpcyAyIG0gb3ZlciA4IG07IGV2ZXJ5IHN0ZXAgaXMgYXQgbW9zdCAxIG0uXG4gKi9cbmV4cG9ydCBjb25zdCBNMDAyX1BBVEhfUFJPRklMRSA9IFsxMSwgMTEsIDExLCAxMiwgMTIsIDEyLCAxMiwgMTMsIDEzXSBhcyBjb25zdDtcblxuZXhwb3J0IGludGVyZmFjZSBUZXJyYWNlQmFuZFNwZWMge1xuICB6MDogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbi8qKiBQaW5uZWQgZmFybSB0ZXJyYWNlcywgaGlnaCBzaWRlIGZpcnN0LiAqL1xuZXhwb3J0IGNvbnN0IE0wMDJfVEVSUkFDRV9CQU5EUzogcmVhZG9ubHkgVGVycmFjZUJhbmRTcGVjW10gPSBbXG4gIHsgejA6IC00MiwgejE6IC00MCwgeTogMTYgfSxcbiAgeyB6MDogLTM5LCB6MTogLTM3LCB5OiAxNSB9LFxuICB7IHowOiAtMzYsIHoxOiAtMzUsIHk6IDE0IH0sXG5dO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVTcGVjIHtcbiAgaWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIGRvb3I6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgYXBwcm9hY2g6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGYXJtU3BlYyB7XG4gIGlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIHRlcnJhY2VzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMkxheW91dCB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgcmVqZWN0ZWQ6IFNpdGVTcGVjO1xuICBob3VzZTogU2l0ZVNwZWM7XG4gIGZhcm06IEZhcm1TcGVjO1xuICBzZWFyY2hBcmVhOiBSZWN0O1xuICB3b3JrWm9uZTogUmVjdDtcbiAgZml4dHVyZUNodW5rczogeyBjeDA6IG51bWJlcjsgY3owOiBudW1iZXI7IGN4MTogbnVtYmVyOyBjejE6IG51bWJlciB9O1xuICBwcm90ZWN0ZWRSZWdpb246IFZveGVsUmVnaW9uO1xuICAvKiogQ29tcGxldGUgYXV0aG9yaXplZCB3b3JrIGVudmVsb3BlIGZvciB0aGUgZmlyc3Qgc2xpY2UuICovXG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xufVxuXG5jb25zdCBGSVhUVVJFX0NIVU5LUyA9IHsgY3gwOiAyOCwgY3owOiAyOSwgY3gxOiAzMiwgY3oxOiAzMiB9IGFzIGNvbnN0O1xuXG5leHBvcnQgY29uc3QgTTAwMl9MQVlPVVQ6IE0wMDJMYXlvdXQgPSB7XG4gIHNlZWQ6IE0wMDJfU0VFRCxcbiAgcmVqZWN0ZWQ6IHtcbiAgICBpZDogJ3NpdGUtYS1yZWplY3RlZCcsXG4gICAgcmVjdDogeyB4MDogLTc0LCB6MDogLTY2LCB4MTogLTY3LCB6MTogLTYxIH0sXG4gICAgLy8gQSBuYWl2ZSBsb3ctc2lkZSBmbG9vcjogdGhlIHVwaGlsbCBjb3JuZXIgd291bGQgbmVlZCA1IG0gb2YgZXhjYXZhdGlvbi5cbiAgICBmbG9vclk6IDMsXG4gICAgZG9vcjogeyB4OiAtNjcsIHo6IC02MyB9LFxuICAgIGFwcHJvYWNoOiB7IHg6IC02MCwgejogLTYzIH0sXG4gIH0sXG4gIGhvdXNlOiB7XG4gICAgaWQ6ICdzaXRlLWItaG91c2UnLFxuICAgIHJlY3Q6IHsgeDA6IC02MCwgejA6IC00NiwgeDE6IC01MywgejE6IC00MSB9LFxuICAgIGZsb29yWTogMTEsXG4gICAgZG9vcjogeyB4OiAtNTMsIHo6IC00MyB9LFxuICAgIGFwcHJvYWNoOiB7IHg6IC00NSwgejogLTQzIH0sXG4gIH0sXG4gIGZhcm06IHtcbiAgICBpZDogJ2ZpZWxkLWMnLFxuICAgIHJlY3Q6IHsgeDA6IC0zOCwgejA6IC00MiwgeDE6IC0yNywgejE6IC0zNSB9LFxuICAgIHRlcnJhY2VzOiAzLFxuICB9LFxuICBzZWFyY2hBcmVhOiB7IHgwOiAtNzYsIHowOiAtNjgsIHgxOiAtNDAsIHoxOiAtNDAgfSxcbiAgd29ya1pvbmU6IHsgeDA6IC03NiwgejA6IC02OCwgeDE6IC0yMywgejE6IC0zMSB9LFxuICBmaXh0dXJlQ2h1bmtzOiBGSVhUVVJFX0NIVU5LUyxcbiAgcHJvdGVjdGVkUmVnaW9uOiB7XG4gICAgeDA6IGNodW5rT3JpZ2luWChGSVhUVVJFX0NIVU5LUy5jeDApLFxuICAgIHowOiBjaHVua09yaWdpblooRklYVFVSRV9DSFVOS1MuY3owKSxcbiAgICB4MTogY2h1bmtPcmlnaW5YKEZJWFRVUkVfQ0hVTktTLmN4MSkgKyAzMSxcbiAgICB6MTogY2h1bmtPcmlnaW5aKEZJWFRVUkVfQ0hVTktTLmN6MSkgKyAzMSxcbiAgICB5MDogWV9NSU4sXG4gICAgeTE6IFlfTUFYIC0gMSxcbiAgfSxcbiAgZW52ZWxvcGU6IFtcbiAgICAvLyBIb3VzZSBmb290cHJpbnQgcGx1cyBhIDIgbSBwcmVwYXJhdGlvbiBidWZmZXIuXG4gICAgeyB4MDogLTYyLCB6MDogLTQ4LCB4MTogLTUxLCB6MTogLTM5LCB5MDogOCwgeTE6IDE2IH0sXG4gICAgLy8gRG9vci10by1hcHByb2FjaCBwYXRoIGNvcnJpZG9yIHBsdXMgYSAxIG0gYnVmZmVyLlxuICAgIHsgeDA6IC01NCwgejA6IC00NCwgeDE6IC00NCwgejE6IC00MiwgeTA6IDksIHkxOiAxNSB9LFxuICAgIC8vIEZhcm0gZm9vdHByaW50IHBsdXMgYSAyIG0gcHJlcGFyYXRpb24gYnVmZmVyLlxuICAgIHsgeDA6IC00MCwgejA6IC00NCwgeDE6IC0yNSwgejE6IC0zMywgeTA6IDEwLCB5MTogMjAgfSxcbiAgXSxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMldvcmxkIHtcbiAgd29ybGQ6IFdvcmxkO1xuICBsYXlvdXQ6IE0wMDJMYXlvdXQ7XG4gIC8qKiBTb3J0ZWQgY2h1bmsga2V5cyBtYXRlcmlhbGlzZWQgYXQgZml4dHVyZSBjcmVhdGlvbi4gKi9cbiAgY2h1bmtLZXlzOiBzdHJpbmdbXTtcbn1cblxuLyoqXG4gKiBTbWFsbCBkZXRlcm1pbmlzdGljIGZpeHR1cmU6IHRoZSAyMCBjaHVua3MgY292ZXJpbmcgdGhlIHdvcmsgem9uZSBhbmQgaXRzXG4gKiBwcm90ZWN0ZWQgc3Vycm91bmRpbmdzLiBGYXN0IGVub3VnaCBmb3IgdGhlIGZ1bGwgdGVzdCBzdWl0ZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU0wMDJGaXh0dXJlKHNlZWQgPSBNMDAyX1NFRUQpOiBNMDAyV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHNlZWQpO1xuICBjb25zdCB7IGN4MCwgY3owLCBjeDEsIGN6MSB9ID0gTTAwMl9MQVlPVVQuZml4dHVyZUNodW5rcztcbiAgZm9yIChsZXQgY3ogPSBjejA7IGN6IDw9IGN6MTsgY3orKykge1xuICAgIGZvciAobGV0IGN4ID0gY3gwOyBjeCA8PSBjeDE7IGN4KyspIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIH1cbiAgcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkKTtcbiAgcmV0dXJuIHsgd29ybGQsIGxheW91dDogTTAwMl9MQVlPVVQsIGNodW5rS2V5czogY2h1bmtLZXlzKHdvcmxkKSB9O1xufVxuXG4vKipcbiAqIExpdmUtd29ybGQgaW50ZWdyYXRpb24gdGFyZ2V0OiB0aGUgc2FtZSBzZWVkIGFuZCBzaXRlcyB3aXRoIGEgOSB4IDkgY2h1bmtcbiAqIG5laWdoYm91cmhvb2QgKDgxIGNodW5rcykgYXJvdW5kIHRoZSBmb3VuZGVyIHZhbGxleS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU0wMDJMaXZlKHNlZWQgPSBNMDAyX1NFRUQsIHJhZGl1cyA9IDQpOiBNMDAyV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGdlbmVyYXRlV29ybGQoc2VlZCwgcmFkaXVzKTtcbiAgcmV0dXJuIHsgd29ybGQsIGxheW91dDogTTAwMl9MQVlPVVQsIGNodW5rS2V5czogY2h1bmtLZXlzKHdvcmxkKSB9O1xufVxuIiwgIi8vIE0wMDIgc3RhZ2UgNyBzY2VuYXJpbyB3aXJpbmc6IHRoZSBwaW5uZWQgZmlyc3Qgc2xpY2UsIHJ1biB0aHJvdWdoIHRoZSBzYW1lXG4vLyBwdWJsaWMgc2ltdWxhdGlvbiBwaXBlbGluZSB1c2VkIGJ5IHRoZSBwbGF5ZXIsIHRoZSBBSSBhbmQgdGhlIHRlc3RzLlxuLy9cbi8vIFRoZSBzY2VuYXJpbyBpcyBkZWxpYmVyYXRlbHkgcGxhaW4gZGF0YSBpbiAvIGRhdGEgb3V0LiBJdCBkb2VzIG5vdCB0b3VjaCB0aGVcbi8vIHJlbmRlcmVyLCBhbmQgZXZlcnkgdGVycmFpbiBlZGl0IHN0aWxsIGdvZXMgdGhyb3VnaCBwcmVwYXJlU2l0ZSAtPlxuLy8gTG9jYWxBdXRob3JpemVyIC0+IGV4ZWN1dGVQcmVwYXJhdGlvbi4gU3RydWN0dXJlcyBzdGlsbCBnbyB0aHJvdWdoXG4vLyBidWlsZFN0cnVjdHVyZSAtPiBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIgLT4gZXhlY3V0ZVN0cnVjdHVyZS5cbmltcG9ydCB7IE1BVCwgUmVzb3VyY2VUeXBlIH0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQge1xuICBNMDAyV29ybGQsIE0wMDJfTEFZT1VULCBNMDAyX1BBVEhfUFJPRklMRSwgTTAwMl9QQVRIX1NJVEVfSUQsXG4gIE0wMDJfVEVSUkFDRV9CQU5EUyxcbn0gZnJvbSAnLi9tMDAyJztcbmltcG9ydCB7IFJlY3QgfSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHsgSE9VU0VfUlVMRVMsIFBBVEhfUlVMRVMsIEZBUk1fUlVMRVMgfSBmcm9tICcuL2NvbnN0cnVjdGlvbic7XG5pbXBvcnQge1xuICBDb2x1bW5UYXJnZXQsIExvY2FsQXV0aG9yaXplciwgcHJlcGFyZVNpdGUsIFByZXBhcmF0aW9uTGVkZ2VyLFxufSBmcm9tICcuL3ByZXBhcmF0aW9uJztcbmltcG9ydCB7XG4gIExvY2FsU3RydWN0dXJlQXV0aG9yaXplciwgYnVpbGRTdHJ1Y3R1cmUsIFN0cnVjdHVyZUxlZGdlcixcbn0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcbmltcG9ydCB7XG4gIGNhbm9uaWNhbEVudGl0eUhhc2gsIGNhbm9uaWNhbEludmVudG9yeUhhc2gsIGNhbm9uaWNhbFJlZ2lvbkhhc2gsXG4gIGNhbm9uaWNhbFN0cnVjdHVyZUhhc2gsIGludmVudG9yeVNuYXBzaG90LFxufSBmcm9tICcuL2Nhbm9uaWNhbCc7XG5cbmV4cG9ydCBjb25zdCBNMDAyX1NUQVJURVJfSU5WRU5UT1JZOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBudW1iZXI+PiA9IHtcbiAgd29vZDogMjQsXG4gIHN0b25lOiA0OCxcbn07XG5cbi8qKiBUaGUgOSB4IDMgbSBjb3JyaWRvciBmcm9tIHRoZSBob3VzZSBkb29yIHRvIHRoZSBhcHByb2FjaC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtMDAyUGF0aFJlY3QoKTogUmVjdCB7XG4gIGNvbnN0IGRvb3IgPSBNMDAyX0xBWU9VVC5ob3VzZS5kb29yO1xuICBjb25zdCBhcHByb2FjaCA9IE0wMDJfTEFZT1VULmhvdXNlLmFwcHJvYWNoO1xuICByZXR1cm4ge1xuICAgIHgwOiBkb29yLngsXG4gICAgejA6IGRvb3IueiAtIDEsXG4gICAgeDE6IGFwcHJvYWNoLngsXG4gICAgejE6IGRvb3IueiArIDEsXG4gIH07XG59XG5cbi8qKiBPbmUgdGFyZ2V0IHBlciBwYXRoIGNvbHVtbiwgdXNpbmcgdGhlIHBpbm5lZCBzdGVwcGVkIHByb2ZpbGUuICovXG5leHBvcnQgZnVuY3Rpb24gbTAwMlBhdGhUYXJnZXRzKCk6IENvbHVtblRhcmdldFtdIHtcbiAgY29uc3QgcmVjdCA9IG0wMDJQYXRoUmVjdCgpO1xuICBjb25zdCB0YXJnZXRzOiBDb2x1bW5UYXJnZXRbXSA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IE0wMDJfUEFUSF9QUk9GSUxFLmxlbmd0aDsgaSsrKSB7XG4gICAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSB7XG4gICAgICB0YXJnZXRzLnB1c2goeyB4OiByZWN0LngwICsgaSwgeiwgeTogTTAwMl9QQVRIX1BST0ZJTEVbaV0gfSk7XG4gICAgfVxuICB9XG4gIHJldHVybiB0YXJnZXRzO1xufVxuXG4vKiogT25lIHRhcmdldCBwZXIgZmFybSBjb2x1bW4sIHVzaW5nIHRoZSBwaW5uZWQgdGVycmFjZSBiYW5kcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtMDAyRmFybVRhcmdldHMoKTogQ29sdW1uVGFyZ2V0W10ge1xuICBjb25zdCByZWN0ID0gTTAwMl9MQVlPVVQuZmFybS5yZWN0O1xuICBjb25zdCB0YXJnZXRzOiBDb2x1bW5UYXJnZXRbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGJhbmQgb2YgTTAwMl9URVJSQUNFX0JBTkRTKSB7XG4gICAgZm9yIChsZXQgeiA9IGJhbmQuejA7IHogPD0gYmFuZC56MTsgeisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHtcbiAgICAgICAgdGFyZ2V0cy5wdXNoKHsgeCwgeiwgeTogYmFuZC55IH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gdGFyZ2V0cztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNMDAyU2NlbmFyaW9PcHRpb25zIHtcbiAgLyoqIFN0YXJ0ZXIgcmVzb3VyY2VzIGJlZm9yZSB0aGUgc2xpY2UgcnVucy4gRGVmYXVsdHMgdG8gd29vZCAyNCAvIHN0b25lIDQ4LiAqL1xuICBpbnZlbnRvcnk/OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE0wMDJTY2VuYXJpb1NpdGUge1xuICBwcmVwYXJhdGlvbjogUHJlcGFyYXRpb25MZWRnZXIgfCBudWxsO1xuICBzdHJ1Y3R1cmU6IFN0cnVjdHVyZUxlZGdlciB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMlNjZW5hcmlvUmVzdWx0IHtcbiAgb2s6IGJvb2xlYW47XG4gIGVycm9yczogc3RyaW5nW107XG4gIGhvdXNlOiBNMDAyU2NlbmFyaW9TaXRlO1xuICBwYXRoOiBNMDAyU2NlbmFyaW9TaXRlO1xuICBmYXJtOiBNMDAyU2NlbmFyaW9TaXRlO1xuICBpbnZlbnRvcnlCZWZvcmU6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGludmVudG9yeUFmdGVyOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBoYXNoZXM6IHtcbiAgICB2b3hlbHM6IHN0cmluZztcbiAgICBzdHJ1Y3R1cmVzOiBzdHJpbmc7XG4gICAgaW52ZW50b3J5OiBzdHJpbmc7XG4gICAgZW50aXRpZXM6IHN0cmluZztcbiAgfTtcbn1cblxuZnVuY3Rpb24gZW1wdHlTaXRlKCk6IE0wMDJTY2VuYXJpb1NpdGUge1xuICByZXR1cm4geyBwcmVwYXJhdGlvbjogbnVsbCwgc3RydWN0dXJlOiBudWxsIH07XG59XG5cbmZ1bmN0aW9uIGRlc2NyaWJlRmFpbHVyZShyZXN1bHQ6IHsgY29kZTogc3RyaW5nOyByZWFzb25zOiBzdHJpbmdbXSB9KTogc3RyaW5nIHtcbiAgcmV0dXJuIGAke3Jlc3VsdC5jb2RlfTogJHtyZXN1bHQucmVhc29ucy5qb2luKCc7ICcpfWA7XG59XG5cbi8qKlxuICogUnVuIGhvdXNlLCBwYXRoIGFuZCB0ZXJyYWNlZCBmYXJtIGluIHRoZWlyIHBpbm5lZCBvcmRlci4gQSBmYWlsZWQgc3RlcCBpc1xuICogcmVjb3JkZWQgYW5kIGxhdGVyIGluZGVwZW5kZW50IHN0ZXBzIHN0aWxsIHJ1bjsgYSBzdHJ1Y3R1cmUgaXMgbmV2ZXIgYnVpbHRcbiAqIHVubGVzcyBpdHMgb3duIHRlcnJhaW4gcHJlcGFyYXRpb24gc3VjY2VlZGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcnVuTTAwMlNjZW5hcmlvKFxuICBtMDAyOiBNMDAyV29ybGQsIG9wdGlvbnM6IE0wMDJTY2VuYXJpb09wdGlvbnMgPSB7fSxcbik6IE0wMDJTY2VuYXJpb1Jlc3VsdCB7XG4gIGNvbnN0IHsgd29ybGQsIGxheW91dCB9ID0gbTAwMjtcbiAgY29uc3Qgc3RhcnRlciA9IG9wdGlvbnMuaW52ZW50b3J5ID8/IE0wMDJfU1RBUlRFUl9JTlZFTlRPUlk7XG4gIHdvcmxkLmludmVudG9yeSA9IHt9O1xuICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhzdGFydGVyKSkge1xuICAgIGlmICgoYW1vdW50ID8/IDApID4gMCkgd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA9IGFtb3VudCBhcyBudW1iZXI7XG4gIH1cblxuICBjb25zdCBwcmVwQXV0aG9yaXplciA9IG5ldyBMb2NhbEF1dGhvcml6ZXIoeyBlbnZlbG9wZTogbGF5b3V0LmVudmVsb3BlIH0pO1xuICBjb25zdCBzdHJ1Y3R1cmVBdXRob3JpemVyID0gbmV3IExvY2FsU3RydWN0dXJlQXV0aG9yaXplcih7IGVudmVsb3BlOiBsYXlvdXQuZW52ZWxvcGUgfSk7XG4gIGNvbnN0IGludmVudG9yeUJlZm9yZSA9IGludmVudG9yeVNuYXBzaG90KHdvcmxkKTtcbiAgY29uc3QgZXJyb3JzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBob3VzZSA9IGVtcHR5U2l0ZSgpO1xuICBjb25zdCBwYXRoID0gZW1wdHlTaXRlKCk7XG4gIGNvbnN0IGZhcm0gPSBlbXB0eVNpdGUoKTtcblxuICBjb25zdCBob3VzZVByZXAgPSBwcmVwYXJlU2l0ZSh3b3JsZCwgcHJlcEF1dGhvcml6ZXIsIHtcbiAgICBzaXRlSWQ6IGxheW91dC5ob3VzZS5pZCxcbiAgICByZWN0OiBsYXlvdXQuaG91c2UucmVjdCxcbiAgICBmbG9vclk6IGxheW91dC5ob3VzZS5mbG9vclksXG4gICAgcnVsZXM6IEhPVVNFX1JVTEVTLFxuICB9KTtcbiAgaWYgKCFob3VzZVByZXAub2spIHtcbiAgICBlcnJvcnMucHVzaChgaG91c2UgcHJlcGFyYXRpb246ICR7ZGVzY3JpYmVGYWlsdXJlKGhvdXNlUHJlcCl9YCk7XG4gIH0gZWxzZSB7XG4gICAgaG91c2UucHJlcGFyYXRpb24gPSBob3VzZVByZXAubGVkZ2VyO1xuICAgIGNvbnN0IGhvdXNlQnVpbGQgPSBidWlsZFN0cnVjdHVyZSh3b3JsZCwgc3RydWN0dXJlQXV0aG9yaXplciwge1xuICAgICAgc2l0ZUlkOiBsYXlvdXQuaG91c2UuaWQsXG4gICAgICBraW5kOiAnaG91c2UnLFxuICAgICAgcmVjdDogbGF5b3V0LmhvdXNlLnJlY3QsXG4gICAgICBmbG9vclk6IGxheW91dC5ob3VzZS5mbG9vclksXG4gICAgICBkb29yOiBsYXlvdXQuaG91c2UuZG9vcixcbiAgICB9KTtcbiAgICBpZiAoIWhvdXNlQnVpbGQub2spIHtcbiAgICAgIGVycm9ycy5wdXNoKGBob3VzZSBzdHJ1Y3R1cmU6ICR7ZGVzY3JpYmVGYWlsdXJlKGhvdXNlQnVpbGQpfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBob3VzZS5zdHJ1Y3R1cmUgPSBob3VzZUJ1aWxkLmxlZGdlcjtcbiAgICB9XG4gIH1cblxuICBjb25zdCBwYXRoUmVjdCA9IG0wMDJQYXRoUmVjdCgpO1xuICBjb25zdCBwYXRoUHJlcCA9IHByZXBhcmVTaXRlKHdvcmxkLCBwcmVwQXV0aG9yaXplciwge1xuICAgIHNpdGVJZDogTTAwMl9QQVRIX1NJVEVfSUQsXG4gICAgcmVjdDogcGF0aFJlY3QsXG4gICAgZmxvb3JZOiAxMixcbiAgICBydWxlczogUEFUSF9SVUxFUyxcbiAgfSwge1xuICAgIHRhcmdldHM6IG0wMDJQYXRoVGFyZ2V0cygpLFxuICAgIHN1cmZhY2VNYXRlcmlhbDogTUFULkdSQVZFTCxcbiAgICBlbnZlbG9wZTogW2xheW91dC5lbnZlbG9wZVsxXV0sXG4gIH0pO1xuICBpZiAoIXBhdGhQcmVwLm9rKSB7XG4gICAgZXJyb3JzLnB1c2goYHBhdGggcHJlcGFyYXRpb246ICR7ZGVzY3JpYmVGYWlsdXJlKHBhdGhQcmVwKX1gKTtcbiAgfSBlbHNlIHtcbiAgICBwYXRoLnByZXBhcmF0aW9uID0gcGF0aFByZXAubGVkZ2VyO1xuICAgIGNvbnN0IHBhdGhCdWlsZCA9IGJ1aWxkU3RydWN0dXJlKHdvcmxkLCBzdHJ1Y3R1cmVBdXRob3JpemVyLCB7XG4gICAgICBzaXRlSWQ6IE0wMDJfUEFUSF9TSVRFX0lELFxuICAgICAga2luZDogJ3BhdGgnLFxuICAgICAgcmVjdDogcGF0aFJlY3QsXG4gICAgICBmbG9vclk6IDEyLFxuICAgIH0pO1xuICAgIGlmICghcGF0aEJ1aWxkLm9rKSB7XG4gICAgICBlcnJvcnMucHVzaChgcGF0aCBzdHJ1Y3R1cmU6ICR7ZGVzY3JpYmVGYWlsdXJlKHBhdGhCdWlsZCl9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhdGguc3RydWN0dXJlID0gcGF0aEJ1aWxkLmxlZGdlcjtcbiAgICB9XG4gIH1cblxuICBjb25zdCBmYXJtUHJlcCA9IHByZXBhcmVTaXRlKHdvcmxkLCBwcmVwQXV0aG9yaXplciwge1xuICAgIHNpdGVJZDogbGF5b3V0LmZhcm0uaWQsXG4gICAgcmVjdDogbGF5b3V0LmZhcm0ucmVjdCxcbiAgICBmbG9vclk6IDE1LFxuICAgIHJ1bGVzOiBGQVJNX1JVTEVTLFxuICB9LCB7XG4gICAgdGFyZ2V0czogbTAwMkZhcm1UYXJnZXRzKCksXG4gICAgc3VyZmFjZU1hdGVyaWFsOiBNQVQuU09JTCxcbiAgICBlbnZlbG9wZTogW2xheW91dC5lbnZlbG9wZVsyXV0sXG4gIH0pO1xuICBpZiAoIWZhcm1QcmVwLm9rKSB7XG4gICAgZXJyb3JzLnB1c2goYGZhcm0gcHJlcGFyYXRpb246ICR7ZGVzY3JpYmVGYWlsdXJlKGZhcm1QcmVwKX1gKTtcbiAgfSBlbHNlIHtcbiAgICBmYXJtLnByZXBhcmF0aW9uID0gZmFybVByZXAubGVkZ2VyO1xuICAgIGNvbnN0IGZhcm1CdWlsZCA9IGJ1aWxkU3RydWN0dXJlKHdvcmxkLCBzdHJ1Y3R1cmVBdXRob3JpemVyLCB7XG4gICAgICBzaXRlSWQ6IGxheW91dC5mYXJtLmlkLFxuICAgICAga2luZDogJ3RlcnJhY2UnLFxuICAgICAgcmVjdDogbGF5b3V0LmZhcm0ucmVjdCxcbiAgICAgIGZsb29yWTogMTUsXG4gICAgICB0ZXJyYWNlczogbGF5b3V0LmZhcm0udGVycmFjZXMsXG4gICAgfSk7XG4gICAgaWYgKCFmYXJtQnVpbGQub2spIHtcbiAgICAgIGVycm9ycy5wdXNoKGBmYXJtIHN0cnVjdHVyZTogJHtkZXNjcmliZUZhaWx1cmUoZmFybUJ1aWxkKX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZmFybS5zdHJ1Y3R1cmUgPSBmYXJtQnVpbGQubGVkZ2VyO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgb2s6IGVycm9ycy5sZW5ndGggPT09IDAsXG4gICAgZXJyb3JzLFxuICAgIGhvdXNlLFxuICAgIHBhdGgsXG4gICAgZmFybSxcbiAgICBpbnZlbnRvcnlCZWZvcmUsXG4gICAgaW52ZW50b3J5QWZ0ZXI6IGludmVudG9yeVNuYXBzaG90KHdvcmxkKSxcbiAgICBoYXNoZXM6IHtcbiAgICAgIHZveGVsczogY2Fub25pY2FsUmVnaW9uSGFzaCh3b3JsZCwgbGF5b3V0LnByb3RlY3RlZFJlZ2lvbikuaGFzaCxcbiAgICAgIHN0cnVjdHVyZXM6IGNhbm9uaWNhbFN0cnVjdHVyZUhhc2god29ybGQpLFxuICAgICAgaW52ZW50b3J5OiBjYW5vbmljYWxJbnZlbnRvcnlIYXNoKHdvcmxkKSxcbiAgICAgIGVudGl0aWVzOiBjYW5vbmljYWxFbnRpdHlIYXNoKHdvcmxkLCBsYXlvdXQucHJvdGVjdGVkUmVnaW9uKSxcbiAgICB9LFxuICB9O1xufVxuXG4vKiogVG90YWwgcmVzb3VyY2VzIHBhaWQgdG8gc3RydWN0dXJlcyBpbiBhIHNjZW5hcmlvIHJlc3VsdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtMDAyU3RydWN0dXJlQ29zdHMocmVzdWx0OiBNMDAyU2NlbmFyaW9SZXN1bHQpOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+IHtcbiAgY29uc3QgdG90YWw6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4gPSB7fTtcbiAgZm9yIChjb25zdCBzaXRlIG9mIFtyZXN1bHQuaG91c2UsIHJlc3VsdC5wYXRoLCByZXN1bHQuZmFybV0pIHtcbiAgICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhzaXRlLnN0cnVjdHVyZT8uY29zdFBhaWQgPz8ge30pKSB7XG4gICAgICB0b3RhbFtyZXNvdXJjZSBhcyBSZXNvdXJjZVR5cGVdID0gKHRvdGFsW3Jlc291cmNlIGFzIFJlc291cmNlVHlwZV0gPz8gMCkgKyAoYW1vdW50ID8/IDApO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdG90YWw7XG59XG4iLCAiLy8gVmVyc2lvbmVkLCBKU09OLXNhZmUgc25hcHNob3RzIG9mIGNvbXBsZXRlIGF1dGhvcml0YXRpdmUgTTAwMiBzdGF0ZS5cbi8vIENodW5rIGJ5dGVzLCBoZWlnaHQvbWF0ZXJpYWwgY2FjaGVzLCByZW5kZXJlciBkYXRhIGFuZCB0aW1pbmcgY291bnRlcnMgYXJlXG4vLyByZWdlbmVyYXRlZCBmcm9tIHRoZSBtYW5pZmVzdCBhbmQgZHVyYWJsZSBlZGl0czsgdGhleSBhcmUgbm90IGEgc2Vjb25kIHNhdmUuXG5pbXBvcnQge1xuICBDSFVOS19TSVpFLCBDSFVOS19WT0xVTUUsIENIVU5LU19QRVJfU0lERSwgRW50aXR5LCBFbnRpdHlLaW5kLFxuICBHRU5FUkFUT1JfVkVSU0lPTiwgSEFMRiwgTWF0SWQsIFJlc291cmNlVHlwZSwgV29ybGQsIFdvcmxkTWFuaWZlc3QsXG4gIGNyZWF0ZVdvcmxkLCBwbGFjZUF1dGhvcmVkU2l0ZXMsIHdvcmxkTWFuaWZlc3QsIGVuc3VyZUNodW5rLCBpc1JldGlyZWRTdG9uZUtpbmQsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgRk9VTkRFUl9ERVNJR05fVkVSU0lPTiwgU3RydWN0dXJlIH0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcbmltcG9ydCB7XG4gIGVuYWJsZVN0b25lUmVwbGF5LCBmaW5pc2hTdG9uZVJlcGxheSwgaXNIaXN0b3JpY2FsU3RvbmVIYXNoLCBpc1N0b25lUmVwbGF5LFxufSBmcm9tICcuL3N0b25lLWNvbXBhdCc7XG5pbXBvcnQge1xuICBDQVJSSUVEX0NBUEFDSVRZLCBDUk9QX0dST1dUSF9USUNLUywgQ1JPUF9QTE9UX0lEUywgRk9VTkRFUl9TVE9DS1BJTEUsXG4gIEZPVU5ERVJfU1RPQ0tQSUxFX0lELCBMSUZFX1JFU09VUkNFUywgTUFYX1BST0RVQ1RJT05fSk9CUywgTUFYX1RJQ0tTX1BFUl9DT01NQU5ELFxuICBSRUNJUEVTLCBTVE9DS1BJTEVfQ0FQQUNJVFksIGNyZWF0ZUxpZmVTdGF0ZSxcbn0gZnJvbSAnLi9lY29ub215JztcblxuZXhwb3J0IGNvbnN0IFNOQVBTSE9UX1NDSEVNQSA9IDEgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgREVTSUdOX1NOQVBTSE9UX1NDSEVNQSA9IDIgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEgPSAzIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IE1BWF9TTkFQU0hPVF9KU09OX0JZVEVTID0gMjVfMDAwXzAwMDtcbmV4cG9ydCBjb25zdCBNQVhfU05BUFNIT1RfRURJVFMgPSAxXzAwMF8wMDA7XG5leHBvcnQgY29uc3QgTUFYX1NOQVBTSE9UX0VOVElUSUVTID0gNTAwXzAwMDtcblxuaW50ZXJmYWNlIEJhc2VXb3JsZFNuYXBzaG90IHtcbiAgc2NoZW1hOiB0eXBlb2YgU05BUFNIT1RfU0NIRU1BIHwgdHlwZW9mIERFU0lHTl9TTkFQU0hPVF9TQ0hFTUEgfCB0eXBlb2YgQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUE7XG4gIG1hbmlmZXN0OiBXb3JsZE1hbmlmZXN0O1xuICByZXZpc2lvbjogbnVtYmVyO1xuICBlZGl0czogQXJyYXk8eyBjaHVuazogc3RyaW5nOyBjZWxsczogQXJyYXk8eyBpOiBudW1iZXI7IG06IG51bWJlciB9PiB9PjtcbiAgZW50aXRpZXM6IEVudGl0eVtdO1xuICAvKiogQ2h1bmtzIHdpdGggZHVyYWJsZSBnZW5lcmF0ZWQtZW50aXR5IGNoYW5nZXM7IHB1cmUgcXVlcmllcyBhcmUgZXhjbHVkZWQuICovXG4gIGVudGl0eUNodW5rczogc3RyaW5nW107XG4gIGVudGl0eVJlbW92YWxzOiBzdHJpbmdbXTtcbiAgaW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBzdHJ1Y3R1cmVzOiBTdHJ1Y3R1cmVbXTtcbiAgYXV0aG9yZWRQbGFjZWQ6IGJvb2xlYW47XG4gIC8qKiBOZXh0IGFjY2VwdGVkIGpvdXJuYWwgc2VxdWVuY2UgYXQgdGhpcyBzbmFwc2hvdCBib3VuZGFyeS4gKi9cbiAgbmV4dFNlcXVlbmNlOiBudW1iZXI7XG59XG5leHBvcnQgdHlwZSBXb3JsZFNuYXBzaG90ID0gQmFzZVdvcmxkU25hcHNob3QgJiAoe1xuICBzY2hlbWE6IHR5cGVvZiBTTkFQU0hPVF9TQ0hFTUEgfCB0eXBlb2YgREVTSUdOX1NOQVBTSE9UX1NDSEVNQTtcbn0gfCB7XG4gIHNjaGVtYTogdHlwZW9mIENVUlJFTlRfU05BUFNIT1RfU0NIRU1BO1xuICB0aWNrOiBudW1iZXI7XG4gIHN0b2NrcGlsZXM6IEFycmF5PHtcbiAgICBpZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEOyB4OiBudW1iZXI7IHo6IG51bWJlcjtcbiAgICBjYXBhY2l0eTogdHlwZW9mIFNUT0NLUElMRV9DQVBBQ0lUWTsgaW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICB9PjtcbiAgam9iczogQXJyYXk8e1xuICAgIGlkOiBzdHJpbmc7IHN0b2NrcGlsZUlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7XG4gICAgcmVjaXBlOiAnc2VlZCcgfCAncmF0aW9ucyc7IHJlbWFpbmluZ1RpY2tzOiBudW1iZXI7XG4gIH0+O1xuICBjcm9wczogQXJyYXk8eyBpZDogc3RyaW5nOyBwbGFudGVkVGljazogbnVtYmVyOyBncm93dGhUaWNrczogdHlwZW9mIENST1BfR1JPV1RIX1RJQ0tTIH0+O1xufSk7XG50eXBlIExpZmVTbmFwc2hvdCA9IEV4dHJhY3Q8V29ybGRTbmFwc2hvdCwgeyBzY2hlbWE6IHR5cGVvZiBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSB9PjtcblxuZnVuY3Rpb24gY2xvbmVFbnRpdHkoZTogRW50aXR5KTogRW50aXR5IHtcbiAgcmV0dXJuIHtcbiAgICBpZDogZS5pZCwga2luZDogZS5raW5kLCBjaHVuazogZS5jaHVuaywgeDogZS54LCB5OiBlLnksIHo6IGUueixcbiAgICByb3Q6IGUucm90LCBzY2FsZTogZS5zY2FsZSwgdmFyaWFudDogZS52YXJpYW50LCByZXNvdXJjZTogZS5yZXNvdXJjZSxcbiAgICByZW1haW5pbmc6IGUucmVtYWluaW5nLCB5aWVsZFBlckhhcnZlc3Q6IGUueWllbGRQZXJIYXJ2ZXN0LCBoYXJ2ZXN0ZWQ6IGUuaGFydmVzdGVkLFxuICAgIC4uLihlLmhhcnZlc3RlZE9uY2UgPT09IHVuZGVmaW5lZCA/IHt9IDogeyBoYXJ2ZXN0ZWRPbmNlOiBlLmhhcnZlc3RlZE9uY2UgfSksXG4gICAgcHJvdmlzaW9uYWw6IGUucHJvdmlzaW9uYWwsIGF1dGhvcmVkOiBlLmF1dGhvcmVkLFxuICB9O1xufVxuXG5mdW5jdGlvbiBjbG9uZVN0cnVjdHVyZShzOiBTdHJ1Y3R1cmUpOiBTdHJ1Y3R1cmUge1xuICByZXR1cm4ge1xuICAgIC4uLnMsXG4gICAgbW9kdWxlczogcy5tb2R1bGVzLm1hcCgobSkgPT4gKHsgLi4ubSB9KSksXG4gICAgY29zdDogT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5lbnRyaWVzKHMuY29zdCkuZmlsdGVyKChbLCBhbW91bnRdKSA9PiAoYW1vdW50ID8/IDApID4gMClcbiAgICAgIC5zb3J0KChbYV0sIFtiXSkgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVXb3JsZFNuYXBzaG90KFxuICB3b3JsZDogV29ybGQsIG5leHRTZXF1ZW5jZSA9IDAsXG4gIHNjaGVtYTogV29ybGRTbmFwc2hvdFsnc2NoZW1hJ10gPSB3b3JsZC5saWZlID8gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUFcbiAgICA6IFsuLi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXS5zb21lKChzKSA9PiBzLmRlc2lnblZlcnNpb24gPT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pXG4gICAgICA/IERFU0lHTl9TTkFQU0hPVF9TQ0hFTUEgOiBTTkFQU0hPVF9TQ0hFTUEsXG4pOiBXb3JsZFNuYXBzaG90IHtcbiAgaWYgKHNjaGVtYSAhPT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEgJiYgKHdvcmxkLmxpZmUgfHwgWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldLnNvbWUoXG4gICAgKHMpID0+IHNjaGVtYSA9PT0gU05BUFNIT1RfU0NIRU1BICYmIHMuZGVzaWduVmVyc2lvbiAhPT0gdW5kZWZpbmVkLFxuICApKSkgdGhyb3cgbmV3IEVycm9yKCdsZWdhY3kgc25hcHNob3RzIGNhbm5vdCBjb250YWluIG5ld2VyIGF1dGhvcml0YXRpdmUgc3RhdGUnKTtcbiAgY29uc3QgYmFzZTogQmFzZVdvcmxkU25hcHNob3QgPSB7XG4gICAgc2NoZW1hLFxuICAgIG1hbmlmZXN0OiB3b3JsZE1hbmlmZXN0KHdvcmxkKSxcbiAgICByZXZpc2lvbjogd29ybGQucmV2aXNpb24sXG4gICAgZWRpdHM6IFsuLi53b3JsZC5lZGl0cy5lbnRyaWVzKCldLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpLm1hcChcbiAgICAgIChbY2h1bmssIGNlbGxzXSkgPT4gKHtcbiAgICAgICAgY2h1bmssXG4gICAgICAgIGNlbGxzOiBbLi4uY2VsbHMuZW50cmllcygpXS5zb3J0KChbYV0sIFtiXSkgPT4gYSAtIGIpLm1hcCgoW2ksIG1dKSA9PiAoeyBpLCBtIH0pKSxcbiAgICAgIH0pLFxuICAgICksXG4gICAgZW50aXRpZXM6IFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0uZmlsdGVyKChlKSA9PiAoaXNIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkKSB8fCAhaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkpXG4gICAgICAmJiAoZS5hdXRob3JlZCB8fCB3b3JsZC5lbnRpdHlDaGFuZ2VzLmhhcyhlLmNodW5rKSkpXG4gICAgICAuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKS5tYXAoY2xvbmVFbnRpdHkpLFxuICAgIGVudGl0eUNodW5rczogWy4uLndvcmxkLmVudGl0eUNoYW5nZXNdLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSksXG4gICAgZW50aXR5UmVtb3ZhbHM6IFsuLi53b3JsZC5lbnRpdHlSZW1vdmFsc10uc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSxcbiAgICBpbnZlbnRvcnk6IE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyh3b3JsZC5pbnZlbnRvcnkpLmZpbHRlcigoWywgYW1vdW50XSkgPT4gYW1vdW50ID4gMClcbiAgICAgIC5zb3J0KChbYV0sIFtiXSkgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSksXG4gICAgc3RydWN0dXJlczogWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkubWFwKGNsb25lU3RydWN0dXJlKSxcbiAgICBhdXRob3JlZFBsYWNlZDogd29ybGQuYXV0aG9yZWRQbGFjZWQsXG4gICAgbmV4dFNlcXVlbmNlLFxuICB9O1xuICBpZiAoc2NoZW1hICE9PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSkgcmV0dXJuIHsgLi4uYmFzZSwgc2NoZW1hIH0gYXMgV29ybGRTbmFwc2hvdDtcbiAgaWYgKCF3b3JsZC5saWZlKSB0aHJvdyBuZXcgRXJyb3IoJ3NjaGVtYS0zIHNuYXBzaG90IHJlcXVpcmVzIGxpZmUgc3RhdGUnKTtcbiAgcmV0dXJuIHtcbiAgICAuLi5iYXNlLCBzY2hlbWEsXG4gICAgdGljazogd29ybGQubGlmZS50aWNrLFxuICAgIHN0b2NrcGlsZXM6IFsuLi53b3JsZC5saWZlLnN0b2NrcGlsZXMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkubWFwKChzKSA9PiAoe1xuICAgICAgaWQ6IHMuaWQsIHg6IHMueCwgejogcy56LCBjYXBhY2l0eTogcy5jYXBhY2l0eSxcbiAgICAgIGludmVudG9yeTogT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5lbnRyaWVzKHMuaW52ZW50b3J5KS5maWx0ZXIoKFssIGFtb3VudF0pID0+IGFtb3VudCA+IDApXG4gICAgICAgIC5zb3J0KChbYV0sIFtiXSkgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSksXG4gICAgfSkpLFxuICAgIGpvYnM6IFsuLi53b3JsZC5saWZlLmpvYnMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkubWFwKChqKSA9PiAoeyAuLi5qIH0pKSxcbiAgICBjcm9wczogWy4uLndvcmxkLmxpZmUuY3JvcHMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkubWFwKChjKSA9PiAoeyAuLi5jIH0pKSxcbiAgfTtcbn1cblxuLyoqIFR3byBsYW5lcywgd2l0aCBsZW5ndGggaW5jbHVkZWQ7IG5vdCBhIGNyeXB0b2dyYXBoaWMgaW50ZWdyaXR5IHNpZ25hdHVyZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxIYXNoKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBhID0gMHg4MTFjOWRjNSwgYiA9IDB4OWUzNzc5Yjk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGMgPSB0ZXh0LmNoYXJDb2RlQXQoaSk7XG4gICAgYSA9IE1hdGguaW11bChhIF4gYywgMHgwMTAwMDE5Myk7XG4gICAgYiA9IE1hdGguaW11bChiIF4gKGMgKyAweDllKSwgMHg4NWViY2E2Yik7XG4gICAgYiBePSBiID4+PiAxMztcbiAgfVxuICByZXR1cm4gKGEgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpICsgKGIgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsV29ybGRIYXNoKFxuICB3b3JsZDogV29ybGQsIG5leHRTZXF1ZW5jZSA9IDAsIHNjaGVtYTogV29ybGRTbmFwc2hvdFsnc2NoZW1hJ10gPSBERVNJR05fU05BUFNIT1RfU0NIRU1BLFxuKTogc3RyaW5nIHtcbiAgcmV0dXJuIGNhbm9uaWNhbEhhc2goSlNPTi5zdHJpbmdpZnkoY3JlYXRlV29ybGRTbmFwc2hvdCh3b3JsZCwgbmV4dFNlcXVlbmNlLCBzY2hlbWEpKSk7XG59XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIHVpbnQodmFsdWU6IHVua25vd24sIG1heGltdW06IG51bWJlcik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIE51bWJlci5pc1NhZmVJbnRlZ2VyKHZhbHVlKSAmJiB2YWx1ZSA+PSAwICYmIHZhbHVlIDw9IG1heGltdW07XG59XG5cbmZ1bmN0aW9uIGZpbml0ZSh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZSh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIHRleHQodmFsdWU6IHVua25vd24sIG1heGltdW0gPSAyNTYpOiB2YWx1ZSBpcyBzdHJpbmcge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiB2YWx1ZS5sZW5ndGggPiAwICYmIHZhbHVlLmxlbmd0aCA8PSBtYXhpbXVtO1xufVxuXG5mdW5jdGlvbiB2YWxpZENodW5rKGtleTogdW5rbm93bik6IGtleSBpcyBzdHJpbmcge1xuICBpZiAodHlwZW9mIGtleSAhPT0gJ3N0cmluZycgfHwgIS9eLT9cXGQrLC0/XFxkKyQvLnRlc3Qoa2V5KSkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICByZXR1cm4gTnVtYmVyLmlzSW50ZWdlcihjeCkgJiYgTnVtYmVyLmlzSW50ZWdlcihjeilcbiAgICAmJiBjeCA+PSAwICYmIGN6ID49IDAgJiYgY3ggPCBDSFVOS1NfUEVSX1NJREUgJiYgY3ogPCBDSFVOS1NfUEVSX1NJREU7XG59XG5cbi8qKiBBIHN0cmljdCBsZWdhY3kgc25hcHNob3QgaXMgYWxyZWFkeSBjYW5vbmljYWwgY3JlYXRlV29ybGRTbmFwc2hvdCBvdXRwdXQuXG4gKiBWZXJpZnkgaXRzIHJlY29yZGVkIGJvdW5kYXJ5IGJlZm9yZSBmaWx0ZXJpbmcgdGhlIHRocmVlIHJldGlyZWQgc3RvbmUgZm9ybXMuICovXG5leHBvcnQgZnVuY3Rpb24gbGVnYWN5U3RvbmVIYXNoKHNuYXBzaG90OiBXb3JsZFNuYXBzaG90KTogc3RyaW5nIHtcbiAgcmV0dXJuIGNhbm9uaWNhbEhhc2goSlNPTi5zdHJpbmdpZnkoc25hcHNob3QpKTtcbn1cblxuLyoqIE1pZ3JhdGlvbiBvbmx5OiBubyBpbnZlbnRvcnksIHN0cnVjdHVyZSwgbGlmZSwgZWRpdCBvciBjb21tYW5kIGRhdGEgY2hhbmdlcy4gKi9cbi8qKiBAaW50ZXJuYWwgUmV0aXJlIG9ubHkgYWZ0ZXIgcmVjb25zdHJ1Y3RpbmcgdGhlIG9sZCBzdGF0ZSBpbiByZXBsYXkgbW9kZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtaWdyYXRlU3RvbmVTbmFwc2hvdChzbmFwc2hvdDogV29ybGRTbmFwc2hvdCk6IFdvcmxkU25hcHNob3Qge1xuICBjb25zdCByZW1vdmFscyA9IG5ldyBTZXQoc25hcHNob3QuZW50aXR5UmVtb3ZhbHMpO1xuICBmb3IgKGNvbnN0IGVudGl0eSBvZiBzbmFwc2hvdC5lbnRpdGllcykge1xuICAgIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpICYmICFlbnRpdHkuYXV0aG9yZWQpIHJlbW92YWxzLmFkZChlbnRpdHkuaWQpO1xuICB9XG4gIGNvbnN0IGVudGl0eUNodW5rcyA9IG5ldyBTZXQoc25hcHNob3QuZW50aXR5Q2h1bmtzKTtcbiAgZm9yIChjb25zdCBlbnRpdHkgb2Ygc25hcHNob3QuZW50aXRpZXMpIHtcbiAgICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSkge1xuICAgICAgZW50aXR5Q2h1bmtzLmFkZChlbnRpdHkuY2h1bmspO1xuICAgICAgaWYgKCFlbnRpdHkuYXV0aG9yZWQpIHJlbW92YWxzLmFkZChlbnRpdHkuaWQpO1xuICAgIH1cbiAgfVxuICByZXR1cm4ge1xuICAgIC4uLnNuYXBzaG90LFxuICAgIGVudGl0aWVzOiBzbmFwc2hvdC5lbnRpdGllcy5maWx0ZXIoKGVudGl0eSkgPT4gIWlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpLFxuICAgIGVudGl0eUNodW5rczogWy4uLmVudGl0eUNodW5rc10uc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSxcbiAgICBlbnRpdHlSZW1vdmFsczogWy4uLnJlbW92YWxzXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpLFxuICB9O1xufVxuY29uc3QgRU5USVRZX0tJTkRTID0gbmV3IFNldDxFbnRpdHlLaW5kPihbXG4gICdzdHlsX3RyZWVfc3BpcmUnLCAnc3R5bF90cmVlX3RhYmxlJywgJ3N0eWxfdHJlZV9jbHVzdGVyJywgJ3N0eWxfdHJlZV9ibG9zc29tJyxcbiAgJ3N0eWxfc2hydWInLCAnc3R5bF9yb2NrX3NtYWxsJywgJ3N0eWxfcm9ja19tZWRpdW0nLCAnc3R5bF9yb2NrX2xhcmdlJyxcbiAgJ3N0eWxfb3JlJywgJ3N0eWxfY2Fpcm4nLCAnd2F5c3RvbmUnLCAnbWFya2VyJyxcbl0pO1xuY29uc3QgUkVTT1VSQ0VTID0gbmV3IFNldDxSZXNvdXJjZVR5cGU+KFsnd29vZCcsICdzdG9uZScsICdvcmUnLCAnZmliZXInXSk7XG5jb25zdCBSRUNPUkRfUkVTT1VSQ0VTID0gbmV3IFNldDxzdHJpbmc+KExJRkVfUkVTT1VSQ0VTKTtcbmNvbnN0IFNUUlVDVFVSRV9LSU5EUyA9IG5ldyBTZXQoWydob3VzZScsICdwYXRoJywgJ3RlcnJhY2UnXSk7XG5jb25zdCBNT0RVTEVfS0lORFMgPSBuZXcgU2V0KFtcbiAgJ2Zsb29yJywgJ3dhbGwnLCAncG9zdCcsICdsaW50ZWwnLCAncm9vZicsICdwYXJhcGV0JywgJ3dpbmRvdycsICdkb29yJyxcbiAgJ3RocmVzaG9sZCcsICdwYXRoJywgJ2N1cmInLCAnc29pbF9iZWQnLCAncmV0YWluaW5nX3dhbGwnLCAnY3JvcF9yb3cnLFxuXSk7XG5jb25zdCBNT0RVTEVfVE9ORVMgPSBuZXcgU2V0KFsnc3RvbmUnLCAnc3RvbmVfYicsICdvY2hyZScsICd0aW1iZXInLCAnYWNjZW50JywgJ3NvaWwnLCAnY3JvcCcsICdncmF2ZWwnXSk7XG5cbmZ1bmN0aW9uIHZhbGlkYXRlRW50aXR5KHZhbHVlOiB1bmtub3duLCBpZHM6IFNldDxzdHJpbmc+KTogRW50aXR5IHtcbiAgaWYgKCFpc09iamVjdCh2YWx1ZSkgfHwgIXRleHQodmFsdWUuaWQpIHx8IGlkcy5oYXModmFsdWUuaWQpXG4gICAgfHwgIXRleHQodmFsdWUua2luZCkgfHwgIUVOVElUWV9LSU5EUy5oYXModmFsdWUua2luZCBhcyBFbnRpdHlLaW5kKVxuICAgIHx8ICF2YWxpZENodW5rKHZhbHVlLmNodW5rKVxuICAgIHx8ICFmaW5pdGUodmFsdWUueCkgfHwgIWZpbml0ZSh2YWx1ZS55KSB8fCAhZmluaXRlKHZhbHVlLnopXG4gICAgfHwgdmFsdWUueCA8IC1IQUxGIHx8IHZhbHVlLnggPj0gSEFMRiB8fCB2YWx1ZS56IDwgLUhBTEYgfHwgdmFsdWUueiA+PSBIQUxGXG4gICAgfHwgIWZpbml0ZSh2YWx1ZS5yb3QpIHx8ICFmaW5pdGUodmFsdWUuc2NhbGUpIHx8ICF1aW50KHZhbHVlLnZhcmlhbnQsIDEwMDApXG4gICAgfHwgdmFsdWUucmVzb3VyY2UgIT09IG51bGwgJiYgISh0eXBlb2YgdmFsdWUucmVzb3VyY2UgPT09ICdzdHJpbmcnICYmIFJFU09VUkNFUy5oYXModmFsdWUucmVzb3VyY2UgYXMgUmVzb3VyY2VUeXBlKSlcbiAgICB8fCAhdWludCh2YWx1ZS5yZW1haW5pbmcsIDFfMDAwXzAwMCkgfHwgIXVpbnQodmFsdWUueWllbGRQZXJIYXJ2ZXN0LCAxXzAwMF8wMDApXG4gICAgfHwgdHlwZW9mIHZhbHVlLmhhcnZlc3RlZCAhPT0gJ2Jvb2xlYW4nIHx8IHR5cGVvZiB2YWx1ZS5wcm92aXNpb25hbCAhPT0gJ2Jvb2xlYW4nXG4gICAgfHwgdHlwZW9mIHZhbHVlLmF1dGhvcmVkICE9PSAnYm9vbGVhbidcbiAgICB8fCB2YWx1ZS5oYXJ2ZXN0ZWRPbmNlICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIHZhbHVlLmhhcnZlc3RlZE9uY2UgIT09ICdib29sZWFuJykge1xuICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgY29udGFpbnMgYW4gaW52YWxpZCBvciBkdXBsaWNhdGUgZW50aXR5Jyk7XG4gIH1cbiAgaWRzLmFkZCh2YWx1ZS5pZCk7XG4gIHJldHVybiB7XG4gICAgaWQ6IHZhbHVlLmlkLCBraW5kOiB2YWx1ZS5raW5kIGFzIEVudGl0eUtpbmQsIGNodW5rOiB2YWx1ZS5jaHVuayxcbiAgICB4OiB2YWx1ZS54LCB5OiB2YWx1ZS55LCB6OiB2YWx1ZS56LCByb3Q6IHZhbHVlLnJvdCwgc2NhbGU6IHZhbHVlLnNjYWxlLFxuICAgIHZhcmlhbnQ6IHZhbHVlLnZhcmlhbnQsIHJlc291cmNlOiB2YWx1ZS5yZXNvdXJjZSBhcyBSZXNvdXJjZVR5cGUgfCBudWxsLFxuICAgIHJlbWFpbmluZzogdmFsdWUucmVtYWluaW5nLCB5aWVsZFBlckhhcnZlc3Q6IHZhbHVlLnlpZWxkUGVySGFydmVzdCxcbiAgICBoYXJ2ZXN0ZWQ6IHZhbHVlLmhhcnZlc3RlZCxcbiAgICAuLi4odmFsdWUuaGFydmVzdGVkT25jZSA9PT0gdW5kZWZpbmVkID8ge30gOiB7IGhhcnZlc3RlZE9uY2U6IHZhbHVlLmhhcnZlc3RlZE9uY2UgfSksXG4gICAgcHJvdmlzaW9uYWw6IHZhbHVlLnByb3Zpc2lvbmFsLCBhdXRob3JlZDogdmFsdWUuYXV0aG9yZWQsXG4gIH07XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlSW52ZW50b3J5KHZhbHVlOiB1bmtub3duKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gIGlmICghaXNPYmplY3QodmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGludmVudG9yeSBpcyBpbnZhbGlkJyk7XG4gIGNvbnN0IG91dDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyh2YWx1ZSkuc29ydCgpKSB7XG4gICAgaWYgKCFSRUNPUkRfUkVTT1VSQ0VTLmhhcyhrZXkpIHx8ICF1aW50KHZhbHVlW2tleV0sIDFfMDAwXzAwMF8wMDApKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYHNuYXBzaG90IGhhcyBpbnZhbGlkIGludmVudG9yeSByZXNvdXJjZSAke2tleX1gKTtcbiAgICB9XG4gICAgaWYgKHZhbHVlW2tleV0gPiAwKSBvdXRba2V5XSA9IHZhbHVlW2tleV07XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gc3RvY2tUb3RhbCh2YWx1ZTogUmVjb3JkPHN0cmluZywgbnVtYmVyPik6IG51bWJlciB7XG4gIHJldHVybiBPYmplY3QudmFsdWVzKHZhbHVlKS5yZWR1Y2UoKHN1bSwgYW1vdW50KSA9PiBzdW0gKyBhbW91bnQsIDApO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUxpZmVGaWVsZHModmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogUGljazxMaWZlU25hcHNob3QsICd0aWNrJyB8ICdzdG9ja3BpbGVzJyB8ICdqb2JzJyB8ICdjcm9wcyc+IHtcbiAgaWYgKCF1aW50KHZhbHVlLnRpY2ssIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKVxuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLnN0b2NrcGlsZXMpIHx8IHZhbHVlLnN0b2NrcGlsZXMubGVuZ3RoICE9PSAxXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuam9icykgfHwgdmFsdWUuam9icy5sZW5ndGggPiBNQVhfUFJPRFVDVElPTl9KT0JTXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuY3JvcHMpIHx8IHZhbHVlLmNyb3BzLmxlbmd0aCA+IENST1BfUExPVF9JRFMubGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgaW52YWxpZCBsaWZlLWxvb3AgZmllbGRzJyk7XG4gIH1cbiAgY29uc3Qgc3RvY2twaWxlczogTm9uTnVsbGFibGU8TGlmZVNuYXBzaG90WydzdG9ja3BpbGVzJ10+ID0gW107XG4gIGZvciAoY29uc3QgcmF3IG9mIHZhbHVlLnN0b2NrcGlsZXMpIHtcbiAgICBpZiAoIWlzT2JqZWN0KHJhdykgfHwgcmF3LmlkICE9PSBGT1VOREVSX1NUT0NLUElMRV9JRCB8fCByYXcueCAhPT0gRk9VTkRFUl9TVE9DS1BJTEUueFxuICAgICAgfHwgcmF3LnogIT09IEZPVU5ERVJfU1RPQ0tQSUxFLnogfHwgcmF3LmNhcGFjaXR5ICE9PSBGT1VOREVSX1NUT0NLUElMRS5jYXBhY2l0eSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgYW4gdW5zdXBwb3J0ZWQgc3RvY2twaWxlJyk7XG4gICAgfVxuICAgIGNvbnN0IGludmVudG9yeSA9IHZhbGlkYXRlSW52ZW50b3J5KHJhdy5pbnZlbnRvcnkpO1xuICAgIGlmIChzdG9ja1RvdGFsKGludmVudG9yeSkgPiBTVE9DS1BJTEVfQ0FQQUNJVFkpIHRocm93IG5ldyBFcnJvcignc3RvY2twaWxlIGV4Y2VlZHMgY2FwYWNpdHknKTtcbiAgICBzdG9ja3BpbGVzLnB1c2goeyBpZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHg6IHJhdy54LCB6OiByYXcueixcbiAgICAgIGNhcGFjaXR5OiBTVE9DS1BJTEVfQ0FQQUNJVFksIGludmVudG9yeSB9KTtcbiAgfVxuICBsZXQgcmVzZXJ2ZWQgPSBzdG9ja1RvdGFsKHN0b2NrcGlsZXNbMF0uaW52ZW50b3J5KTtcbiAgY29uc3QgaWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IGpvYnM6IE5vbk51bGxhYmxlPExpZmVTbmFwc2hvdFsnam9icyddPiA9IFtdO1xuICBmb3IgKGNvbnN0IHJhdyBvZiB2YWx1ZS5qb2JzKSB7XG4gICAgaWYgKCFpc09iamVjdChyYXcpIHx8ICF0ZXh0KHJhdy5pZCwgMTI4KSB8fCAhL15bQS1aYS16MC05XVtBLVphLXowLTkuXzolLV0qJC8udGVzdChyYXcuaWQpXG4gICAgICB8fCBpZHMuaGFzKHJhdy5pZCkgfHwgcmF3LnN0b2NrcGlsZUlkICE9PSBGT1VOREVSX1NUT0NLUElMRV9JRFxuICAgICAgfHwgcmF3LnJlY2lwZSAhPT0gJ3NlZWQnICYmIHJhdy5yZWNpcGUgIT09ICdyYXRpb25zJ1xuICAgICAgfHwgIXVpbnQocmF3LnJlbWFpbmluZ1RpY2tzLCBNQVhfVElDS1NfUEVSX0NPTU1BTkQpIHx8IHJhdy5yZW1haW5pbmdUaWNrcyA8IDFcbiAgICAgIHx8IHJhdy5yZW1haW5pbmdUaWNrcyA+IFJFQ0lQRVNbcmF3LnJlY2lwZV0udGlja3MpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaGFzIGFuIGludmFsaWQgcHJvZHVjdGlvbiBqb2InKTtcbiAgICByZXNlcnZlZCArPSBzdG9ja1RvdGFsKFJFQ0lQRVNbcmF3LnJlY2lwZV0ub3V0cHV0IGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4pO1xuICAgIGlkcy5hZGQocmF3LmlkKTtcbiAgICBqb2JzLnB1c2goeyBpZDogcmF3LmlkLCBzdG9ja3BpbGVJZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHJlY2lwZTogcmF3LnJlY2lwZSwgcmVtYWluaW5nVGlja3M6IHJhdy5yZW1haW5pbmdUaWNrcyB9KTtcbiAgfVxuICBpZiAocmVzZXJ2ZWQgPiBTVE9DS1BJTEVfQ0FQQUNJVFkpIHRocm93IG5ldyBFcnJvcignc3RvY2twaWxlIHJlc2VydmVkIG91dHB1dCBleGNlZWRzIGNhcGFjaXR5Jyk7XG4gIGlkcy5jbGVhcigpO1xuICBjb25zdCBjcm9wczogTm9uTnVsbGFibGU8TGlmZVNuYXBzaG90Wydjcm9wcyddPiA9IFtdO1xuICBmb3IgKGNvbnN0IHJhdyBvZiB2YWx1ZS5jcm9wcykge1xuICAgIGlmICghaXNPYmplY3QocmF3KSB8fCAhQ1JPUF9QTE9UX0lEUy5pbmNsdWRlcyhTdHJpbmcocmF3LmlkKSkgfHwgaWRzLmhhcyhTdHJpbmcocmF3LmlkKSlcbiAgICAgIHx8ICF1aW50KHJhdy5wbGFudGVkVGljaywgdmFsdWUudGljaykgfHwgcmF3Lmdyb3d0aFRpY2tzICE9PSBDUk9QX0dST1dUSF9USUNLUykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgYW4gaW52YWxpZCBjcm9wIHBsb3QnKTtcbiAgICB9XG4gICAgY29uc3QgcGxvdElkID0gU3RyaW5nKHJhdy5pZCk7XG4gICAgaWRzLmFkZChwbG90SWQpO1xuICAgIGNyb3BzLnB1c2goeyBpZDogcGxvdElkLCBwbGFudGVkVGljazogcmF3LnBsYW50ZWRUaWNrLCBncm93dGhUaWNrczogQ1JPUF9HUk9XVEhfVElDS1MgfSk7XG4gIH1cbiAgc3RvY2twaWxlcy5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpO1xuICBqb2JzLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG4gIGNyb3BzLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG4gIHJldHVybiB7IHRpY2s6IHZhbHVlLnRpY2ssIHN0b2NrcGlsZXMsIGpvYnMsIGNyb3BzIH07XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ29zdCh2YWx1ZTogdW5rbm93bik6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4ge1xuICBjb25zdCBvdXQgPSB2YWxpZGF0ZUludmVudG9yeSh2YWx1ZSk7XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlU3RydWN0dXJlKFxuICB2YWx1ZTogdW5rbm93biwgaWRzOiBTZXQ8c3RyaW5nPiwgc2NoZW1hOiBXb3JsZFNuYXBzaG90WydzY2hlbWEnXSxcbik6IFN0cnVjdHVyZSB7XG4gIGlmICghaXNPYmplY3QodmFsdWUpIHx8ICF0ZXh0KHZhbHVlLmlkKSB8fCBpZHMuaGFzKHZhbHVlLmlkKVxuICAgIHx8ICF0ZXh0KHZhbHVlLmtpbmQpIHx8ICFTVFJVQ1RVUkVfS0lORFMuaGFzKHZhbHVlLmtpbmQpXG4gICAgfHwgIXRleHQodmFsdWUuc2l0ZUlkKVxuICAgIHx8ICFmaW5pdGUodmFsdWUueCkgfHwgIWZpbml0ZSh2YWx1ZS55KSB8fCAhZmluaXRlKHZhbHVlLnopIHx8ICFmaW5pdGUodmFsdWUucm90KVxuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLm1vZHVsZXMpIHx8IHZhbHVlLm1vZHVsZXMubGVuZ3RoID4gNjRcbiAgICB8fCAhdWludCh2YWx1ZS5idWlsdFJldmlzaW9uLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikgfHwgdmFsdWUucHJvdmlzaW9uYWwgIT09IHRydWVcbiAgICB8fCBzY2hlbWEgPT09IFNOQVBTSE9UX1NDSEVNQSAmJiB2YWx1ZS5kZXNpZ25WZXJzaW9uICE9PSB1bmRlZmluZWRcbiAgICB8fCBzY2hlbWEgIT09IFNOQVBTSE9UX1NDSEVNQSAmJiB2YWx1ZS5kZXNpZ25WZXJzaW9uICE9PSB1bmRlZmluZWRcbiAgICAgICYmIHZhbHVlLmRlc2lnblZlcnNpb24gIT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGNvbnRhaW5zIGFuIGludmFsaWQgb3IgZHVwbGljYXRlIHN0cnVjdHVyZScpO1xuICB9XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZVsnbW9kdWxlcyddID0gW107XG4gIGNvbnN0IG1vZHVsZUlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHJhdyBvZiB2YWx1ZS5tb2R1bGVzKSB7XG4gICAgaWYgKCFpc09iamVjdChyYXcpIHx8ICF0ZXh0KHJhdy5raW5kKSB8fCAhTU9EVUxFX0tJTkRTLmhhcyhyYXcua2luZClcbiAgICAgIHx8ICFmaW5pdGUocmF3LngpIHx8ICFmaW5pdGUocmF3LnkpIHx8ICFmaW5pdGUocmF3LnopXG4gICAgICB8fCAhZmluaXRlKHJhdy53KSB8fCByYXcudyA8PSAwIHx8ICFmaW5pdGUocmF3LmgpIHx8IHJhdy5oIDw9IDAgfHwgIWZpbml0ZShyYXcuZCkgfHwgcmF3LmQgPD0gMFxuICAgICAgfHwgcmF3LnJvdCAhPT0gdW5kZWZpbmVkICYmICFmaW5pdGUocmF3LnJvdClcbiAgICAgIHx8IHJhdy50b25lICE9PSB1bmRlZmluZWQgJiYgKHR5cGVvZiByYXcudG9uZSAhPT0gJ3N0cmluZycgfHwgIU1PRFVMRV9UT05FUy5oYXMocmF3LnRvbmUpKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBzdHJ1Y3R1cmUgJHt2YWx1ZS5pZH0gY29udGFpbnMgYW4gaW52YWxpZCBtb2R1bGVgKTtcbiAgICB9XG4gICAgY29uc3Qgc2lnbmF0dXJlID0gSlNPTi5zdHJpbmdpZnkocmF3KTtcbiAgICBpZiAobW9kdWxlSWRzLmhhcyhzaWduYXR1cmUpKSB0aHJvdyBuZXcgRXJyb3IoYHN0cnVjdHVyZSAke3ZhbHVlLmlkfSBjb250YWlucyBkdXBsaWNhdGUgbW9kdWxlc2ApO1xuICAgIG1vZHVsZUlkcy5hZGQoc2lnbmF0dXJlKTtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogcmF3LmtpbmQgYXMgU3RydWN0dXJlWydtb2R1bGVzJ11bbnVtYmVyXVsna2luZCddLFxuICAgICAgeDogcmF3LngsIHk6IHJhdy55LCB6OiByYXcueiwgdzogcmF3LncsIGg6IHJhdy5oLCBkOiByYXcuZCxcbiAgICAgIC4uLihyYXcucm90ID09PSB1bmRlZmluZWQgPyB7fSA6IHsgcm90OiByYXcucm90IH0pLFxuICAgICAgLi4uKHJhdy50b25lID09PSB1bmRlZmluZWQgPyB7fSA6IHsgdG9uZTogcmF3LnRvbmUgYXMgU3RydWN0dXJlWydtb2R1bGVzJ11bbnVtYmVyXVsndG9uZSddIH0pLFxuICAgIH0pO1xuICB9XG4gIGlkcy5hZGQodmFsdWUuaWQpO1xuICByZXR1cm4ge1xuICAgIGlkOiB2YWx1ZS5pZCwga2luZDogdmFsdWUua2luZCBhcyBTdHJ1Y3R1cmVbJ2tpbmQnXSwgc2l0ZUlkOiB2YWx1ZS5zaXRlSWQsXG4gICAgeDogdmFsdWUueCwgeTogdmFsdWUueSwgejogdmFsdWUueiwgcm90OiB2YWx1ZS5yb3QsXG4gICAgbW9kdWxlcywgY29zdDogdmFsaWRhdGVDb3N0KHZhbHVlLmNvc3QpLCBidWlsdFJldmlzaW9uOiB2YWx1ZS5idWlsdFJldmlzaW9uLFxuICAgIC4uLih2YWx1ZS5kZXNpZ25WZXJzaW9uID09PSB1bmRlZmluZWQgPyB7fSA6IHsgZGVzaWduVmVyc2lvbjogRk9VTkRFUl9ERVNJR05fVkVSU0lPTiB9KSxcbiAgICBwcm92aXNpb25hbDogdHJ1ZSxcbiAgfTtcbn1cblxuLyoqIFN0cmljdCBydW50aW1lIHZhbGlkYXRpb247IEpTT04ncyBUeXBlU2NyaXB0IGNhc3RzIGFyZSBuZXZlciB0cnVzdGVkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlV29ybGRTbmFwc2hvdCh2YWx1ZTogdW5rbm93bik6IFdvcmxkU25hcHNob3Qge1xuICBpZiAoIWlzT2JqZWN0KHZhbHVlKVxuICAgIHx8IHZhbHVlLnNjaGVtYSAhPT0gU05BUFNIT1RfU0NIRU1BICYmIHZhbHVlLnNjaGVtYSAhPT0gREVTSUdOX1NOQVBTSE9UX1NDSEVNQVxuICAgICYmIHZhbHVlLnNjaGVtYSAhPT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUFcbiAgICB8fCAhaXNPYmplY3QodmFsdWUubWFuaWZlc3QpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBvciBtYWxmb3JtZWQgd29ybGQgc25hcHNob3QnKTtcbiAgfVxuICBjb25zdCBzY2hlbWEgPSB2YWx1ZS5zY2hlbWE7XG4gIGNvbnN0IG0gPSB2YWx1ZS5tYW5pZmVzdDtcbiAgY29uc3QgcGFyYW1zID0ge1xuICAgIHNpemU6IDIwNDgsIGNodW5rU2l6ZTogQ0hVTktfU0laRSwgeU1pbjogLTE2LCB5TWF4OiAxMTIsXG4gICAgc2VhTGV2ZWw6IDAsIGdlbmVyYXRvclZlcnNpb246IEdFTkVSQVRPUl9WRVJTSU9OLFxuICB9O1xuICBpZiAobS5zY2hlbWEgIT09IDEgfHwgIXVpbnQobS5zZWVkLCAweGZmZmZmZmZmKVxuICAgIHx8IG0uZ2VuZXJhdG9yVmVyc2lvbiAhPT0gcGFyYW1zLmdlbmVyYXRvclZlcnNpb25cbiAgICB8fCBtLnNpemUgIT09IHBhcmFtcy5zaXplIHx8IG0uY2h1bmtTaXplICE9PSBwYXJhbXMuY2h1bmtTaXplXG4gICAgfHwgbS55TWluICE9PSBwYXJhbXMueU1pbiB8fCBtLnlNYXggIT09IHBhcmFtcy55TWF4IHx8IG0uc2VhTGV2ZWwgIT09IHBhcmFtcy5zZWFMZXZlbFxuICAgIHx8ICEvXlswLTlhLWZdezh9JC8udGVzdChTdHJpbmcobS5wYXJhbXNIYXNoKSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGdlbmVyYXRvciBjb25maWd1cmF0aW9uIGlzIHVuc3VwcG9ydGVkIG9yIGluY29tcGF0aWJsZScpO1xuICB9XG4gIGlmICghdWludCh2YWx1ZS5yZXZpc2lvbiwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpXG4gICAgfHwgIXVpbnQodmFsdWUubmV4dFNlcXVlbmNlLCAxMF8wMDBfMDAwKVxuICAgIHx8IHR5cGVvZiB2YWx1ZS5hdXRob3JlZFBsYWNlZCAhPT0gJ2Jvb2xlYW4nXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuZWRpdHMpIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVudGl0aWVzKVxuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVudGl0eVJlbW92YWxzKVxuICAgIHx8IHZhbHVlLmVudGl0aWVzLmxlbmd0aCA+IE1BWF9TTkFQU0hPVF9FTlRJVElFU1xuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVudGl0eUNodW5rcykgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuc3RydWN0dXJlcykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhcyBpbnZhbGlkIGF1dGhvcml0YXRpdmUtc3RhdGUgZmllbGRzJyk7XG4gIH1cbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChtLnNlZWQpO1xuICAvLyBUaGUgbWFuaWZlc3QgaGFzaCBpcyBjaGVja2VkIGFnYWluc3QgdGhlIGFjdHVhbCByZXN0b3JlZCBjb25maWd1cmF0aW9uLlxuICBpZiAod29ybGRNYW5pZmVzdCh3b3JsZCkucGFyYW1zSGFzaCAhPT0gbS5wYXJhbXNIYXNoKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IG1hbmlmZXN0IGhhc2ggbWlzbWF0Y2gnKTtcblxuICBjb25zdCBlZGl0czogV29ybGRTbmFwc2hvdFsnZWRpdHMnXSA9IFtdO1xuICBsZXQgZWRpdENvdW50ID0gMDtcbiAgY29uc3QgY2h1bmtJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCByYXcgb2YgdmFsdWUuZWRpdHMpIHtcbiAgICBpZiAoIWlzT2JqZWN0KHJhdykgfHwgIXZhbGlkQ2h1bmsocmF3LmNodW5rKSB8fCBjaHVua0lkcy5oYXMocmF3LmNodW5rKVxuICAgICAgfHwgIUFycmF5LmlzQXJyYXkocmF3LmNlbGxzKSB8fCByYXcuY2VsbHMubGVuZ3RoID4gQ0hVTktfVk9MVU1FKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGNvbnRhaW5zIGludmFsaWQgY2h1bmsgZWRpdHMnKTtcbiAgICB9XG4gICAgY29uc3QgY2VsbElkcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICAgIGNvbnN0IGNlbGxzOiBBcnJheTx7IGk6IG51bWJlcjsgbTogbnVtYmVyIH0+ID0gW107XG4gICAgZm9yIChjb25zdCBjZWxsIG9mIHJhdy5jZWxscykge1xuICAgICAgaWYgKCFpc09iamVjdChjZWxsKSB8fCAhdWludChjZWxsLmksIENIVU5LX1ZPTFVNRSAtIDEpIHx8IGNlbGxJZHMuaGFzKGNlbGwuaSlcbiAgICAgICAgfHwgIXVpbnQoY2VsbC5tLCA5KSkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBjb250YWlucyBhbiBpbnZhbGlkIHZveGVsIGVkaXQnKTtcbiAgICAgIGNlbGxJZHMuYWRkKGNlbGwuaSk7XG4gICAgICBjZWxscy5wdXNoKHsgaTogY2VsbC5pLCBtOiBjZWxsLm0gfSk7XG4gICAgfVxuICAgIGNlbGxJZHMuY2xlYXIoKTtcbiAgICBjZWxscy5zb3J0KChhLCBiKSA9PiBhLmkgLSBiLmkpO1xuICAgIGVkaXRDb3VudCArPSBjZWxscy5sZW5ndGg7XG4gICAgaWYgKGVkaXRDb3VudCA+IE1BWF9TTkFQU0hPVF9FRElUUykgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBleGNlZWRzIHRoZSBib3VuZGVkIGVkaXQgbGltaXQnKTtcbiAgICBjaHVua0lkcy5hZGQocmF3LmNodW5rKTtcbiAgICBlZGl0cy5wdXNoKHsgY2h1bms6IHJhdy5jaHVuaywgY2VsbHMgfSk7XG4gIH1cbiAgZWRpdHMuc29ydCgoYSwgYikgPT4gYS5jaHVuay5sb2NhbGVDb21wYXJlKGIuY2h1bmspKTtcblxuICBjb25zdCBlbnRpdHlJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3QgZW50aXRpZXMgPSB2YWx1ZS5lbnRpdGllcy5tYXAoKGUpID0+IHZhbGlkYXRlRW50aXR5KGUsIGVudGl0eUlkcykpO1xuICBjb25zdCBlbnRpdHlDaHVua3M6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGdlbmVyYXRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IGtleSBvZiB2YWx1ZS5lbnRpdHlDaHVua3MpIHtcbiAgICBpZiAoIXZhbGlkQ2h1bmsoa2V5KSB8fCBnZW5lcmF0ZWQuaGFzKGtleSkpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgZ2VuZXJhdGVkLWNodW5rIGluZGV4IGlzIGludmFsaWQnKTtcbiAgICBnZW5lcmF0ZWQuYWRkKGtleSk7XG4gICAgZW50aXR5Q2h1bmtzLnB1c2goa2V5KTtcbiAgfVxuICBmb3IgKGNvbnN0IGVudGl0eSBvZiBlbnRpdGllcykge1xuICAgIGlmICghZW50aXR5LmF1dGhvcmVkICYmICFnZW5lcmF0ZWQuaGFzKGVudGl0eS5jaHVuaykpIHRocm93IG5ldyBFcnJvcihgZW50aXR5ICR7ZW50aXR5LmlkfSBiZWxvbmdzIHRvIGFuIHVubWFya2VkIGNodW5rYCk7XG4gIH1cbiAgZW50aXR5Q2h1bmtzLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG4gIGNvbnN0IHJlbW92YWxzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgaWQgb2YgdmFsdWUuZW50aXR5UmVtb3ZhbHMpIHtcbiAgICBpZiAoIXRleHQoaWQpIHx8IHJlbW92YWxzLmhhcyhpZCkgfHwgZW50aXR5SWRzLmhhcyhpZCkgfHwgIS9eZTpcXGQrLFxcZCs6XFxkKyQvLnRlc3QoaWQpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGVudGl0eSB0b21ic3RvbmUgaXMgaW52YWxpZCcpO1xuICAgIH1cbiAgICByZW1vdmFscy5hZGQoaWQpO1xuICB9XG4gIGNvbnN0IGVudGl0eVJlbW92YWxzID0gWy4uLnJlbW92YWxzXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuXG4gIGNvbnN0IHN0cnVjdHVyZUlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb25zdCBzdHJ1Y3R1cmVzID0gdmFsdWUuc3RydWN0dXJlcy5tYXAoKHMpID0+IHZhbGlkYXRlU3RydWN0dXJlKHMsIHN0cnVjdHVyZUlkcywgc2NoZW1hKSlcbiAgICAuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKTtcbiAgY29uc3QgY2FycmllZCA9IHZhbGlkYXRlSW52ZW50b3J5KHZhbHVlLmludmVudG9yeSk7XG4gIGlmIChzY2hlbWEgPT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BICYmIHN0b2NrVG90YWwoY2FycmllZCkgPiBDQVJSSUVEX0NBUEFDSVRZKSB0aHJvdyBuZXcgRXJyb3IoJ2NhcnJpZWQgaW52ZW50b3J5IGV4Y2VlZHMgY2FwYWNpdHknKTtcbiAgY29uc3Qgc25hcHNob3Q6IEJhc2VXb3JsZFNuYXBzaG90ID0ge1xuICAgIHNjaGVtYSxcbiAgICBtYW5pZmVzdDoge1xuICAgICAgc2NoZW1hOiAxLCBzZWVkOiBtLnNlZWQsIGdlbmVyYXRvclZlcnNpb246IHBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLFxuICAgICAgc2l6ZTogcGFyYW1zLnNpemUsIGNodW5rU2l6ZTogcGFyYW1zLmNodW5rU2l6ZSwgeU1pbjogcGFyYW1zLnlNaW4sXG4gICAgICB5TWF4OiBwYXJhbXMueU1heCwgc2VhTGV2ZWw6IHBhcmFtcy5zZWFMZXZlbCwgcGFyYW1zSGFzaDogbS5wYXJhbXNIYXNoLFxuICAgIH0sXG4gICAgcmV2aXNpb246IHZhbHVlLnJldmlzaW9uLFxuICAgIGVkaXRzLFxuICAgIGVudGl0aWVzLFxuICAgIGVudGl0eUNodW5rcyxcbiAgICBlbnRpdHlSZW1vdmFscyxcbiAgICBpbnZlbnRvcnk6IGNhcnJpZWQsXG4gICAgc3RydWN0dXJlcyxcbiAgICBhdXRob3JlZFBsYWNlZDogdmFsdWUuYXV0aG9yZWRQbGFjZWQsXG4gICAgbmV4dFNlcXVlbmNlOiB2YWx1ZS5uZXh0U2VxdWVuY2UsXG4gIH07XG4gIGNvbnN0IHJlc3VsdDogV29ybGRTbmFwc2hvdCA9IHNjaGVtYSA9PT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUFcbiAgICA/IHsgLi4uc25hcHNob3QsIHNjaGVtYTogQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEsIC4uLnZhbGlkYXRlTGlmZUZpZWxkcyh2YWx1ZSkgfVxuICAgIDogeyAuLi5zbmFwc2hvdCwgc2NoZW1hOiBzY2hlbWEgYXMgdHlwZW9mIFNOQVBTSE9UX1NDSEVNQSB8IHR5cGVvZiBERVNJR05fU05BUFNIT1RfU0NIRU1BIH07XG4gIGlmIChKU09OLnN0cmluZ2lmeShyZXN1bHQpICE9PSBKU09OLnN0cmluZ2lmeSh2YWx1ZSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGNvbnRhaW5zIHVua25vd24sIG5vbi1jYW5vbmljYWwgb3IgYW1iaWd1b3VzIGZpZWxkcycpO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVXb3JsZFNuYXBzaG90KGpzb246IHN0cmluZyk6IFdvcmxkU25hcHNob3Qge1xuICBpZiAoanNvbi5sZW5ndGggPiBNQVhfU05BUFNIT1RfSlNPTl9CWVRFUykgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBleGNlZWRzIHRoZSBKU09OIHNpemUgbGltaXQnKTtcbiAgcmV0dXJuIHZhbGlkYXRlV29ybGRTbmFwc2hvdChKU09OLnBhcnNlKGpzb24pKTtcbn1cblxuLyoqIFJlc3RvcmUgaW4gcGxhY2Ugc28gY29udHJvbGxlcnMgcmV0YWluIHRoZSBzYW1lIFdvcmxkIHJlZmVyZW5jZS4gQWxsXG4gKiB2YWxpZGF0aW9uIGhhcHBlbnMgYmVmb3JlIG11dGF0aW9uLCBzbyBhIHJlamVjdGVkIHNhdmUgY2Fubm90IGVyYXNlIHdvcmsuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzdG9yZVdvcmxkU25hcHNob3Qod29ybGQ6IFdvcmxkLCBpbnB1dDogV29ybGRTbmFwc2hvdCk6IHZvaWQge1xuICAvLyBPcmRpbmFyeSBzbmFwc2hvdHMgYW5kIHRyYW5zYWN0aW9uYWwgcm9sbGJhY2tzIHJlc3RvcmUgdGhlaXIgZXhhY3QgcmVjb3JkZWRcbiAgLy8gc3RhdGUuIFJldGlyZWQgaGlzdG9yaWNhbCBlbnRpdGllcyBhcmUgcmVtb3ZlZCBvbmx5IGFmdGVyIEdhbWVTZXNzaW9uIGhhc1xuICAvLyBhdXRoZW50aWNhdGVkIHRoZSBvcmlnaW5hbCBqb3VybmFsIGFuZCBleHBsaWNpdGx5IG1pZ3JhdGVkIHRoYXQgc2F2ZS5cbiAgZmluaXNoU3RvbmVSZXBsYXkod29ybGQpO1xuICByZXN0b3JlV29ybGRTbmFwc2hvdEV4YWN0KHdvcmxkLCBpbnB1dCk7XG59XG5cbi8qKiBAaW50ZXJuYWwgSGlzdG9yaWNhbCByZWNvbnN0cnVjdGlvbiBvciBleGFjdCBuZXctc25hcHNob3QgcmVzdG9yYXRpb24uICovXG5leHBvcnQgZnVuY3Rpb24gcmVzdG9yZVdvcmxkU25hcHNob3RFeGFjdCh3b3JsZDogV29ybGQsIGlucHV0OiBXb3JsZFNuYXBzaG90KTogdm9pZCB7XG4gIGNvbnN0IHNuYXBzaG90ID0gdmFsaWRhdGVXb3JsZFNuYXBzaG90KGlucHV0KTtcbiAgaWYgKHNuYXBzaG90Lm1hbmlmZXN0LnNlZWQgIT09IHdvcmxkLnNlZWQpIHRocm93IG5ldyBFcnJvcignc25hcHNob3Qgc2VlZCBkb2VzIG5vdCBtYXRjaCB0aGUgd29ybGQnKTtcbiAgd29ybGQucGFyYW1zID0ge1xuICAgIHNpemU6IHNuYXBzaG90Lm1hbmlmZXN0LnNpemUsXG4gICAgY2h1bmtTaXplOiBzbmFwc2hvdC5tYW5pZmVzdC5jaHVua1NpemUsXG4gICAgeU1pbjogc25hcHNob3QubWFuaWZlc3QueU1pbixcbiAgICB5TWF4OiBzbmFwc2hvdC5tYW5pZmVzdC55TWF4LFxuICAgIHNlYUxldmVsOiBzbmFwc2hvdC5tYW5pZmVzdC5zZWFMZXZlbCxcbiAgICBnZW5lcmF0b3JWZXJzaW9uOiBzbmFwc2hvdC5tYW5pZmVzdC5nZW5lcmF0b3JWZXJzaW9uLFxuICB9O1xuICB3b3JsZC5jaHVua3MuY2xlYXIoKTtcbiAgd29ybGQuZW50aXRpZXMuY2xlYXIoKTtcbiAgd29ybGQuZW50aXR5Q2h1bmtzLmNsZWFyKCk7XG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuY2xlYXIoKTtcbiAgd29ybGQuZW50aXR5UmVtb3ZhbHMuY2xlYXIoKTtcbiAgd29ybGQuc3RydWN0dXJlcy5jbGVhcigpO1xuICB3b3JsZC5lZGl0cy5jbGVhcigpO1xuICB3b3JsZC5pbnZlbnRvcnkgPSB7IC4uLnNuYXBzaG90LmludmVudG9yeSB9O1xuICB3b3JsZC5saWZlID0gc25hcHNob3Quc2NoZW1hID09PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSA/IGNyZWF0ZUxpZmVTdGF0ZSgpIDogdW5kZWZpbmVkO1xuICBpZiAod29ybGQubGlmZSAmJiBzbmFwc2hvdC5zY2hlbWEgPT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BKSB7XG4gICAgd29ybGQubGlmZS50aWNrID0gc25hcHNob3QudGljaztcbiAgICBmb3IgKGNvbnN0IHMgb2Ygc25hcHNob3Quc3RvY2twaWxlcykgd29ybGQubGlmZS5zdG9ja3BpbGVzLnNldChzLmlkLCB7IC4uLnMsIGludmVudG9yeTogeyAuLi5zLmludmVudG9yeSB9IH0pO1xuICAgIGZvciAoY29uc3QgaiBvZiBzbmFwc2hvdC5qb2JzKSB3b3JsZC5saWZlLmpvYnMuc2V0KGouaWQsIHsgLi4uaiB9KTtcbiAgICBmb3IgKGNvbnN0IGMgb2Ygc25hcHNob3QuY3JvcHMpIHdvcmxkLmxpZmUuY3JvcHMuc2V0KGMuaWQsIHsgLi4uYyB9KTtcbiAgfVxuICB3b3JsZC5kaXJ0eS5jbGVhcigpO1xuICB3b3JsZC5zaXRlcyA9IFtdO1xuICB3b3JsZC5zdGF0cyA9IHtcbiAgICBjaHVua3NHZW5lcmF0ZWQ6IDAsIGNodW5rc0V2aWN0ZWQ6IDAsIHZveGVsc0ZpbGxlZDogMCwgZ2VuZXJhdGlvbk1zOiAwLFxuICAgIGVudGl0aWVzOiBzbmFwc2hvdC5lbnRpdGllcy5sZW5ndGgsIHRyZWVzOiAwLCBwaW5rVHJlZXM6IDAsIHBpbmtPdmVyZmxvdzogMCxcbiAgfTtcbiAgd29ybGQucmV2aXNpb24gPSBzbmFwc2hvdC5yZXZpc2lvbjtcbiAgd29ybGQuYXV0aG9yZWRQbGFjZWQgPSBzbmFwc2hvdC5hdXRob3JlZFBsYWNlZDtcbiAgZm9yIChjb25zdCBrZXkgb2Ygc25hcHNob3QuZW50aXR5Q2h1bmtzKSB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChrZXkpO1xuICAvLyBBcHBseSBkdXJhYmxlIHZveGVsIGVkaXRzIGJlZm9yZSBhbnkgYXV0aG9yZWQtc2l0ZSBxdWVyeSBjYW4gZ2VuZXJhdGUgYVxuICAvLyBjaHVuay4gT3RoZXJ3aXNlIHRob3NlIGNodW5rcyBjYWNoZSB0aGUgdW5lZGl0ZWQgYmFzZSB0ZXJyYWluIHBlcm1hbmVudGx5LlxuICBmb3IgKGNvbnN0IGRlbHRhIG9mIHNuYXBzaG90LmVkaXRzKSB7XG4gICAgd29ybGQuZWRpdHMuc2V0KGRlbHRhLmNodW5rLCBuZXcgTWFwKGRlbHRhLmNlbGxzLm1hcCgoZSkgPT4gW2UuaSwgZS5tIGFzIE1hdElkXSkpKTtcbiAgfVxuICAvLyBSZWNyZWF0ZSBhdXRob3JlZCBzaXRlIHJlY29yZHMuIFN1cHByZXNzIHRoZWlyIGVudGl0eSBwbGFjZW1lbnQgc28gdGhlXG4gIC8vIGV4YWN0IHNhdmVkIGVudGl0eSByZWNvcmRzIGJlbG93IGNhbm5vdCBiZSBhZmZlY3RlZCBieSBhIG1vZGlmaWVkIGNodW5rLlxuICBpZiAod29ybGQuYXV0aG9yZWRQbGFjZWQpIHtcbiAgICB3b3JsZC5hdXRob3JlZFBsYWNlZCA9IGZhbHNlO1xuICAgIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZCk7XG4gICAgd29ybGQuYXV0aG9yZWRQbGFjZWQgPSB0cnVlO1xuICB9XG4gIC8vIEF1dGhvcmVkIHBsYWNlbWVudCBkZXJpdmVzIHNpdGUvZW50aXR5IHNjYWZmb2xkaW5nIGFuZCBtYXkgYWR2YW5jZSB0aGVcbiAgLy8gcmV2aXNpb24uIFRoZSBzYXZlZCByZXZpc2lvbiBpcyByZXN0b3JlZCBvbmx5IGFmdGVyIHRoYXQgZGVyaXZlZCB3b3JrLlxuICB3b3JsZC5yZXZpc2lvbiA9IHNuYXBzaG90LnJldmlzaW9uO1xuICAvLyBUb21ic3RvbmVzIG11c3QgZXhpc3QgYmVmb3JlIGFueSBjaGFuZ2VkIGNodW5rIHJlZ2VuZXJhdGVzIGl0cyBlbnRpdGllcy5cbiAgZm9yIChjb25zdCBpZCBvZiBzbmFwc2hvdC5lbnRpdHlSZW1vdmFscykgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGlkKTtcbiAgLy8gUmVwbGFjZSBnZW5lcmF0ZWQgZW50aXRpZXMgd2l0aCB0aGUgZXhhY3Qgc2F2ZWQgcmVjb3JkcywgaW5jbHVkaW5nXG4gIC8vIGhhcnZlc3RlZC9yZW1vdmVkIG9uZXMuXG4gIHdvcmxkLmVudGl0aWVzLmNsZWFyKCk7XG4gIHdvcmxkLmVudGl0eUNodW5rcy5jbGVhcigpO1xuICAvLyBJbnN0YWxsIHBlcnNpc3RlZCBlbnRpdHkgZGVsdGFzIGRpcmVjdGx5LiBUaGlzIGlzIHJlY29uc3RydWN0aW9uLCBub3QgYVxuICAvLyBjb21tYW5kOiByZW1vdmVFbnRpdHkgd291bGQgY3JlYXRlIGZyZXNoIHRvbWJzdG9uZXMgYW5kIGFkdmFuY2UgcmV2aXNpb24uXG4gIGZvciAoY29uc3Qga2V5IG9mIHNuYXBzaG90LmVudGl0eUNodW5rcykge1xuICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYHNuYXBzaG90IHJlZmVyZW5jZXMgdW5hdmFpbGFibGUgY2h1bmsgJHtrZXl9YCk7XG4gICAgY29uc3Qgc2F2ZWQgPSBuZXcgU2V0KHNuYXBzaG90LmVudGl0aWVzLmZpbHRlcigoZSkgPT4gZS5jaHVuayA9PT0ga2V5KS5tYXAoKGUpID0+IGUuaWQpKTtcbiAgICAvLyBBdXRob3JlZCBlbnRpdGllcyBmb3IgdGhlIHNhbWUgY2h1bmsgc3Vydml2ZSBhbG9uZ3NpZGUgbmF0dXJhbCBkZWx0YXMuXG4gICAgY29uc3QgaWRzID0gKHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KSA/PyBbXSkuZmlsdGVyKChpZCkgPT4ge1xuICAgICAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICAgIHJldHVybiAhaWQuc3RhcnRzV2l0aCgnZTonKSAmJiAhIWVudGl0eVxuICAgICAgICAmJiAoIWlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkgfHwgaXNTdG9uZVJlcGxheSh3b3JsZCkpO1xuICAgIH0pO1xuICAgIGZvciAoY29uc3QgaWQgb2YgWy4uLndvcmxkLmVudGl0aWVzLmtleXMoKV0pIHtcbiAgICAgIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgICBpZiAoZW50aXR5Py5jaHVuayA9PT0ga2V5ICYmICFlbnRpdHkuYXV0aG9yZWQgJiYgIXNhdmVkLmhhcyhpZCkpIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgaWQgb2Ygc2F2ZWQpIGlmICghaWRzLmluY2x1ZGVzKGlkKSkgaWRzLnB1c2goaWQpO1xuICAgIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBpZHMpO1xuICB9XG4gIGZvciAoY29uc3QgZSBvZiBzbmFwc2hvdC5lbnRpdGllcykge1xuICAgIHdvcmxkLmVudGl0aWVzLnNldChlLmlkLCBjbG9uZUVudGl0eShlKSk7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgb2Ygc25hcHNob3QuZW50aXR5Q2h1bmtzKSB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChrZXkpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIGZvciAoY29uc3QgZSBvZiB3b3JsZC5lbnRpdGllcy52YWx1ZXMoKSkge1xuICAgIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gIH1cbiAgZm9yIChjb25zdCBzIG9mIHNuYXBzaG90LnN0cnVjdHVyZXMpIHdvcmxkLnN0cnVjdHVyZXMuc2V0KHMuaWQsIGNsb25lU3RydWN0dXJlKHMpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdvcmxkRnJvbVNuYXBzaG90KHNuYXBzaG90OiBXb3JsZFNuYXBzaG90KTogV29ybGQge1xuICBjb25zdCB2YWxpZCA9IHZhbGlkYXRlV29ybGRTbmFwc2hvdChzbmFwc2hvdCk7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQodmFsaWQubWFuaWZlc3Quc2VlZCk7XG4gIHJlc3RvcmVXb3JsZFNuYXBzaG90KHdvcmxkLCB2YWxpZCk7XG4gIHJldHVybiB3b3JsZDtcbn1cblxuLyoqIFJhdyBvbGQgc3RhdGUgaXMgdXNlZCBvbmx5IHdoaWxlIHZhbGlkYXRpbmcgYSByZWNvcmRlZCBhY2NlcHRlZCBqb3VybmFsLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhpc3RvcmljYWxXb3JsZEZyb21TbmFwc2hvdChzbmFwc2hvdDogV29ybGRTbmFwc2hvdCk6IFdvcmxkIHtcbiAgY29uc3QgdmFsaWQgPSB2YWxpZGF0ZVdvcmxkU25hcHNob3Qoc25hcHNob3QpO1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHZhbGlkLm1hbmlmZXN0LnNlZWQpO1xuICBlbmFibGVTdG9uZVJlcGxheSh3b3JsZCk7XG4gIHJlc3RvcmVXb3JsZFNuYXBzaG90RXhhY3Qod29ybGQsIHZhbGlkKTtcbiAgcmV0dXJuIHdvcmxkO1xufVxuIiwgIi8vIE0wMDIgcGxheWFibGUgZmlyc3Qgc2xpY2UgXHUyMDE0IHRoZSB0aHJlZSBhdXRob3JlZCBwcm9qZWN0cyBhcyBwbGFpbiBkYXRhLlxuLy9cbi8vIFRoaXMgbW9kdWxlIGlzIGRlbGliZXJhdGVseSBET00tZnJlZS4gVGhlIGJ1aWxkIHNpZGViYXIsIHRoZSBnaG9zdCBwcmV2aWV3XG4vLyBhbmQgdGhlIHRlc3RzIGFsbCByZWFkIHRoZSBzYW1lIGRlZmluaXRpb25zIGFuZCBjYWxsIHRoZSBzYW1lIHNpbXVsYXRpb25cbi8vIGVudHJ5IHBvaW50czsgYSBwcm9qZWN0IGNhbm5vdCBhZHZlcnRpc2Ugb25lIGZvb3RwcmludCwgcHJpY2Ugb3IgcHJlcGFyYXRpb25cbi8vIHN0ZXAgYW5kIHRoZW4gZXhlY3V0ZSBhbm90aGVyLlxuaW1wb3J0IHsgTUFULCBXb3JsZCwgUmVzb3VyY2VUeXBlIH0gZnJvbSAnLi4vc2ltL3dvcmxkJztcbmltcG9ydCB7IFJlY3QgfSBmcm9tICcuLi9zaW0vdGVycmFpbic7XG5pbXBvcnQge1xuICBCdWlsZGluZ1J1bGVzLCBIT1VTRV9SVUxFUywgUEFUSF9SVUxFUywgRkFSTV9SVUxFUyxcbiAgU2l0ZVByb3Bvc2FsLCBTaXRlUHJldmlldywgU2l0ZVN0YXRlLCBWYWxpZGF0aW9uUmVhc29uLCBwcmV2aWV3U2l0ZSxcbn0gZnJvbSAnLi4vc2ltL2NvbnN0cnVjdGlvbic7XG5pbXBvcnQge1xuICBNMDAyX0xBWU9VVCwgTTAwMl9QQVRIX1NJVEVfSUQsIE0wMDJfVEVSUkFDRV9CQU5EUyxcbn0gZnJvbSAnLi4vc2ltL20wMDInO1xuaW1wb3J0IHtcbiAgbTAwMkZhcm1UYXJnZXRzLCBtMDAyUGF0aFJlY3QsIG0wMDJQYXRoVGFyZ2V0cyxcbn0gZnJvbSAnLi4vc2ltL3NjZW5hcmlvJztcbmltcG9ydCB7XG4gIENvbHVtblRhcmdldCwgTG9jYWxBdXRob3JpemVyLCBQcmVwYXJhdGlvbkxlZGdlciwgUHJlcGFyYXRpb25PcHRpb25zLFxuICBQbGFuUmVzdWx0LCBwbGFuUHJlcGFyYXRpb24sIHByZXBhcmVTaXRlLFxufSBmcm9tICcuLi9zaW0vcHJlcGFyYXRpb24nO1xuaW1wb3J0IHsgY3JlYXRlV29ybGRTbmFwc2hvdCwgcmVzdG9yZVdvcmxkU25hcHNob3QgfSBmcm9tICcuLi9zaW0vc25hcHNob3QnO1xuXG5pbXBvcnQge1xuICBIT1VTRV9DT1NULCBURVJSQUNFX0NPU1QsIExvY2FsU3RydWN0dXJlQXV0aG9yaXplciwgU3RydWN0dXJlLFxuICBTdHJ1Y3R1cmVLaW5kLCBTdHJ1Y3R1cmVMZWRnZXIsIFN0cnVjdHVyZVByb3Bvc2FsLCBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uLFxuICBidWlsZFN0cnVjdHVyZSwgcGF0aENvc3QsXG59IGZyb20gJy4uL3NpbS9zdHJ1Y3R1cmVzJztcblxuZXhwb3J0IHR5cGUgTTJQcm9qZWN0SWQgPSAnaG91c2UnIHwgJ3BhdGgnIHwgJ2Zhcm0nO1xuXG5leHBvcnQgaW50ZXJmYWNlIE0yR2hvc3RCYW5kIHtcbiAgejA6IG51bWJlcjtcbiAgejE6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE0yUHJvamVjdCB7XG4gIGlkOiBNMlByb2plY3RJZDtcbiAgbmFtZTogc3RyaW5nO1xuICBzdWJ0aXRsZTogc3RyaW5nO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBzaXRlSWQ6IHN0cmluZztcbiAga2luZDogU3RydWN0dXJlS2luZDtcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHJ1bGVzOiBCdWlsZGluZ1J1bGVzO1xuICBjb3N0OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBkb29yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBhcHByb2FjaD86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgdGVycmFjZXM/OiBudW1iZXI7XG4gIHByZXA6IFByZXBhcmF0aW9uT3B0aW9ucztcbiAgZ2hvc3RCYW5kcz86IHJlYWRvbmx5IE0yR2hvc3RCYW5kW107XG59XG5cbmNvbnN0IHBhdGhSZWN0ID0gbTAwMlBhdGhSZWN0KCk7XG5jb25zdCBwYXRoVGFyZ2V0czogQ29sdW1uVGFyZ2V0W10gPSBtMDAyUGF0aFRhcmdldHMoKTtcbmNvbnN0IGZhcm1UYXJnZXRzOiBDb2x1bW5UYXJnZXRbXSA9IG0wMDJGYXJtVGFyZ2V0cygpO1xuXG4vKipcbiAqIFRoZSBmaXJzdCBwbGF5YWJsZSBzbGljZSBpbiB0aGUgcGlubmVkIG9yZGVyOiBhIGhvdXNlIG9uIHRoZSBwcmVwYXJlZCBzaGVsZixcbiAqIGEgc3RlcHBlZCBwYXRoIGZyb20gaXRzIGRvb3IsIGFuZCBhIHRlcnJhY2VkIGZpZWxkIG9uIHRoZSBzbG9wZSBiZWxvdy5cbiAqL1xuZXhwb3J0IGNvbnN0IE0yX1BST0pFQ1RTOiByZWFkb25seSBNMlByb2plY3RbXSA9IFtcbiAge1xuICAgIGlkOiAnaG91c2UnLFxuICAgIG5hbWU6IFwiRm91bmRlcidzIGhvdXNlXCIsXG4gICAgc3VidGl0bGU6ICc4IHggNiBtIFx1MDBCNyBmbGF0IHN0b25lIHNoZWxmJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgMTktbW9kdWxlIGZvdW5kZXIgY2FuZGlkYXRlIHVzZXMgYSBmbGF0IHN0b25lIGZvdW5kYXRpb24sIGEgMy4yIG0gc3RvcmV5LCBhIHJlYWwgZWFzdCBkb29yd2F5ICdcbiAgICAgICsgJ2FuZCB0d28gb3BlbiBzb3V0aCB3aW5kb3dzLiBTdHJ1Y3R1cmFsIHdhbGwgdm9pZHMgcmVxdWlyZSBtb3JlIHByaW1pdGl2ZXMgdGhhbiB0aGUgcHJvdmlzaW9uYWwgJ1xuICAgICAgKyAnYXNzZXQtdm9sdW1lIHRhcmdldDsgdGhpcyBkZXNpZ24gcmVtYWlucyBzdWJqZWN0IHRvIGFydCByZXZpZXcuJyxcbiAgICBzaXRlSWQ6IE0wMDJfTEFZT1VULmhvdXNlLmlkLFxuICAgIGtpbmQ6ICdob3VzZScsXG4gICAgcmVjdDogTTAwMl9MQVlPVVQuaG91c2UucmVjdCxcbiAgICBmbG9vclk6IE0wMDJfTEFZT1VULmhvdXNlLmZsb29yWSxcbiAgICBydWxlczogSE9VU0VfUlVMRVMsXG4gICAgY29zdDogeyAuLi5IT1VTRV9DT1NUIH0sXG4gICAgZG9vcjogTTAwMl9MQVlPVVQuaG91c2UuZG9vcixcbiAgICBhcHByb2FjaDogTTAwMl9MQVlPVVQuaG91c2UuYXBwcm9hY2gsXG4gICAgcHJlcDoge30sXG4gIH0sXG4gIHtcbiAgICBpZDogJ3BhdGgnLFxuICAgIG5hbWU6ICdEb29yIHBhdGgnLFxuICAgIHN1YnRpdGxlOiAnOSB4IDMgbSBcdTAwQjcgc3RlcHBlZCBncmF2ZWwnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ0EgbmluZS1tZXRyZSBjb3JyaWRvciBmcm9tIHRoZSBob3VzZSBkb29yIHRvIHRoZSBhcHByb2FjaC4gJ1xuICAgICAgKyAnRWFjaCBjb2x1bW4gaXMgY3V0IHRvIGEgcGlubmVkIHByb2ZpbGUgc28gdGhlIHJpc2Ugc3RheXMgd2Fsa2FibGUuJyxcbiAgICBzaXRlSWQ6IE0wMDJfUEFUSF9TSVRFX0lELFxuICAgIGtpbmQ6ICdwYXRoJyxcbiAgICByZWN0OiBwYXRoUmVjdCxcbiAgICBmbG9vclk6IDEyLFxuICAgIHJ1bGVzOiBQQVRIX1JVTEVTLFxuICAgIGNvc3Q6IHBhdGhDb3N0KHBhdGhSZWN0LngxIC0gcGF0aFJlY3QueDAgKyAxKSxcbiAgICBwcmVwOiB7XG4gICAgICB0YXJnZXRzOiBwYXRoVGFyZ2V0cyxcbiAgICAgIHN1cmZhY2VNYXRlcmlhbDogTUFULkdSQVZFTCxcbiAgICAgIGVudmVsb3BlOiBbTTAwMl9MQVlPVVQuZW52ZWxvcGVbMV1dLFxuICAgIH0sXG4gIH0sXG4gIHtcbiAgICBpZDogJ2Zhcm0nLFxuICAgIG5hbWU6ICdUZXJyYWNlZCBmaWVsZCcsXG4gICAgc3VidGl0bGU6ICcxMiB4IDggbSBcdTAwQjcgdGhyZWUgYmFuZHMnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RocmVlIHNvaWwgdGVycmFjZXMgc3RlcHBpbmcgZG93biB0aGUgc2xvcGUsIGhlbGQgYnkgc3RvbmUgcmV0YWluaW5nIHdhbGxzLiAnXG4gICAgICArICdUaGUgYmxvc3NvbSB0cmVlIG9uIHRoZSBmaWVsZCBpcyBjbGVhcmVkIGR1cmluZyBwcmVwYXJhdGlvbi4nLFxuICAgIHNpdGVJZDogTTAwMl9MQVlPVVQuZmFybS5pZCxcbiAgICBraW5kOiAndGVycmFjZScsXG4gICAgcmVjdDogTTAwMl9MQVlPVVQuZmFybS5yZWN0LFxuICAgIGZsb29yWTogMTUsXG4gICAgcnVsZXM6IEZBUk1fUlVMRVMsXG4gICAgY29zdDogeyAuLi5URVJSQUNFX0NPU1QgfSxcbiAgICB0ZXJyYWNlczogTTAwMl9MQVlPVVQuZmFybS50ZXJyYWNlcyxcbiAgICBwcmVwOiB7XG4gICAgICB0YXJnZXRzOiBmYXJtVGFyZ2V0cyxcbiAgICAgIHN1cmZhY2VNYXRlcmlhbDogTUFULlNPSUwsXG4gICAgICBlbnZlbG9wZTogW00wMDJfTEFZT1VULmVudmVsb3BlWzJdXSxcbiAgICB9LFxuICAgIGdob3N0QmFuZHM6IE0wMDJfVEVSUkFDRV9CQU5EUyxcbiAgfSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm9qZWN0QnlJZChpZDogTTJQcm9qZWN0SWQpOiBNMlByb2plY3Qge1xuICBjb25zdCBwcm9qZWN0ID0gTTJfUFJPSkVDVFMuZmluZCgocCkgPT4gcC5pZCA9PT0gaWQpO1xuICBpZiAoIXByb2plY3QpIHRocm93IG5ldyBFcnJvcihgdW5rbm93biBNMDAyIHByb2plY3Q6ICR7aWR9YCk7XG4gIHJldHVybiBwcm9qZWN0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvamVjdFNpdGVQcm9wb3NhbChwcm9qZWN0OiBNMlByb2plY3QpOiBTaXRlUHJvcG9zYWwge1xuICByZXR1cm4ge1xuICAgIHNpdGVJZDogcHJvamVjdC5zaXRlSWQsXG4gICAgcmVjdDogcHJvamVjdC5yZWN0LFxuICAgIGZsb29yWTogcHJvamVjdC5mbG9vclksXG4gICAgcnVsZXM6IHByb2plY3QucnVsZXMsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm9qZWN0U3RydWN0dXJlUHJvcG9zYWwoXG4gIHByb2plY3Q6IE0yUHJvamVjdCwgZGVzaWduVmVyc2lvbj86IFN0cnVjdHVyZURlc2lnblZlcnNpb24sXG4pOiBTdHJ1Y3R1cmVQcm9wb3NhbCB7XG4gIHJldHVybiB7XG4gICAgc2l0ZUlkOiBwcm9qZWN0LnNpdGVJZCxcbiAgICBraW5kOiBwcm9qZWN0LmtpbmQsXG4gICAgcmVjdDogcHJvamVjdC5yZWN0LFxuICAgIGZsb29yWTogcHJvamVjdC5mbG9vclksXG4gICAgZG9vcjogcHJvamVjdC5kb29yLFxuICAgIGFwcHJvYWNoOiBwcm9qZWN0LmFwcHJvYWNoLFxuICAgIHRlcnJhY2VzOiBwcm9qZWN0LnRlcnJhY2VzLFxuICAgIC4uLihkZXNpZ25WZXJzaW9uID09PSB1bmRlZmluZWQgPyB7fSA6IHsgZGVzaWduVmVyc2lvbiB9KSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUHJvamVjdEJ1aWx0KHdvcmxkOiBXb3JsZCwgcHJvamVjdDogTTJQcm9qZWN0KTogYm9vbGVhbiB7XG4gIGZvciAoY29uc3Qgc3RydWN0dXJlIG9mIHdvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCkpIHtcbiAgICBpZiAoc3RydWN0dXJlLnNpdGVJZCA9PT0gcHJvamVjdC5zaXRlSWQgJiYgc3RydWN0dXJlLmtpbmQgPT09IHByb2plY3Qua2luZCkgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbmdSZXNvdXJjZSB7XG4gIHJlc291cmNlOiBSZXNvdXJjZVR5cGU7XG4gIG5lZWQ6IG51bWJlcjtcbiAgaGF2ZTogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWlzc2luZ1Jlc291cmNlcyh3b3JsZDogV29ybGQsIHByb2plY3Q6IE0yUHJvamVjdCk6IE1pc3NpbmdSZXNvdXJjZVtdIHtcbiAgY29uc3QgbWlzc2luZzogTWlzc2luZ1Jlc291cmNlW10gPSBbXTtcbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocHJvamVjdC5jb3N0KSkge1xuICAgIGNvbnN0IG5lZWQgPSBhbW91bnQgPz8gMDtcbiAgICBjb25zdCBoYXZlID0gd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwO1xuICAgIGlmIChoYXZlIDwgbmVlZCkgbWlzc2luZy5wdXNoKHsgcmVzb3VyY2U6IHJlc291cmNlIGFzIFJlc291cmNlVHlwZSwgbmVlZCwgaGF2ZSB9KTtcbiAgfVxuICByZXR1cm4gbWlzc2luZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9qZWN0SW5zcGVjdGlvbiB7XG4gIHByb2plY3RJZDogTTJQcm9qZWN0SWQ7XG4gIGJ1aWx0OiBib29sZWFuO1xuICBhZmZvcmRhYmxlOiBib29sZWFuO1xuICBtaXNzaW5nOiBNaXNzaW5nUmVzb3VyY2VbXTtcbiAgc3RhdGU6IFNpdGVTdGF0ZTtcbiAgcmVhc29uczogVmFsaWRhdGlvblJlYXNvbltdO1xuICBwcmV2aWV3OiBTaXRlUHJldmlldztcbiAgcGxhbjogUGxhblJlc3VsdDtcbiAgY2FuQnVpbGQ6IGJvb2xlYW47XG59XG5cbi8qKlxuICogUmVhZC1vbmx5IGluc3BlY3Rpb24gZm9yIHRoZSBnaG9zdCBhbmQgc2lkZWJhci4gSXQgcnVucyB0aGUgc2FtZSB2YWxpZGF0b3JcbiAqIGFuZCB0aGUgc2FtZSBwcmVwYXJhdGlvbiBwbGFubmVyIHRoZSBidWlsZCBidXR0b24gd2lsbCBydW4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnNwZWN0UHJvamVjdCh3b3JsZDogV29ybGQsIHByb2plY3Q6IE0yUHJvamVjdCk6IFByb2plY3RJbnNwZWN0aW9uIHtcbiAgY29uc3QgcHJvcG9zYWwgPSBwcm9qZWN0U2l0ZVByb3Bvc2FsKHByb2plY3QpO1xuICBjb25zdCBwcmV2aWV3ID0gcHJldmlld1NpdGUod29ybGQsIHByb3Bvc2FsLCB7XG4gICAgZG9vcjogcHJvamVjdC5kb29yLFxuICAgIGFwcHJvYWNoOiBwcm9qZWN0LmFwcHJvYWNoLFxuICB9KTtcbiAgY29uc3QgcGxhbiA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwgcHJvcG9zYWwsIHByb2plY3QucHJlcCk7XG4gIGNvbnN0IGJ1aWx0ID0gaXNQcm9qZWN0QnVpbHQod29ybGQsIHByb2plY3QpO1xuICBjb25zdCBtaXNzaW5nID0gbWlzc2luZ1Jlc291cmNlcyh3b3JsZCwgcHJvamVjdCk7XG4gIGNvbnN0IHN0YXRlID0gcGxhbi5vayA/IHBsYW4udmFsaWRhdGlvbi5zdGF0ZSA6IHByZXZpZXcuc3RhdGU7XG4gIGNvbnN0IHJlYXNvbnMgPSBwbGFuLm9rID8gcGxhbi52YWxpZGF0aW9uLnJlYXNvbnMgOiBwcmV2aWV3LnJlYXNvbnM7XG5cbiAgcmV0dXJuIHtcbiAgICBwcm9qZWN0SWQ6IHByb2plY3QuaWQsXG4gICAgYnVpbHQsXG4gICAgYWZmb3JkYWJsZTogbWlzc2luZy5sZW5ndGggPT09IDAsXG4gICAgbWlzc2luZyxcbiAgICBzdGF0ZSxcbiAgICByZWFzb25zLFxuICAgIHByZXZpZXcsXG4gICAgcGxhbixcbiAgICBjYW5CdWlsZDogIWJ1aWx0ICYmIG1pc3NpbmcubGVuZ3RoID09PSAwICYmIHBsYW4ub2sgJiYgc3RhdGUgIT09ICdpbnZhbGlkJyxcbiAgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9qZWN0QnVpbGRTdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHByb2plY3Q6IE0yUHJvamVjdDtcbiAgcHJlcGFyYXRpb246IFByZXBhcmF0aW9uTGVkZ2VyO1xuICBzdHJ1Y3R1cmU6IFN0cnVjdHVyZUxlZGdlcjtcbiAgcmVjb3JkOiBTdHJ1Y3R1cmU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvamVjdEJ1aWxkRmFpbHVyZSB7XG4gIG9rOiBmYWxzZTtcbiAgcHJvamVjdDogTTJQcm9qZWN0O1xuICBzdGFnZTogJ3ByZWNoZWNrJyB8ICdwcmVwYXJlJyB8ICdzdHJ1Y3R1cmUnO1xuICBjb2RlOiBzdHJpbmc7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xuICBwcmVwYXJhdGlvbj86IFByZXBhcmF0aW9uTGVkZ2VyO1xuICAvKiogRmFpbGVkIGJ1aWxkcyByb2xsIGJhY2sgdGhlIGVudGlyZSBhdXRob3JpdGF0aXZlIHByZS1idWlsZCBzbmFwc2hvdC4gKi9cbiAgc3RydWN0dXJlRmFpbHVyZVJldGFpbmVkOiBmYWxzZTtcbiAgcmV0cnlhYmxlOiB0cnVlO1xufVxuXG5leHBvcnQgdHlwZSBQcm9qZWN0QnVpbGRSZXN1bHQgPSBQcm9qZWN0QnVpbGRTdWNjZXNzIHwgUHJvamVjdEJ1aWxkRmFpbHVyZTtcblxuLyoqXG4gKiBQcmVwYXJlIHRoZSBzaXRlIGFuZCBjb25zdHJ1Y3QgdGhlIHByb2plY3QgdGhyb3VnaCB0aGUgYXV0aG9yaXplZCBwaXBlbGluZS5cbiAqIFRoZSByZXNvdXJjZSBjaGVjayBoYXBwZW5zIGJlZm9yZSBhbnkgdGVycmFpbiBlZGl0LCBzbyBhbiB1bmFmZm9yZGFibGUgYnVpbGRcbiAqIGNhbm5vdCBsZWF2ZSBhIGdyYWRlZCBwYWQgYmVoaW5kLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRQcm9qZWN0KFxuICB3b3JsZDogV29ybGQsXG4gIHByZXBBdXRob3JpemVyOiBMb2NhbEF1dGhvcml6ZXIsXG4gIHN0cnVjdHVyZUF1dGhvcml6ZXI6IExvY2FsU3RydWN0dXJlQXV0aG9yaXplcixcbiAgcHJvamVjdDogTTJQcm9qZWN0LFxuICBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbixcbik6IFByb2plY3RCdWlsZFJlc3VsdCB7XG4gIGlmIChpc1Byb2plY3RCdWlsdCh3b3JsZCwgcHJvamVjdCkpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLCBwcm9qZWN0LCBzdGFnZTogJ3ByZWNoZWNrJywgY29kZTogJ2FscmVhZHlfYnVpbHQnLFxuICAgICAgcmVhc29uczogW2Ake3Byb2plY3QubmFtZX0gaXMgYWxyZWFkeSBidWlsdGBdLFxuICAgICAgc3RydWN0dXJlRmFpbHVyZVJldGFpbmVkOiBmYWxzZSwgcmV0cnlhYmxlOiB0cnVlLFxuICAgIH07XG4gIH1cbiAgY29uc3QgbWlzc2luZyA9IG1pc3NpbmdSZXNvdXJjZXMod29ybGQsIHByb2plY3QpO1xuICBpZiAobWlzc2luZy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSwgcHJvamVjdCwgc3RhZ2U6ICdwcmVjaGVjaycsIGNvZGU6ICdpbnN1ZmZpY2llbnRfcmVzb3VyY2VzJyxcbiAgICAgIHJlYXNvbnM6IG1pc3NpbmcubWFwKChtKSA9PiBgbmVlZCAke20ubmVlZH0gJHttLnJlc291cmNlfSwgaGF2ZSAke20uaGF2ZX1gKSxcbiAgICAgIHN0cnVjdHVyZUZhaWx1cmVSZXRhaW5lZDogZmFsc2UsIHJldHJ5YWJsZTogdHJ1ZSxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgYmVmb3JlID0gY3JlYXRlV29ybGRTbmFwc2hvdCh3b3JsZCwgMCk7XG4gIGNvbnN0IHByZXBhcmVkID0gcHJlcGFyZVNpdGUod29ybGQsIHByZXBBdXRob3JpemVyLCBwcm9qZWN0U2l0ZVByb3Bvc2FsKHByb2plY3QpLCBwcm9qZWN0LnByZXApO1xuICBpZiAoIXByZXBhcmVkLm9rKSB7XG4gICAgcmVzdG9yZVdvcmxkU25hcHNob3Qod29ybGQsIGJlZm9yZSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSwgcHJvamVjdCwgc3RhZ2U6ICdwcmVwYXJlJywgY29kZTogcHJlcGFyZWQuY29kZSxcbiAgICAgIHJlYXNvbnM6IFsuLi5wcmVwYXJlZC5yZWFzb25zLCAnTm8gcHJlcGFyYXRpb24sIHJlc291cmNlIG9yIGVudGl0eSBjaGFuZ2VzIHdlcmUgcmV0YWluZWQuJ10sXG4gICAgICBzdHJ1Y3R1cmVGYWlsdXJlUmV0YWluZWQ6IGZhbHNlLCByZXRyeWFibGU6IHRydWUsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IGJ1aWx0ID0gYnVpbGRTdHJ1Y3R1cmUod29ybGQsIHN0cnVjdHVyZUF1dGhvcml6ZXIsIHByb2plY3RTdHJ1Y3R1cmVQcm9wb3NhbChwcm9qZWN0LCBkZXNpZ25WZXJzaW9uKSk7XG4gIGlmICghYnVpbHQub2spIHtcbiAgICByZXN0b3JlV29ybGRTbmFwc2hvdCh3b3JsZCwgYmVmb3JlKTtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLCBwcm9qZWN0LCBzdGFnZTogJ3N0cnVjdHVyZScsIGNvZGU6IGJ1aWx0LmNvZGUsXG4gICAgICByZWFzb25zOiBbLi4uYnVpbHQucmVhc29ucyxcbiAgICAgICAgJ0FsbCBwcmVwYXJhdGlvbiwgcmVzb3VyY2UgYW5kIGVudGl0eSBjaGFuZ2VzIHdlcmUgcm9sbGVkIGJhY2s7IHRoZSBidWlsZCBjYW4gYmUgcmV0cmllZC4nXSxcbiAgICAgIHN0cnVjdHVyZUZhaWx1cmVSZXRhaW5lZDogZmFsc2UsIHJldHJ5YWJsZTogdHJ1ZSxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgcmVjb3JkID0gd29ybGQuc3RydWN0dXJlcy5nZXQoYnVpbHQubGVkZ2VyLnN0cnVjdHVyZUlkKTtcbiAgaWYgKCFyZWNvcmQpIHtcbiAgICByZXN0b3JlV29ybGRTbmFwc2hvdCh3b3JsZCwgYmVmb3JlKTtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLCBwcm9qZWN0LCBzdGFnZTogJ3N0cnVjdHVyZScsIGNvZGU6ICdtaXNzaW5nX3JlY29yZCcsXG4gICAgICByZWFzb25zOiBbJ3N0cnVjdHVyZSBsZWRnZXIgd2FzIHdyaXR0ZW4gYnV0IHRoZSB3b3JsZCBoYXMgbm8gcmVjb3JkJyxcbiAgICAgICAgJ0FsbCBwcmVwYXJhdGlvbiwgcmVzb3VyY2UgYW5kIGVudGl0eSBjaGFuZ2VzIHdlcmUgcm9sbGVkIGJhY2s7IHRoZSBidWlsZCBjYW4gYmUgcmV0cmllZC4nXSxcbiAgICAgIHN0cnVjdHVyZUZhaWx1cmVSZXRhaW5lZDogZmFsc2UsIHJldHJ5YWJsZTogdHJ1ZSxcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBvazogdHJ1ZSxcbiAgICBwcm9qZWN0LFxuICAgIHByZXBhcmF0aW9uOiBwcmVwYXJlZC5sZWRnZXIsXG4gICAgc3RydWN0dXJlOiBidWlsdC5sZWRnZXIsXG4gICAgcmVjb3JkLFxuICB9O1xufVxuIiwgIi8vIFRoZSBzb2xlIHdyaXRlIGJvdW5kYXJ5IGZvciB0aGUgcGxheWFibGUgTTAwMiBzbGljZS4gQWNjZXB0ZWQgY29tbWFuZHMgYXJlXG4vLyBkdXJhYmxlIGlucHV0OyByZWplY3RlZCBhdHRlbXB0cywgcmVuZGVyZXIgd29yayBhbmQgdGVycmFpbiBxdWVyaWVzIGFyZSBub3QuXG5pbXBvcnQge1xuICBFbnRpdHksIFJlc291cmNlVHlwZSwgV29ybGQsIGNyZWF0ZVdvcmxkLCBnZW5lcmF0ZVdvcmxkLCBoYXJ2ZXN0RW50aXR5LCBwbGFjZUF1dGhvcmVkU2l0ZXMsXG4gIHJldGlyZVN0b25lRW50aXRpZXMsIGlzUmV0aXJlZFN0b25lS2luZCxcbn0gZnJvbSAnLi4vc2ltL3dvcmxkJztcbmltcG9ydCB7IE0wMDJfTEFZT1VUIH0gZnJvbSAnLi4vc2ltL20wMDInO1xuaW1wb3J0IHsgTG9jYWxBdXRob3JpemVyIH0gZnJvbSAnLi4vc2ltL3ByZXBhcmF0aW9uJztcbmltcG9ydCB7IExvY2FsU3RydWN0dXJlQXV0aG9yaXplciwgRk9VTkRFUl9ERVNJR05fVkVSU0lPTiB9IGZyb20gJy4uL3NpbS9zdHJ1Y3R1cmVzJztcbmltcG9ydCB7IE0wMDJfU1RBUlRFUl9JTlZFTlRPUlkgfSBmcm9tICcuLi9zaW0vc2NlbmFyaW8nO1xuaW1wb3J0IHtcbiAgV29ybGRTbmFwc2hvdCwgY2Fub25pY2FsV29ybGRIYXNoLCBjcmVhdGVXb3JsZFNuYXBzaG90LFxuICBsZWdhY3lTdG9uZUhhc2gsIG1pZ3JhdGVTdG9uZVNuYXBzaG90LCByZXN0b3JlV29ybGRTbmFwc2hvdEV4YWN0LCB2YWxpZGF0ZVdvcmxkU25hcHNob3QsIHdvcmxkRnJvbVNuYXBzaG90LFxufSBmcm9tICcuLi9zaW0vc25hcHNob3QnO1xuaW1wb3J0IHsgZW5hYmxlU3RvbmVSZXBsYXksIGZpbmlzaFN0b25lUmVwbGF5IH0gZnJvbSAnLi4vc2ltL3N0b25lLWNvbXBhdCc7XG5pbXBvcnQgeyBNMlByb2plY3RJZCwgYnVpbGRQcm9qZWN0LCBwcm9qZWN0QnlJZCB9IGZyb20gJy4vcHJvamVjdHMnO1xuaW1wb3J0IHtcbiAgRk9VTkRFUl9TVE9DS1BJTEVfSUQsIExJRkVfUkVTT1VSQ0VTLCBMaWZlUmVzb3VyY2UsIExpZmVSZXNvdXJjZUJhZywgUkVDSVBFUywgUmVjaXBlSWQsXG4gIGFkdmFuY2VUaWNrcywgY3JlYXRlTGlmZVN0YXRlLCBoYXJ2ZXN0Q3JvcCwgcGxhbnRDcm9wLCBzdGFydFByb2R1Y3Rpb24sIHRyYW5zZmVyLFxufSBmcm9tICcuLi9zaW0vZWNvbm9teSc7XG5cbmV4cG9ydCBjb25zdCBKT1VSTkFMX1NDSEVNQSA9IDEgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgREVTSUdOX0pPVVJOQUxfU0NIRU1BID0gMiBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BID0gMyBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBNQVhfSk9VUk5BTF9FTlRSSUVTID0gMTAwXzAwMDtcbmV4cG9ydCB0eXBlIENvbW1hbmQgPSBMZWdhY3lCdWlsZENvbW1hbmQgfCBCdWlsZENvbW1hbmQgfCBIYXJ2ZXN0Q29tbWFuZFxuICB8IFRyYW5zZmVyQ29tbWFuZCB8IFByb2R1Y2VDb21tYW5kIHwgVGlja0NvbW1hbmQgfCBQbGFudENvbW1hbmQgfCBIYXJ2ZXN0Q3JvcENvbW1hbmQ7XG5pbnRlcmZhY2UgQ29tbWFuZEVudmVsb3BlIHtcbiAgc2NoZW1hOiB0eXBlb2YgQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQTtcbiAgaWQ6IHN0cmluZztcbiAgZXhwZWN0ZWRSZXZpc2lvbjogbnVtYmVyO1xufVxuZXhwb3J0IGludGVyZmFjZSBUcmFuc2ZlckNvbW1hbmQgZXh0ZW5kcyBDb21tYW5kRW52ZWxvcGUge1xuICB0eXBlOiAnZGVwb3NpdCcgfCAnd2l0aGRyYXcnO1xuICBzdG9ja3BpbGVJZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEO1xuICByZXNvdXJjZXM6IExpZmVSZXNvdXJjZUJhZztcbn1cbmV4cG9ydCBpbnRlcmZhY2UgUHJvZHVjZUNvbW1hbmQgZXh0ZW5kcyBDb21tYW5kRW52ZWxvcGUge1xuICB0eXBlOiAncHJvZHVjZSc7IHN0b2NrcGlsZUlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7IHJlY2lwZToga2V5b2YgdHlwZW9mIFJFQ0lQRVM7XG59XG5leHBvcnQgaW50ZXJmYWNlIFRpY2tDb21tYW5kIGV4dGVuZHMgQ29tbWFuZEVudmVsb3BlIHsgdHlwZTogJ3RpY2snOyB0aWNrczogbnVtYmVyOyB9XG5leHBvcnQgaW50ZXJmYWNlIFBsYW50Q29tbWFuZCBleHRlbmRzIENvbW1hbmRFbnZlbG9wZSB7IHR5cGU6ICdwbGFudCc7IHBsb3RJZDogc3RyaW5nOyB9XG5leHBvcnQgaW50ZXJmYWNlIEhhcnZlc3RDcm9wQ29tbWFuZCBleHRlbmRzIENvbW1hbmRFbnZlbG9wZSB7IHR5cGU6ICdoYXJ2ZXN0X2Nyb3AnOyBwbG90SWQ6IHN0cmluZzsgfVxuZXhwb3J0IGludGVyZmFjZSBMZWdhY3lCdWlsZENvbW1hbmQge1xuICBzY2hlbWE6IHR5cGVvZiBKT1VSTkFMX1NDSEVNQTtcbiAgaWQ6IHN0cmluZztcbiAgdHlwZTogJ2J1aWxkJztcbiAgcHJvamVjdElkOiBNMlByb2plY3RJZDtcbiAgZXhwZWN0ZWRSZXZpc2lvbjogbnVtYmVyO1xufVxuZXhwb3J0IGludGVyZmFjZSBCdWlsZENvbW1hbmQge1xuICBzY2hlbWE6IHR5cGVvZiBERVNJR05fSk9VUk5BTF9TQ0hFTUEgfCB0eXBlb2YgQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQTtcbiAgaWQ6IHN0cmluZztcbiAgdHlwZTogJ2J1aWxkJztcbiAgcHJvamVjdElkOiBNMlByb2plY3RJZDtcbiAgZXhwZWN0ZWRSZXZpc2lvbjogbnVtYmVyO1xuICBkZXNpZ25WZXJzaW9uOiB0eXBlb2YgRk9VTkRFUl9ERVNJR05fVkVSU0lPTjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgSGFydmVzdENvbW1hbmQge1xuICBzY2hlbWE6IHR5cGVvZiBKT1VSTkFMX1NDSEVNQSB8IHR5cGVvZiBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BO1xuICBpZDogc3RyaW5nO1xuICB0eXBlOiAnaGFydmVzdCc7XG4gIGVudGl0eUlkOiBzdHJpbmc7XG4gIGV4cGVjdGVkUmV2aXNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IHR5cGUgQ29tbWFuZE91dGNvbWUgPSBCdWlsZE91dGNvbWUgfCBIYXJ2ZXN0T3V0Y29tZSB8IFRyYW5zZmVyT3V0Y29tZSB8IFByb2R1Y2VPdXRjb21lIHwgVGlja091dGNvbWUgfCBQbGFudE91dGNvbWUgfCBDcm9wT3V0Y29tZTtcbmV4cG9ydCBpbnRlcmZhY2UgVHJhbnNmZXJPdXRjb21lIHtcbiAgdHlwZTogJ2RlcG9zaXQnIHwgJ3dpdGhkcmF3Jzsgc3RvY2twaWxlSWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgcmVzb3VyY2VzOiBQYXJ0aWFsPFJlY29yZDxMaWZlUmVzb3VyY2UsIG51bWJlcj4+O1xufVxuZXhwb3J0IGludGVyZmFjZSBQcm9kdWNlT3V0Y29tZSB7XG4gIHR5cGU6ICdwcm9kdWNlJzsgam9iSWQ6IHN0cmluZzsgc3RvY2twaWxlSWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgcmVjaXBlOiBrZXlvZiB0eXBlb2YgUkVDSVBFUzsgcmVtYWluaW5nVGlja3M6IG51bWJlcjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgVGlja091dGNvbWUge1xuICB0eXBlOiAndGljayc7IGZyb21UaWNrOiBudW1iZXI7IHRvVGljazogbnVtYmVyO1xuICBjb21wbGV0ZWRKb2JzOiBBcnJheTx7IGlkOiBzdHJpbmc7IHJlY2lwZToga2V5b2YgdHlwZW9mIFJFQ0lQRVM7IG91dHB1dDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB9PjtcbiAgcmVhZHlDcm9wczogc3RyaW5nW107XG59XG5leHBvcnQgaW50ZXJmYWNlIFBsYW50T3V0Y29tZSB7XG4gIHR5cGU6ICdwbGFudCc7IHBsb3RJZDogc3RyaW5nOyBwbGFudGVkVGljazogbnVtYmVyOyBncm93dGhUaWNrczogbnVtYmVyO1xufVxuZXhwb3J0IGludGVyZmFjZSBDcm9wT3V0Y29tZSB7XG4gIHR5cGU6ICdoYXJ2ZXN0X2Nyb3AnOyBwbG90SWQ6IHN0cmluZzsgcmVzb3VyY2VzOiB7IGZvb2Q6IG51bWJlcjsgZmliZXI6IG51bWJlciB9O1xufVxuZXhwb3J0IGludGVyZmFjZSBCdWlsZE91dGNvbWUge1xuICB0eXBlOiAnYnVpbGQnO1xuICBzdHJ1Y3R1cmVJZDogc3RyaW5nO1xuICBjb3N0UGFpZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgcmVzb3VyY2VzR2FpbmVkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xufVxuZXhwb3J0IGludGVyZmFjZSBIYXJ2ZXN0T3V0Y29tZSB7XG4gIHR5cGU6ICdoYXJ2ZXN0JztcbiAgZW50aXR5SWQ6IHN0cmluZztcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZTtcbiAgYW1vdW50OiBudW1iZXI7XG59XG5leHBvcnQgaW50ZXJmYWNlIEpvdXJuYWxFbnRyeSB7XG4gIGNvbW1hbmQ6IENvbW1hbmQ7XG4gIHNlcXVlbmNlOiBudW1iZXI7XG4gIHJldmlzaW9uOiBudW1iZXI7XG4gIGhhc2g6IHN0cmluZztcbiAgb3V0Y29tZTogQ29tbWFuZE91dGNvbWU7XG59XG5leHBvcnQgaW50ZXJmYWNlIENvbW1hbmRKb3VybmFsIHtcbiAgc2NoZW1hOiB0eXBlb2YgSk9VUk5BTF9TQ0hFTUEgfCB0eXBlb2YgREVTSUdOX0pPVVJOQUxfU0NIRU1BIHwgdHlwZW9mIENVUlJFTlRfSk9VUk5BTF9TQ0hFTUE7XG4gIHNlZWQ6IG51bWJlcjtcbiAgc3RhcnRlckludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgZW50cmllczogSm91cm5hbEVudHJ5W107XG59XG5leHBvcnQgaW50ZXJmYWNlIENvbW1hbmRSZWNlaXB0IHtcbiAgb2s6IHRydWU7XG4gIGR1cGxpY2F0ZTogYm9vbGVhbjtcbiAgaWQ6IHN0cmluZztcbiAgc2VxdWVuY2U6IG51bWJlcjtcbiAgcmV2aXNpb246IG51bWJlcjtcbiAgaGFzaDogc3RyaW5nO1xuICBvdXRjb21lOiBDb21tYW5kT3V0Y29tZTtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgQ29tbWFuZFJlamVjdGlvbiB7XG4gIG9rOiBmYWxzZTtcbiAgZHVwbGljYXRlOiBmYWxzZTtcbiAgaWQ6IHN0cmluZztcbiAgY29kZTogc3RyaW5nO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZnVuY3Rpb24gb2JqZWN0KHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZSk7XG59XG5mdW5jdGlvbiB1aW50KHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzU2FmZUludGVnZXIodmFsdWUpICYmIHZhbHVlID49IDA7XG59XG5mdW5jdGlvbiBpZCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIHN0cmluZyB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIC9eW0EtWmEtejAtOV1bQS1aYS16MC05Ll86JS1dezAsMTI3fSQvLnRlc3QodmFsdWUpO1xufVxuZnVuY3Rpb24gZW50aXR5SWQodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBzdHJpbmcge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiB2YWx1ZS5sZW5ndGggPD0gMTI4XG4gICAgJiYgKC9eZTpcXGQrLFxcZCs6XFxkKyQvLnRlc3QodmFsdWUpXG4gICAgICB8fCAvXmhlcm86c3R5bF9bYS16X10rOi0/XFxkKzotP1xcZCskLy50ZXN0KHZhbHVlKSk7XG59XG5mdW5jdGlvbiBzYW1lRmllbGRzKGE6IHVua25vd24sIGI6IHVua25vd24pOiBib29sZWFuIHtcbiAgaWYgKG9iamVjdChhKSAmJiBvYmplY3QoYikpIHtcbiAgICBjb25zdCBhS2V5cyA9IE9iamVjdC5rZXlzKGEpLnNvcnQoKSwgYktleXMgPSBPYmplY3Qua2V5cyhiKS5zb3J0KCk7XG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGFLZXlzKSA9PT0gSlNPTi5zdHJpbmdpZnkoYktleXMpXG4gICAgICAmJiBhS2V5cy5ldmVyeSgoa2V5KSA9PiBzYW1lRmllbGRzKGFba2V5XSwgYltrZXldKSk7XG4gIH1cbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGEpID09PSBKU09OLnN0cmluZ2lmeShiKTtcbn1cblxuZnVuY3Rpb24gaW52ZW50b3J5KHZhbHVlOiB1bmtub3duKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gIGlmICghb2JqZWN0KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHJlc291cmNlIHJlY29yZCcpO1xuICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXModmFsdWUpLnNvcnQoKSkge1xuICAgIGlmICghTElGRV9SRVNPVVJDRVMuaW5jbHVkZXMoa2V5IGFzIExpZmVSZXNvdXJjZSlcbiAgICAgIHx8ICF1aW50KHZhbHVlW2tleV0pIHx8IHZhbHVlW2tleV0gPD0gMCB8fCB2YWx1ZVtrZXldID4gMV8wMDBfMDAwXzAwMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHJlc291cmNlIHJlY29yZCcpO1xuICAgIH1cbiAgICByZXN1bHRba2V5XSA9IHZhbHVlW2tleV07XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqIENhbm9uaWNhbGl6ZSBhbmQgcmVqZWN0IHVua25vd24sIGFtYmlndW91cyBvciBtYWxmb3JtZWQgY29tbWFuZCBmaWVsZHMuICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVDb21tYW5kKHZhbHVlOiB1bmtub3duKTogQ29tbWFuZCB7XG4gIGlmICghb2JqZWN0KHZhbHVlKSB8fCAodmFsdWUuc2NoZW1hICE9PSBKT1VSTkFMX1NDSEVNQSAmJiB2YWx1ZS5zY2hlbWEgIT09IERFU0lHTl9KT1VSTkFMX1NDSEVNQSAmJiB2YWx1ZS5zY2hlbWEgIT09IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEpXG4gICAgfHwgIWlkKHZhbHVlLmlkKSB8fCAhdWludCh2YWx1ZS5leHBlY3RlZFJldmlzaW9uKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGNvbW1hbmQgZW52ZWxvcGUnKTtcbiAgaWYgKHZhbHVlLnR5cGUgPT09ICdidWlsZCcgJiYgWydob3VzZScsICdwYXRoJywgJ2Zhcm0nXS5pbmNsdWRlcyhTdHJpbmcodmFsdWUucHJvamVjdElkKSkpIHtcbiAgICBjb25zdCBjb21tYW5kOiBDb21tYW5kID0gdmFsdWUuc2NoZW1hICE9PSBKT1VSTkFMX1NDSEVNQSA/IHtcbiAgICAgIHNjaGVtYTogdmFsdWUuc2NoZW1hLCBpZDogdmFsdWUuaWQsIHR5cGU6ICdidWlsZCcsXG4gICAgICBwcm9qZWN0SWQ6IHZhbHVlLnByb2plY3RJZCBhcyBNMlByb2plY3RJZCwgZXhwZWN0ZWRSZXZpc2lvbjogdmFsdWUuZXhwZWN0ZWRSZXZpc2lvbixcbiAgICAgIGRlc2lnblZlcnNpb246IHZhbHVlLmRlc2lnblZlcnNpb24gYXMgdHlwZW9mIEZPVU5ERVJfREVTSUdOX1ZFUlNJT04sXG4gICAgfSA6IHtcbiAgICAgIHNjaGVtYTogSk9VUk5BTF9TQ0hFTUEsIGlkOiB2YWx1ZS5pZCwgdHlwZTogJ2J1aWxkJyxcbiAgICAgIHByb2plY3RJZDogdmFsdWUucHJvamVjdElkIGFzIE0yUHJvamVjdElkLCBleHBlY3RlZFJldmlzaW9uOiB2YWx1ZS5leHBlY3RlZFJldmlzaW9uLFxuICAgIH07XG4gICAgaWYgKGNvbW1hbmQuc2NoZW1hICE9PSBKT1VSTkFMX1NDSEVNQSAmJiBjb21tYW5kLmRlc2lnblZlcnNpb24gIT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQgc3RydWN0dXJlIGRlc2lnbicpO1xuICAgIH1cbiAgICBpZiAoIXNhbWVGaWVsZHMoY29tbWFuZCwgdmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ25vbi1jYW5vbmljYWwgYnVpbGQgY29tbWFuZCcpO1xuICAgIHJldHVybiBjb21tYW5kO1xuICB9XG4gIGlmICh2YWx1ZS50eXBlID09PSAnaGFydmVzdCcgJiYgdmFsdWUuc2NoZW1hID09PSBKT1VSTkFMX1NDSEVNQSAmJiBlbnRpdHlJZCh2YWx1ZS5lbnRpdHlJZCkpIHtcbiAgICBjb25zdCBjb21tYW5kOiBDb21tYW5kID0ge1xuICAgICAgc2NoZW1hOiB2YWx1ZS5zY2hlbWEsIGlkOiB2YWx1ZS5pZCwgdHlwZTogJ2hhcnZlc3QnLFxuICAgICAgZW50aXR5SWQ6IHZhbHVlLmVudGl0eUlkLCBleHBlY3RlZFJldmlzaW9uOiB2YWx1ZS5leHBlY3RlZFJldmlzaW9uLFxuICAgIH07XG4gICAgaWYgKCFzYW1lRmllbGRzKGNvbW1hbmQsIHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGhhcnZlc3QgY29tbWFuZCcpO1xuICAgIHJldHVybiBjb21tYW5kO1xuICB9XG4gIGlmICh2YWx1ZS5zY2hlbWEgPT09IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEpIHtcbiAgICBjb25zdCBiYXNlID0geyBzY2hlbWE6IHZhbHVlLnNjaGVtYSwgaWQ6IHZhbHVlLmlkLCBleHBlY3RlZFJldmlzaW9uOiB2YWx1ZS5leHBlY3RlZFJldmlzaW9uIH07XG4gICAgbGV0IGNvbW1hbmQ6IENvbW1hbmQgfCBudWxsID0gbnVsbDtcbiAgICBpZiAodmFsdWUudHlwZSA9PT0gJ2hhcnZlc3QnICYmIGVudGl0eUlkKHZhbHVlLmVudGl0eUlkKSkge1xuICAgICAgY29tbWFuZCA9IHsgc2NoZW1hOiB2YWx1ZS5zY2hlbWEsIGlkOiB2YWx1ZS5pZCwgdHlwZTogdmFsdWUudHlwZSxcbiAgICAgICAgZW50aXR5SWQ6IHZhbHVlLmVudGl0eUlkLCBleHBlY3RlZFJldmlzaW9uOiB2YWx1ZS5leHBlY3RlZFJldmlzaW9uIH07XG4gICAgfSBlbHNlIGlmICgodmFsdWUudHlwZSA9PT0gJ2RlcG9zaXQnIHx8IHZhbHVlLnR5cGUgPT09ICd3aXRoZHJhdycpICYmIHZhbHVlLnN0b2NrcGlsZUlkID09PSBGT1VOREVSX1NUT0NLUElMRV9JRCkge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogdmFsdWUudHlwZSwgc3RvY2twaWxlSWQ6IHZhbHVlLnN0b2NrcGlsZUlkLCByZXNvdXJjZXM6IGludmVudG9yeSh2YWx1ZS5yZXNvdXJjZXMpIH07XG4gICAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAncHJvZHVjZScgJiYgdmFsdWUuc3RvY2twaWxlSWQgPT09IEZPVU5ERVJfU1RPQ0tQSUxFX0lEXG4gICAgICAmJiAodmFsdWUucmVjaXBlID09PSAnc2VlZCcgfHwgdmFsdWUucmVjaXBlID09PSAncmF0aW9ucycpKSB7XG4gICAgICBjb21tYW5kID0geyAuLi5iYXNlLCB0eXBlOiB2YWx1ZS50eXBlLCBzdG9ja3BpbGVJZDogdmFsdWUuc3RvY2twaWxlSWQsIHJlY2lwZTogdmFsdWUucmVjaXBlIH07XG4gICAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAndGljaycgJiYgdWludCh2YWx1ZS50aWNrcykgJiYgdmFsdWUudGlja3MgPiAwICYmIHZhbHVlLnRpY2tzIDw9IDY0KSB7XG4gICAgICBjb21tYW5kID0geyAuLi5iYXNlLCB0eXBlOiB2YWx1ZS50eXBlLCB0aWNrczogdmFsdWUudGlja3MgfTtcbiAgICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICdwbGFudCcgJiYgdHlwZW9mIHZhbHVlLnBsb3RJZCA9PT0gJ3N0cmluZycgJiYgL15jcm9wOlswLThdJC8udGVzdCh2YWx1ZS5wbG90SWQpKSB7XG4gICAgICBjb21tYW5kID0geyAuLi5iYXNlLCB0eXBlOiB2YWx1ZS50eXBlLCBwbG90SWQ6IHZhbHVlLnBsb3RJZCB9O1xuICAgIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ2hhcnZlc3RfY3JvcCcgJiYgdHlwZW9mIHZhbHVlLnBsb3RJZCA9PT0gJ3N0cmluZycgJiYgL15jcm9wOlswLThdJC8udGVzdCh2YWx1ZS5wbG90SWQpKSB7XG4gICAgICBjb21tYW5kID0geyAuLi5iYXNlLCB0eXBlOiB2YWx1ZS50eXBlLCBwbG90SWQ6IHZhbHVlLnBsb3RJZCB9O1xuICAgIH1cbiAgICBpZiAoY29tbWFuZCkge1xuICAgICAgaWYgKCFzYW1lRmllbGRzKGNvbW1hbmQsIHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGxpZmUtbG9vcCBjb21tYW5kJyk7XG4gICAgICByZXR1cm4gY29tbWFuZDtcbiAgICB9XG4gIH1cbiAgdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBjb21tYW5kJyk7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlT3V0Y29tZSh2YWx1ZTogdW5rbm93bik6IENvbW1hbmRPdXRjb21lIHtcbiAgaWYgKCFvYmplY3QodmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgY29tbWFuZCBvdXRjb21lJyk7XG4gIGlmICh2YWx1ZS50eXBlID09PSAnYnVpbGQnICYmIGlkKHZhbHVlLnN0cnVjdHVyZUlkKSkge1xuICAgIGNvbnN0IG91dGNvbWU6IENvbW1hbmRPdXRjb21lID0ge1xuICAgICAgdHlwZTogJ2J1aWxkJywgc3RydWN0dXJlSWQ6IHZhbHVlLnN0cnVjdHVyZUlkLFxuICAgICAgY29zdFBhaWQ6IGludmVudG9yeSh2YWx1ZS5jb3N0UGFpZCksIHJlc291cmNlc0dhaW5lZDogaW52ZW50b3J5KHZhbHVlLnJlc291cmNlc0dhaW5lZCksXG4gICAgfTtcbiAgICBpZiAoSlNPTi5zdHJpbmdpZnkob3V0Y29tZSkgIT09IEpTT04uc3RyaW5naWZ5KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGJ1aWxkIG91dGNvbWUnKTtcbiAgICByZXR1cm4gb3V0Y29tZTtcbiAgfVxuICBpZiAodmFsdWUudHlwZSA9PT0gJ2hhcnZlc3QnICYmIGVudGl0eUlkKHZhbHVlLmVudGl0eUlkKVxuICAgICYmIFsnd29vZCcsICdzdG9uZScsICdvcmUnLCAnZmliZXInXS5pbmNsdWRlcyhTdHJpbmcodmFsdWUucmVzb3VyY2UpKVxuICAgICYmIHVpbnQodmFsdWUuYW1vdW50KSAmJiB2YWx1ZS5hbW91bnQgPiAwICYmIHZhbHVlLmFtb3VudCA8PSAxXzAwMF8wMDApIHtcbiAgICBjb25zdCBvdXRjb21lOiBDb21tYW5kT3V0Y29tZSA9IHtcbiAgICAgIHR5cGU6ICdoYXJ2ZXN0JywgZW50aXR5SWQ6IHZhbHVlLmVudGl0eUlkLFxuICAgICAgcmVzb3VyY2U6IHZhbHVlLnJlc291cmNlIGFzIFJlc291cmNlVHlwZSwgYW1vdW50OiB2YWx1ZS5hbW91bnQsXG4gICAgfTtcbiAgICBpZiAoSlNPTi5zdHJpbmdpZnkob3V0Y29tZSkgIT09IEpTT04uc3RyaW5naWZ5KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGhhcnZlc3Qgb3V0Y29tZScpO1xuICAgIHJldHVybiBvdXRjb21lO1xuICB9XG4gIGxldCBvdXRjb21lOiBDb21tYW5kT3V0Y29tZSB8IG51bGwgPSBudWxsO1xuICBpZiAoKHZhbHVlLnR5cGUgPT09ICdkZXBvc2l0JyB8fCB2YWx1ZS50eXBlID09PSAnd2l0aGRyYXcnKSAmJiB2YWx1ZS5zdG9ja3BpbGVJZCA9PT0gRk9VTkRFUl9TVE9DS1BJTEVfSUQpIHtcbiAgICBvdXRjb21lID0geyB0eXBlOiB2YWx1ZS50eXBlLCBzdG9ja3BpbGVJZDogdmFsdWUuc3RvY2twaWxlSWQsIHJlc291cmNlczogaW52ZW50b3J5KHZhbHVlLnJlc291cmNlcykgfTtcbiAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAncHJvZHVjZScgJiYgaWQodmFsdWUuam9iSWQpICYmIHZhbHVlLnN0b2NrcGlsZUlkID09PSBGT1VOREVSX1NUT0NLUElMRV9JRFxuICAgICYmICh2YWx1ZS5yZWNpcGUgPT09ICdzZWVkJyB8fCB2YWx1ZS5yZWNpcGUgPT09ICdyYXRpb25zJykgJiYgdWludCh2YWx1ZS5yZW1haW5pbmdUaWNrcykgJiYgdmFsdWUucmVtYWluaW5nVGlja3MgPiAwKSB7XG4gICAgb3V0Y29tZSA9IHsgdHlwZTogdmFsdWUudHlwZSwgam9iSWQ6IHZhbHVlLmpvYklkLCBzdG9ja3BpbGVJZDogdmFsdWUuc3RvY2twaWxlSWQsXG4gICAgICByZWNpcGU6IHZhbHVlLnJlY2lwZSwgcmVtYWluaW5nVGlja3M6IHZhbHVlLnJlbWFpbmluZ1RpY2tzIH07XG4gIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ3BsYW50JyAmJiB0eXBlb2YgdmFsdWUucGxvdElkID09PSAnc3RyaW5nJyAmJiAvXmNyb3A6WzAtOF0kLy50ZXN0KHZhbHVlLnBsb3RJZClcbiAgICAmJiB1aW50KHZhbHVlLnBsYW50ZWRUaWNrKSAmJiB2YWx1ZS5ncm93dGhUaWNrcyA9PT0gNCkge1xuICAgIG91dGNvbWUgPSB7IHR5cGU6IHZhbHVlLnR5cGUsIHBsb3RJZDogdmFsdWUucGxvdElkLCBwbGFudGVkVGljazogdmFsdWUucGxhbnRlZFRpY2ssIGdyb3d0aFRpY2tzOiB2YWx1ZS5ncm93dGhUaWNrcyB9O1xuICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICdoYXJ2ZXN0X2Nyb3AnICYmIHR5cGVvZiB2YWx1ZS5wbG90SWQgPT09ICdzdHJpbmcnICYmIC9eY3JvcDpbMC04XSQvLnRlc3QodmFsdWUucGxvdElkKVxuICAgICYmIGlzUmVzb3VyY2VzKHZhbHVlLnJlc291cmNlcykgJiYgdmFsdWUucmVzb3VyY2VzLmZvb2QgPT09IDYgJiYgdmFsdWUucmVzb3VyY2VzLmZpYmVyID09PSAxKSB7XG4gICAgb3V0Y29tZSA9IHsgdHlwZTogdmFsdWUudHlwZSwgcGxvdElkOiB2YWx1ZS5wbG90SWQsIHJlc291cmNlczogeyBmb29kOiA2LCBmaWJlcjogMSB9IH07XG4gIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ3RpY2snICYmIHVpbnQodmFsdWUuZnJvbVRpY2spICYmIHVpbnQodmFsdWUudG9UaWNrKVxuICAgICYmIHZhbHVlLnRvVGljayA+IHZhbHVlLmZyb21UaWNrICYmIHZhbHVlLnRvVGljayAtIHZhbHVlLmZyb21UaWNrIDw9IDY0XG4gICAgJiYgQXJyYXkuaXNBcnJheSh2YWx1ZS5jb21wbGV0ZWRKb2JzKSAmJiBBcnJheS5pc0FycmF5KHZhbHVlLnJlYWR5Q3JvcHMpKSB7XG4gICAgY29uc3QgY29tcGxldGVkSm9iczogQXJyYXk8eyBpZDogc3RyaW5nOyByZWNpcGU6IFJlY2lwZUlkOyBvdXRwdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfT4gPSB2YWx1ZS5jb21wbGV0ZWRKb2JzLm1hcCgocmF3OiB1bmtub3duKSA9PiB7XG4gICAgICBpZiAoIW9iamVjdChyYXcpIHx8ICFpZChyYXcuaWQpIHx8IChyYXcucmVjaXBlICE9PSAnc2VlZCcgJiYgcmF3LnJlY2lwZSAhPT0gJ3JhdGlvbnMnKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGNvbXBsZXRlZCBqb2InKTtcbiAgICAgIHJldHVybiB7IGlkOiByYXcuaWQsIHJlY2lwZTogcmF3LnJlY2lwZSwgb3V0cHV0OiBpbnZlbnRvcnkocmF3Lm91dHB1dCkgfTtcbiAgICB9KTtcbiAgICBpZiAoIXZhbHVlLnJlYWR5Q3JvcHMuZXZlcnkoKHBsb3QpID0+IHR5cGVvZiBwbG90ID09PSAnc3RyaW5nJyAmJiAvXmNyb3A6WzAtOF0kLy50ZXN0KHBsb3QpKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHJlYWR5IGNyb3BzJyk7XG4gICAgb3V0Y29tZSA9IHsgdHlwZTogdmFsdWUudHlwZSwgZnJvbVRpY2s6IHZhbHVlLmZyb21UaWNrLCB0b1RpY2s6IHZhbHVlLnRvVGljayxcbiAgICAgIGNvbXBsZXRlZEpvYnMsIHJlYWR5Q3JvcHM6IFsuLi52YWx1ZS5yZWFkeUNyb3BzXSB9O1xuICB9XG4gIGlmIChvdXRjb21lKSB7XG4gICAgaWYgKEpTT04uc3RyaW5naWZ5KG91dGNvbWUpICE9PSBKU09OLnN0cmluZ2lmeSh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBsaWZlLWxvb3Agb3V0Y29tZScpO1xuICAgIHJldHVybiBvdXRjb21lO1xuICB9XG4gIHRocm93IG5ldyBFcnJvcignaW52YWxpZCBjb21tYW5kIG91dGNvbWUnKTtcbn1cblxuZnVuY3Rpb24gaXNSZXNvdXJjZXModmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgcmV0dXJuIG9iamVjdCh2YWx1ZSkgJiYgT2JqZWN0LnZhbHVlcyh2YWx1ZSkuZXZlcnkoKGFtb3VudCkgPT4gdWludChhbW91bnQpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUpvdXJuYWwoc2VlZCA9IDEzMzcsIHNjaGVtYTogQ29tbWFuZEpvdXJuYWxbJ3NjaGVtYSddID0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSk6IENvbW1hbmRKb3VybmFsIHtcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWEsIHNlZWQsXG4gICAgc3RhcnRlckludmVudG9yeTogaW52ZW50b3J5KE0wMDJfU1RBUlRFUl9JTlZFTlRPUlkpLCBlbnRyaWVzOiBbXSxcbiAgfTtcbn1cblxuLyoqIFZhbGlkYXRlIGFuIGVudGlyZSBqb3VybmFsIHdpdGhvdXQgY2hhbmdpbmcgYSBsaXZlIHNlc3Npb24uICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVKb3VybmFsKHZhbHVlOiB1bmtub3duKTogQ29tbWFuZEpvdXJuYWwge1xuICBpZiAoIW9iamVjdCh2YWx1ZSkgfHwgKHZhbHVlLnNjaGVtYSAhPT0gSk9VUk5BTF9TQ0hFTUEgJiYgdmFsdWUuc2NoZW1hICE9PSBERVNJR05fSk9VUk5BTF9TQ0hFTUEgJiYgdmFsdWUuc2NoZW1hICE9PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKVxuICAgIHx8ICF1aW50KHZhbHVlLnNlZWQpIHx8IHZhbHVlLnNlZWQgPiAweGZmZmZmZmZmXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuZW50cmllcykgfHwgdmFsdWUuZW50cmllcy5sZW5ndGggPiBNQVhfSk9VUk5BTF9FTlRSSUVTKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGNvbW1hbmQgam91cm5hbCcpO1xuICB9XG4gIGNvbnN0IGpvdXJuYWw6IENvbW1hbmRKb3VybmFsID0ge1xuICAgIHNjaGVtYTogdmFsdWUuc2NoZW1hLCBzZWVkOiB2YWx1ZS5zZWVkLFxuICAgIHN0YXJ0ZXJJbnZlbnRvcnk6IGludmVudG9yeSh2YWx1ZS5zdGFydGVySW52ZW50b3J5KSwgZW50cmllczogW10sXG4gIH07XG4gIGNvbnN0IGlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmVudHJpZXMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCByYXcgPSB2YWx1ZS5lbnRyaWVzW2ldO1xuICAgIGlmICghb2JqZWN0KHJhdykgfHwgcmF3LnNlcXVlbmNlICE9PSBpIHx8ICF1aW50KHJhdy5yZXZpc2lvbilcbiAgICAgIHx8IHR5cGVvZiByYXcuaGFzaCAhPT0gJ3N0cmluZycgfHwgIS9eWzAtOWEtZl17MTZ9JC8udGVzdChyYXcuaGFzaCkpIHRocm93IG5ldyBFcnJvcignbm9uLWNvbnRpZ3VvdXMgb3IgaW52YWxpZCBqb3VybmFsIGVudHJ5Jyk7XG4gICAgY29uc3QgZW50cnk6IEpvdXJuYWxFbnRyeSA9IHtcbiAgICAgIGNvbW1hbmQ6IHZhbGlkYXRlQ29tbWFuZChyYXcuY29tbWFuZCksIHNlcXVlbmNlOiBpLFxuICAgICAgcmV2aXNpb246IHJhdy5yZXZpc2lvbiwgaGFzaDogcmF3Lmhhc2gsIG91dGNvbWU6IHZhbGlkYXRlT3V0Y29tZShyYXcub3V0Y29tZSksXG4gICAgfTtcbiAgICBpZiAoKGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2J1aWxkJyB8fCBlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdoYXJ2ZXN0JylcbiAgICAgICYmIGVudHJ5LmNvbW1hbmQuc2NoZW1hICE9PSB2YWx1ZS5zY2hlbWEpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignam91cm5hbCBzY2hlbWEgYW5kIGJ1aWxkIGNvbW1hbmQgc2NoZW1hIGRpZmZlcicpO1xuICAgIH1cbiAgICBpZiAoSlNPTi5zdHJpbmdpZnkoZW50cnkpICE9PSBKU09OLnN0cmluZ2lmeShyYXcpKSB0aHJvdyBuZXcgRXJyb3IoJ25vbi1jYW5vbmljYWwgam91cm5hbCBlbnRyeScpO1xuICAgIGlmIChpZHMuaGFzKGVudHJ5LmNvbW1hbmQuaWQpKSB0aHJvdyBuZXcgRXJyb3IoJ2R1cGxpY2F0ZSBqb3VybmFsIGNvbW1hbmQgaWQnKTtcbiAgICBpZiAoZW50cnkuY29tbWFuZC50eXBlICE9PSBlbnRyeS5vdXRjb21lLnR5cGVcbiAgICAgIHx8IGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3QnICYmIGVudHJ5Lm91dGNvbWUudHlwZSA9PT0gJ2hhcnZlc3QnXG4gICAgICAmJiBlbnRyeS5jb21tYW5kLmVudGl0eUlkICE9PSBlbnRyeS5vdXRjb21lLmVudGl0eUlkXG4gICAgICB8fCAoZW50cnkuY29tbWFuZC50eXBlID09PSAncGxhbnQnIHx8IGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3RfY3JvcCcpXG4gICAgICAmJiBlbnRyeS5jb21tYW5kLnR5cGUgPT09IGVudHJ5Lm91dGNvbWUudHlwZSAmJiBlbnRyeS5jb21tYW5kLnBsb3RJZCAhPT0gZW50cnkub3V0Y29tZS5wbG90SWRcbiAgICAgIHx8IChlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdkZXBvc2l0JyB8fCBlbnRyeS5jb21tYW5kLnR5cGUgPT09ICd3aXRoZHJhdycpXG4gICAgICAmJiBlbnRyeS5jb21tYW5kLnR5cGUgPT09IGVudHJ5Lm91dGNvbWUudHlwZVxuICAgICAgJiYgKGVudHJ5LmNvbW1hbmQuc3RvY2twaWxlSWQgIT09IGVudHJ5Lm91dGNvbWUuc3RvY2twaWxlSWRcbiAgICAgICAgfHwgSlNPTi5zdHJpbmdpZnkoZW50cnkuY29tbWFuZC5yZXNvdXJjZXMpICE9PSBKU09OLnN0cmluZ2lmeShlbnRyeS5vdXRjb21lLnJlc291cmNlcykpXG4gICAgICB8fCBlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdwcm9kdWNlJyAmJiBlbnRyeS5vdXRjb21lLnR5cGUgPT09ICdwcm9kdWNlJ1xuICAgICAgJiYgKGVudHJ5LmNvbW1hbmQuc3RvY2twaWxlSWQgIT09IGVudHJ5Lm91dGNvbWUuc3RvY2twaWxlSWQgfHwgZW50cnkuY29tbWFuZC5yZWNpcGUgIT09IGVudHJ5Lm91dGNvbWUucmVjaXBlKVxuICAgICAgfHwgZW50cnkuY29tbWFuZC50eXBlID09PSAndGljaycgJiYgZW50cnkub3V0Y29tZS50eXBlID09PSAndGljaydcbiAgICAgICYmIGVudHJ5Lm91dGNvbWUudG9UaWNrIC0gZW50cnkub3V0Y29tZS5mcm9tVGljayAhPT0gZW50cnkuY29tbWFuZC50aWNrcykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdqb3VybmFsIGNvbW1hbmQgYW5kIG91dGNvbWUgZGlzYWdyZWUnKTtcbiAgICB9XG4gICAgaWRzLmFkZChlbnRyeS5jb21tYW5kLmlkKTtcbiAgICBqb3VybmFsLmVudHJpZXMucHVzaChlbnRyeSk7XG4gIH1cbiAgaWYgKEpTT04uc3RyaW5naWZ5KGpvdXJuYWwpICE9PSBKU09OLnN0cmluZ2lmeSh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBjb21tYW5kIGpvdXJuYWwnKTtcbiAgLy8gVGhpcyBzbGljZSBoYXMgb25lIGRldGVybWluaXN0aWMgZ2VuZXNpcyBjb25maWd1cmF0aW9uLiBBIGNoYW5nZWQgc3RhcnRlclxuICAvLyBncmFudCBtdXN0IG5vdCBwYXNzIHVubm90aWNlZCB3aGVuIHJlcGxheSBiZWdpbnMgZnJvbSBhIGxhdGVyIHNuYXBzaG90LlxuICBpZiAoSlNPTi5zdHJpbmdpZnkoam91cm5hbC5zdGFydGVySW52ZW50b3J5KSAhPT0gSlNPTi5zdHJpbmdpZnkoY3JlYXRlSm91cm5hbCh2YWx1ZS5zZWVkLCB2YWx1ZS5zY2hlbWEpLnN0YXJ0ZXJJbnZlbnRvcnkpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdqb3VybmFsIHN0YXJ0ZXIgaW52ZW50b3J5IGlzIGluY29tcGF0aWJsZSB3aXRoIHRoaXMgdmVyc2lvbicpO1xuICB9XG4gIHJldHVybiBqb3VybmFsO1xufVxuXG5mdW5jdGlvbiByZWZlcmVuY2VzUmV0aXJlZFN0b25lKGVudHJ5OiBKb3VybmFsRW50cnkpOiBib29sZWFuIHtcbiAgcmV0dXJuIC9eaGVybzpzdHlsX3JvY2tfKD86c21hbGx8bWVkaXVtfGxhcmdlKTovLnRlc3QoXG4gICAgZW50cnkuY29tbWFuZC50eXBlID09PSAnaGFydmVzdCcgPyBlbnRyeS5jb21tYW5kLmVudGl0eUlkIDogZW50cnkub3V0Y29tZS50eXBlID09PSAnaGFydmVzdCcgPyBlbnRyeS5vdXRjb21lLmVudGl0eUlkIDogJycsXG4gICk7XG59XG5cbmV4cG9ydCBjbGFzcyBHYW1lU2Vzc2lvbiB7XG4gIHJlYWRvbmx5IGpvdXJuYWw6IENvbW1hbmRKb3VybmFsO1xuICBwcml2YXRlIHJlYWRvbmx5IHByZXBBdXRob3JpemVyOiBMb2NhbEF1dGhvcml6ZXI7XG4gIHByaXZhdGUgcmVhZG9ubHkgc3RydWN0dXJlQXV0aG9yaXplcjogTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyO1xuICBwcml2YXRlIHJlYWRvbmx5IGlkcyA9IG5ldyBNYXA8c3RyaW5nLCBKb3VybmFsRW50cnk+KCk7XG5cbiAgcHJpdmF0ZSBjb25zdHJ1Y3RvcihyZWFkb25seSB3b3JsZDogV29ybGQsIGpvdXJuYWw6IENvbW1hbmRKb3VybmFsKSB7XG4gICAgdGhpcy5qb3VybmFsID0gam91cm5hbDtcbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGpvdXJuYWwuZW50cmllcykgdGhpcy5pZHMuc2V0KGVudHJ5LmNvbW1hbmQuaWQsIGVudHJ5KTtcbiAgICB0aGlzLnByZXBBdXRob3JpemVyID0gbmV3IExvY2FsQXV0aG9yaXplcih7IGVudmVsb3BlOiBNMDAyX0xBWU9VVC5lbnZlbG9wZSB9KTtcbiAgICB0aGlzLnN0cnVjdHVyZUF1dGhvcml6ZXIgPSBuZXcgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyKHsgZW52ZWxvcGU6IE0wMDJfTEFZT1VULmVudmVsb3BlIH0pO1xuICB9XG5cbiAgc3RhdGljIGdlbmVzaXMoc2VlZCA9IDEzMzcpOiBHYW1lU2Vzc2lvbiB7XG4gICAgcmV0dXJuIG5ldyBHYW1lU2Vzc2lvbihnZW5lc2lzV29ybGQoc2VlZCksIGNyZWF0ZUpvdXJuYWwoc2VlZCkpO1xuICB9XG5cbiAgLyoqIENvbXBhdGliaWxpdHkgZW50cnkgcG9pbnQgZm9yIHJlY29yZGVkIE0wMDIgZml4dHVyZXMgYW5kIHNhdmVkIHdvcmxkcy4gKi9cbiAgc3RhdGljIGxlZ2FjeUdlbmVzaXMoc2VlZCA9IDEzMzcsIHNjaGVtYTogdHlwZW9mIEpPVVJOQUxfU0NIRU1BIHwgdHlwZW9mIERFU0lHTl9KT1VSTkFMX1NDSEVNQSA9IEpPVVJOQUxfU0NIRU1BKTogR2FtZVNlc3Npb24ge1xuICAgIHJldHVybiBuZXcgR2FtZVNlc3Npb24oZ2VuZXNpc1dvcmxkKHNlZWQsIGludmVudG9yeShNMDAyX1NUQVJURVJfSU5WRU5UT1JZKSwgc2NoZW1hKSwgY3JlYXRlSm91cm5hbChzZWVkLCBzY2hlbWEpKTtcbiAgfVxuXG4gIC8qKiBSZXBsYXkgYWNjZXB0ZWQgY29tbWFuZHMgaW4gdGhlaXIgYXV0aG9yaXRhdGl2ZSBvcmRlciBmcm9tIGFuIGVtcHR5IHdvcmxkLlxuICAgKiBBIG5vcm1hbCByZXBsYXkgaXMgYXR0ZW1wdGVkIGZpcnN0OiBzdG9uZSBmcm9tIHJldGFpbmVkIGNhaXJucyBhbmQgYnVpbGRpbmdcbiAgICogcHJlcGFyYXRpb24gbXVzdCBub3QgZm9yY2UgaGlzdG9yaWNhbCBtb2RlLiBSYXcgb2xkIGpvdXJuYWxzIGVudGVyIHByaXZhdGVcbiAgICogcmVjb25zdHJ1Y3Rpb24gb25seSB3aGVuIHRoZWlyIG9yaWdpbmFsIHN0b25lIG9ic3RydWN0aW9ucyByZXF1aXJlZCBpdC4gKi9cbiAgc3RhdGljIHJlcGxheShpbnB1dDogdW5rbm93bik6IEdhbWVTZXNzaW9uIHtcbiAgICBjb25zdCBqb3VybmFsID0gdmFsaWRhdGVKb3VybmFsKGlucHV0KTtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIEdhbWVTZXNzaW9uLnJlcGxheUN1cnJlbnQoam91cm5hbCk7XG4gICAgfSBjYXRjaCAoY3VycmVudEVycm9yKSB7XG4gICAgICBpZiAoIWpvdXJuYWwuZW50cmllcy5zb21lKGNvbnRhaW5zUmV0aXJlZFN0b25lKSkgdGhyb3cgY3VycmVudEVycm9yO1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIEdhbWVTZXNzaW9uLnJlY29uc3RydWN0SGlzdG9yaWNhbChqb3VybmFsKS5zZXNzaW9uO1xuICAgICAgfSBjYXRjaCAoaGlzdG9yaWNhbEVycm9yKSB7XG4gICAgICAgIC8vIEFuIGFscmVhZHktbWlncmF0ZWQgam91cm5hbCBoYXMgcmV3cml0dGVuIGhhc2hlczsgdmVyaWZ5IGl0cyByZXRhaW5lZFxuICAgICAgICAvLyBzdG9uZSBjb21tYW5kcyBub3JtYWxseSBpbnN0ZWFkIG9mIGFjY2VwdGluZyB0aGUgZmFpbGVkIG9sZCByZXBsYXkuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEdhbWVTZXNzaW9uLnJlcGxheUN1cnJlbnQoam91cm5hbCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIHRocm93IGhpc3RvcmljYWxFcnJvcjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKiBSZXN0b3JlIGEgdmFsaWRhdGVkIHNuYXBzaG90LCB0aGVuIHJlcGxheSBvbmx5IGl0cyBhY2NlcHRlZC1jb21tYW5kIHRhaWwuICovXG4gIHN0YXRpYyByZXN0b3JlKHNuYXBzaG90SW5wdXQ6IFdvcmxkU25hcHNob3QsIGpvdXJuYWxJbnB1dDogdW5rbm93bik6IEdhbWVTZXNzaW9uIHtcbiAgICBjb25zdCBqb3VybmFsID0gdmFsaWRhdGVKb3VybmFsKGpvdXJuYWxJbnB1dCk7XG4gICAgY29uc3Qgc25hcHNob3QgPSB2YWxpZGF0ZVdvcmxkU25hcHNob3Qoc25hcHNob3RJbnB1dCk7XG4gICAgaWYgKHNuYXBzaG90LnNjaGVtYSAhPT0gam91cm5hbC5zY2hlbWEpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgYW5kIGpvdXJuYWwgc2NoZW1hcyBkaWZmZXInKTtcbiAgICBjb25zdCBuZXh0ID0gc25hcHNob3QubmV4dFNlcXVlbmNlO1xuICAgIGlmIChuZXh0ID4gam91cm5hbC5lbnRyaWVzLmxlbmd0aCkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBpcyBhaGVhZCBvZiB0aGUgam91cm5hbCcpO1xuICAgIC8vIEN1cnJlbnQgc2F2ZXMgKGluY2x1ZGluZyBldmVyeSBtaWdyYXRlZCBib3VuZGFyeSkga2VlcCB0aGVpciBleGFjdCBoYXNoLlxuICAgIC8vIFRyeSB0aGVtIGJlZm9yZSByZWNvbnN0cnVjdGluZyBhIGNvbXBhdGlibGUgb2xkIGpvdXJuYWwuIERlcG9zaXQtb25seVxuICAgIC8vIG1pZ3JhdGVkIHNhdmVzIG5vIGxvbmdlciBjYXJyeSBhbiBleHBsaWNpdCBzdG9uZSBjb21tYW5kIHRvIGNsYXNzaWZ5IHRoZW0uXG4gICAgaWYgKCFzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpKSB7XG4gICAgICB0cnkgeyByZXR1cm4gR2FtZVNlc3Npb24ucmVzdG9yZUN1cnJlbnQoc25hcHNob3QsIGpvdXJuYWwsIG5leHQpOyB9IGNhdGNoIHsgLyogYXV0aGVudGljYXRlZCBtaWdyYXRpb24gYmVsb3cgKi8gfVxuICAgIH1cbiAgICBpZiAobmV4dCA+IDAgfHwgc25hcHNob3QuZW50aXRpZXMuc29tZSgoZW50aXR5KSA9PiBpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSkge1xuICAgICAgLy8gQSBib3VuZGFyeSBhdXRoZW50aWNhdGVkIGR1cmluZyBtaWdyYXRpb24gaXMgY29tcGFyZWQgd2l0aCB0aGUgbWlncmF0ZWRcbiAgICAgIC8vIHN0YXRlOyBhIHJhdyBvbGQgYm91bmRhcnkgaXMgY29tcGFyZWQgd2l0aCB0aGUgb3JpZ2luYWwgaGlzdG9yaWNhbCBvbmUuXG4gICAgICAvLyBCb3RoIHBhdGhzIGF1dGhlbnRpY2F0ZSB0aGUgY29tcGxldGUgb3JpZ2luYWwgYWNjZXB0ZWQgam91cm5hbCBmaXJzdC5cbiAgICAgIGNvbnN0IGhpc3RvcmljYWwgPSBqb3VybmFsLmVudHJpZXMuc29tZShyZWZlcmVuY2VzUmV0aXJlZFN0b25lKVxuICAgICAgICB8fCBzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpO1xuICAgICAgLy8gQSBtaWdyYXRlZCBzYXZlIG5vIGxvbmdlciBjb250YWlucyByZXRpcmVkIGVudGl0aWVzLiBJdHMgcmV3cml0dGVuXG4gICAgICAvLyBib3VuZGFyeSBoYXNoZXMgZGVzY3JpYmUgdGhlIGZpbHRlcmVkIHN0YXRlLCBzbyBvcmRpbmFyeSByZXN0b3JhdGlvblxuICAgICAgLy8gbXVzdCBzdWNjZWVkIGJlZm9yZSB0cnlpbmcgdG8gaW50ZXJwcmV0IGl0IGFzIHJhdyBvbGQtc2F2ZSBieXRlcy5cbiAgICAgIC8vIEEgcmVmZXJlbmNlZCBhdXRob3JlZCBzdG9uZSBhbG9uZSBkb2VzICpub3QqIGltcGx5IGEgcmF3IG9sZCBib3VuZGFyeTpcbiAgICAgIC8vIGxlZ2l0aW1hdGUgc2F2ZXMgY2FuIGNvbnRhaW4gdW50b3VjaGVkIG5hdHVyYWwgcmV0aXJlZCBkZXBvc2l0cyBvbmx5LlxuICAgICAgaWYgKCFzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpKSB7XG4gICAgICAgIHRyeSB7IHJldHVybiBHYW1lU2Vzc2lvbi5yZXN0b3JlQ3VycmVudChzbmFwc2hvdCwgam91cm5hbCwgbmV4dCk7IH0gY2F0Y2ggeyAvKiB0cnkgb3JpZ2luYWwgcmVjb25zdHJ1Y3Rpb24gKi8gfVxuICAgICAgfVxuICAgICAgaWYgKGhpc3RvcmljYWwpIHtcbiAgICAgICAgY29uc3QgcmVjb25zdHJ1Y3RlZCA9IEdhbWVTZXNzaW9uLnJlY29uc3RydWN0SGlzdG9yaWNhbChqb3VybmFsKTtcbiAgICAgICAgY29uc3QgZXhwZWN0ZWQgPSByZWNvbnN0cnVjdGVkLnNuYXBzaG90cy5nZXQobmV4dCk7XG4gICAgICAgIGNvbnN0IG1pZ3JhdGVkID0gZXhwZWN0ZWQgPyBtaWdyYXRlU3RvbmVTbmFwc2hvdChleHBlY3RlZCkgOiB1bmRlZmluZWQ7XG4gICAgICAgIGlmIChtaWdyYXRlZCAmJiBsZWdhY3lTdG9uZUhhc2goc25hcHNob3QpID09PSBsZWdhY3lTdG9uZUhhc2gobWlncmF0ZWQpKVxuICAgICAgICAgIHJldHVybiByZWNvbnN0cnVjdGVkLnNlc3Npb247XG4gICAgICAgIGlmIChzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpXG4gICAgICAgICAgJiYgZXhwZWN0ZWQgJiYgbGVnYWN5U3RvbmVIYXNoKHNuYXBzaG90KSA9PT0gbGVnYWN5U3RvbmVIYXNoKGV4cGVjdGVkKSlcbiAgICAgICAgICByZXR1cm4gcmVjb25zdHJ1Y3RlZC5zZXNzaW9uO1xuICAgICAgICBpZiAoc25hcHNob3QuZW50aXRpZXMuc29tZSgoZW50aXR5KSA9PiBpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignaGlzdG9yaWNhbCBzbmFwc2hvdCBkb2VzIG5vdCBtYXRjaCBpdHMgb3JpZ2luYWwgam91cm5hbCBib3VuZGFyeScpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChuZXh0ID4gMCkgcmV0dXJuIEdhbWVTZXNzaW9uLnJlc3RvcmVDdXJyZW50KHNuYXBzaG90LCBqb3VybmFsLCBuZXh0KTtcbiAgICBjb25zdCBoaXN0b3JpY2FsID0gam91cm5hbC5lbnRyaWVzLnNvbWUoY29udGFpbnNSZXRpcmVkU3RvbmUpO1xuICAgIGlmIChoaXN0b3JpY2FsKSB7XG4gICAgICB0cnkgeyByZXR1cm4gR2FtZVNlc3Npb24ucmVzdG9yZUN1cnJlbnQoc25hcHNob3QsIGpvdXJuYWwsIG5leHQpOyB9IGNhdGNoIHsgLyogcmF3IG9yIG1pZ3JhdGVkIGdlbmVzaXMgKi8gfVxuICAgICAgY29uc3QgcmVjb25zdHJ1Y3RlZCA9IEdhbWVTZXNzaW9uLnJlY29uc3RydWN0SGlzdG9yaWNhbChqb3VybmFsKTtcbiAgICAgIGNvbnN0IHJhd0dlbmVzaXMgPSByZWNvbnN0cnVjdGVkLnNuYXBzaG90cy5nZXQoMCkhO1xuICAgICAgaWYgKGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdCkgPT09IGxlZ2FjeVN0b25lSGFzaChyYXdHZW5lc2lzKSkgcmV0dXJuIHJlY29uc3RydWN0ZWQuc2Vzc2lvbjtcbiAgICB9XG4gICAgcmV0dXJuIEdhbWVTZXNzaW9uLnJlc3RvcmVDdXJyZW50KHNuYXBzaG90LCBqb3VybmFsLCBuZXh0KTtcbiAgfVxuXG4gIC8qKiBSZXBsYXkgYWxyZWFkeS1hdXRoZW50aWNhdGVkIGN1cnJlbnQtc3RhdGUgY29tbWFuZHMuICovXG4gIHByaXZhdGUgc3RhdGljIHJlcGxheUN1cnJlbnQoam91cm5hbDogQ29tbWFuZEpvdXJuYWwpOiBHYW1lU2Vzc2lvbiB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IG5ldyBHYW1lU2Vzc2lvbihcbiAgICAgIGdlbmVzaXNXb3JsZChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc3RhcnRlckludmVudG9yeSwgam91cm5hbC5zY2hlbWEpLFxuICAgICAgY3JlYXRlSm91cm5hbChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc2NoZW1hKSxcbiAgICApO1xuICAgIGZvciAoY29uc3QgZW50cnkgb2Ygam91cm5hbC5lbnRyaWVzKSBzZXNzaW9uLnJlcGxheUVudHJ5KGVudHJ5KTtcbiAgICByZXR1cm4gc2Vzc2lvbjtcbiAgfVxuXG4gIHByaXZhdGUgc3RhdGljIHJlc3RvcmVDdXJyZW50KHNuYXBzaG90OiBXb3JsZFNuYXBzaG90LCBqb3VybmFsOiBDb21tYW5kSm91cm5hbCwgbmV4dDogbnVtYmVyKTogR2FtZVNlc3Npb24ge1xuICAgIGNvbnN0IHdvcmxkID0gd29ybGRGcm9tU25hcHNob3Qoc25hcHNob3QpO1xuICAgIGlmICh3b3JsZC5zZWVkICE9PSBqb3VybmFsLnNlZWQpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgYW5kIGpvdXJuYWwgc2VlZHMgZGlmZmVyJyk7XG4gICAgY29uc3QgZ2VuZXNpcyA9IGdlbmVzaXNXb3JsZChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc3RhcnRlckludmVudG9yeSwgam91cm5hbC5zY2hlbWEpO1xuICAgIGlmIChuZXh0ID09PSAwICYmIGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdCkgIT09IGNhbm9uaWNhbFdvcmxkSGFzaChnZW5lc2lzLCAwLCBqb3VybmFsLnNjaGVtYSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignZ2VuZXNpcyBzbmFwc2hvdCBkb2VzIG5vdCBtYXRjaCBqb3VybmFsIGNvbmZpZ3VyYXRpb24nKTtcbiAgICB9XG4gICAgaWYgKG5leHQgPiAwICYmIGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdCkgIT09IGpvdXJuYWwuZW50cmllc1tuZXh0IC0gMV0uaGFzaCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXNoIGRvZXMgbm90IG1hdGNoIGl0cyBqb3VybmFsIGJvdW5kYXJ5Jyk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb24gPSBHYW1lU2Vzc2lvbi5mcm9tVmFsaWRhdGVkQm91bmRhcnkod29ybGQsIHtcbiAgICAgIHNjaGVtYTogam91cm5hbC5zY2hlbWEsIHNlZWQ6IGpvdXJuYWwuc2VlZCxcbiAgICAgIHN0YXJ0ZXJJbnZlbnRvcnk6IHsgLi4uam91cm5hbC5zdGFydGVySW52ZW50b3J5IH0sIGVudHJpZXM6IGpvdXJuYWwuZW50cmllcy5zbGljZSgwLCBuZXh0KSxcbiAgICB9KTtcbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGpvdXJuYWwuZW50cmllcy5zbGljZShuZXh0KSkgc2Vzc2lvbi5yZXBsYXlFbnRyeShlbnRyeSk7XG4gICAgcmV0dXJuIHNlc3Npb247XG4gIH1cblxuICAvKiogQGludGVybmFsIEFzc2VtYmxlIGFuIGF1dGhlbnRpY2F0ZWQgc2F2ZSBib3VuZGFyeTsgZ2FtZXBsYXkgdXNlcyBkaXNwYXRjaC4gKi9cbiAgcHJpdmF0ZSBzdGF0aWMgZnJvbVZhbGlkYXRlZEJvdW5kYXJ5KHdvcmxkOiBXb3JsZCwgam91cm5hbDogQ29tbWFuZEpvdXJuYWwpOiBHYW1lU2Vzc2lvbiB7XG4gICAgcmV0dXJuIG5ldyBHYW1lU2Vzc2lvbih3b3JsZCwgam91cm5hbCk7XG4gIH1cblxuICAvKiogQGludGVybmFsIFNvdXJjZSBmb3IgZGV0ZXJtaW5pc3RpYyBvbGQtc2F2ZSBmaXh0dXJlczsgbm90IGEgbGl2ZSBzZXNzaW9uLiAqL1xuICBzdGF0aWMgaGlzdG9yaWNhbEpvdXJuYWwod29ybGQ6IFdvcmxkKTogR2FtZVNlc3Npb24ge1xuICAgIHJldHVybiBuZXcgR2FtZVNlc3Npb24od29ybGQsIGNyZWF0ZUpvdXJuYWwod29ybGQuc2VlZCwgd29ybGQubGlmZSA/IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUFcbiAgICAgIDogd29ybGQuc3RydWN0dXJlcy5zaXplID4gMCA/IERFU0lHTl9KT1VSTkFMX1NDSEVNQSA6IEpPVVJOQUxfU0NIRU1BKSk7XG4gIH1cblxuICAvKiogQGludGVybmFsIFNvdXJjZSBmb3IgZGV0ZXJtaW5pc3RpYyBvbGQtc2F2ZSBmaXh0dXJlczsgbm90IGEgbGl2ZSBzZXNzaW9uLiAqL1xuICBzdGF0aWMgaGlzdG9yaWNhbEdlbmVzaXNXb3JsZChzZWVkID0gMTMzNywgc2NoZW1hOiBDb21tYW5kSm91cm5hbFsnc2NoZW1hJ10gPSBKT1VSTkFMX1NDSEVNQSk6IFdvcmxkIHtcbiAgICByZXR1cm4gaGlzdG9yaWNhbEdlbmVzaXNXb3JsZChzZWVkLCBpbnZlbnRvcnkoTTAwMl9TVEFSVEVSX0lOVkVOVE9SWSksIHNjaGVtYSk7XG4gIH1cblxuICBwcml2YXRlIHN0YXRpYyByZWNvbnN0cnVjdEhpc3RvcmljYWwoam91cm5hbDogQ29tbWFuZEpvdXJuYWwpOiB7XG4gICAgc2Vzc2lvbjogR2FtZVNlc3Npb247IHNuYXBzaG90czogTWFwPG51bWJlciwgV29ybGRTbmFwc2hvdD47XG4gIH0ge1xuICAgIGNvbnN0IGV4cGVjdGVkR2VuZXNpcyA9IGhpc3RvcmljYWxHZW5lc2lzV29ybGQoam91cm5hbC5zZWVkLCBqb3VybmFsLnN0YXJ0ZXJJbnZlbnRvcnksIGpvdXJuYWwuc2NoZW1hKTtcbiAgICBjb25zdCBzbmFwc2hvdHMgPSBuZXcgTWFwPG51bWJlciwgV29ybGRTbmFwc2hvdD4oKTtcbiAgICBzbmFwc2hvdHMuc2V0KDAsIGNyZWF0ZVdvcmxkU25hcHNob3QoZXhwZWN0ZWRHZW5lc2lzLCAwLCBqb3VybmFsLnNjaGVtYSkpO1xuICAgIGNvbnN0IHJlcGxheSA9IG5ldyBHYW1lU2Vzc2lvbihleHBlY3RlZEdlbmVzaXMsIGNyZWF0ZUpvdXJuYWwoam91cm5hbC5zZWVkLCBqb3VybmFsLnNjaGVtYSkpO1xuICAgIGNvbnN0IG1pZ3JhdGVkSm91cm5hbCA9IGNyZWF0ZUpvdXJuYWwoam91cm5hbC5zZWVkLCBqb3VybmFsLnNjaGVtYSk7XG4gICAgZm9yIChjb25zdCBlbnRyeSBvZiBqb3VybmFsLmVudHJpZXMpIHtcbiAgICAgIHJlcGxheS5yZXBsYXlFbnRyeShlbnRyeSk7XG4gICAgICBjb25zdCBzbmFwc2hvdCA9IGNyZWF0ZVdvcmxkU25hcHNob3QocmVwbGF5LndvcmxkLCByZXBsYXkubmV4dFNlcXVlbmNlLCBqb3VybmFsLnNjaGVtYSk7XG4gICAgICBzbmFwc2hvdHMuc2V0KHJlcGxheS5uZXh0U2VxdWVuY2UsIHNuYXBzaG90KTtcbiAgICAgIC8vIEtlZXAgdGhlIHJld3JpdHRlbiBhdXRoZW50aWNhdGVkIGJvdW5kYXJ5IGluIHRoZSByZXR1cm5lZCBqb3VybmFsLiBBXG4gICAgICAvLyByZXBsYXktb25seSBqb3VybmFsIHJlYnVpbGQgd291bGQgc2lsZW50bHkgcHV0IHRoZSByYXcgaGFzaCBiYWNrLlxuICAgICAgZW50cnkuaGFzaCA9IGxlZ2FjeVN0b25lSGFzaChtaWdyYXRlU3RvbmVTbmFwc2hvdChzbmFwc2hvdCkpO1xuICAgICAgbWlncmF0ZWRKb3VybmFsLmVudHJpZXMucHVzaChlbnRyeSk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb24gPSBHYW1lU2Vzc2lvbi5mcm9tVmFsaWRhdGVkQm91bmRhcnkocmVwbGF5LndvcmxkLCBtaWdyYXRlZEpvdXJuYWwpO1xuICAgIHJldHVybiB7IHNlc3Npb246IHNlc3Npb24ubWlncmF0ZVJldGlyZWRTdG9uZXMoKSwgc25hcHNob3RzIH07XG4gIH1cblxuICBwcml2YXRlIHNuYXBzaG90U2NoZW1hKCk6IFdvcmxkU25hcHNob3RbJ3NjaGVtYSddIHsgcmV0dXJuIHRoaXMuam91cm5hbC5zY2hlbWE7IH1cblxuICBnZXQgbmV4dFNlcXVlbmNlKCk6IG51bWJlciB7IHJldHVybiB0aGlzLmpvdXJuYWwuZW50cmllcy5sZW5ndGg7IH1cbiAgZ2V0IHNuYXBzaG90KCk6IFdvcmxkU25hcHNob3Qge1xuICAgIHJldHVybiBjcmVhdGVXb3JsZFNuYXBzaG90KHRoaXMud29ybGQsIHRoaXMubmV4dFNlcXVlbmNlLCB0aGlzLnNuYXBzaG90U2NoZW1hKCkpO1xuICB9XG4gIGdldCBzdGF0ZUhhc2goKTogc3RyaW5nIHtcbiAgICByZXR1cm4gY2Fub25pY2FsV29ybGRIYXNoKHRoaXMud29ybGQsIHRoaXMubmV4dFNlcXVlbmNlLCB0aGlzLnNuYXBzaG90U2NoZW1hKCkpO1xuICB9XG5cbiAgY29tbWFuZElkKGtpbmQ6IENvbW1hbmRbJ3R5cGUnXSwgdGFyZ2V0OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIC8vIEVudGl0eSBJRHMgY29udGFpbiBjaHVuayBjb29yZGluYXRlczsgZW5jb2RlIGNvbW1hcyBhbmQgb3RoZXIgc2VwYXJhdG9yc1xuICAgIC8vIHNvIGdlbmVyYXRlZCBjb21tYW5kcyBzYXRpc2Z5IHRoZSBzYW1lIGVudmVsb3BlIHZhbGlkYXRpb24gYXMgaW5wdXQuXG4gICAgcmV0dXJuIGAke2tpbmR9OiR7dGhpcy5uZXh0U2VxdWVuY2V9OiR7ZW5jb2RlVVJJQ29tcG9uZW50KHRhcmdldCl9YDtcbiAgfVxuXG4gIGVudHJ5KHNlcXVlbmNlOiBudW1iZXIpOiBKb3VybmFsRW50cnkgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5qb3VybmFsLmVudHJpZXNbc2VxdWVuY2VdOyB9XG5cbiAgZGlzcGF0Y2goaW5wdXQ6IHVua25vd24pOiBDb21tYW5kUmVjZWlwdCB8IENvbW1hbmRSZWplY3Rpb24ge1xuICAgIGxldCBjb21tYW5kOiBDb21tYW5kO1xuICAgIHRyeSB7IGNvbW1hbmQgPSB2YWxpZGF0ZUNvbW1hbmQoaW5wdXQpOyB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIHRoaXMucmVqZWN0KG9iamVjdChpbnB1dCkgJiYgdHlwZW9mIGlucHV0LmlkID09PSAnc3RyaW5nJyA/IGlucHV0LmlkIDogJycsXG4gICAgICAgICdpbnZhbGlkX2NvbW1hbmQnLCBbKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlXSk7XG4gICAgfVxuICAgIGlmICgoY29tbWFuZC50eXBlID09PSAnYnVpbGQnIHx8IGNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3QnKVxuICAgICAgJiYgY29tbWFuZC5zY2hlbWEgIT09IHRoaXMuam91cm5hbC5zY2hlbWFcbiAgICAgIHx8IGNvbW1hbmQudHlwZSAhPT0gJ2J1aWxkJyAmJiBjb21tYW5kLnR5cGUgIT09ICdoYXJ2ZXN0J1xuICAgICAgICAmJiB0aGlzLmpvdXJuYWwuc2NoZW1hICE9PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgJ3NjaGVtYV9taXNtYXRjaCcsIFsnY29tbWFuZCBzY2hlbWEgZG9lcyBub3QgbWF0Y2ggdGhpcyB3b3JsZCBqb3VybmFsJ10pO1xuICAgIH1cbiAgICBjb25zdCBwcmlvciA9IHRoaXMuaWRzLmdldChjb21tYW5kLmlkKTtcbiAgICBpZiAocHJpb3IpIHtcbiAgICAgIGlmICghc2FtZUZpZWxkcyhwcmlvci5jb21tYW5kLCBjb21tYW5kKSkge1xuICAgICAgICByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgJ2R1cGxpY2F0ZV9jb21tYW5kX2lkJywgWydjb21tYW5kIGlkIGFscmVhZHkgaGFzIGRpZmZlcmVudCBhY2NlcHRlZCBpbnB1dCddKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLnJlY2VpcHQocHJpb3IsIHRydWUpO1xuICAgIH1cbiAgICBpZiAoY29tbWFuZC5leHBlY3RlZFJldmlzaW9uICE9PSB0aGlzLndvcmxkLnJldmlzaW9uKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgJ3N0YWxlX3JldmlzaW9uJywgW1xuICAgICAgICBgY29tbWFuZCBleHBlY3RzIHJldmlzaW9uICR7Y29tbWFuZC5leHBlY3RlZFJldmlzaW9ufTsgd29ybGQgaXMgYXQgJHt0aGlzLndvcmxkLnJldmlzaW9ufWAsXG4gICAgICBdKTtcbiAgICB9XG4gICAgY29uc3QgYmVmb3JlID0gdGhpcy5zdGF0ZUhhc2g7XG4gICAgbGV0IG91dGNvbWU6IENvbW1hbmRPdXRjb21lO1xuICAgIGlmIChjb21tYW5kLnR5cGUgPT09ICdidWlsZCcpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGJ1aWxkUHJvamVjdCh0aGlzLndvcmxkLCB0aGlzLnByZXBBdXRob3JpemVyLCB0aGlzLnN0cnVjdHVyZUF1dGhvcml6ZXIsXG4gICAgICAgIHByb2plY3RCeUlkKGNvbW1hbmQucHJvamVjdElkKSxcbiAgICAgICAgJ2Rlc2lnblZlcnNpb24nIGluIGNvbW1hbmQgPyBjb21tYW5kLmRlc2lnblZlcnNpb24gOiB1bmRlZmluZWQpO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHtcbiAgICAgICAgaWYgKHRoaXMuc3RhdGVIYXNoICE9PSBiZWZvcmUpIHRocm93IG5ldyBFcnJvcigncmVqZWN0ZWQgYnVpbGQgY2hhbmdlZCBhdXRob3JpdGF0aXZlIHN0YXRlJyk7XG4gICAgICAgIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCByZXN1bHQuY29kZSwgcmVzdWx0LnJlYXNvbnMpO1xuICAgICAgfVxuICAgICAgb3V0Y29tZSA9IHtcbiAgICAgICAgdHlwZTogJ2J1aWxkJywgc3RydWN0dXJlSWQ6IHJlc3VsdC5yZWNvcmQuaWQsXG4gICAgICAgIGNvc3RQYWlkOiBpbnZlbnRvcnkocmVzdWx0LnN0cnVjdHVyZS5jb3N0UGFpZCksXG4gICAgICAgIHJlc291cmNlc0dhaW5lZDogaW52ZW50b3J5KHJlc3VsdC5wcmVwYXJhdGlvbi5yZXNvdXJjZXNHYWluZWQpLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKGNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3QnKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBoYXJ2ZXN0RW50aXR5KHRoaXMud29ybGQsIGNvbW1hbmQuZW50aXR5SWQpO1xuICAgICAgaWYgKCFyZXN1bHQpIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCAnbm90X2hhcnZlc3RhYmxlJywgWydlbnRpdHkgaXMgYWJzZW50LCBkZXBsZXRlZCBvciBoYXMgbm8gcmVzb3VyY2UnXSk7XG4gICAgICBvdXRjb21lID0ge1xuICAgICAgICB0eXBlOiAnaGFydmVzdCcsIGVudGl0eUlkOiByZXN1bHQuZW50aXR5LmlkLFxuICAgICAgICByZXNvdXJjZTogcmVzdWx0LnJlc291cmNlLCBhbW91bnQ6IHJlc3VsdC5hbW91bnQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSAnZGVwb3NpdCcgfHwgY29tbWFuZC50eXBlID09PSAnd2l0aGRyYXcnKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSB0cmFuc2Zlcih0aGlzLndvcmxkLCBjb21tYW5kLnR5cGUsIGNvbW1hbmQucmVzb3VyY2VzKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgICAgIGlmICh0aGlzLnN0YXRlSGFzaCAhPT0gYmVmb3JlKSB0aHJvdyBuZXcgRXJyb3IoJ3JlamVjdGVkIHRyYW5zZmVyIGNoYW5nZWQgYXV0aG9yaXRhdGl2ZSBzdGF0ZScpO1xuICAgICAgICByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgcmVzdWx0LmNvZGUsIHJlc3VsdC5yZWFzb25zKTtcbiAgICAgIH1cbiAgICAgIG91dGNvbWUgPSB7IHR5cGU6IGNvbW1hbmQudHlwZSwgc3RvY2twaWxlSWQ6IEZPVU5ERVJfU1RPQ0tQSUxFX0lELCByZXNvdXJjZXM6IHJlc3VsdC52YWx1ZSB9O1xuICAgIH0gZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSAncHJvZHVjZScpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHN0YXJ0UHJvZHVjdGlvbih0aGlzLndvcmxkLCBjb21tYW5kLnJlY2lwZSwgY29tbWFuZC5pZCk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsIHJlc3VsdC5jb2RlLCByZXN1bHQucmVhc29ucyk7XG4gICAgICBvdXRjb21lID0geyB0eXBlOiAncHJvZHVjZScsIGpvYklkOiByZXN1bHQudmFsdWUuaWQsIHN0b2NrcGlsZUlkOiByZXN1bHQudmFsdWUuc3RvY2twaWxlSWQsXG4gICAgICAgIHJlY2lwZTogcmVzdWx0LnZhbHVlLnJlY2lwZSwgcmVtYWluaW5nVGlja3M6IHJlc3VsdC52YWx1ZS5yZW1haW5pbmdUaWNrcyB9O1xuICAgIH0gZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSAndGljaycpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGFkdmFuY2VUaWNrcyh0aGlzLndvcmxkLCBjb21tYW5kLnRpY2tzKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgcmVzdWx0LmNvZGUsIHJlc3VsdC5yZWFzb25zKTtcbiAgICAgIG91dGNvbWUgPSB7IHR5cGU6ICd0aWNrJywgLi4ucmVzdWx0LnZhbHVlIH07XG4gICAgfSBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09ICdwbGFudCcpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHBsYW50Q3JvcCh0aGlzLndvcmxkLCBjb21tYW5kLnBsb3RJZCk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsIHJlc3VsdC5jb2RlLCByZXN1bHQucmVhc29ucyk7XG4gICAgICBvdXRjb21lID0geyB0eXBlOiAncGxhbnQnLCBwbG90SWQ6IGNvbW1hbmQucGxvdElkLFxuICAgICAgICBwbGFudGVkVGljazogcmVzdWx0LnZhbHVlLnBsYW50ZWRUaWNrLCBncm93dGhUaWNrczogcmVzdWx0LnZhbHVlLmdyb3d0aFRpY2tzIH07XG4gICAgfSBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09ICdoYXJ2ZXN0X2Nyb3AnKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBoYXJ2ZXN0Q3JvcCh0aGlzLndvcmxkLCBjb21tYW5kLnBsb3RJZCk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsIHJlc3VsdC5jb2RlLCByZXN1bHQucmVhc29ucyk7XG4gICAgICBvdXRjb21lID0geyB0eXBlOiAnaGFydmVzdF9jcm9wJywgcGxvdElkOiBjb21tYW5kLnBsb3RJZCwgcmVzb3VyY2VzOiByZXN1bHQudmFsdWUgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCd1bmhhbmRsZWQgY29tbWFuZCB0eXBlJyk7XG4gICAgfVxuICAgIGNvbnN0IGVudHJ5OiBKb3VybmFsRW50cnkgPSB7XG4gICAgICBjb21tYW5kLCBzZXF1ZW5jZTogdGhpcy5uZXh0U2VxdWVuY2UsIHJldmlzaW9uOiB0aGlzLndvcmxkLnJldmlzaW9uLFxuICAgICAgLy8gVGhlIHNlcXVlbmNlIGlzIHBhcnQgb2YgdGhlIHN0YXRlIGhhc2ggYXQgdGhpcyBhY2NlcHRlZCBib3VuZGFyeS5cbiAgICAgIGhhc2g6IGNhbm9uaWNhbFdvcmxkSGFzaCh0aGlzLndvcmxkLCB0aGlzLm5leHRTZXF1ZW5jZSArIDEsIHRoaXMuc25hcHNob3RTY2hlbWEoKSksIG91dGNvbWUsXG4gICAgfTtcbiAgICB0aGlzLmpvdXJuYWwuZW50cmllcy5wdXNoKGVudHJ5KTtcbiAgICB0aGlzLmlkcy5zZXQoY29tbWFuZC5pZCwgZW50cnkpO1xuICAgIHJldHVybiB0aGlzLnJlY2VpcHQoZW50cnksIGZhbHNlKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVwbGF5RW50cnkoZW50cnk6IEpvdXJuYWxFbnRyeSk6IHZvaWQge1xuICAgIGlmIChlbnRyeS5zZXF1ZW5jZSAhPT0gdGhpcy5uZXh0U2VxdWVuY2UpIHRocm93IG5ldyBFcnJvcignam91cm5hbCBzZXF1ZW5jZSBnYXAnKTtcbiAgICBjb25zdCByZWNlaXB0ID0gdGhpcy5kaXNwYXRjaChlbnRyeS5jb21tYW5kKTtcbiAgICBpZiAoIXJlY2VpcHQub2sgfHwgcmVjZWlwdC5kdXBsaWNhdGUgfHwgcmVjZWlwdC5oYXNoICE9PSBlbnRyeS5oYXNoXG4gICAgICB8fCByZWNlaXB0LnJldmlzaW9uICE9PSBlbnRyeS5yZXZpc2lvblxuICAgICAgfHwgSlNPTi5zdHJpbmdpZnkocmVjZWlwdC5vdXRjb21lKSAhPT0gSlNPTi5zdHJpbmdpZnkoZW50cnkub3V0Y29tZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgam91cm5hbCByZXBsYXkgZGl2ZXJnZWQgYXQgc2VxdWVuY2UgJHtlbnRyeS5zZXF1ZW5jZX1gKTtcbiAgICB9XG4gIH1cblxuICAvKiogSGlzdG9yaWNhbCBlbnRyaWVzIGhhdmUgcGFzc2VkIHRoZWlyIG9yaWdpbmFsIG91dGNvbWUvaGFzaCBjaGVja3MuIFRoZWlyXG4gICAqIGFjY2VwdGVkIGNvbW1hbmRzIGFuZCBzdG9uZSB5aWVsZHMgcmVtYWluOyBvbmx5IGVudGl0eSBleGlzdGVuY2UgYW5kIHRoZVxuICAgKiByZXN1bHRpbmcgY2Fub25pY2FsIGJvdW5kYXJ5IGhhc2hlcyBjaGFuZ2UuICovXG4gIHByaXZhdGUgbWlncmF0ZVJldGlyZWRTdG9uZXMoKTogR2FtZVNlc3Npb24ge1xuICAgIHJldGlyZVN0b25lRW50aXRpZXModGhpcy53b3JsZCk7XG4gICAgZmluaXNoU3RvbmVSZXBsYXkodGhpcy53b3JsZCk7XG4gICAgY29uc3QgbWlncmF0ZWQgPSBjcmVhdGVXb3JsZFNuYXBzaG90KHRoaXMud29ybGQsIHRoaXMubmV4dFNlcXVlbmNlLCB0aGlzLnNuYXBzaG90U2NoZW1hKCkpO1xuICAgIHJlc3RvcmVXb3JsZFNuYXBzaG90RXhhY3QodGhpcy53b3JsZCwgbWlncmF0ZWQpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgcHJpdmF0ZSByZWNlaXB0KGVudHJ5OiBKb3VybmFsRW50cnksIGR1cGxpY2F0ZTogYm9vbGVhbik6IENvbW1hbmRSZWNlaXB0IHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IHRydWUsIGR1cGxpY2F0ZSwgaWQ6IGVudHJ5LmNvbW1hbmQuaWQsIHNlcXVlbmNlOiBlbnRyeS5zZXF1ZW5jZSxcbiAgICAgIHJldmlzaW9uOiBlbnRyeS5yZXZpc2lvbiwgaGFzaDogZW50cnkuaGFzaCwgb3V0Y29tZTogZW50cnkub3V0Y29tZSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSByZWplY3QoaWQ6IHN0cmluZywgY29kZTogc3RyaW5nLCByZWFzb25zOiBzdHJpbmdbXSk6IENvbW1hbmRSZWplY3Rpb24ge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZHVwbGljYXRlOiBmYWxzZSwgaWQsIGNvZGUsIHJlYXNvbnMgfTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXNpc1dvcmxkKHNlZWQ6IG51bWJlciwgc3RhcnRlciA9IGludmVudG9yeShNMDAyX1NUQVJURVJfSU5WRU5UT1JZKSxcbiAgc2NoZW1hOiBDb21tYW5kSm91cm5hbFsnc2NoZW1hJ10gPSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKTogV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGdlbmVyYXRlV29ybGQoc2VlZCwgMCk7XG4gIHdvcmxkLmludmVudG9yeSA9IHsgLi4uc3RhcnRlciB9O1xuICBpZiAoc2NoZW1hID09PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKSB3b3JsZC5saWZlID0gY3JlYXRlTGlmZVN0YXRlKCk7XG4gIHJldHVybiB3b3JsZDtcbn1cblxuZnVuY3Rpb24gaGlzdG9yaWNhbEdlbmVzaXNXb3JsZChzZWVkOiBudW1iZXIsIHN0YXJ0ZXI6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4sXG4gIHNjaGVtYTogQ29tbWFuZEpvdXJuYWxbJ3NjaGVtYSddKTogV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHNlZWQpO1xuICBlbmFibGVTdG9uZVJlcGxheSh3b3JsZCk7XG4gIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZCk7XG4gIHdvcmxkLmludmVudG9yeSA9IHsgLi4uc3RhcnRlciB9O1xuICBpZiAoc2NoZW1hID09PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKSB3b3JsZC5saWZlID0gY3JlYXRlTGlmZVN0YXRlKCk7XG4gIHJldHVybiB3b3JsZDtcbn1cblxuZnVuY3Rpb24gY29udGFpbnNSZXRpcmVkU3RvbmUoZW50cnk6IEpvdXJuYWxFbnRyeSk6IGJvb2xlYW4ge1xuICBpZiAoZW50cnkuY29tbWFuZC50eXBlID09PSAnaGFydmVzdCcpIHtcbiAgICByZXR1cm4gZW50cnkub3V0Y29tZS50eXBlID09PSAnaGFydmVzdCdcbiAgICAgICYmIChlbnRyeS5vdXRjb21lLnJlc291cmNlID09PSAnc3RvbmUnXG4gICAgICAgIHx8IC9eaGVybzpzdHlsX3JvY2tfKD86c21hbGx8bWVkaXVtfGxhcmdlKTovLnRlc3QoZW50cnkuY29tbWFuZC5lbnRpdHlJZCkpO1xuICB9XG4gIHJldHVybiBlbnRyeS5vdXRjb21lLnR5cGUgPT09ICdidWlsZCcgJiYgKGVudHJ5Lm91dGNvbWUucmVzb3VyY2VzR2FpbmVkLnN0b25lID8/IDApID4gMDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhcnZlc3RlZEVudGl0eShzZXNzaW9uOiBHYW1lU2Vzc2lvbiwgaWQ6IHN0cmluZyk6IEVudGl0eSB8IHVuZGVmaW5lZCB7XG4gIHJldHVybiBzZXNzaW9uLndvcmxkLmVudGl0aWVzLmdldChpZCk7XG59XG4iLCAiLy8gQnJvd3NlciBwZXJzaXN0ZW5jZSBpcyBhIHRyYW5zcG9ydCBjb25jZXJuOyBHYW1lU2Vzc2lvbiByZW1haW5zIERPTS1mcmVlLlxuLy8gQSBzaW5nbGUgV2ViIFN0b3JhZ2Uga2V5IGdpdmVzIGJyb3dzZXJzIGFuIGF0b21pYyBzbmFwc2hvdCArIGpvdXJuYWwgcmVwbGFjZS5cbmltcG9ydCB7IENvbW1hbmRKb3VybmFsLCBHYW1lU2Vzc2lvbiB9IGZyb20gJy4vc2Vzc2lvbic7XG5pbXBvcnQgeyBXb3JsZFNuYXBzaG90IH0gZnJvbSAnLi4vc2ltL3NuYXBzaG90JztcblxuZXhwb3J0IGNvbnN0IFNBVkVfU0NIRU1BID0gMSBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBERVNJR05fU0FWRV9TQ0hFTUEgPSAyIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IENVUlJFTlRfU0FWRV9TQ0hFTUEgPSAzIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IE1BWF9TQVZFX0pTT05fQllURVMgPSAzMF8wMDBfMDAwO1xuZXhwb3J0IGludGVyZmFjZSBTYXZlUmVjb3JkIHtcbiAgc2NoZW1hOiB0eXBlb2YgU0FWRV9TQ0hFTUEgfCB0eXBlb2YgREVTSUdOX1NBVkVfU0NIRU1BIHwgdHlwZW9mIENVUlJFTlRfU0FWRV9TQ0hFTUE7XG4gIHNlZWQ6IG51bWJlcjtcbiAgc25hcHNob3Q6IFdvcmxkU25hcHNob3Q7XG4gIGpvdXJuYWw6IENvbW1hbmRKb3VybmFsO1xufVxuZXhwb3J0IGludGVyZmFjZSBLZXlWYWx1ZVN0b3JhZ2Uge1xuICBnZXRJdGVtKGtleTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbDtcbiAgc2V0SXRlbShrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IHZvaWQ7XG4gIHJlbW92ZUl0ZW0oa2V5OiBzdHJpbmcpOiB2b2lkO1xufVxuZXhwb3J0IHR5cGUgTG9hZFN0YXR1cyA9ICduZXcnIHwgJ3Jlc3RvcmVkJyB8ICdzYXZlZCcgfCAnY29ycnVwdCcgfCAndW5hdmFpbGFibGUnO1xuZXhwb3J0IGludGVyZmFjZSBMb2FkUmVzdWx0IHtcbiAgc2Vzc2lvbjogR2FtZVNlc3Npb247XG4gIHN0YXR1czogTG9hZFN0YXR1cztcbiAgbWVzc2FnZTogc3RyaW5nO1xufVxuZXhwb3J0IGludGVyZmFjZSBQZXJzaXN0ZW5jZU1ldHJpY3Mge1xuICBzY2hlbWE6IFNhdmVSZWNvcmRbJ3NjaGVtYSddO1xuICBrZXk6IHN0cmluZztcbiAgc3RhdHVzOiBMb2FkU3RhdHVzO1xuICAvKiogVHJ1ZSBvbmx5IHdoZW4gc3RvcmFnZSBpcyBjdXJyZW50bHkgdXNhYmxlIGFuZCB0aGUgbGF0ZXN0IHNhdmUgYXR0ZW1wdCBzdWNjZWVkZWQuICovXG4gIHBlcnNpc3RlbnQ6IGJvb2xlYW47XG4gIG1lc3NhZ2U6IHN0cmluZztcbn1cbmV4cG9ydCBpbnRlcmZhY2UgU2F2ZVJlc3VsdCB7XG4gIG9rOiBib29sZWFuO1xuICBtZXNzYWdlOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIHNhdmVLZXkoc2VlZDogbnVtYmVyLCBzY2hlbWE6IFNhdmVSZWNvcmRbJ3NjaGVtYSddKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBhc3RyaXg6bTAwMjp2JHtzY2hlbWF9OnNlZWQ6JHtzZWVkfWA7XG59XG5cbi8qKiBWYWxpZGF0ZSB0aGUgZW52ZWxvcGUgYmVmb3JlIHJlc3RvcmluZzsgbmV2ZXIgdHJ1c3QgSlNPTiB0eXBlIGFzc2VydGlvbnMuICovXG5mdW5jdGlvbiBwYXJzZVNhdmUocmF3OiBzdHJpbmcsIHNlZWQ6IG51bWJlciwgc2NoZW1hOiBTYXZlUmVjb3JkWydzY2hlbWEnXSk6IFNhdmVSZWNvcmQge1xuICBpZiAocmF3Lmxlbmd0aCA+IE1BWF9TQVZFX0pTT05fQllURVMpIHRocm93IG5ldyBFcnJvcignc2F2ZSBleGNlZWRzIHRoZSBKU09OIHNpemUgbGltaXQnKTtcbiAgY29uc3QgdmFsdWU6IHVua25vd24gPSBKU09OLnBhcnNlKHJhdyk7XG4gIGlmICh0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnIHx8IHZhbHVlID09PSBudWxsIHx8IEFycmF5LmlzQXJyYXkodmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgc2F2ZSBlbnZlbG9wZScpO1xuICBjb25zdCByZWNvcmQgPSB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgaWYgKHJlY29yZC5zY2hlbWEgIT09IHNjaGVtYSB8fCByZWNvcmQuc2VlZCAhPT0gc2VlZFxuICAgIHx8ICEoJ3NuYXBzaG90JyBpbiByZWNvcmQpIHx8ICEoJ2pvdXJuYWwnIGluIHJlY29yZClcbiAgICB8fCBPYmplY3Qua2V5cyhyZWNvcmQpLmxlbmd0aCAhPT0gNCkgdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBvciBtYWxmb3JtZWQgc2F2ZSBlbnZlbG9wZScpO1xuICByZXR1cm4gcmVjb3JkIGFzIHVua25vd24gYXMgU2F2ZVJlY29yZDtcbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJTYXZlU3RvcmUge1xuICBwcml2YXRlIHN0YXR1czogTG9hZFN0YXR1cyA9ICduZXcnO1xuICBwcml2YXRlIG1lc3NhZ2UgPSAnJztcbiAgcHJpdmF0ZSBzY2hlbWE6IFNhdmVSZWNvcmRbJ3NjaGVtYSddID0gQ1VSUkVOVF9TQVZFX1NDSEVNQTtcbiAgcHJpdmF0ZSBwZXJzaXN0ZW50ID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBzdG9yYWdlOiBLZXlWYWx1ZVN0b3JhZ2UgfCBudWxsLCBwcml2YXRlIHJlYWRvbmx5IHNlZWQ6IG51bWJlcikge31cblxuICBsb2FkKCk6IExvYWRSZXN1bHQge1xuICAgIGxldCByYXc6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCBzY2hlbWE6IFNhdmVSZWNvcmRbJ3NjaGVtYSddID0gQ1VSUkVOVF9TQVZFX1NDSEVNQTtcbiAgICB0aGlzLnNjaGVtYSA9IENVUlJFTlRfU0FWRV9TQ0hFTUE7XG4gICAgdGhpcy5wZXJzaXN0ZW50ID0gZmFsc2U7XG4gICAgdHJ5IHtcbiAgICAgIHJhdyA9IHRoaXMuc3RvcmFnZT8uZ2V0SXRlbShzYXZlS2V5KHRoaXMuc2VlZCwgc2NoZW1hKSkgPz8gbnVsbDtcbiAgICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIFtDVVJSRU5UX1NBVkVfU0NIRU1BLCBERVNJR05fU0FWRV9TQ0hFTUEsIFNBVkVfU0NIRU1BXSBhcyBjb25zdCkge1xuICAgICAgICByYXcgPSB0aGlzLnN0b3JhZ2U/LmdldEl0ZW0oc2F2ZUtleSh0aGlzLnNlZWQsIGNhbmRpZGF0ZSkpID8/IG51bGw7XG4gICAgICAgIGlmIChyYXcgIT09IG51bGwpIHsgc2NoZW1hID0gY2FuZGlkYXRlOyB0aGlzLnNjaGVtYSA9IGNhbmRpZGF0ZTsgYnJlYWs7IH1cbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIHRoaXMudW5hdmFpbGFibGUoYExvY2FsIHNhdmUgdW5hdmFpbGFibGU6ICR7KGVycm9yIGFzIEVycm9yKS5tZXNzYWdlfTsgdGhpcyBzZXNzaW9uIGlzIHZvbGF0aWxlLmApO1xuICAgIH1cbiAgICBpZiAocmF3ID09PSBudWxsKSB7XG4gICAgICBpZiAoIXRoaXMuc3RvcmFnZSkgcmV0dXJuIHRoaXMudW5hdmFpbGFibGUoJ0xvY2FsIHN0b3JhZ2UgaXMgdW5hdmFpbGFibGU7IHRoaXMgc2Vzc2lvbiBpcyB2b2xhdGlsZS4nKTtcbiAgICAgIHRoaXMuc3RhdHVzID0gJ25ldyc7XG4gICAgICB0aGlzLm1lc3NhZ2UgPSAnTmV3IGxvY2FsIHdvcmxkLic7XG4gICAgICByZXR1cm4gdGhpcy5yZXN1bHQoR2FtZVNlc3Npb24uZ2VuZXNpcyh0aGlzLnNlZWQpKTtcbiAgICB9XG4gICAgY29uc3Qga2V5ID0gc2F2ZUtleSh0aGlzLnNlZWQsIHNjaGVtYSk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHNhdmUgPSBwYXJzZVNhdmUocmF3LCB0aGlzLnNlZWQsIHNjaGVtYSk7XG4gICAgICBjb25zdCBzZXNzaW9uID0gR2FtZVNlc3Npb24ucmVzdG9yZShzYXZlLnNuYXBzaG90LCBzYXZlLmpvdXJuYWwpO1xuICAgICAgdGhpcy5zdGF0dXMgPSAncmVzdG9yZWQnO1xuICAgICAgdGhpcy5tZXNzYWdlID0gYFJlc3RvcmVkICR7c2Vzc2lvbi5uZXh0U2VxdWVuY2V9IGFjY2VwdGVkIGNvbW1hbmQke3Nlc3Npb24ubmV4dFNlcXVlbmNlID09PSAxID8gJycgOiAncyd9LmA7XG4gICAgICB0aGlzLnBlcnNpc3RlbnQgPSB0cnVlO1xuICAgICAgcmV0dXJuIHRoaXMucmVzdWx0KHNlc3Npb24pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBQcmVzZXJ2ZSB0aGUgcmVqZWN0ZWQgYnl0ZXMgZm9yIGRpYWdub3Npcy4gSWYgcXVhcmFudGluZSBpcyB1bmF2YWlsYWJsZSxcbiAgICAgIC8vIGtlZXAgdGhlIG9yaWdpbmFsIGtleSB1bnRvdWNoZWQgYW5kIG1ha2UgdGhpcyBzZXNzaW9uIGV4cGxpY2l0bHkgdm9sYXRpbGUuXG4gICAgICB0cnkge1xuICAgICAgICBpZiAoIXRoaXMuc3RvcmFnZSkgdGhyb3cgbmV3IEVycm9yKCdsb2NhbCBzdG9yYWdlIGlzIHVuYXZhaWxhYmxlJyk7XG4gICAgICAgIHRoaXMuc3RvcmFnZS5zZXRJdGVtKGAke2tleX06Y29ycnVwdGAsIHJhdyk7XG4gICAgICAgIHRoaXMuc3RvcmFnZS5yZW1vdmVJdGVtKGtleSk7XG4gICAgICAgIHRoaXMuc3RhdHVzID0gJ2NvcnJ1cHQnO1xuICAgICAgICB0aGlzLm1lc3NhZ2UgPSBgU2F2ZSByZWplY3RlZDogJHsoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2V9LiBPcmlnaW5hbCBieXRlcyBxdWFyYW50aW5lZDsgc3RhcnRlZCBhIG5ldyB3b3JsZC5gO1xuICAgICAgICByZXR1cm4gdGhpcy5yZXN1bHQoR2FtZVNlc3Npb24uZ2VuZXNpcyh0aGlzLnNlZWQpKTtcbiAgICAgIH0gY2F0Y2ggKHF1YXJhbnRpbmVFcnJvcikge1xuICAgICAgICByZXR1cm4gdGhpcy51bmF2YWlsYWJsZShgU2F2ZSByZWplY3RlZDogJHsoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2V9OyBxdWFyYW50aW5lIGZhaWxlZDogJHsocXVhcmFudGluZUVycm9yIGFzIEVycm9yKS5tZXNzYWdlfS4gT3JpZ2luYWwgc2F2ZSBsZWZ0IHVudG91Y2hlZDsgdGhpcyBzZXNzaW9uIGlzIHZvbGF0aWxlLmApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKiBSZXBsYWNlIHRoZSBzb2xlIHJlY29yZCBvbmx5IGFmdGVyIGFuIGFjY2VwdGVkIGNvbW1hbmQgcmVhY2hlcyB0aGUgam91cm5hbC4gKi9cbiAgc2F2ZShzZXNzaW9uOiBHYW1lU2Vzc2lvbik6IFNhdmVSZXN1bHQge1xuICAgIHRyeSB7XG4gICAgICBpZiAoIXRoaXMuc3RvcmFnZSkgdGhyb3cgbmV3IEVycm9yKCdsb2NhbCBzdG9yYWdlIGlzIHVuYXZhaWxhYmxlJyk7XG4gICAgICBpZiAoc2Vzc2lvbi53b3JsZC5zZWVkICE9PSB0aGlzLnNlZWQpIHRocm93IG5ldyBFcnJvcignc2F2ZSBzZWVkIGRvZXMgbm90IG1hdGNoIHRoaXMgYnJvd3NlciBzZXNzaW9uJyk7XG4gICAgICBjb25zdCBzY2hlbWEgPSBzZXNzaW9uLmpvdXJuYWwuc2NoZW1hO1xuICAgICAgaWYgKHNjaGVtYSAhPT0gU0FWRV9TQ0hFTUEgJiYgc2NoZW1hICE9PSBERVNJR05fU0FWRV9TQ0hFTUEgJiYgc2NoZW1hICE9PSBDVVJSRU5UX1NBVkVfU0NIRU1BKSB0aHJvdyBuZXcgRXJyb3IoJ3Vuc3VwcG9ydGVkIGpvdXJuYWwgc2NoZW1hJyk7XG4gICAgICBjb25zdCByZWNvcmQ6IFNhdmVSZWNvcmQgPSB7XG4gICAgICAgIHNjaGVtYSwgc2VlZDogdGhpcy5zZWVkLFxuICAgICAgICBzbmFwc2hvdDogc2Vzc2lvbi5zbmFwc2hvdCwgam91cm5hbDogc2Vzc2lvbi5qb3VybmFsLFxuICAgICAgfTtcbiAgICAgIGNvbnN0IHJhdyA9IEpTT04uc3RyaW5naWZ5KHJlY29yZCk7XG4gICAgICBpZiAocmF3Lmxlbmd0aCA+IE1BWF9TQVZFX0pTT05fQllURVMpIHRocm93IG5ldyBFcnJvcignc2F2ZSBleGNlZWRzIHRoZSBKU09OIHNpemUgbGltaXQnKTtcbiAgICAgIHRoaXMuc3RvcmFnZS5zZXRJdGVtKHNhdmVLZXkodGhpcy5zZWVkLCBzY2hlbWEpLCByYXcpO1xuICAgICAgdGhpcy5zY2hlbWEgPSBzY2hlbWE7XG4gICAgICB0aGlzLnN0YXR1cyA9ICdzYXZlZCc7XG4gICAgICB0aGlzLm1lc3NhZ2UgPSAnU2F2ZWQgbG9jYWxseS4nO1xuICAgICAgdGhpcy5wZXJzaXN0ZW50ID0gdHJ1ZTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBtZXNzYWdlOiB0aGlzLm1lc3NhZ2UgfTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdGhpcy5zdGF0dXMgPSAndW5hdmFpbGFibGUnO1xuICAgICAgdGhpcy5tZXNzYWdlID0gYFNhdmUgZmFpbGVkOiAkeyhlcnJvciBhcyBFcnJvcikubWVzc2FnZX0uIExhdGVzdCBhY2NlcHRlZCB3b3JrIGlzIG5vdCBzYWZlbHkgcGVyc2lzdGVkLmA7XG4gICAgICB0aGlzLnBlcnNpc3RlbnQgPSBmYWxzZTtcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgbWVzc2FnZTogdGhpcy5tZXNzYWdlIH07XG4gICAgfVxuICB9XG5cbiAgbWV0cmljcygpOiBQZXJzaXN0ZW5jZU1ldHJpY3Mge1xuICAgIHJldHVybiB7IHNjaGVtYTogdGhpcy5zY2hlbWEsIGtleTogc2F2ZUtleSh0aGlzLnNlZWQsIHRoaXMuc2NoZW1hKSwgc3RhdHVzOiB0aGlzLnN0YXR1cywgcGVyc2lzdGVudDogdGhpcy5wZXJzaXN0ZW50LCBtZXNzYWdlOiB0aGlzLm1lc3NhZ2UgfTtcbiAgfVxuXG4gIHByaXZhdGUgcmVzdWx0KHNlc3Npb246IEdhbWVTZXNzaW9uKTogTG9hZFJlc3VsdCB7XG4gICAgcmV0dXJuIHsgc2Vzc2lvbiwgc3RhdHVzOiB0aGlzLnN0YXR1cywgbWVzc2FnZTogdGhpcy5tZXNzYWdlIH07XG4gIH1cblxuICBwcml2YXRlIHVuYXZhaWxhYmxlKG1lc3NhZ2U6IHN0cmluZyk6IExvYWRSZXN1bHQge1xuICAgIHRoaXMuc3RhdHVzID0gJ3VuYXZhaWxhYmxlJztcbiAgICB0aGlzLm1lc3NhZ2UgPSBtZXNzYWdlO1xuICAgIHRoaXMucGVyc2lzdGVudCA9IGZhbHNlO1xuICAgIHJldHVybiB0aGlzLnJlc3VsdChHYW1lU2Vzc2lvbi5nZW5lc2lzKHRoaXMuc2VlZCkpO1xuICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsT0FBTyxZQUFZO0FBQ25CLE9BQU8sVUFBVTtBQUNqQixZQUFZQSxZQUFXOzs7QUNFaEIsSUFBTSxpQkFBaUIsQ0FBQyxTQUFTLFFBQVEsT0FBTyxXQUFXLFFBQVEsU0FBUyxNQUFNO0FBRWxGLElBQU0sbUJBQW1CO0FBQ3pCLElBQU0scUJBQXFCO0FBQzNCLElBQU0sc0JBQXNCO0FBQzVCLElBQU0sd0JBQXdCO0FBQzlCLElBQU0sb0JBQW9CO0FBQzFCLElBQU0sdUJBQXVCO0FBQzdCLElBQU0sb0JBQW9CLEVBQUUsSUFBSSxzQkFBc0IsR0FBRyxLQUFL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QUFDO0FBQ0QsU0FBTyxNQUFNLE9BQU8sSUFBSSxNQUFNLEtBQUssVUFBVSxNQUFNLENBQUM7QUFDdEQ7QUFFQSxLQUFLLDhGQUE4RixNQUFNO0FBQ3ZHLFFBQU0sVUFBVSxZQUFZLFFBQVE7QUFDcEMsUUFBTSxRQUFRLElBQVUsYUFBTTtBQUM5QixRQUFNLE9BQU8sSUFBSSxTQUFTO0FBQUEsSUFDeEI7QUFBQSxJQUFTLE9BQU8sSUFBSSxpQkFBaUIsSUFBSSxjQUFjLEdBQUcsUUFBUSxNQUFNLElBQUk7QUFBQSxJQUM1RTtBQUFBLElBQU8sT0FBTyxNQUFNO0FBQUEsSUFBQztBQUFBLEVBQ3ZCLENBQUM7QUFDRCxRQUFNLFVBQVUsTUFBTSxnQkFBZ0IsWUFBWTtBQUNsRCxTQUFPLE1BQU0sUUFBUSxTQUFTLFFBQVEsQ0FBQztBQUN2QyxPQUFLLFFBQVE7QUFDYixTQUFPLE1BQU0sUUFBUSxTQUFTLFFBQVEsR0FBRywyQ0FBMkM7QUFFcEYsWUFBVSxPQUFPO0FBQ2pCLFNBQU8sTUFBTSxRQUFRLFNBQVMsUUFBUSxHQUFHLDhDQUE4QztBQUN2RixTQUFPLGFBQWEsTUFBTSxLQUFLLFFBQVEsQ0FBQztBQUN4QyxTQUFPLE1BQU0sUUFBUSxRQUFRLEtBQUs7QUFDbEMsU0FBTyxNQUFNLFFBQVEsU0FBUyxPQUFPLENBQUMsVUFBVSxNQUFNLFNBQVMsTUFBTSxFQUFFLFFBQVEsQ0FBQztBQUNoRixTQUFPLGFBQWEsTUFBTSxLQUFLLFFBQVEsQ0FBQztBQUN4QyxTQUFPO0FBQUEsSUFBTSxRQUFRLFNBQVMsT0FBTyxDQUFDLFVBQVUsTUFBTSxTQUFTLE1BQU0sRUFBRTtBQUFBLElBQVE7QUFBQSxJQUM3RTtBQUFBLEVBQXdEO0FBQzVELENBQUM7IiwKICAibmFtZXMiOiBbIlRIUkVFIiwgImpvYiIsICJpZCIsICJpZCIsICJpZCIsICJ0ZXh0IiwgImlkIiwgIm9iamVjdCIsICJ0ZXh0IiwgImlkIiwgInRvdGFsIiwgImludmVudG9yeSIsICJpZCIsICJpZCIsICJkaWdlc3QiLCAiZmFpbCIsICJ0ZXh0IiwgImludmVudG9yeSIsICJpZCIsICJpZCIsICJpZCIsICJ1aW50IiwgImVudGl0eUlkIiwgIm91dGNvbWUiLCAiaGlzdG9yaWNhbCIsICJlcnJvciIsICJpZCIsICJlcnJvciJdCn0K
