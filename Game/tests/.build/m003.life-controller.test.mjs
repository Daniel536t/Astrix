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
    const ready = crop !== void 0 && cropReady(crop, life.tick);
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
    if (!result.duplicate) {
      saved = this.options.store.save(session);
      this.options.onSaved?.();
    }
    const message = lifeMessage(intent) + (saved ? ` \xB7 ${saved.message}` : "");
    this.options.toast(message, saved?.ok === false ? "bad" : "good");
    if (!result.duplicate) this.refresh();
  }
  /**
   * Issue one real-time settlement tick through the normal journaled command
   * path. Saving is left to the caller's SaveScheduler (throttled), so this
   * returns whether an accepted tick changed state.
   */
  realtimeTick() {
    const session = this.options.session;
    if (session.journal.schema !== 3 || !session.world.life) return { ok: false, reasons: ["legacy world"] };
    const result = session.dispatch({
      schema: 3,
      id: session.commandId("tick", "realtime"),
      type: "tick",
      ticks: 1,
      expectedRevision: session.world.revision
    });
    if (!result.ok) return { ok: false, reasons: result.reasons };
    if (result.outcome.type === "tick") {
      const done = result.outcome.completedJobs.map((j) => j.recipe);
      const ready = result.outcome.readyCrops.length;
      if (done.length || ready) {
        this.options.toast([
          done.length ? `Finished ${done.join(", ")}` : "",
          ready ? `${ready} crop${ready === 1 ? "" : "s"} ready to harvest` : ""
        ].filter(Boolean).join(" \xB7 "), "good");
      }
    }
    this.refresh();
    return { ok: true, reasons: [] };
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
    return intent.type === "plant" ? `Planted ${intent.plotId}` : `Harvested ${intent.plotId}: ${CROP_YIELD_LABEL}`;
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
  /**
   * `newWorldGenerator` applies only when no save exists for this seed. An
   * existing save always restores on the generator recorded in its snapshot
   * and journal, so older worlds keep loading unchanged.
   */
  constructor(storage, seed, newWorldGenerator = GENERATOR_VERSION) {
    this.storage = storage;
    this.seed = seed;
    this.newWorldGenerator = newWorldGenerator;
  }
  storage;
  seed;
  newWorldGenerator;
  status = "new";
  message = "";
  schema = CURRENT_SAVE_SCHEMA;
  persistent = false;
  /**
   * Move every save for this seed to an archive key so the next load starts a
   * new world. Reversible: the archived bytes are kept untouched under
   * `<key>:archived:<timestamp>`. Returns the archive keys written.
   */
  archiveCurrent(now = Date.now()) {
    const archived = [];
    if (!this.storage) return archived;
    for (const schema of [CURRENT_SAVE_SCHEMA, DESIGN_SAVE_SCHEMA, SAVE_SCHEMA]) {
      const key = saveKey(this.seed, schema);
      const raw = this.storage.getItem(key);
      if (raw === null) continue;
      const target = `${key}:archived:${now}`;
      this.storage.setItem(target, raw);
      if (this.storage.getItem(target) !== raw) throw new Error("archive write could not be verified");
      this.storage.removeItem(key);
      archived.push(target);
    }
    return archived;
  }
  genesis() {
    return GameSession.genesis(this.seed, this.newWorldGenerator);
  }
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
      return this.result(this.genesis());
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
        return this.result(this.genesis());
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
    return this.result(this.genesis());
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwMy5saWZlLWNvbnRyb2xsZXIudGVzdC50cyIsICIuLi8uLi9zcmMvc2ltL2Vjb25vbXkudHMiLCAiLi4vLi4vc3JjL3JlbmRlci9saWZlLnRzIiwgIi4uLy4uL3NyYy9kYXRhL3BhbGV0dGUuanNvbiIsICIuLi8uLi9zcmMvc2ltL3N0b25lLWNvbXBhdC50cyIsICIuLi8uLi9zcmMvc2ltL25vaXNlLnRzIiwgIi4uLy4uL3NyYy9zaW0vaHlkcm9sb2d5LnRzIiwgIi4uLy4uL3NyYy9zaW0vbWF0ZXJpYWxzLnRzIiwgIi4uLy4uL3NyYy9zaW0vdGVycmFpbi12Mi50cyIsICIuLi8uLi9zcmMvc2ltL3dvcmxkLnRzIiwgIi4uLy4uL3NyYy91aS9saWZlLnRzIiwgIi4uLy4uL3NyYy9hcHAvbGlmZS50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4udHMiLCAiLi4vLi4vc3JjL3NpbS9jb25zdHJ1Y3Rpb24udHMiLCAiLi4vLi4vc3JjL3NpbS9wcmVwYXJhdGlvbi50cyIsICIuLi8uLi9zcmMvc2ltL3N0cnVjdHVyZXMudHMiLCAiLi4vLi4vc3JjL3NpbS9jYW5vbmljYWwudHMiLCAiLi4vLi4vc3JjL3NpbS9tMDAyLnRzIiwgIi4uLy4uL3NyYy9zaW0vc2NlbmFyaW8udHMiLCAiLi4vLi4vc3JjL3NpbS9zbmFwc2hvdC50cyIsICIuLi8uLi9zcmMvYXBwL3Byb2plY3RzLnRzIiwgIi4uLy4uL3NyYy9hcHAvc2Vzc2lvbi50cyIsICIuLi8uLi9zcmMvYXBwL3BlcnNpc3RlbmNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgYXNzZXJ0IGZyb20gJ25vZGU6YXNzZXJ0L3N0cmljdCc7XG5pbXBvcnQgdGVzdCBmcm9tICdub2RlOnRlc3QnO1xuaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuaW1wb3J0IHsgTGlmZUdhbWUgfSBmcm9tICcuLi9zcmMvYXBwL2xpZmUnO1xuaW1wb3J0IHsgQnJvd3NlclNhdmVTdG9yZSwgS2V5VmFsdWVTdG9yYWdlIH0gZnJvbSAnLi4vc3JjL2FwcC9wZXJzaXN0ZW5jZSc7XG5pbXBvcnQgeyBHYW1lU2Vzc2lvbiB9IGZyb20gJy4uL3NyYy9hcHAvc2Vzc2lvbic7XG5cbi8vIExpZmVQYW5lbCdzIERPTSBpcyBvdXRzaWRlIHRoaXMgdGVzdCdzIHB1cnBvc2UuIFRoZXNlIG1pbmltYWwgbm9kZXMgY292ZXIgaXRzXG4vLyBjb25zdHJ1Y3Rpb24vcmVuZGVyIGNvbnRyYWN0IHdpdGhvdXQgaW5zdGFsbGluZyBhIHByb2R1Y3Rpb24gRE9NIGRlcGVuZGVuY3kuXG5jbGFzcyBFbGVtZW50IHtcbiAgcmVhZG9ubHkgY2hpbGRyZW46IEVsZW1lbnRbXSA9IFtdO1xuICByZWFkb25seSBkYXRhc2V0OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIHJlYWRvbmx5IGNsYXNzTGlzdCA9IHtcbiAgICB0b2dnbGU6IChfbmFtZTogc3RyaW5nLCBfZm9yY2U/OiBib29sZWFuKSA9PiBmYWxzZSxcbiAgICByZW1vdmU6ICguLi5fbmFtZXM6IHN0cmluZ1tdKSA9PiB7fSxcbiAgfTtcbiAgaGlkZGVuID0gZmFsc2U7XG4gIGRpc2FibGVkID0gZmFsc2U7XG4gIHZhbHVlID0gJyc7XG4gIGlkID0gJyc7XG4gIG5hbWUgPSAnJztcbiAgdHlwZSA9ICcnO1xuICBtaW4gPSAnJztcbiAgc3RlcCA9ICcnO1xuICByZXF1aXJlZCA9IGZhbHNlO1xuICBodG1sRm9yID0gJyc7XG4gIGNsYXNzTmFtZSA9ICcnO1xuICB0ZXh0Q29udGVudCA9ICcnO1xuXG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHRhZ05hbWU6IHN0cmluZykge1xuICAgIGlmICh0YWdOYW1lLnRvVXBwZXJDYXNlKCkgPT09ICdTRUxFQ1QnKSB0aGlzLnZhbHVlID0gJ2ZpYmVyJztcbiAgfVxuICBhcHBlbmQoLi4uY2hpbGRyZW46IChFbGVtZW50IHwgc3RyaW5nKVtdKTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikgaWYgKGNoaWxkIGluc3RhbmNlb2YgRWxlbWVudCkgdGhpcy5jaGlsZHJlbi5wdXNoKGNoaWxkKTtcbiAgfVxuICBzZXRBdHRyaWJ1dGUoKTogdm9pZCB7fVxuICByZW1vdmVBdHRyaWJ1dGUoKTogdm9pZCB7fVxuICBhZGRFdmVudExpc3RlbmVyKCk6IHZvaWQge31cbiAgcXVlcnlTZWxlY3RvcihzZWxlY3Rvcjogc3RyaW5nKTogRWxlbWVudCB8IG51bGwge1xuICAgIGlmIChzZWxlY3RvciA9PT0gJy5saWZlLXVuYXZhaWxhYmxlJykgcmV0dXJuIG5ldyBFbGVtZW50KCdwJyk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuY29uc3QgZG9jdW1lbnRTdHViID0ge1xuICBjcmVhdGVFbGVtZW50OiAodGFnOiBzdHJpbmcpID0+IG5ldyBFbGVtZW50KHRhZyksXG4gIGJvZHk6IHtcbiAgICBhcHBlbmQ6ICguLi5fY2hpbGRyZW46IEVsZW1lbnRbXSkgPT4ge30sXG4gICAgY2xhc3NMaXN0OiB7IGNvbnRhaW5zOiAoX25hbWU6IHN0cmluZykgPT4gZmFsc2UgfSxcbiAgfSxcbn07XG5PYmplY3QuYXNzaWduKGdsb2JhbFRoaXMsIHsgZG9jdW1lbnQ6IGRvY3VtZW50U3R1YiB9KTtcblxuY2xhc3MgTWVtb3J5U3RvcmFnZSBpbXBsZW1lbnRzIEtleVZhbHVlU3RvcmFnZSB7XG4gIHByaXZhdGUgdmFsdWVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgZ2V0SXRlbShrZXk6IHN0cmluZyk6IHN0cmluZyB8IG51bGwgeyByZXR1cm4gdGhpcy52YWx1ZXMuZ2V0KGtleSkgPz8gbnVsbDsgfVxuICBzZXRJdGVtKGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZCB7IHRoaXMudmFsdWVzLnNldChrZXksIHZhbHVlKTsgfVxuICByZW1vdmVJdGVtKGtleTogc3RyaW5nKTogdm9pZCB7IHRoaXMudmFsdWVzLmRlbGV0ZShrZXkpOyB9XG59XG5cbmZ1bmN0aW9uIGJ1aWxkRmFybShzZXNzaW9uOiBHYW1lU2Vzc2lvbik6IHZvaWQge1xuICBjb25zdCByZXN1bHQgPSBzZXNzaW9uLmRpc3BhdGNoKHtcbiAgICBzY2hlbWE6IDMsIGlkOiAnY29udHJvbGxlci10ZXN0LWZhcm0nLCB0eXBlOiAnYnVpbGQnLCBwcm9qZWN0SWQ6ICdmYXJtJyxcbiAgICBkZXNpZ25WZXJzaW9uOiAyLCBleHBlY3RlZFJldmlzaW9uOiBzZXNzaW9uLndvcmxkLnJldmlzaW9uLFxuICB9KTtcbiAgYXNzZXJ0LmVxdWFsKHJlc3VsdC5vaywgdHJ1ZSwgSlNPTi5zdHJpbmdpZnkocmVzdWx0KSk7XG59XG5cbnRlc3QoJ2NvbnRyb2xsZXIgcmVmcmVzaCBncm93cyBmcm9tIGFuIGVtcHR5IGRlcG90IHRvIG5pbmUgY3JvcCByb3dzIGFuZCByZW1haW5zIHJldmlzaW9uLWRyaXZlbicsICgpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IEdhbWVTZXNzaW9uLmdlbmVzaXMoKTtcbiAgY29uc3Qgc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcbiAgY29uc3QgZ2FtZSA9IG5ldyBMaWZlR2FtZSh7XG4gICAgc2Vzc2lvbiwgc3RvcmU6IG5ldyBCcm93c2VyU2F2ZVN0b3JlKG5ldyBNZW1vcnlTdG9yYWdlKCksIHNlc3Npb24ud29ybGQuc2VlZCksXG4gICAgc2NlbmUsIHRvYXN0OiAoKSA9PiB7fSxcbiAgfSk7XG4gIGNvbnN0IG92ZXJsYXkgPSBzY2VuZS5nZXRPYmplY3RCeU5hbWUoJ2xpZmVfc3RhdGUnKSE7XG4gIGFzc2VydC5lcXVhbChvdmVybGF5LmNoaWxkcmVuLmxlbmd0aCwgMSk7XG4gIGdhbWUucmVmcmVzaCgpO1xuICBhc3NlcnQuZXF1YWwob3ZlcmxheS5jaGlsZHJlbi5sZW5ndGgsIDEsICdhbiB1bmNoYW5nZWQgcmV2aXNpb24gZG9lcyBubyByZW5kZXIgd29yaycpO1xuXG4gIGJ1aWxkRmFybShzZXNzaW9uKTtcbiAgYXNzZXJ0LmVxdWFsKG92ZXJsYXkuY2hpbGRyZW4ubGVuZ3RoLCAxLCAndGhlIG9sZCBvdmVybGF5IHJlbWFpbnMgdmFsaWQgYmVmb3JlIHJlZnJlc2gnKTtcbiAgYXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiBnYW1lLnJlZnJlc2goKSk7XG4gIGFzc2VydC5lcXVhbChvdmVybGF5LnBhcmVudCwgc2NlbmUpO1xuICBhc3NlcnQuZXF1YWwob3ZlcmxheS5jaGlsZHJlbi5maWx0ZXIoKGNoaWxkKSA9PiBjaGlsZC51c2VyRGF0YS5jcm9wSWQpLmxlbmd0aCwgOSk7XG4gIGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4gZ2FtZS5yZWZyZXNoKCkpO1xuICBhc3NlcnQuZXF1YWwob3ZlcmxheS5jaGlsZHJlbi5maWx0ZXIoKGNoaWxkKSA9PiBjaGlsZC51c2VyRGF0YS5jcm9wSWQpLmxlbmd0aCwgOSxcbiAgICAnbGF0ZXIgcmV2aXNpb25zIG11c3Qgbm90IGR1cGxpY2F0ZSBvciByZW1vdmUgY3JvcCByb3dzJyk7XG59KTtcbiIsICIvLyBTY2hlbWEtMyBsaWZlIGxvb3AuIEFsbCBxdWFudGl0aWVzIGFyZSBpbnRlZ2VycyBhbmQgYWxsIG11dGF0aW9ucyBhcmUgZHJpdmVuXG4vLyBieSBhY2NlcHRlZCBjb21tYW5kczsgd2FsbC1jbG9jayB0aW1lIGFuZCByZW5kZXJpbmcgbmV2ZXIgYWR2YW5jZSB0aGlzIHN0YXRlLlxuaW1wb3J0IHR5cGUgeyBXb3JsZCB9IGZyb20gJy4vd29ybGQnO1xuXG5leHBvcnQgY29uc3QgTElGRV9SRVNPVVJDRVMgPSBbJ2ZpYmVyJywgJ2Zvb2QnLCAnb3JlJywgJ3JhdGlvbnMnLCAnc2VlZCcsICdzdG9uZScsICd3b29kJ10gYXMgY29uc3Q7XG5leHBvcnQgdHlwZSBMaWZlUmVzb3VyY2UgPSAodHlwZW9mIExJRkVfUkVTT1VSQ0VTKVtudW1iZXJdO1xuZXhwb3J0IGNvbnN0IENBUlJJRURfQ0FQQUNJVFkgPSAxMjA7XG5leHBvcnQgY29uc3QgU1RPQ0tQSUxFX0NBUEFDSVRZID0gMjAwO1xuZXhwb3J0IGNvbnN0IE1BWF9QUk9EVUNUSU9OX0pPQlMgPSAxNjtcbmV4cG9ydCBjb25zdCBNQVhfVElDS1NfUEVSX0NPTU1BTkQgPSA2NDtcbmV4cG9ydCBjb25zdCBDUk9QX0dST1dUSF9USUNLUyA9IDQ7XG4vKiogRml4ZWQgaGFydmVzdCBmcm9tIG9uZSByZWFkeSBjcm9wIHBsb3QuIEpvdXJuYWwgb3V0Y29tZXMgbXVzdCBtYXRjaCBpdCBleGFjdGx5LiAqL1xuZXhwb3J0IGNvbnN0IENST1BfWUlFTEQgPSB7IGZvb2Q6IDYsIGZpYmVyOiAxIH0gYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgQ1JPUF9ZSUVMRF9MQUJFTCA9IGAke0NST1BfWUlFTEQuZm9vZH0gZm9vZCArICR7Q1JPUF9ZSUVMRC5maWJlcn0gZmliZXJgO1xuZXhwb3J0IGNvbnN0IEZPVU5ERVJfU1RPQ0tQSUxFX0lEID0gJ3N0b2NrcGlsZTpmb3VuZGVyJztcbmV4cG9ydCBjb25zdCBGT1VOREVSX1NUT0NLUElMRSA9IHsgaWQ6IEZPVU5ERVJfU1RPQ0tQSUxFX0lELCB4OiAtNTAsIHo6IC0zMiwgY2FwYWNpdHk6IFNUT0NLUElMRV9DQVBBQ0lUWSB9IGFzIGNvbnN0O1xuXG5leHBvcnQgdHlwZSBMaWZlUmVzb3VyY2VCYWcgPSBQYXJ0aWFsPFJlY29yZDxMaWZlUmVzb3VyY2UsIG51bWJlcj4+O1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0b2NrcGlsZSB7XG4gIGlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICBjYXBhY2l0eTogdHlwZW9mIFNUT0NLUElMRV9DQVBBQ0lUWTtcbiAgaW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xufVxuXG5leHBvcnQgdHlwZSBSZWNpcGVJZCA9ICdzZWVkJyB8ICdyYXRpb25zJztcbmV4cG9ydCBjb25zdCBSRUNJUEVTOiBSZWNvcmQ8UmVjaXBlSWQsIHsgaW5wdXQ6IExpZmVSZXNvdXJjZUJhZzsgb3V0cHV0OiBMaWZlUmVzb3VyY2VCYWc7IHRpY2tzOiBudW1iZXIgfT4gPSB7XG4gIHNlZWQ6IHsgaW5wdXQ6IHsgZmliZXI6IDIgfSwgb3V0cHV0OiB7IHNlZWQ6IDMgfSwgdGlja3M6IDEgfSxcbiAgcmF0aW9uczogeyBpbnB1dDogeyBmb29kOiAyIH0sIG91dHB1dDogeyByYXRpb25zOiAzIH0sIHRpY2tzOiAyIH0sXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFByb2R1Y3Rpb25Kb2Ige1xuICBpZDogc3RyaW5nO1xuICBzdG9ja3BpbGVJZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEO1xuICByZWNpcGU6IFJlY2lwZUlkO1xuICByZW1haW5pbmdUaWNrczogbnVtYmVyO1xufVxuXG4vKiogRml4ZWQgcGxvdHMgY29ycmVzcG9uZCB0byB0aGUgbmluZSBhdXRob3JpdGF0aXZlIHRlcnJhY2UgY3JvcC1yb3cgdm9sdW1lcy4gKi9cbmV4cG9ydCBjb25zdCBDUk9QX1BMT1RfSURTID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogOSB9LCAoXywgaSkgPT4gYGNyb3A6JHtpfWApO1xuZXhwb3J0IGludGVyZmFjZSBDcm9wUGxvdCB7XG4gIGlkOiBzdHJpbmc7XG4gIHBsYW50ZWRUaWNrOiBudW1iZXI7XG4gIGdyb3d0aFRpY2tzOiB0eXBlb2YgQ1JPUF9HUk9XVEhfVElDS1M7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTGlmZVN0YXRlIHtcbiAgc3RvY2twaWxlczogTWFwPHN0cmluZywgU3RvY2twaWxlPjtcbiAgam9iczogTWFwPHN0cmluZywgUHJvZHVjdGlvbkpvYj47XG4gIGNyb3BzOiBNYXA8c3RyaW5nLCBDcm9wUGxvdD47XG4gIHRpY2s6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxpZmVTdGF0ZSgpOiBMaWZlU3RhdGUge1xuICByZXR1cm4ge1xuICAgIHN0b2NrcGlsZXM6IG5ldyBNYXAoW1tGT1VOREVSX1NUT0NLUElMRV9JRCwge1xuICAgICAgaWQ6IEZPVU5ERVJfU1RPQ0tQSUxFX0lELCB4OiBGT1VOREVSX1NUT0NLUElMRS54LCB6OiBGT1VOREVSX1NUT0NLUElMRS56LFxuICAgICAgY2FwYWNpdHk6IFNUT0NLUElMRV9DQVBBQ0lUWSwgaW52ZW50b3J5OiB7fSxcbiAgICB9XV0pLCBqb2JzOiBuZXcgTWFwKCksIGNyb3BzOiBuZXcgTWFwKCksIHRpY2s6IDAsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b3RhbChiYWc6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4pOiBudW1iZXIge1xuICByZXR1cm4gT2JqZWN0LnZhbHVlcyhiYWcpLnJlZHVjZSgoc3VtLCBhbW91bnQpID0+IHN1bSArIGFtb3VudCwgMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbG9uZUJhZyhiYWc6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4pOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgcmV0dXJuIE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyhiYWcpLmZpbHRlcigoWywgYW1vdW50XSkgPT4gYW1vdW50ID4gMClcbiAgICAuc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGlmZVN0YXRlKHdvcmxkOiBXb3JsZCk6IExpZmVTdGF0ZSB7XG4gIGlmICghd29ybGQubGlmZSkgdGhyb3cgbmV3IEVycm9yKCdsaWZlLWxvb3AgY29tbWFuZHMgcmVxdWlyZSBhIHNjaGVtYS0zIHdvcmxkJyk7XG4gIHJldHVybiB3b3JsZC5saWZlO1xufVxuXG5leHBvcnQgdHlwZSBMaWZlRmFpbHVyZSA9IHsgb2s6IGZhbHNlOyBjb2RlOiBzdHJpbmc7IHJlYXNvbnM6IHN0cmluZ1tdIH07XG5leHBvcnQgdHlwZSBMaWZlU3VjY2VzczxUPiA9IHsgb2s6IHRydWU7IHZhbHVlOiBUIH07XG5leHBvcnQgdHlwZSBMaWZlUmVzdWx0PFQ+ID0gTGlmZVN1Y2Nlc3M8VD4gfCBMaWZlRmFpbHVyZTtcbmZ1bmN0aW9uIHJlamVjdExpZmUoY29kZTogc3RyaW5nLCByZWFzb25zOiBzdHJpbmdbXSk6IExpZmVGYWlsdXJlIHtcbiAgcmV0dXJuIHsgb2s6IGZhbHNlLCBjb2RlLCByZWFzb25zIH07XG59XG50eXBlIFBhcnNlZEFtb3VudCA9IHsgb2s6IHRydWU7IHJlc291cmNlOiBMaWZlUmVzb3VyY2U7IGFtb3VudDogbnVtYmVyIH0gfCB7IG9rOiBmYWxzZTsgcmVhc29uczogc3RyaW5nW10gfTtcbmZ1bmN0aW9uIHJlcXVpcmVBbW91bnQoYmFnOiBMaWZlUmVzb3VyY2VCYWcpOiBQYXJzZWRBbW91bnQge1xuICBjb25zdCBlbnRyaWVzID0gT2JqZWN0LmVudHJpZXMoYmFnKTtcbiAgaWYgKGVudHJpZXMubGVuZ3RoICE9PSAxKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbnM6IFsndHJhbnNmZXIgZXhhY3RseSBvbmUgcmVzb3VyY2UgYXQgYSB0aW1lJ10gfTtcbiAgY29uc3QgW3Jlc291cmNlLCBhbW91bnRdID0gZW50cmllc1swXTtcbiAgaWYgKCFMSUZFX1JFU09VUkNFUy5pbmNsdWRlcyhyZXNvdXJjZSBhcyBMaWZlUmVzb3VyY2UpIHx8ICFOdW1iZXIuaXNTYWZlSW50ZWdlcihhbW91bnQpIHx8IChhbW91bnQgPz8gMCkgPD0gMCkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uczogWydyZXNvdXJjZSBhbW91bnQgbXVzdCBiZSBhIHBvc2l0aXZlIGludGVnZXInXSB9O1xuICB9XG4gIHJldHVybiB7IG9rOiB0cnVlLCByZXNvdXJjZTogcmVzb3VyY2UgYXMgTGlmZVJlc291cmNlLCBhbW91bnQgfTtcbn1cblxuZnVuY3Rpb24gbW92ZSh3b3JsZDogV29ybGQsIGZyb206IFJlY29yZDxzdHJpbmcsIG51bWJlcj4sIHRvOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+LFxuICByZXF1ZXN0ZWQ6IExpZmVSZXNvdXJjZUJhZywgdG9DYXBhY2l0eTogbnVtYmVyKTogTGlmZVJlc3VsdDxMaWZlUmVzb3VyY2VCYWc+IHtcbiAgY29uc3QgY2hlY2tlZCA9IHJlcXVpcmVBbW91bnQocmVxdWVzdGVkKTtcbiAgaWYgKCFjaGVja2VkLm9rKSByZXR1cm4gcmVqZWN0TGlmZSgnaW52YWxpZF90cmFuc2ZlcicsIFtjaGVja2VkLnJlYXNvbnNbMF1dKTtcbiAgY29uc3QgeyByZXNvdXJjZSwgYW1vdW50IH0gPSBjaGVja2VkO1xuICBpZiAoKGZyb21bcmVzb3VyY2VdID8/IDApIDwgYW1vdW50KSByZXR1cm4gcmVqZWN0TGlmZSgnaW5zdWZmaWNpZW50X3Jlc291cmNlcycsIFtgbmVlZCAke2Ftb3VudH0gJHtTdHJpbmcocmVzb3VyY2UpfSwgaGF2ZSAke2Zyb21bcmVzb3VyY2VdID8/IDB9YF0pO1xuICBpZiAodG90YWwodG8pICsgYW1vdW50ID4gdG9DYXBhY2l0eSkgcmV0dXJuIHJlamVjdExpZmUoJ2NhcGFjaXR5X2V4Y2VlZGVkJywgW2BkZXN0aW5hdGlvbiBjYXBhY2l0eSAke3RvQ2FwYWNpdHl9IHdvdWxkIGJlIGV4Y2VlZGVkYF0pO1xuICBmcm9tW3Jlc291cmNlXSA9IChmcm9tW3Jlc291cmNlXSA/PyAwKSAtIGFtb3VudDtcbiAgaWYgKGZyb21bcmVzb3VyY2VdID09PSAwKSBkZWxldGUgZnJvbVtyZXNvdXJjZV07XG4gIHRvW3Jlc291cmNlXSA9ICh0b1tyZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogeyBbcmVzb3VyY2VdOiBhbW91bnQgfSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdHJhbnNmZXIod29ybGQ6IFdvcmxkLCBraW5kOiAnZGVwb3NpdCcgfCAnd2l0aGRyYXcnLCBiYWc6IExpZmVSZXNvdXJjZUJhZyk6IExpZmVSZXN1bHQ8TGlmZVJlc291cmNlQmFnPiB7XG4gIGNvbnN0IGxpZmUgPSBsaWZlU3RhdGUod29ybGQpO1xuICBjb25zdCBzdG9jayA9IGxpZmUuc3RvY2twaWxlcy5nZXQoRk9VTkRFUl9TVE9DS1BJTEVfSUQpO1xuICBpZiAoIXN0b2NrKSByZXR1cm4gcmVqZWN0TGlmZSgnbWlzc2luZ19zdG9ja3BpbGUnLCBbJ2ZvdW5kZXIgc3RvY2twaWxlIGlzIGFic2VudCddKTtcbiAgcmV0dXJuIGtpbmQgPT09ICdkZXBvc2l0J1xuICAgID8gbW92ZSh3b3JsZCwgd29ybGQuaW52ZW50b3J5LCBzdG9jay5pbnZlbnRvcnksIGJhZywgc3RvY2suY2FwYWNpdHkpXG4gICAgOiBtb3ZlKHdvcmxkLCBzdG9jay5pbnZlbnRvcnksIHdvcmxkLmludmVudG9yeSwgYmFnLCBDQVJSSUVEX0NBUEFDSVRZKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0UHJvZHVjdGlvbih3b3JsZDogV29ybGQsIHJlY2lwZUlkOiBSZWNpcGVJZCwgam9iSWQ6IHN0cmluZyk6IExpZmVSZXN1bHQ8UHJvZHVjdGlvbkpvYj4ge1xuICBjb25zdCBsaWZlID0gbGlmZVN0YXRlKHdvcmxkKTtcbiAgY29uc3Qgc3RvY2sgPSBsaWZlLnN0b2NrcGlsZXMuZ2V0KEZPVU5ERVJfU1RPQ0tQSUxFX0lEKTtcbiAgaWYgKCFzdG9jaykgcmV0dXJuIHJlamVjdExpZmUoJ21pc3Npbmdfc3RvY2twaWxlJywgWydmb3VuZGVyIHN0b2NrcGlsZSBpcyBhYnNlbnQnXSk7XG4gIGlmIChsaWZlLmpvYnMuaGFzKGpvYklkKSkgcmV0dXJuIHJlamVjdExpZmUoJ2R1cGxpY2F0ZV9qb2InLCBbJ3Byb2R1Y3Rpb24gam9iIGFscmVhZHkgZXhpc3RzJ10pO1xuICBpZiAobGlmZS5qb2JzLnNpemUgPj0gTUFYX1BST0RVQ1RJT05fSk9CUykgcmV0dXJuIHJlamVjdExpZmUoJ2pvYl9saW1pdCcsIFtgYXQgbW9zdCAke01BWF9QUk9EVUNUSU9OX0pPQlN9IGpvYnMgbWF5IGJlIGFjdGl2ZWBdKTtcbiAgY29uc3QgcmVjaXBlID0gUkVDSVBFU1tyZWNpcGVJZF07XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHJlY2lwZS5pbnB1dCkpIHtcbiAgICBpZiAoKHN0b2NrLmludmVudG9yeVtyZXNvdXJjZV0gPz8gMCkgPCAoYW1vdW50ID8/IDApKSB7XG4gICAgICByZXR1cm4gcmVqZWN0TGlmZSgnaW5zdWZmaWNpZW50X3Jlc291cmNlcycsIFtgbmVlZCAke2Ftb3VudH0gJHtTdHJpbmcocmVzb3VyY2UpfSwgaGF2ZSAke3N0b2NrLmludmVudG9yeVtyZXNvdXJjZV0gPz8gMH1gXSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IHJlc2VydmVkT3V0cHV0ID0gWy4uLmxpZmUuam9icy52YWx1ZXMoKV0uZmlsdGVyKChqKSA9PiBqLnN0b2NrcGlsZUlkID09PSBzdG9jay5pZClcbiAgICAucmVkdWNlKChzdW0sIGpvYikgPT4gc3VtICsgdG90YWwoY2xvbmVCYWcoUkVDSVBFU1tqb2IucmVjaXBlXS5vdXRwdXQgYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPikpLCAwKTtcbiAgaWYgKHRvdGFsKHN0b2NrLmludmVudG9yeSkgLSB0b3RhbChjbG9uZUJhZyhyZWNpcGUuaW5wdXQgYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPikpXG4gICAgKyByZXNlcnZlZE91dHB1dCArIHRvdGFsKGNsb25lQmFnKHJlY2lwZS5vdXRwdXQgYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPikpID4gc3RvY2suY2FwYWNpdHkpIHtcbiAgICByZXR1cm4gcmVqZWN0TGlmZSgnY2FwYWNpdHlfZXhjZWVkZWQnLCBbJ3Jlc2VydmVkIHByb2R1Y3Rpb24gb3V0cHV0IHdvdWxkIGV4Y2VlZCBzdG9ja3BpbGUgY2FwYWNpdHknXSk7XG4gIH1cbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocmVjaXBlLmlucHV0KSkge1xuICAgIHN0b2NrLmludmVudG9yeVtyZXNvdXJjZV0gPSAoc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwKSAtIChhbW91bnQgPz8gMCk7XG4gICAgaWYgKHN0b2NrLmludmVudG9yeVtyZXNvdXJjZV0gPT09IDApIGRlbGV0ZSBzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdO1xuICB9XG4gIGNvbnN0IGpvYjogUHJvZHVjdGlvbkpvYiA9IHsgaWQ6IGpvYklkLCBzdG9ja3BpbGVJZDogc3RvY2suaWQsIHJlY2lwZTogcmVjaXBlSWQsIHJlbWFpbmluZ1RpY2tzOiByZWNpcGUudGlja3MgfTtcbiAgbGlmZS5qb2JzLnNldChqb2IuaWQsIGpvYik7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogeyAuLi5qb2IgfSB9O1xufVxuXG4vKiogUGxhbnQgaW50byBhbiBlbXB0eSBmaXhlZCB0ZXJyYWNlIHBsb3QuIFRoZSBmb3VuZGVyIGZhcm0gbXVzdCBhbHJlYWR5IGV4aXN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYW50Q3JvcCh3b3JsZDogV29ybGQsIHBsb3RJZDogc3RyaW5nKTogTGlmZVJlc3VsdDxDcm9wUGxvdD4ge1xuICBjb25zdCBsaWZlID0gbGlmZVN0YXRlKHdvcmxkKTtcbiAgaWYgKCFDUk9QX1BMT1RfSURTLmluY2x1ZGVzKHBsb3RJZCkpIHJldHVybiByZWplY3RMaWZlKCdpbnZhbGlkX3Bsb3QnLCBbJ3Vua25vd24gY3JvcCBwbG90J10pO1xuICBpZiAoIVsuLi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXS5zb21lKChzKSA9PiBzLmtpbmQgPT09ICd0ZXJyYWNlJykpIHtcbiAgICByZXR1cm4gcmVqZWN0TGlmZSgnZmFybV9yZXF1aXJlZCcsIFsnYnVpbGQgdGhlIGZvdW5kZXIgdGVycmFjZWQgZmFybSBiZWZvcmUgcGxhbnRpbmcnXSk7XG4gIH1cbiAgaWYgKGxpZmUuY3JvcHMuaGFzKHBsb3RJZCkpIHJldHVybiByZWplY3RMaWZlKCdwbG90X29jY3VwaWVkJywgWydjcm9wIHBsb3QgaXMgYWxyZWFkeSBwbGFudGVkJ10pO1xuICBjb25zdCBzdG9jayA9IGxpZmUuc3RvY2twaWxlcy5nZXQoRk9VTkRFUl9TVE9DS1BJTEVfSUQpO1xuICBpZiAoIXN0b2NrIHx8IChzdG9jay5pbnZlbnRvcnkuc2VlZCA/PyAwKSA8IDEpIHJldHVybiByZWplY3RMaWZlKCdpbnN1ZmZpY2llbnRfcmVzb3VyY2VzJywgWyduZWVkIDEgc2VlZCBpbiB0aGUgZm91bmRlciBzdG9ja3BpbGUnXSk7XG4gIHN0b2NrLmludmVudG9yeS5zZWVkIS0tO1xuICBpZiAoc3RvY2suaW52ZW50b3J5LnNlZWQgPT09IDApIGRlbGV0ZSBzdG9jay5pbnZlbnRvcnkuc2VlZDtcbiAgY29uc3QgY3JvcDogQ3JvcFBsb3QgPSB7IGlkOiBwbG90SWQsIHBsYW50ZWRUaWNrOiBsaWZlLnRpY2ssIGdyb3d0aFRpY2tzOiBDUk9QX0dST1dUSF9USUNLUyB9O1xuICBsaWZlLmNyb3BzLnNldChwbG90SWQsIGNyb3ApO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHsgLi4uY3JvcCB9IH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcm9wUmVhZHkoY3JvcDogQ3JvcFBsb3QsIHRpY2s6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gdGljayAtIGNyb3AucGxhbnRlZFRpY2sgPj0gY3JvcC5ncm93dGhUaWNrcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhcnZlc3RDcm9wKHdvcmxkOiBXb3JsZCwgcGxvdElkOiBzdHJpbmcpOiBMaWZlUmVzdWx0PHsgZm9vZDogbnVtYmVyOyBmaWJlcjogbnVtYmVyIH0+IHtcbiAgY29uc3QgbGlmZSA9IGxpZmVTdGF0ZSh3b3JsZCk7XG4gIGNvbnN0IGNyb3AgPSBsaWZlLmNyb3BzLmdldChwbG90SWQpO1xuICBpZiAoIWNyb3ApIHJldHVybiByZWplY3RMaWZlKCdub3RfcGxhbnRlZCcsIFsnY3JvcCBwbG90IGlzIGVtcHR5J10pO1xuICBpZiAoIWNyb3BSZWFkeShjcm9wLCBsaWZlLnRpY2spKSByZXR1cm4gcmVqZWN0TGlmZSgnY3JvcF9ub3RfcmVhZHknLCBbYGNyb3AgbmVlZHMgJHtjcm9wLmdyb3d0aFRpY2tzIC0gKGxpZmUudGljayAtIGNyb3AucGxhbnRlZFRpY2spfSBtb3JlIHRpY2tzYF0pO1xuICAvLyBQbGFudCBncm93dGggaXMgdGhlIGV4cGxpY2l0IGJpb2xvZ2ljYWwgc291cmNlOyBldmVyeSBvdGhlciBsaWZlLWxvb3BcbiAgLy8gdHJhbnNmb3JtYXRpb24gY29uc2VydmVzIGl0cyBkZWNsYXJlZCBpbnB1dHMgYW5kIG91dHB1dHMuXG4gIGNvbnN0IHlpZWxkQmFnID0geyBmb29kOiBDUk9QX1lJRUxELmZvb2QsIGZpYmVyOiBDUk9QX1lJRUxELmZpYmVyIH07XG4gIGlmICh0b3RhbCh3b3JsZC5pbnZlbnRvcnkpICsgeWllbGRCYWcuZm9vZCArIHlpZWxkQmFnLmZpYmVyID4gQ0FSUklFRF9DQVBBQ0lUWSkge1xuICAgIHJldHVybiByZWplY3RMaWZlKCdjYXBhY2l0eV9leGNlZWRlZCcsIFtgY2FycmllZCBjYXBhY2l0eSAke0NBUlJJRURfQ0FQQUNJVFl9IHdvdWxkIGJlIGV4Y2VlZGVkYF0pO1xuICB9XG4gIHdvcmxkLmludmVudG9yeS5mb29kID0gKHdvcmxkLmludmVudG9yeS5mb29kID8/IDApICsgeWllbGRCYWcuZm9vZDtcbiAgd29ybGQuaW52ZW50b3J5LmZpYmVyID0gKHdvcmxkLmludmVudG9yeS5maWJlciA/PyAwKSArIHlpZWxkQmFnLmZpYmVyO1xuICBsaWZlLmNyb3BzLmRlbGV0ZShwbG90SWQpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHlpZWxkQmFnIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGlja091dGNvbWUge1xuICBmcm9tVGljazogbnVtYmVyO1xuICB0b1RpY2s6IG51bWJlcjtcbiAgY29tcGxldGVkSm9iczogQXJyYXk8eyBpZDogc3RyaW5nOyByZWNpcGU6IFJlY2lwZUlkOyBvdXRwdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfT47XG4gIHJlYWR5Q3JvcHM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWR2YW5jZVRpY2tzKHdvcmxkOiBXb3JsZCwgY291bnQ6IG51bWJlcik6IExpZmVSZXN1bHQ8VGlja091dGNvbWU+IHtcbiAgY29uc3QgbGlmZSA9IGxpZmVTdGF0ZSh3b3JsZCk7XG4gIGlmICghTnVtYmVyLmlzU2FmZUludGVnZXIoY291bnQpIHx8IGNvdW50IDwgMSB8fCBjb3VudCA+IE1BWF9USUNLU19QRVJfQ09NTUFORCkge1xuICAgIHJldHVybiByZWplY3RMaWZlKCdpbnZhbGlkX3RpY2tfY291bnQnLCBbYHRpY2tzIG11c3QgYmUgYW4gaW50ZWdlciBmcm9tIDEgdG8gJHtNQVhfVElDS1NfUEVSX0NPTU1BTkR9YF0pO1xuICB9XG4gIGNvbnN0IGNvbXBsZXRlZDogVGlja091dGNvbWVbJ2NvbXBsZXRlZEpvYnMnXSA9IFtdO1xuICBjb25zdCBmcm9tVGljayA9IGxpZmUudGljaztcbiAgLy8gSm9icyBhcmUgcHJvY2Vzc2VkIGluIHN0YWJsZSBpZCBvcmRlciBhdCBlYWNoIHRpY2ssIG5ldmVyIG1hcCBpbnNlcnRpb24sXG4gIC8vIHdhbGwgdGltZSwgZnJhbWUgZGVsdGEsIG9yIGFzeW5jaHJvbm91cyBjb21wbGV0aW9uIG9yZGVyLlxuICBmb3IgKGxldCBzdGVwID0gMDsgc3RlcCA8IGNvdW50OyBzdGVwKyspIHtcbiAgICBsaWZlLnRpY2srKztcbiAgICBmb3IgKGNvbnN0IGpvYiBvZiBbLi4ubGlmZS5qb2JzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpKSB7XG4gICAgICBqb2IucmVtYWluaW5nVGlja3MtLTtcbiAgICAgIGlmIChqb2IucmVtYWluaW5nVGlja3MgPiAwKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHN0b2NrID0gbGlmZS5zdG9ja3BpbGVzLmdldChqb2Iuc3RvY2twaWxlSWQpO1xuICAgICAgaWYgKCFzdG9jaykgdGhyb3cgbmV3IEVycm9yKCdhY3RpdmUgcHJvZHVjdGlvbiByZWZlcmVuY2VzIGEgbWlzc2luZyBzdG9ja3BpbGUnKTtcbiAgICAgIGNvbnN0IG91dHB1dCA9IGNsb25lQmFnKFJFQ0lQRVNbam9iLnJlY2lwZV0ub3V0cHV0IGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4pO1xuICAgICAgaWYgKHRvdGFsKHN0b2NrLmludmVudG9yeSkgKyB0b3RhbChvdXRwdXQpID4gc3RvY2suY2FwYWNpdHkpIHRocm93IG5ldyBFcnJvcigncmVzZXJ2ZWQgcHJvZHVjdGlvbiBvdXRwdXQgZXhjZWVkcyBjYXBhY2l0eScpO1xuICAgICAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMob3V0cHV0KSkgc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA9IChzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICAgICAgbGlmZS5qb2JzLmRlbGV0ZShqb2IuaWQpO1xuICAgICAgY29tcGxldGVkLnB1c2goeyBpZDogam9iLmlkLCByZWNpcGU6IGpvYi5yZWNpcGUsIG91dHB1dCB9KTtcbiAgICB9XG4gIH1cbiAgY29uc3QgcmVhZHlDcm9wcyA9IFsuLi5saWZlLmNyb3BzLnZhbHVlcygpXS5maWx0ZXIoKGNyb3ApID0+IGNyb3BSZWFkeShjcm9wLCBsaWZlLnRpY2spXG4gICAgJiYgY3JvcC5wbGFudGVkVGljayArIGNyb3AuZ3Jvd3RoVGlja3MgPiBmcm9tVGljaykubWFwKChjcm9wKSA9PiBjcm9wLmlkKS5zb3J0KCk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogeyBmcm9tVGljaywgdG9UaWNrOiBsaWZlLnRpY2ssIGNvbXBsZXRlZEpvYnM6IGNvbXBsZXRlZCwgcmVhZHlDcm9wcyB9IH07XG59XG4iLCAiLy8gU2NoZW1hLTMgbGlmZS1zdGF0ZSBwcmVzZW50YXRpb24uIFRoZSBzaW11bGF0aW9uIG93bnMgc3RvY2twaWxlIGNvbnRlbnRzLFxuLy8gY3JvcCBleGlzdGVuY2UgYW5kIGdyb3d0aDsgdGhpcyBtb2R1bGUgb25seSBkZXJpdmVzIGRpc3Bvc2FibGUgVEhSRUUgbWVzaGVzLlxuaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuaW1wb3J0IHsgbWVyZ2VHZW9tZXRyaWVzIH0gZnJvbSAndGhyZWUvZXhhbXBsZXMvanNtL3V0aWxzL0J1ZmZlckdlb21ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHBhbGV0dGUgZnJvbSAnLi4vZGF0YS9wYWxldHRlLmpzb24nO1xuaW1wb3J0IHsgV29ybGQsIHN1cmZhY2VBdCB9IGZyb20gJy4uL3NpbS93b3JsZCc7XG5pbXBvcnQgeyBTdHJ1Y3R1cmVNb2R1bGUgfSBmcm9tICcuLi9zaW0vc3RydWN0dXJlcyc7XG5pbXBvcnQgeyBDcm9wUGxvdCwgU3RvY2twaWxlLCBjcm9wUmVhZHkgfSBmcm9tICcuLi9zaW0vZWNvbm9teSc7XG5cbmNvbnN0IE0gPSBwYWxldHRlLm1hdGVyaWFscyBhcyBSZWNvcmQ8c3RyaW5nLCB7IGhleDogc3RyaW5nIH0+O1xuY29uc3QgSCA9IChrZXk6IHN0cmluZykgPT4gTVtrZXldLmhleDtcbmNvbnN0IFRJTUJFUiA9IEgoJ2JhcmtfZGFyaycpO1xuY29uc3QgV09PRCA9IEgoJ3RydW5rJyk7XG5jb25zdCBTVE9ORSA9IEgoJ25veGVsX3N0b25lX2InKTtcbmNvbnN0IFNPSUwgPSAnIzY4NEEzMic7XG5jb25zdCBTT0lMX0VER0UgPSBIKCdzdHJhdGFfb2NocmUnKTtcbmNvbnN0IEdSRUVOID0gSCgnY2Fub3B5X2dyZWVuX2EnKTtcbmNvbnN0IEdSRUVOX0xJR0hUID0gSCgnY2Fub3B5X2dyZWVuX2MnKTtcbmNvbnN0IEdPTEQgPSAnI0Q5QUQzRCc7XG5jb25zdCBHT0xEX0xJR0hUID0gJyNGMENGNjMnO1xuY29uc3QgRklCRVIgPSAnI0I4QTk2Qic7XG5cbmNvbnN0IExJRkVfTUFURVJJQUwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XG4gIHZlcnRleENvbG9yczogdHJ1ZSxcbiAgZmxhdFNoYWRpbmc6IHRydWUsXG59KTtcblxuZnVuY3Rpb24gcGFpbnQoZ2VvbWV0cnk6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5LCBoZXg6IHN0cmluZyk6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5IHtcbiAgY29uc3QgZyA9IGdlb21ldHJ5LmluZGV4ID8gZ2VvbWV0cnkudG9Ob25JbmRleGVkKCkgOiBnZW9tZXRyeTtcbiAgZy5kZWxldGVBdHRyaWJ1dGUoJ3V2Jyk7XG4gIGNvbnN0IGNvbG91ciA9IG5ldyBUSFJFRS5Db2xvcihoZXgpO1xuICBjb25zdCB2YWx1ZXMgPSBuZXcgRmxvYXQzMkFycmF5KGcuYXR0cmlidXRlcy5wb3NpdGlvbi5jb3VudCAqIDMpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGcuYXR0cmlidXRlcy5wb3NpdGlvbi5jb3VudDsgaSsrKSB7XG4gICAgdmFsdWVzW2kgKiAzXSA9IGNvbG91ci5yO1xuICAgIHZhbHVlc1tpICogMyArIDFdID0gY29sb3VyLmc7XG4gICAgdmFsdWVzW2kgKiAzICsgMl0gPSBjb2xvdXIuYjtcbiAgfVxuICBnLnNldEF0dHJpYnV0ZSgnY29sb3InLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKHZhbHVlcywgMykpO1xuICByZXR1cm4gZztcbn1cblxuZnVuY3Rpb24gYm94KHc6IG51bWJlciwgaDogbnVtYmVyLCBkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIGNvbG91cjogc3RyaW5nKSB7XG4gIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KHcsIGgsIGQpO1xuICBnZW9tZXRyeS50cmFuc2xhdGUoeCwgeSArIGggLyAyLCB6KTtcbiAgcmV0dXJuIHBhaW50KGdlb21ldHJ5LCBjb2xvdXIpO1xufVxuXG5mdW5jdGlvbiBtZXNoKHBhcnRzOiBUSFJFRS5CdWZmZXJHZW9tZXRyeVtdLCBuYW1lOiBzdHJpbmcpOiBUSFJFRS5NZXNoIHtcbiAgY29uc3QgZ2VvbWV0cnkgPSBtZXJnZUdlb21ldHJpZXMocGFydHMsIGZhbHNlKTtcbiAgZm9yIChjb25zdCBwYXJ0IG9mIHBhcnRzKSBwYXJ0LmRpc3Bvc2UoKTtcbiAgaWYgKCFnZW9tZXRyeSkgdGhyb3cgbmV3IEVycm9yKGBjb3VsZCBub3QgbWVyZ2UgbGlmZSBtZXNoICR7bmFtZX1gKTtcbiAgZ2VvbWV0cnkuY29tcHV0ZUJvdW5kaW5nQm94KCk7XG4gIGdlb21ldHJ5LmNvbXB1dGVCb3VuZGluZ1NwaGVyZSgpO1xuICBjb25zdCByZXN1bHQgPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSwgTElGRV9NQVRFUklBTCk7XG4gIHJlc3VsdC5uYW1lID0gbmFtZTtcbiAgcmVzdWx0LmNhc3RTaGFkb3cgPSB0cnVlO1xuICByZXN1bHQucmVjZWl2ZVNoYWRvdyA9IHRydWU7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQSBzbWFsbCBvcGVuIE5veGVsIGRlcG90OiBzdG9uZSBwYWQsIHRpbWJlciByYWlscyBhbmQgYSBwaXRjaGVkIGNhbm9weS4gSXRzXG4gKiByZXNvdXJjZSBwaWxlIGlzIGEgc2VwYXJhdGUgbm9kZSBzbyByZXBsYWNpbmcgaXQgYWZ0ZXIgYSB0cmFuc2ZlciBpcyBzaW1wbGUuXG4gKi9cbmZ1bmN0aW9uIHN0b2NrcGlsZUZyYW1lKCk6IFRIUkVFLk1lc2gge1xuICBjb25zdCBwYXJ0czogVEhSRUUuQnVmZmVyR2VvbWV0cnlbXSA9IFtcbiAgICBib3goMy40LCAwLjE4LCAyLjYsIDAsIDAsIDAsIFNUT05FKSxcbiAgICAvLyBTbGF0dGVkIHRpbWJlciBiaW4sIG9wZW4gYXQgdGhlIGZyb250IHNvIGVtcHR5IHN0b3JhZ2UgaXMgdmlzaWJsZS5cbiAgICBib3goMy4wLCAwLjE2LCAwLjE2LCAwLCAwLjE4LCAtMS4wMiwgVElNQkVSKSxcbiAgICBib3goMC4xNiwgMC42NSwgMi4wLCAtMS40MywgMC4xOCwgMCwgVElNQkVSKSxcbiAgICBib3goMC4xNiwgMC42NSwgMi4wLCAxLjQzLCAwLjE4LCAwLCBUSU1CRVIpLFxuICAgIGJveCgzLjAsIDAuMTYsIDAuMTYsIDAsIDAuNzAsIC0xLjAyLCBXT09EKSxcbiAgXTtcbiAgZm9yIChjb25zdCB4IG9mIFstMS40MywgMS40M10pIHtcbiAgICBjb25zdCBwb3N0ID0gbmV3IFRIUkVFLkN5bGluZGVyR2VvbWV0cnkoMC4wOSwgMC4xMiwgMS44NSwgNCk7XG4gICAgcG9zdC5yb3RhdGVZKE1hdGguUEkgLyA0KTtcbiAgICBwb3N0LnRyYW5zbGF0ZSh4LCAxLjEwNSwgLTEuMCk7XG4gICAgcGFydHMucHVzaChwYWludChwb3N0LCBUSU1CRVIpKTtcbiAgfVxuICAvLyBBIHJlc3RyYWluZWQgZm91ci1zaWRlZCBwaXRjaGVkIHJvb2YsIHJhdGhlciB0aGFuIGFub3RoZXIgZ2VuZXJpYyBjdWJvaWQuXG4gIGNvbnN0IHJvb2YgPSBuZXcgVEhSRUUuQ29uZUdlb21ldHJ5KDIuMzUsIDAuNjIsIDQpO1xuICByb29mLnJvdGF0ZVkoTWF0aC5QSSAvIDQpO1xuICByb29mLnNjYWxlKDEsIDEsIDAuNzYpO1xuICByb29mLnRyYW5zbGF0ZSgwLCAyLjE1LCAtMS4wKTtcbiAgcGFydHMucHVzaChwYWludChyb29mLCBXT09EKSk7XG4gIHJldHVybiBtZXNoKHBhcnRzLCAnc3RvY2twaWxlX2ZyYW1lJyk7XG59XG5cbmZ1bmN0aW9uIHJlc291cmNlR2VvbWV0cnkocmVzb3VyY2U6IHN0cmluZywgaW5kZXg6IG51bWJlcik6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5IHtcbiAgY29uc3QgeCA9IC0xLjA1ICsgKGluZGV4ICUgNCkgKiAwLjcwO1xuICBjb25zdCB6ID0gMC40MiAtIE1hdGguZmxvb3IoaW5kZXggLyA0KSAqIDAuNjU7XG4gIGlmIChyZXNvdXJjZSA9PT0gJ3dvb2QnKSB7XG4gICAgY29uc3QgbG9nID0gbmV3IFRIUkVFLkN5bGluZGVyR2VvbWV0cnkoMC4xNiwgMC4xOCwgMC41OCwgNik7XG4gICAgbG9nLnJvdGF0ZVooTWF0aC5QSSAvIDIpO1xuICAgIGxvZy50cmFuc2xhdGUoeCwgMC4zOSwgeik7XG4gICAgcmV0dXJuIHBhaW50KGxvZywgV09PRCk7XG4gIH1cbiAgaWYgKHJlc291cmNlID09PSAnc3RvbmUnIHx8IHJlc291cmNlID09PSAnb3JlJykge1xuICAgIGNvbnN0IHJvY2sgPSBuZXcgVEhSRUUuRG9kZWNhaGVkcm9uR2VvbWV0cnkocmVzb3VyY2UgPT09ICdvcmUnID8gMC4yMCA6IDAuMjQsIDApO1xuICAgIHJvY2suc2NhbGUoMS4xLCAwLjc1LCAwLjkpO1xuICAgIHJvY2sucm90YXRlWShpbmRleCAqIDAuNyk7XG4gICAgcm9jay50cmFuc2xhdGUoeCwgMC4zOCwgeik7XG4gICAgcmV0dXJuIHBhaW50KHJvY2ssIHJlc291cmNlID09PSAnb3JlJyA/IEgoJ29yZV9jcnlzdGFsJykgOiBTVE9ORSk7XG4gIH1cbiAgaWYgKHJlc291cmNlID09PSAnZmliZXInIHx8IHJlc291cmNlID09PSAnc2VlZCcpIHtcbiAgICBjb25zdCBidW5kbGUgPSBuZXcgVEhSRUUuQ29uZUdlb21ldHJ5KDAuMjIsIDAuNDQsIDUpO1xuICAgIGJ1bmRsZS50cmFuc2xhdGUoeCwgMC40MCwgeik7XG4gICAgcmV0dXJuIHBhaW50KGJ1bmRsZSwgcmVzb3VyY2UgPT09ICdzZWVkJyA/IEdPTEQgOiBGSUJFUik7XG4gIH1cbiAgLy8gRm9vZCBhbmQgcmF0aW9ucyBhcmUgc21hbGwgZmFjZXRlZCBzYWNrcywgcmVjb2duaXphYmxlIHdpdGhvdXQgbGFiZWxzLlxuICBjb25zdCBzYWNrID0gbmV3IFRIUkVFLk9jdGFoZWRyb25HZW9tZXRyeSgwLjI1LCAwKTtcbiAgc2Fjay5zY2FsZSgwLjksIDEuMTUsIDAuOCk7XG4gIHNhY2sudHJhbnNsYXRlKHgsIDAuNDIsIHopO1xuICByZXR1cm4gcGFpbnQoc2FjaywgcmVzb3VyY2UgPT09ICdyYXRpb25zJyA/IEdPTERfTElHSFQgOiBHT0xEKTtcbn1cblxuZnVuY3Rpb24gc3RvY2twaWxlUmVzb3VyY2VzKHN0b2NrOiBTdG9ja3BpbGUpOiBUSFJFRS5NZXNoIHwgbnVsbCB7XG4gIGNvbnN0IGVudHJpZXMgPSBPYmplY3QuZW50cmllcyhzdG9jay5pbnZlbnRvcnkpXG4gICAgLmZpbHRlcigoWywgYW1vdW50XSkgPT4gYW1vdW50ID4gMClcbiAgICAuc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG4gIGNvbnN0IHBhcnRzID0gZW50cmllcy5tYXAoKFtyZXNvdXJjZV0sIGluZGV4KSA9PiByZXNvdXJjZUdlb21ldHJ5KHJlc291cmNlLCBpbmRleCkpO1xuICBpZiAocGFydHMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgcmVzb3VyY2VzID0gbWVzaChwYXJ0cywgJ3N0b2NrcGlsZV9yZXNvdXJjZXMnKTtcbiAgcmVzb3VyY2VzLnVzZXJEYXRhLnJlc291cmNlcyA9IE9iamVjdC5mcm9tRW50cmllcyhlbnRyaWVzKTtcbiAgcmVzb3VyY2VzLnVzZXJEYXRhLnN0b3JlZCA9IGVudHJpZXMucmVkdWNlKChzdW0sIFssIGFtb3VudF0pID0+IHN1bSArIGFtb3VudCwgMCk7XG4gIHJlc291cmNlcy51c2VyRGF0YS5jYXBhY2l0eSA9IHN0b2NrLmNhcGFjaXR5O1xuICByZXR1cm4gcmVzb3VyY2VzO1xufVxuXG5mdW5jdGlvbiBidWlsZFN0b2NrcGlsZSh3b3JsZDogV29ybGQsIHN0b2NrOiBTdG9ja3BpbGUpOiBUSFJFRS5Hcm91cCB7XG4gIGNvbnN0IGdyb3VwID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIGdyb3VwLm5hbWUgPSBgbGlmZV8ke3N0b2NrLmlkfWA7XG4gIGdyb3VwLnBvc2l0aW9uLnNldChzdG9jay54LCBzdXJmYWNlQXQod29ybGQsIE1hdGguZmxvb3Ioc3RvY2sueCksIE1hdGguZmxvb3Ioc3RvY2sueikpLCBzdG9jay56KTtcbiAgZ3JvdXAudXNlckRhdGEuc3RvY2twaWxlSWQgPSBzdG9jay5pZDtcbiAgZ3JvdXAudXNlckRhdGEuY2FwYWNpdHkgPSBzdG9jay5jYXBhY2l0eTtcbiAgZ3JvdXAudXNlckRhdGEuaW5zcGVjdFRhcmdldCA9IHsgeDogMCwgeTogMS41LCB6OiAtMC40IH07XG4gIGdyb3VwLmFkZChzdG9ja3BpbGVGcmFtZSgpKTtcbiAgY29uc3QgcmVzb3VyY2VzID0gc3RvY2twaWxlUmVzb3VyY2VzKHN0b2NrKTtcbiAgLy8gRW1wdHkgc3RvcmFnZSBpcyBhIHJlYWwgdmlzaWJsZSBzdGF0ZSwgbm90IGFuIGludmlzaWJsZSBwbGFjZWhvbGRlci5cbiAgY29uc3QgZW1wdHkgPSBuZXcgVEhSRUUuT2JqZWN0M0QoKTtcbiAgZW1wdHkubmFtZSA9ICdzdG9ja3BpbGVfZW1wdHknO1xuICBlbXB0eS52aXNpYmxlID0gcmVzb3VyY2VzID09PSBudWxsO1xuICBncm91cC51c2VyRGF0YS5lbXB0eSA9IHJlc291cmNlcyA9PT0gbnVsbDtcbiAgZ3JvdXAuYWRkKGVtcHR5KTtcbiAgaWYgKHJlc291cmNlcykgZ3JvdXAuYWRkKHJlc291cmNlcyk7XG4gIHJldHVybiBncm91cDtcbn1cblxuZnVuY3Rpb24gcGxhbnQoXG4gIHBhcnRzOiBUSFJFRS5CdWZmZXJHZW9tZXRyeVtdLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLFxuICBoZWlnaHQ6IG51bWJlciwgc3ByZWFkOiBudW1iZXIsIGNvbG91cjogc3RyaW5nLCBjcm93bjogc3RyaW5nLFxuKTogdm9pZCB7XG4gIGNvbnN0IHN0ZW0gPSBuZXcgVEhSRUUuQ3lsaW5kZXJHZW9tZXRyeSgwLjAyNSwgMC4wNCwgaGVpZ2h0LCA1KTtcbiAgc3RlbS50cmFuc2xhdGUoeCwgeSArIGhlaWdodCAvIDIsIHopO1xuICBwYXJ0cy5wdXNoKHBhaW50KHN0ZW0sIGNvbG91cikpO1xuICAvLyBUd28gcG9pbnRlZCBsZWF2ZXMgZ2l2ZSBzcHJvdXRzIGEgcmVhZGFibGUgb3JnYW5pYyBzaWxob3VldHRlLlxuICBmb3IgKGNvbnN0IHNpZGUgb2YgWy0xLCAxXSkge1xuICAgIGNvbnN0IGxlYWYgPSBuZXcgVEhSRUUuT2N0YWhlZHJvbkdlb21ldHJ5KDAuMTAsIDApO1xuICAgIGxlYWYuc2NhbGUoMS42LCAwLjQ1LCAwLjgpO1xuICAgIGxlYWYucm90YXRlWihzaWRlICogMC41NSk7XG4gICAgbGVhZi50cmFuc2xhdGUoeCArIHNpZGUgKiBzcHJlYWQgKiAwLjQ1LCB5ICsgaGVpZ2h0ICogMC41Miwgeik7XG4gICAgcGFydHMucHVzaChwYWludChsZWFmLCBjb2xvdXIpKTtcbiAgfVxuICBpZiAoaGVpZ2h0ID4gMC41KSB7XG4gICAgY29uc3QgaGVhZCA9IG5ldyBUSFJFRS5Eb2RlY2FoZWRyb25HZW9tZXRyeSgwLjEwLCAwKTtcbiAgICBoZWFkLnNjYWxlKDAuODUsIDEuMzUsIDAuODUpO1xuICAgIGhlYWQudHJhbnNsYXRlKHgsIHkgKyBoZWlnaHQsIHopO1xuICAgIHBhcnRzLnB1c2gocGFpbnQoaGVhZCwgY3Jvd24pKTtcbiAgfVxufVxuXG4vKiogR2VvbWV0cnkgcmVtYWlucyBpbnNpZGUgdGhlIGNvcnJlc3BvbmRpbmcgYXV0aG9yaXRhdGl2ZSBjcm9wLXJvdyBib3VuZHMuICovXG5mdW5jdGlvbiBjcm9wR2VvbWV0cnkocm93OiBTdHJ1Y3R1cmVNb2R1bGUsIGNyb3A6IENyb3BQbG90IHwgdW5kZWZpbmVkLCB0aWNrOiBudW1iZXIpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XG4gIGNvbnN0IHBhcnRzOiBUSFJFRS5CdWZmZXJHZW9tZXRyeVtdID0gW107XG4gIGlmICghY3JvcCkge1xuICAgIC8vIEVtcHR5IHBsb3RzIHNob3cgYSBsb3cgdGlsbGVkIHJpZGdlLCB3aXRoIHNtYWxsIGJyZWFrcyBpbiBpdHMgc2lsaG91ZXR0ZS5cbiAgICBwYXJ0cy5wdXNoKGJveChyb3cudywgMC4wNywgcm93LmQgKiAwLjcyLCByb3cueCwgcm93LnksIHJvdy56LCBTT0lMKSk7XG4gICAgY29uc3QgY2xvZHMgPSBNYXRoLm1heCgzLCBNYXRoLnJvdW5kKHJvdy53IC8gMS41KSk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjbG9kczsgaSsrKSB7XG4gICAgICBjb25zdCBjbG9kID0gbmV3IFRIUkVFLkRvZGVjYWhlZHJvbkdlb21ldHJ5KDAuMDg1LCAwKTtcbiAgICAgIGNsb2Quc2NhbGUoMS40LCAwLjQ1LCAwLjgpO1xuICAgICAgY2xvZC50cmFuc2xhdGUocm93LnggLSByb3cudyAvIDIgKyByb3cudyAqIChpICsgMC41KSAvIGNsb2RzLCByb3cueSArIDAuMDc1LCByb3cueik7XG4gICAgICBwYXJ0cy5wdXNoKHBhaW50KGNsb2QsIGkgJSAyID8gU09JTF9FREdFIDogU09JTCkpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjb25zdCBwcm9ncmVzcyA9IFRIUkVFLk1hdGhVdGlscy5jbGFtcChcbiAgICAgICh0aWNrIC0gY3JvcC5wbGFudGVkVGljaykgLyBjcm9wLmdyb3d0aFRpY2tzLCAwLCAxLFxuICAgICk7XG4gICAgY29uc3QgcmVhZHkgPSBwcm9ncmVzcyA+PSAxO1xuICAgIC8vIEZvdXIgdmlzaWJsZSBzdGFnZXM7IHJlYWRpbmVzcyBhbHNvIGNoYW5nZXMgZ3JlZW4gZm9saWFnZSB0byBnb2xkLlxuICAgIGNvbnN0IHN0YWdlID0gcmVhZHkgPyAzIDogTWF0aC5mbG9vcihwcm9ncmVzcyAqIDMpO1xuICAgIGNvbnN0IGhlaWdodCA9IDAuMTQgKyBzdGFnZSAqIDAuMDk7XG4gICAgY29uc3QgY291bnQgPSBNYXRoLm1heCgzLCBNYXRoLnJvdW5kKHJvdy53IC8gMC45KSk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICBjb25zdCB4ID0gcm93LnggLSByb3cudyAvIDIgKyByb3cudyAqIChpICsgMC41KSAvIGNvdW50O1xuICAgICAgY29uc3QgeiA9IHJvdy56ICsgKGkgJSAyID09PSAwID8gLTAuMDI1IDogMC4wMjUpO1xuICAgICAgcGxhbnQocGFydHMsIHgsIHJvdy55LCB6LCBoZWlnaHQsIHJvdy5kICogMC40LFxuICAgICAgICByZWFkeSA/IEdPTEQgOiBzdGFnZSA9PT0gMCA/IEdSRUVOX0xJR0hUIDogR1JFRU4sXG4gICAgICAgIHJlYWR5ID8gR09MRF9MSUdIVCA6IEdSRUVOX0xJR0hUKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgZ2VvbWV0cnkgPSBtZXJnZUdlb21ldHJpZXMocGFydHMsIGZhbHNlKTtcbiAgZm9yIChjb25zdCBwYXJ0IG9mIHBhcnRzKSBwYXJ0LmRpc3Bvc2UoKTtcbiAgaWYgKCFnZW9tZXRyeSkgdGhyb3cgbmV3IEVycm9yKGBjb3VsZCBub3QgbWVyZ2UgbGlmZSBjcm9wIHJvdyAke3Jvdy54fSwke3Jvdy56fWApO1xuICBnZW9tZXRyeS5jb21wdXRlQm91bmRpbmdCb3goKTtcbiAgZ2VvbWV0cnkuY29tcHV0ZUJvdW5kaW5nU3BoZXJlKCk7XG4gIHJldHVybiBnZW9tZXRyeTtcbn1cblxuZnVuY3Rpb24gY3JvcFJvd3Mod29ybGQ6IFdvcmxkKTogU3RydWN0dXJlTW9kdWxlW10ge1xuICBjb25zdCBzdHJ1Y3R1cmVzID0gWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldXG4gICAgLmZpbHRlcigoc3RydWN0dXJlKSA9PiBzdHJ1Y3R1cmUua2luZCA9PT0gJ3RlcnJhY2UnKVxuICAgIC5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpO1xuICBjb25zdCBzb3VyY2UgPSBzdHJ1Y3R1cmVzLmZpbmQoKHN0cnVjdHVyZSkgPT4gc3RydWN0dXJlLmRlc2lnblZlcnNpb24gPT09IDIpID8/IHN0cnVjdHVyZXNbMF07XG4gIHJldHVybiBzb3VyY2U/Lm1vZHVsZXMuZmlsdGVyKChtb2R1bGUpID0+IG1vZHVsZS5raW5kID09PSAnY3JvcF9yb3cnKSA/PyBbXTtcbn1cblxuLyoqXG4gKiBCdWlsZCB0aGUgY29tcGxldGUgc2NoZW1hLTMgbGlmZSBvdmVybGF5LiBObyBzdHJ1Y3R1cmUgbWVzaGVzIGFyZSBpbmNsdWRlZDpcbiAqIHRoZSBjYWxsZXIgbXVzdCByZW5kZXIgdGhhdCBmYXJtIHdpdGhvdXQgaXRzIHN0YXRpYyBjcm9wIGZvbGlhZ2UgdG8gYXZvaWQgYVxuICogc2Vjb25kLCBsaWZlY3ljbGUtdW5hd2FyZSBwbGFudCBsYXllci4gTGVnYWN5IHdvcmxkcyByZXR1cm4gYW4gZW1wdHkgZ3JvdXAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZExpZmVNZXNoZXMod29ybGQ6IFdvcmxkKTogVEhSRUUuR3JvdXAge1xuICBjb25zdCBncm91cCA9IG5ldyBUSFJFRS5Hcm91cCgpO1xuICBncm91cC5uYW1lID0gJ2xpZmVfc3RhdGUnO1xuICBncm91cC51c2VyRGF0YS5zY2hlbWEgPSAzO1xuICBpZiAoIXdvcmxkLmxpZmUpIHJldHVybiBncm91cDtcblxuICBjb25zdCBsaWZlID0gd29ybGQubGlmZTtcbiAgZm9yIChjb25zdCBzdG9jayBvZiBbLi4ubGlmZS5zdG9ja3BpbGVzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpKSB7XG4gICAgZ3JvdXAuYWRkKGJ1aWxkU3RvY2twaWxlKHdvcmxkLCBzdG9jaykpO1xuICB9XG4gIGNvbnN0IHJvd3MgPSBjcm9wUm93cyh3b3JsZCk7XG4gIC8vIElEcyBhcmUgZml4ZWQgcGxvdCBpbmRpY2VzLCBzbyBleHRyYS9taXNzaW5nIHRlcnJhY2Ugcm93cyBjYW5ub3Qgc2lsZW50bHlcbiAgLy8gYXNzb2NpYXRlIGEgcGxhbnQgd2l0aCB0aGUgd3JvbmcgcGh5c2ljYWwgbG9jYXRpb24uXG4gIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBNYXRoLm1pbihyb3dzLmxlbmd0aCwgOSk7IGluZGV4KyspIHtcbiAgICBjb25zdCBpZCA9IGBjcm9wOiR7aW5kZXh9YDtcbiAgICBjb25zdCBjcm9wID0gbGlmZS5jcm9wcy5nZXQoaWQpO1xuICAgIGNvbnN0IHJlYWR5ID0gY3JvcCAhPT0gdW5kZWZpbmVkICYmIGNyb3BSZWFkeShjcm9wLCBsaWZlLnRpY2spO1xuICAgIGNvbnN0IHBsb3QgPSBuZXcgVEhSRUUuTWVzaChjcm9wR2VvbWV0cnkocm93c1tpbmRleF0sIGNyb3AsIGxpZmUudGljayksIExJRkVfTUFURVJJQUwpO1xuICAgIHBsb3QubmFtZSA9IGBsaWZlXyR7aWR9YDtcbiAgICBwbG90LmNhc3RTaGFkb3cgPSBjcm9wICE9PSB1bmRlZmluZWQ7XG4gICAgcGxvdC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcbiAgICBwbG90LnVzZXJEYXRhLmNyb3BJZCA9IGlkO1xuICAgIHBsb3QudXNlckRhdGEuc3RhdGUgPSAhY3JvcCA/ICdlbXB0eScgOiByZWFkeSA/ICdyZWFkeScgOiAnc3Byb3V0JztcbiAgICBwbG90LnVzZXJEYXRhLnBsYW50ZWRUaWNrID0gY3JvcD8ucGxhbnRlZFRpY2s7XG4gICAgcGxvdC51c2VyRGF0YS5ncm93dGhUaWNrcyA9IGNyb3A/Lmdyb3d0aFRpY2tzO1xuICAgIHBsb3QudXNlckRhdGEudGljayA9IGxpZmUudGljaztcbiAgICBwbG90LnVzZXJEYXRhLmluc3BlY3RUYXJnZXQgPSB7XG4gICAgICB4OiByb3dzW2luZGV4XS54LCB5OiByb3dzW2luZGV4XS55ICsgTWF0aC5tYXgoMC4xMiwgcm93c1tpbmRleF0uaCAvIDIpLCB6OiByb3dzW2luZGV4XS56LFxuICAgIH07XG4gICAgZ3JvdXAuYWRkKHBsb3QpO1xuICB9XG4gIHJldHVybiBncm91cDtcbn1cblxuLyoqIERpc3Bvc2UgcGVyLWluc3RhbmNlIGdlb21ldHJ5OyB0aGUgc2hhcmVkIGZsYXQtc2hhZGVkIG1hdGVyaWFsIGlzIHJldGFpbmVkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRpc3Bvc2VMaWZlTWVzaGVzKGdyb3VwOiBUSFJFRS5Hcm91cCk6IHZvaWQge1xuICBncm91cC50cmF2ZXJzZSgob2JqZWN0KSA9PiB7XG4gICAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIFRIUkVFLk1lc2gpIG9iamVjdC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gIH0pO1xuICBncm91cC5jbGVhcigpO1xufVxuIiwgIntcbiAgXCJzY2hlbWFcIjogXCJwYWxldHRlX3YyXCIsXG4gIFwiZGF0ZVwiOiBcIjIwMjYtMTAtMjJcIixcbiAgXCJzdGF0dXNcIjogXCJwcm9wb3NlZFwiLFxuICBcInNvdXJjZVwiOiBcIlJFRi0wMDIgKGh5YnJpZCB3b3JsZCByZWZlcmVuY2UpLCB2YWx1ZXMgc2FtcGxlZCBieSBleWU7IG51bWVyaWMgdmVyaWZpY2F0aW9uIHBlbmRpbmdcIixcbiAgXCJub3RlXCI6IFwiT25lIG1hdGVyaWFsIHBhbGV0dGUuIFRpbWUgb2YgZGF5IGlzIGV4cHJlc3NlZCBieSB0aGUgbGlnaHRpbmcgcHJlc2V0cyBiZWxvdywgbm90IGJ5IHJlcGFpbnRpbmcgbWF0ZXJpYWxzLlwiLFxuICBcIm1hdGVyaWFsc1wiOiB7XG4gICAgXCJncmFzc190b3BcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNzlCOTRDXCIsXG4gICAgICBcInJvbGVcIjogXCJ0ZXJyYWluIHRvcCwgbG93IGVsZXZhdGlvblwiXG4gICAgfSxcbiAgICBcImdyYXNzX2hpZ2hcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOEZDOTVFXCIsXG4gICAgICBcInJvbGVcIjogXCJ0ZXJyYWluIHRvcCwgbWlkIGVsZXZhdGlvblwiXG4gICAgfSxcbiAgICBcImdyYXNzX3BlYWtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUFEMDZBXCIsXG4gICAgICBcInJvbGVcIjogXCJ0ZXJyYWluIHRvcCwgaGlnaCBlbGV2YXRpb25cIlxuICAgIH0sXG4gICAgXCJncmFzc19jYXBcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNUU5NDQwXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJhbmQgMC4wLTAuNCBtIGJlbG93IHRvcFwiXG4gICAgfSxcbiAgICBcInN0cmF0YV9vY2hyZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNDOTlBNUZcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYmFuZCAwLjQtMC42MiBtIGJlbG93IHRvcFwiXG4gICAgfSxcbiAgICBcInN0cmF0YV9ydXN0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0I0NjMzQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBiYW5kIDAuNjItMC44MCBtIGJlbG93IHRvcFwiXG4gICAgfSxcbiAgICBcInN0b25lX3RvcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFNkRGQ0NcIixcbiAgICAgIFwicm9sZVwiOiBcImJhcmUgc3RvbmUgdG9wIHN1cmZhY2VcIlxuICAgIH0sXG4gICAgXCJzdG9uZV9ib2R5X2FcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRENEM0JFXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJvZHksIGV2ZW4gNC41IG0gYmFuZFwiXG4gICAgfSxcbiAgICBcInN0b25lX2JvZHlfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEMUM3QUZcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYm9keSwgb2RkIDQuNSBtIGJhbmRcIlxuICAgIH0sXG4gICAgXCJzdG9uZV9zaGFkZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCOUFFOTZcIixcbiAgICAgIFwicm9sZVwiOiBcImNyZXZpY2UgLyByZWNlc3NlZCBzdG9uZSBhY2NlbnRcIlxuICAgIH0sXG4gICAgXCJzYW5kXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0UzRDNBNlwiLFxuICAgICAgXCJyb2xlXCI6IFwic2hvcmUgY2VsbHNcIlxuICAgIH0sXG4gICAgXCJzbm93XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0VFRjFGNVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ2VuZXJhdG9yIHYyIHNub3dmaWVsZHMgYWJvdmUgdGhlIHNub3dsaW5lIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl9za2luXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0Q5QTc3RVwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2hhcmFjdGVyIHNraW4gKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX3R1bmljXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0IzNEEzQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwiZm91bmRlciB0dW5pYywgd2FybSByZWQgYWNjZW50IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl90dW5pY19hbHRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMkU4Qzg2XCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlciB0dW5pYywgdGVhbCBhY2NlbnQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX3Ryb3VzZXJzXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVCNDYzNlwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2hhcmFjdGVyIHRyb3VzZXJzIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl9oYWlyXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzRBMzMyNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2hhcmFjdGVyIGhhaXIgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX2Jvb3RzXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzMzMjgxRlwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2hhcmFjdGVyIGJvb3RzIGFuZCBiZWx0IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfZGVlclwiOiB7XG4gICAgICBcImhleFwiOiBcIiM4QzVCM0FcIixcbiAgICAgIFwicm9sZVwiOiBcInJlZCBkZWVyIGNvYXQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV9saWdodFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEQ0M3QTRcIixcbiAgICAgIFwicm9sZVwiOiBcImRlZXIgYmVsbHksIGhhcmUgdGFpbCwgYW50bGVyIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfaGFyZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QTg2NzBcIixcbiAgICAgIFwicm9sZVwiOiBcImhhcmUgY29hdCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX3Ryb3V0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZGN0Y1RVwiLFxuICAgICAgXCJyb2xlXCI6IFwidHJvdXQgYmFjayAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX3Ryb3V0X2JlbGx5XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0Q4QzlBM1wiLFxuICAgICAgXCJyb2xlXCI6IFwidHJvdXQgYmVsbHkgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3BsYXN0ZXJcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRThEREM2XCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIHdhbGwgcGxhc3RlciAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfdGltYmVyXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZBNDUzMFwiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZSB0aW1iZXIgZnJhbWUgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3RpbWJlcl9saWdodFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM4QTYxNDJcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2UgcGxhbmtzIGFuZCBkb29ycyAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfdGhhdGNoXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0M3QTI1N1wiLFxuICAgICAgXCJyb2xlXCI6IFwidGhhdGNoIHJvb2YgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3RoYXRjaF9kYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlDN0IzQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwidGhhdGNoIHJvb2Ygc2hhZGUgY291cnNlIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF9zdG9uZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QjlBOTFcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2UgbWFzb25yeSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfc3RvbmVfZGFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM3NDczNkNcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2UgbWFzb25yeSBqb2ludHMgYW5kIHBsaW50aCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcInByb3BfaXJvblwiOiB7XG4gICAgICBcImhleFwiOiBcIiMzQTNBM0ZcIixcbiAgICAgIFwicm9sZVwiOiBcImlyb24gZml0dGluZ3MgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJwcm9wX2dsb3dcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRkZEMjdGXCIsXG4gICAgICBcInJvbGVcIjogXCJsYW50ZXJuIGxpZ2h0IChlbWlzc2l2ZSwgZWZmZWN0IG9ubHkpIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfc2hhbGxvd1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM2N0NGRDhcIixcbiAgICAgIFwicm9sZVwiOiBcIndhdGVyIGRlcHRoIDw9IDAuNSBtXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfbWlkXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzNBQUZDNFwiLFxuICAgICAgXCJyb2xlXCI6IFwid2F0ZXIgZGVwdGggfjEuNSBtXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfZGVlcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMyQThGQThcIixcbiAgICAgIFwicm9sZVwiOiBcIndhdGVyIGRlcHRoID49IDQuMCBtXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfcmltXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0JGRUFGMFwiLFxuICAgICAgXCJyb2xlXCI6IFwic2hvcmVsaW5lIHJpbSAvIGZvYW0gdGludFwiXG4gICAgfSxcbiAgICBcImNhbm9weV9ncmVlbl9hXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVGQTgzRlwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JlZW4gY2Fub3B5LCBzaGFkZSBtYXNzXCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X2dyZWVuX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNkZCODRBXCIsXG4gICAgICBcInJvbGVcIjogXCJncmVlbiBjYW5vcHksIG1haW4gbWFzc1wiXG4gICAgfSxcbiAgICBcImNhbm9weV9ncmVlbl9jXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzdGQzM1NlwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JlZW4gY2Fub3B5LCBoaWdobGlnaHQgbWFzc1wiXG4gICAgfSxcbiAgICBcImNhbm9weV9waW5rXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0YyQTZDNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmxvc3NvbSBhY2NlbnQgc3BlY2llcyBvbmx5XCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X3BpbmtfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFODhGQjJcIixcbiAgICAgIFwicm9sZVwiOiBcImJsb3Nzb20gc2hhZGUgbWFzc1wiXG4gICAgfSxcbiAgICBcInRydW5rXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZCNEEzM1wiLFxuICAgICAgXCJyb2xlXCI6IFwidHJlZSB0cnVua3NcIlxuICAgIH0sXG4gICAgXCJiYXJrX2RhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNEUzNjI2XCIsXG4gICAgICBcInJvbGVcIjogXCJ0cnVuayBzaGFkZSwgc3R1bXBzXCJcbiAgICB9LFxuICAgIFwib3JlX2NyeXN0YWxcIjoge1xuICAgICAgXCJoZXhcIjogXCIjN0I1QUQ2XCIsXG4gICAgICBcInJvbGVcIjogXCJvcmUgZGVwb3NpdCBhY2NlbnQgKHByb3Bvc2VkLCByZXBsYWNlcyB0ZWFsKVwiXG4gICAgfSxcbiAgICBcIm9yZV9jcnlzdGFsX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUI3QkU4XCIsXG4gICAgICBcInJvbGVcIjogXCJvcmUgaGlnaGxpZ2h0IGZhY2V0XCJcbiAgICB9LFxuICAgIFwibm94ZWxfc3RvbmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTZERkNDXCIsXG4gICAgICBcInJvbGVcIjogXCJOb3hlbCBhcmNoaXRlY3R1cmUgbWFpbiBzdG9uZVwiXG4gICAgfSxcbiAgICBcIm5veGVsX3N0b25lX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDNDOUI0XCIsXG4gICAgICBcInJvbGVcIjogXCJOb3hlbCBzZWNvbmRhcnkgc3RvbmUgLyByZWNlc3NcIlxuICAgIH0sXG4gICAgXCJhY2NlbnRfYmx1ZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiMzRTdGQjhcIixcbiAgICAgIFwicm9sZVwiOiBcImJhbm5lciAvIGNsb3RoIGFjY2VudFwiXG4gICAgfSxcbiAgICBcImFjY2VudF90ZWFsXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzJGQTZBMFwiLFxuICAgICAgXCJyb2xlXCI6IFwic2Vjb25kYXJ5IGFjY2VudFwiXG4gICAgfSxcbiAgICBcImVtaXNzaXZlX2ZpcmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRkY5RTRBXCIsXG4gICAgICBcInJvbGVcIjogXCJjYW1wZmlyZSAvIHdhcm0gZW1pc3NpdmUgKGVmZmVjdHMgb25seSlcIlxuICAgIH0sXG4gICAgXCJlbWlzc2l2ZV9tYWdpY1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNEMjRCRkZcIixcbiAgICAgIFwicm9sZVwiOiBcInJlc2VydmVkOiBtYWdpYyBlZmZlY3RzIG9ubHksIG5ldmVyIG1hdGVyaWFsc1wiXG4gICAgfVxuICB9LFxuICBcImxpZ2h0aW5nXCI6IHtcbiAgICBcImRhd25cIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogMTIsXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogMTA1LFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNGRkM3OUFcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDIuMixcbiAgICAgIFwiaGVtaVNreVwiOiBcIiM4RkE2QzhcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiM0RTVGNkVcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAwLjYsXG4gICAgICBcInNreVwiOiBcIiNBOEJFRDZcIixcbiAgICAgIFwiZm9nXCI6IFwiI0E4QkVENlwiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDA1LFxuICAgICAgXCJleHBvc3VyZVwiOiAxLjFcbiAgICB9LFxuICAgIFwibm9vblwiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiAzOCxcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiA1MCxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjRkZGNERDXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAyLjc1LFxuICAgICAgXCJoZW1pU2t5XCI6IFwiI0JGRDlGMlwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzdBOEY1NVwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDAuNTUsXG4gICAgICBcInNreVwiOiBcIiM5RUQyRUVcIixcbiAgICAgIFwiZm9nXCI6IFwiI0RDRUZGOFwiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDAyOCxcbiAgICAgIFwiZXhwb3N1cmVcIjogMS4wNVxuICAgIH0sXG4gICAgXCJkdXNrXCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDksXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogMjUwLFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNGRkIyN0FcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDMuMixcbiAgICAgIFwiaGVtaVNreVwiOiBcIiM4RTdDOUVcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiM1QTRBNTBcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAxLjEsXG4gICAgICBcInNreVwiOiBcIiNDOThFODZcIixcbiAgICAgIFwiZm9nXCI6IFwiI0MwOTA4QVwiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDAzNixcbiAgICAgIFwiZXhwb3N1cmVcIjogMS4zMlxuICAgIH0sXG4gICAgXCJuaWdodFwiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiA0MCxcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiAyMjAsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0FGQzhGRlwiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMS4wLFxuICAgICAgXCJoZW1pU2t5XCI6IFwiIzNBNEM3QVwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzFDMjU0MFwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDEuMDUsXG4gICAgICBcInNreVwiOiBcIiMxMDE3MzZcIixcbiAgICAgIFwiZm9nXCI6IFwiIzE1MUMzQ1wiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDA0NSxcbiAgICAgIFwiZXhwb3N1cmVcIjogMS41XG4gICAgfVxuICB9XG59IiwgIi8vIFByaXZhdGUgbWlncmF0aW9uIHJlcGxheSBvbmx5LiBSZXRpcmVkIGVudGl0aWVzIGxpdmUgaW4gdGhpcyBXb3JsZCB3aGlsZSBhblxuLy8gYWNjZXB0ZWQgaGlzdG9yaWNhbCBqb3VybmFsIGlzIGNoZWNrZWQ7IG5vIHB1YmxpYyBjb21tYW5kIGVuYWJsZXMgdGhpcyBtb2RlLlxuaW50ZXJmYWNlIFJlcGxheVN0YXRlIHtcbiAgYWN0aXZlOiBib29sZWFuO1xuICBoaXN0b3JpY2FsSGFzaDogYm9vbGVhbjtcbiAgbWlncmF0ZWQ6IGJvb2xlYW47XG59XG5cbmNvbnN0IHN0YXRlcyA9IG5ldyBXZWFrTWFwPG9iamVjdCwgUmVwbGF5U3RhdGU+KCk7XG5cbmV4cG9ydCBmdW5jdGlvbiByZXBsYXlTdG9uZVN0YXRlKHdvcmxkOiBvYmplY3QpOiBSZXBsYXlTdGF0ZSB7XG4gIGxldCBzdGF0ZSA9IHN0YXRlcy5nZXQod29ybGQpO1xuICBpZiAoIXN0YXRlKSB7IHN0YXRlID0geyBhY3RpdmU6IGZhbHNlLCBoaXN0b3JpY2FsSGFzaDogZmFsc2UsIG1pZ3JhdGVkOiBmYWxzZSB9OyBzdGF0ZXMuc2V0KHdvcmxkLCBzdGF0ZSk7IH1cbiAgcmV0dXJuIHN0YXRlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5hYmxlU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICBjb25zdCBzdGF0ZSA9IHJlcGxheVN0b25lU3RhdGUod29ybGQpO1xuICBzdGF0ZS5hY3RpdmUgPSB0cnVlO1xuICBzdGF0ZS5oaXN0b3JpY2FsSGFzaCA9IHRydWU7XG4gIHN0YXRlLm1pZ3JhdGVkID0gZmFsc2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5hY3RpdmUgPz8gZmFsc2U7XG59XG5cbi8qKiBTbmFwc2hvdCBoYXNoZXMgYmVmb3JlIGFuZCBkdXJpbmcgdmVyaWZpZWQgaGlzdG9yaWNhbCByZXBsYXkgaW5jbHVkZSBzdG9uZXMuICovXG5leHBvcnQgZnVuY3Rpb24gZW5hYmxlSGlzdG9yaWNhbFN0b25lSGFzaCh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIHJlcGxheVN0b25lU3RhdGUod29ybGQpLmhpc3RvcmljYWxIYXNoID0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSGlzdG9yaWNhbFN0b25lSGFzaCh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8uaGlzdG9yaWNhbEhhc2ggPz8gZmFsc2U7XG59XG5cbi8qKiBBIG1pZ3JhdGVkIHNuYXBzaG90IGFscmVhZHkgaGFzIHJldGlyZW1lbnQgdG9tYnN0b25lcyBpbiBnZW5lcmF0ZWQgY2h1bmtzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcmtTdG9uZU1pZ3JhdGVkKHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCkubWlncmF0ZWQgPSB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdG9uZU1pZ3JhdGVkKHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5taWdyYXRlZCA/PyBmYWxzZTtcbn1cblxuLyoqIEV4aXQgaGlzdG9yaWNhbCBtb2RlIGFmdGVyIGFsbCBhY2NlcHRlZCBjb21tYW5kcyBhbmQgaGFzaGVzIGhhdmUgcGFzc2VkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbmlzaFN0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgY29uc3Qgc3RhdGUgPSByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKTtcbiAgc3RhdGUuYWN0aXZlID0gZmFsc2U7XG4gIHN0YXRlLmhpc3RvcmljYWxIYXNoID0gZmFsc2U7XG4gIHN0YXRlLm1pZ3JhdGVkID0gdHJ1ZTtcbn1cbiIsICIvLyBEZXRlcm1pbmlzdGljIGhhc2gsIG5vaXNlIGFuZCBtYXRoIGhlbHBlcnMgc2hhcmVkIGJ5IHRoZSBzaW11bGF0aW9uIGxheWVyLlxuLy8gUHVyZSBUeXBlU2NyaXB0IChELTAwNSkuIEV4dHJhY3RlZCBmcm9tIHdvcmxkLnRzIHVuY2hhbmdlZCBzbyB0ZXJyYWluXG4vLyBnZW5lcmF0b3JzIG9mIGV2ZXJ5IHZlcnNpb24gdXNlIGlkZW50aWNhbCBwcmltaXRpdmVzLlxuZXhwb3J0IGNvbnN0IGNsYW1wID0gKHY6IG51bWJlciwgYTogbnVtYmVyLCBiOiBudW1iZXIpID0+ICh2IDwgYSA/IGEgOiB2ID4gYiA/IGIgOiB2KTtcbmV4cG9ydCBjb25zdCBsZXJwID0gKGE6IG51bWJlciwgYjogbnVtYmVyLCB0OiBudW1iZXIpID0+IGEgKyAoYiAtIGEpICogdDtcbmV4cG9ydCBjb25zdCBzbW9vdGhzdGVwID0gKGUwOiBudW1iZXIsIGUxOiBudW1iZXIsIHg6IG51bWJlcikgPT4ge1xuICBjb25zdCB0ID0gY2xhbXAoKHggLSBlMCkgLyAoZTEgLSBlMCksIDAsIDEpO1xuICByZXR1cm4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcbn07XG5cbi8vIC0tLS0tLS0tLS0gZGV0ZXJtaW5pc3RpYyBoYXNoIC8gbm9pc2UgLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGhhc2gyaSh4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGggPSBzZWVkIF4gTWF0aC5pbXVsKHgsIDM3NDc2MTM5MykgXiBNYXRoLmltdWwoeSwgNjY4MjY1MjYzKTtcbiAgaCA9IE1hdGguaW11bChoIF4gKGggPj4+IDEzKSwgMTI3NDEyNjE3Nyk7XG4gIHJldHVybiAoKGggXiAoaCA+Pj4gMTYpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzaDNpKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gc2VlZCBeIE1hdGguaW11bCh4LCAzNzQ3NjEzOTMpIF4gTWF0aC5pbXVsKHksIDY2ODI2NTI2MykgXiBNYXRoLmltdWwoeiwgMjI0NjgyMjUxOSk7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxMyksIDEyNzQxMjYxNzcpO1xuICByZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG11bGJlcnJ5MzIoc2VlZDogbnVtYmVyKTogKCkgPT4gbnVtYmVyIHtcbiAgbGV0IGEgPSBzZWVkID4+PiAwO1xuICByZXR1cm4gKCkgPT4ge1xuICAgIGEgPSAoYSArIDB4NmQyYjc5ZjUpID4+PiAwO1xuICAgIGxldCB0ID0gYTtcbiAgICB0ID0gTWF0aC5pbXVsKHQgXiAodCA+Pj4gMTUpLCB0IHwgMSk7XG4gICAgdCBePSB0ICsgTWF0aC5pbXVsKHQgXiAodCA+Pj4gNyksIHQgfCA2MSk7XG4gICAgcmV0dXJuICgodCBeICh0ID4+PiAxNCkpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBzbW9vdGggPSAodDogbnVtYmVyKSA9PiB0ICogdCAqICgzIC0gMiAqIHQpO1xuXG5leHBvcnQgZnVuY3Rpb24gdmFsdWVOb2lzZTIoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpO1xuICBjb25zdCB4ZiA9IHNtb290aCh4IC0geGkpLCB5ZiA9IHNtb290aCh5IC0geWkpO1xuICBjb25zdCBhID0gaGFzaDJpKHhpLCB5aSwgc2VlZCksIGIgPSBoYXNoMmkoeGkgKyAxLCB5aSwgc2VlZCk7XG4gIGNvbnN0IGMgPSBoYXNoMmkoeGksIHlpICsgMSwgc2VlZCksIGQgPSBoYXNoMmkoeGkgKyAxLCB5aSArIDEsIHNlZWQpO1xuICBjb25zdCB0b3AgPSBhICsgKGIgLSBhKSAqIHhmO1xuICBjb25zdCBib3R0b20gPSBjICsgKGQgLSBjKSAqIHhmO1xuICByZXR1cm4gdG9wICsgKGJvdHRvbSAtIHRvcCkgKiB5Zjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZibTIoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlciwgb2N0YXZlczogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHN1bSA9IDAsIGFtcCA9IDEsIGZyZXEgPSAxLCBub3JtID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBvY3RhdmVzOyBpKyspIHtcbiAgICBzdW0gKz0gYW1wICogdmFsdWVOb2lzZTIoeCAqIGZyZXEsIHkgKiBmcmVxLCBzZWVkICsgaSAqIDEzMSk7XG4gICAgbm9ybSArPSBhbXA7XG4gICAgYW1wICo9IDAuNTsgZnJlcSAqPSAyO1xuICB9XG4gIHJldHVybiBzdW0gLyBub3JtO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdmFsdWVOb2lzZTMoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgeGkgPSBNYXRoLmZsb29yKHgpLCB5aSA9IE1hdGguZmxvb3IoeSksIHppID0gTWF0aC5mbG9vcih6KTtcbiAgY29uc3QgeGYgPSBzbW9vdGgoeCAtIHhpKSwgeWYgPSBzbW9vdGgoeSAtIHlpKSwgemYgPSBzbW9vdGgoeiAtIHppKTtcbiAgY29uc3QgYzAwMCA9IGhhc2gzaSh4aSwgeWksIHppLCBzZWVkKSwgYzEwMCA9IGhhc2gzaSh4aSArIDEsIHlpLCB6aSwgc2VlZCk7XG4gIGNvbnN0IGMwMTAgPSBoYXNoM2koeGksIHlpICsgMSwgemksIHNlZWQpLCBjMTEwID0gaGFzaDNpKHhpICsgMSwgeWkgKyAxLCB6aSwgc2VlZCk7XG4gIGNvbnN0IGMwMDEgPSBoYXNoM2koeGksIHlpLCB6aSArIDEsIHNlZWQpLCBjMTAxID0gaGFzaDNpKHhpICsgMSwgeWksIHppICsgMSwgc2VlZCk7XG4gIGNvbnN0IGMwMTEgPSBoYXNoM2koeGksIHlpICsgMSwgemkgKyAxLCBzZWVkKSwgYzExMSA9IGhhc2gzaSh4aSArIDEsIHlpICsgMSwgemkgKyAxLCBzZWVkKTtcbiAgY29uc3QgeDAwID0gYzAwMCArIChjMTAwIC0gYzAwMCkgKiB4ZjtcbiAgY29uc3QgeDEwID0gYzAxMCArIChjMTEwIC0gYzAxMCkgKiB4ZjtcbiAgY29uc3QgeDAxID0gYzAwMSArIChjMTAxIC0gYzAwMSkgKiB4ZjtcbiAgY29uc3QgeDExID0gYzAxMSArIChjMTExIC0gYzAxMSkgKiB4ZjtcbiAgY29uc3QgeTAgPSB4MDAgKyAoeDEwIC0geDAwKSAqIHlmO1xuICBjb25zdCB5MSA9IHgwMSArICh4MTEgLSB4MDEpICogeWY7XG4gIHJldHVybiB5MCArICh5MSAtIHkwKSAqIHpmO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmJtMyh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwLCBhbXAgPSAxLCBmcmVxID0gMSwgbm9ybSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG4gICAgc3VtICs9IGFtcCAqIHZhbHVlTm9pc2UzKHggKiBmcmVxLCB5ICogZnJlcSwgeiAqIGZyZXEsIHNlZWQgKyBpICogMTMxKTtcbiAgICBub3JtICs9IGFtcDtcbiAgICBhbXAgKj0gMC41OyBmcmVxICo9IDI7XG4gIH1cbiAgcmV0dXJuIHN1bSAvIG5vcm07XG59XG5cbiIsICIvLyBIeWRyb2xvZ3kgXHUyMDE0IHRoZSBkZXRlcm1pbmlzdGljIHdhdGVyIG5ldHdvcmsgb2YgYSB3b3JsZCAocHVyZSBUeXBlU2NyaXB0LCBELTAwNSkuXG4vL1xuLy8gVGhpcyBpcyBkZXJpdmVkICpzaW11bGF0aW9uIGRhdGEqLCBub3QgcHJlc2VudGF0aW9uOiBpdCBpcyBhIHB1cmUgZnVuY3Rpb24gb2Zcbi8vIChzZWVkLCBnZW5lcmF0b3IgdmVyc2lvbikgYW5kIGlzIHdoYXQgdGVycmFpbiBjYXJ2aW5nLCB3YXRlciBmaWxsaW5nLCBmbG93XG4vLyBkaXJlY3Rpb24gYW5kIGZ1dHVyZSBmaXNoaW5nL2lycmlnYXRpb24vZmxvb2RpbmcgcnVsZXMgcmVhZC4gSXQgaXMgbmV2ZXJcbi8vIGpvdXJuYWxlZCBiZWNhdXNlIGl0IGNhbiBhbHdheXMgYmUgcmVnZW5lcmF0ZWQgZXhhY3RseS5cbi8vXG4vLyBOZXR3b3JrIChib3RoIGdlbmVyYXRvciB2ZXJzaW9ucyk6XG4vLyAgIGxha2UgIFx1MjAxNCB0aGUgdmFsbGV5IGxha2UgYmFzaW4sIGxvY2F0ZWQgZnJvbSB0aGUgYWN0dWFsIGdlbmVyYXRlZCB0ZXJyYWluLlxuLy8gICBsb3dlciBcdTIwMTQgdGhlIGxvd2xhbmQgcml2ZXIgZnJvbSB0aGUgbGFrZSB0byB0aGUgc291dGhlcm4gc2VhLCB0cmFjZWQgZnJvbVxuLy8gICAgICAgICAgIHRoZSBhY3R1YWwgY2FydmVkIGNoYW5uZWwgKHRoZSB2MSBjaGFubmVsIGlzIGNhcnZlZCBvbiAqd2FycGVkKlxuLy8gICAgICAgICAgIGNvb3JkaW5hdGVzLCBzbyBgcml2ZXJDZW50ZXJYYCBhbG9uZSBpcyB1cCB0byB+MTM1IG0gb2ZmKS5cbi8vIEdlbmVyYXRvciB2MiBhZGRzOlxuLy8gICB1cHBlciBcdTIwMTQgYSBtb3VudGFpbiByaXZlciBmcm9tIGEgaGlnaGxhbmQgdGFybiBkb3duIHRvIHRoZSBsYWtlLCB3aXRoIGFcbi8vICAgICAgICAgICB3YXRlci1zdXJmYWNlIGxldmVsIHRoYXQgbmV2ZXIgcmlzZXMgZG93bnN0cmVhbSwgY2FzY2FkZXMgYW5kIGZhbGxzLlxuLy9cbi8vIEZsb3cgYWx3YXlzIHBvaW50cyBkb3duc3RyZWFtOiB1cHBlciBcdTIxOTIgbGFrZSBcdTIxOTIgbG93ZXIgXHUyMTkyIHNlYS5cbmltcG9ydCB7IGNsYW1wLCBmYm0yLCBtdWxiZXJyeTMyLCBzbW9vdGhzdGVwIH0gZnJvbSAnLi9ub2lzZSc7XG5cbmV4cG9ydCB0eXBlIEhlaWdodFNhbXBsZXIgPSAoeDogbnVtYmVyLCB6OiBudW1iZXIpID0+IG51bWJlcjtcblxuZXhwb3J0IGludGVyZmFjZSBSaXZlclBvaW50IHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIC8qKiBBcmMgbGVuZ3RoIGZyb20gdGhlIGRvd25zdHJlYW0gZW5kIG9mIHRoaXMgcmVhY2ggKG1ldHJlcykuICovXG4gIHM6IG51bWJlcjtcbiAgLyoqIFdhdGVyLXN1cmZhY2UgZWxldmF0aW9uIChtZXRyZXMsIG1heSBiZSBmcmFjdGlvbmFsKS4gKi9cbiAgbGV2ZWw6IG51bWJlcjtcbiAgLyoqIENoYW5uZWwgaGFsZi13aWR0aCAobWV0cmVzKS4gKi9cbiAgd2lkdGg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWFjaEhpdCB7XG4gIC8qKiBIb3Jpem9udGFsIGRpc3RhbmNlIGZyb20gdGhlIGNlbnRyZWxpbmUuICovXG4gIGQ6IG51bWJlcjtcbiAgLyoqIEludGVycG9sYXRlZCB3YXRlciBsZXZlbCBhdCB0aGUgbmVhcmVzdCBjZW50cmVsaW5lIHBvaW50LiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICB3aWR0aDogbnVtYmVyO1xuICAvKiogVW5pdCBkb3duc3RyZWFtIGRpcmVjdGlvbi4gKi9cbiAgdHg6IG51bWJlcjtcbiAgdHo6IG51bWJlcjtcbiAgLyoqIFdhdGVyLXN1cmZhY2UgZHJvcCBwZXIgbWV0cmUgYWxvbmcgdGhlIGNoYW5uZWwgKD49IDApLiAqL1xuICBncmFkaWVudDogbnVtYmVyO1xuICAvKiogQXJjIGxlbmd0aCBvZiB0aGUgbmVhcmVzdCBwb2ludCBmcm9tIHRoZSBkb3duc3RyZWFtIGVuZC4gKi9cbiAgczogbnVtYmVyO1xufVxuXG4vKipcbiAqIEEgcG9seWxpbmUgcmVhY2ggc3RvcmVkIGRvd25zdHJlYW0tZmlyc3QuIE5lYXJlc3Qtc2VnbWVudCBxdWVyaWVzIHVzZSBhXG4gKiB1bmlmb3JtIGdyaWQgd2hvc2UgY2VsbHMgbGlzdCBldmVyeSBzZWdtZW50IHdpdGhpbiBgcmVhY2hgIG1ldHJlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIFJpdmVyUmVhY2gge1xuICByZWFkb25seSBwb2ludHM6IFJpdmVyUG9pbnRbXTtcbiAgcHJpdmF0ZSByZWFkb25seSBjZWxsID0gMzI7XG4gIHByaXZhdGUgcmVhZG9ubHkgZ3JpZCA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXJbXT4oKTtcblxuICBjb25zdHJ1Y3Rvcihwb2ludHM6IFJpdmVyUG9pbnRbXSwgcmVhZG9ubHkgcmVhY2g6IG51bWJlcikge1xuICAgIHRoaXMucG9pbnRzID0gcG9pbnRzO1xuICAgIGZvciAobGV0IGkgPSAwOyBpICsgMSA8IHBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgYSA9IHBvaW50c1tpXSwgYiA9IHBvaW50c1tpICsgMV07XG4gICAgICBjb25zdCB4MCA9IE1hdGgubWluKGEueCwgYi54KSAtIHJlYWNoLCB4MSA9IE1hdGgubWF4KGEueCwgYi54KSArIHJlYWNoO1xuICAgICAgY29uc3QgejAgPSBNYXRoLm1pbihhLnosIGIueikgLSByZWFjaCwgejEgPSBNYXRoLm1heChhLnosIGIueikgKyByZWFjaDtcbiAgICAgIGZvciAobGV0IGN6ID0gTWF0aC5mbG9vcih6MCAvIHRoaXMuY2VsbCk7IGN6IDw9IE1hdGguZmxvb3IoejEgLyB0aGlzLmNlbGwpOyBjeisrKSB7XG4gICAgICAgIGZvciAobGV0IGN4ID0gTWF0aC5mbG9vcih4MCAvIHRoaXMuY2VsbCk7IGN4IDw9IE1hdGguZmxvb3IoeDEgLyB0aGlzLmNlbGwpOyBjeCsrKSB7XG4gICAgICAgICAgY29uc3Qga2V5ID0gY2VsbEtleShjeCwgY3opO1xuICAgICAgICAgIGxldCBsaXN0ID0gdGhpcy5ncmlkLmdldChrZXkpO1xuICAgICAgICAgIGlmICghbGlzdCkgeyBsaXN0ID0gW107IHRoaXMuZ3JpZC5zZXQoa2V5LCBsaXN0KTsgfVxuICAgICAgICAgIGxpc3QucHVzaChpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldCBsZW5ndGgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMucG9pbnRzW3RoaXMucG9pbnRzLmxlbmd0aCAtIDFdPy5zID8/IDA7IH1cblxuICAvKiogTmVhcmVzdCBjZW50cmVsaW5lIHBvaW50IHdpdGhpbiBgcmVhY2hgLCBvciBudWxsLiAqL1xuICBuZWFyZXN0KHg6IG51bWJlciwgejogbnVtYmVyKTogUmVhY2hIaXQgfCBudWxsIHtcbiAgICBjb25zdCBsaXN0ID0gdGhpcy5ncmlkLmdldChjZWxsS2V5KE1hdGguZmxvb3IoeCAvIHRoaXMuY2VsbCksIE1hdGguZmxvb3IoeiAvIHRoaXMuY2VsbCkpKTtcbiAgICBpZiAoIWxpc3QpIHJldHVybiBudWxsO1xuICAgIGxldCBiZXN0ID0gSW5maW5pdHksIGJpID0gLTEsIGJ0ID0gMDtcbiAgICBmb3IgKGNvbnN0IGkgb2YgbGlzdCkge1xuICAgICAgY29uc3QgYSA9IHRoaXMucG9pbnRzW2ldLCBiID0gdGhpcy5wb2ludHNbaSArIDFdO1xuICAgICAgY29uc3QgZHggPSBiLnggLSBhLngsIGR6ID0gYi56IC0gYS56O1xuICAgICAgY29uc3QgbGVuMiA9IGR4ICogZHggKyBkeiAqIGR6IHx8IDE7XG4gICAgICBjb25zdCB0ID0gY2xhbXAoKCh4IC0gYS54KSAqIGR4ICsgKHogLSBhLnopICogZHopIC8gbGVuMiwgMCwgMSk7XG4gICAgICBjb25zdCBweCA9IGEueCArIGR4ICogdCwgcHogPSBhLnogKyBkeiAqIHQ7XG4gICAgICBjb25zdCBkMiA9ICh4IC0gcHgpICoqIDIgKyAoeiAtIHB6KSAqKiAyO1xuICAgICAgaWYgKGQyIDwgYmVzdCkgeyBiZXN0ID0gZDI7IGJpID0gaTsgYnQgPSB0OyB9XG4gICAgfVxuICAgIGlmIChiaSA8IDAgfHwgYmVzdCA+IHRoaXMucmVhY2ggKiB0aGlzLnJlYWNoKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBhID0gdGhpcy5wb2ludHNbYmldLCBiID0gdGhpcy5wb2ludHNbYmkgKyAxXTtcbiAgICBjb25zdCBzZWdMZW4gPSBNYXRoLm1heCgxZS02LCBiLnMgLSBhLnMpO1xuICAgIC8vIFBvaW50cyBhcmUgc3RvcmVkIGRvd25zdHJlYW0tZmlyc3QsIHNvIGRvd25zdHJlYW0gaXMgYSA8LSBiLlxuICAgIGNvbnN0IHR4ID0gKGEueCAtIGIueCkgLyBzZWdMZW4sIHR6ID0gKGEueiAtIGIueikgLyBzZWdMZW47XG4gICAgcmV0dXJuIHtcbiAgICAgIGQ6IE1hdGguc3FydChiZXN0KSxcbiAgICAgIGxldmVsOiBhLmxldmVsICsgKGIubGV2ZWwgLSBhLmxldmVsKSAqIGJ0LFxuICAgICAgd2lkdGg6IGEud2lkdGggKyAoYi53aWR0aCAtIGEud2lkdGgpICogYnQsXG4gICAgICB0eCwgdHosXG4gICAgICBncmFkaWVudDogTWF0aC5tYXgoMCwgKGIubGV2ZWwgLSBhLmxldmVsKSAvIHNlZ0xlbiksXG4gICAgICBzOiBhLnMgKyAoYi5zIC0gYS5zKSAqIGJ0LFxuICAgIH07XG4gIH1cbn1cblxuZnVuY3Rpb24gY2VsbEtleShjeDogbnVtYmVyLCBjejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIChjeCArIDQwOTYpICogODE5MiArIChjeiArIDQwOTYpO1xufVxuXG5leHBvcnQgdHlwZSBXYXRlckJvZHkgPSAncml2ZXInIHwgJ2xha2UnIHwgJ3NlYScgfCAnbm9uZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRmxvd1NhbXBsZSB7XG4gIGJvZHk6IFdhdGVyQm9keTtcbiAgLyoqIFVuaXQgZmxvdyBkaXJlY3Rpb24gKHplcm8gZm9yIHN0aWxsIHdhdGVyKS4gKi9cbiAgZHg6IG51bWJlcjtcbiAgZHo6IG51bWJlcjtcbiAgLyoqIFN1cmZhY2UgY3VycmVudCBzcGVlZCBpbiBtL3MuICovXG4gIHNwZWVkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSHlkcm9sb2d5T3B0aW9ucyB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgLyoqIEdlbmVyYXRvciB2ZXJzaW9uIHRoZSBuZXR3b3JrIGJlbG9uZ3MgdG8uICovXG4gIHZlcnNpb246IG51bWJlcjtcbiAgLyoqIEJhc2UgaGVpZ2h0IG9mIHRoZSAqdW5tb2RpZmllZCB2MSBzaGFwZSogKHVzZWQgdG8gbG9jYXRlIGxha2UvY2hhbm5lbCkuICovXG4gIHYxSGVpZ2h0OiBIZWlnaHRTYW1wbGVyO1xufVxuXG4vKiogRGV0ZXJtaW5pc3RpYyBoeWRyb2xvZ2ljYWwgbmV0d29yayBmb3Igb25lIChzZWVkLCBnZW5lcmF0b3IgdmVyc2lvbikuICovXG5leHBvcnQgY2xhc3MgSHlkcm9sb2d5IHtcbiAgcmVhZG9ubHkgc2VlZDogbnVtYmVyO1xuICByZWFkb25seSB2ZXJzaW9uOiBudW1iZXI7XG4gIHJlYWRvbmx5IGxha2U6IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHJ4OiBudW1iZXI7IHJ6OiBudW1iZXIgfTtcbiAgcmVhZG9ubHkgbG93ZXI6IFJpdmVyUmVhY2g7XG4gIHJlYWRvbmx5IHVwcGVyOiBSaXZlclJlYWNoIHwgbnVsbDtcbiAgLyoqIFVwcGVyLXJpdmVyIHNvdXJjZSB0YXJuICh2MiBvbmx5KS4gKi9cbiAgcmVhZG9ubHkgdGFybjogeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcjogbnVtYmVyOyBsZXZlbDogbnVtYmVyIH0gfCBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKG9wdHM6IEh5ZHJvbG9neU9wdGlvbnMpIHtcbiAgICB0aGlzLnNlZWQgPSBvcHRzLnNlZWQ7XG4gICAgdGhpcy52ZXJzaW9uID0gb3B0cy52ZXJzaW9uO1xuICAgIHRoaXMubGFrZSA9IGxvY2F0ZUxha2Uob3B0cy52MUhlaWdodCk7XG4gICAgdGhpcy5sb3dlciA9IHRyYWNlTG93ZXJSaXZlcihvcHRzLnYxSGVpZ2h0LCB0aGlzLmxha2UpO1xuICAgIGlmIChvcHRzLnZlcnNpb24gPj0gMikge1xuICAgICAgY29uc3QgdXBwZXIgPSBhdXRob3JVcHBlclJpdmVyKG9wdHMuc2VlZCwgdGhpcy5sYWtlKTtcbiAgICAgIHRoaXMudXBwZXIgPSB1cHBlci5yZWFjaDtcbiAgICAgIHRoaXMudGFybiA9IHVwcGVyLnRhcm47XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMudXBwZXIgPSBudWxsO1xuICAgICAgdGhpcy50YXJuID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU3VyZmFjZSBjdXJyZW50IGZvciBhIHdhdGVyIGNvbHVtbi4gYGxldmVsYCBpcyB0aGUgY29sdW1uJ3Mgd2F0ZXIgc3VyZmFjZSxcbiAgICogdXNlZCB0byB0ZWxsIHNlYS1sZXZlbCB3YXRlciAobGFrZSwgbG93ZXIgcml2ZXIsIHNlYSkgZnJvbSB0aGUgdXBwZXIgcml2ZXIuXG4gICAqL1xuICBmbG93QXQoeDogbnVtYmVyLCB6OiBudW1iZXIsIGxldmVsOiBudW1iZXIpOiBGbG93U2FtcGxlIHtcbiAgICBpZiAodGhpcy51cHBlciAmJiBsZXZlbCA+IDAuNSkge1xuICAgICAgY29uc3QgaGl0ID0gdGhpcy51cHBlci5uZWFyZXN0KHgsIHopO1xuICAgICAgaWYgKGhpdCAmJiBoaXQuZCA8PSBoaXQud2lkdGggKyAyKSB7XG4gICAgICAgIGNvbnN0IHNwZWVkID0gY2xhbXAoMC41NSArIGhpdC5ncmFkaWVudCAqIDksIDAuNCwgNC41KTtcbiAgICAgICAgcmV0dXJuIHsgYm9keTogJ3JpdmVyJywgZHg6IGhpdC50eCwgZHo6IGhpdC50eiwgc3BlZWQgfTtcbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLnRhcm4gJiYgTWF0aC5oeXBvdCh4IC0gdGhpcy50YXJuLngsIHogLSB0aGlzLnRhcm4ueikgPCB0aGlzLnRhcm4uciArIDQpIHtcbiAgICAgICAgcmV0dXJuIHsgYm9keTogJ2xha2UnLCAuLi50b3dhcmRzKHgsIHosIHRoaXMudXBwZXJTb3VyY2UoKSwgMC4wNikgfTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgbG93ID0gdGhpcy5sb3dlci5uZWFyZXN0KHgsIHopO1xuICAgIGlmIChsb3cgJiYgbG93LmQgPD0gbG93LndpZHRoICsgNikge1xuICAgICAgcmV0dXJuIHsgYm9keTogJ3JpdmVyJywgZHg6IGxvdy50eCwgZHo6IGxvdy50eiwgc3BlZWQ6IDAuMzUgKyAwLjI1ICogc21vb3Roc3RlcChsb3cud2lkdGggKyA2LCAwLCBsb3cuZCkgfTtcbiAgICB9XG4gICAgY29uc3QgbGQgPSBNYXRoLmh5cG90KCh4IC0gdGhpcy5sYWtlLngpIC8gdGhpcy5sYWtlLnJ4LCAoeiAtIHRoaXMubGFrZS56KSAvIHRoaXMubGFrZS5yeik7XG4gICAgaWYgKGxkIDwgMS4zNSkge1xuICAgICAgLy8gU2xvdyBkcmlmdCBmcm9tIHRoZSBpbmZsb3cgdG93YXJkIHRoZSBvdXRmbG93IGF0IHRoZSBoZWFkIG9mIHRoZSBsb3dlciByaXZlci5cbiAgICAgIGNvbnN0IGhlYWQgPSB0aGlzLmxvd2VyLnBvaW50c1t0aGlzLmxvd2VyLnBvaW50cy5sZW5ndGggLSAxXTtcbiAgICAgIGNvbnN0IGRyaWZ0ID0gdG93YXJkcyh4LCB6LCBoZWFkLCAwLjA4KTtcbiAgICAgIHJldHVybiB7IGJvZHk6ICdsYWtlJywgLi4uZHJpZnQgfTtcbiAgICB9XG4gICAgcmV0dXJuIHsgYm9keTogJ3NlYScsIGR4OiAwLCBkejogMCwgc3BlZWQ6IDAgfTtcbiAgfVxuXG4gIHByaXZhdGUgdXBwZXJTb3VyY2UoKTogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9IHtcbiAgICBjb25zdCBwdHMgPSB0aGlzLnVwcGVyIS5wb2ludHM7XG4gICAgcmV0dXJuIHB0c1twdHMubGVuZ3RoIC0gMV07XG4gIH1cbn1cblxuZnVuY3Rpb24gdG93YXJkcyh4OiBudW1iZXIsIHo6IG51bWJlciwgcDogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9LCBzcGVlZDogbnVtYmVyKSB7XG4gIGNvbnN0IGR4ID0gcC54IC0geCwgZHogPSBwLnogLSB6O1xuICBjb25zdCBsZW4gPSBNYXRoLmh5cG90KGR4LCBkeikgfHwgMTtcbiAgcmV0dXJuIHsgZHg6IGR4IC8gbGVuLCBkejogZHogLyBsZW4sIHNwZWVkIH07XG59XG5cbi8qKiBGaW5kIHRoZSB2YWxsZXkgbGFrZSBmcm9tIHRoZSB0ZXJyYWluIGl0c2VsZjogdGhlIGRlZXAgYmFzaW4gTlcgb2YgdGhlIGZvdW5kZXIgdmFsbGV5LiAqL1xuZnVuY3Rpb24gbG9jYXRlTGFrZShoOiBIZWlnaHRTYW1wbGVyKTogSHlkcm9sb2d5WydsYWtlJ10ge1xuICBsZXQgc3ggPSAwLCBzeiA9IDAsIG4gPSAwLCBtaW5YID0gSW5maW5pdHksIG1heFggPSAtSW5maW5pdHksIG1pblogPSBJbmZpbml0eSwgbWF4WiA9IC1JbmZpbml0eTtcbiAgZm9yIChsZXQgeiA9IC00NjA7IHogPD0gLTEyMDsgeiArPSA0KSB7XG4gICAgZm9yIChsZXQgeCA9IC00ODA7IHggPD0gLTQwOyB4ICs9IDQpIHtcbiAgICAgIGlmIChoKHgsIHopID4gLTQpIGNvbnRpbnVlO1xuICAgICAgc3ggKz0geDsgc3ogKz0gejsgbisrO1xuICAgICAgbWluWCA9IE1hdGgubWluKG1pblgsIHgpOyBtYXhYID0gTWF0aC5tYXgobWF4WCwgeCk7XG4gICAgICBtaW5aID0gTWF0aC5taW4obWluWiwgeik7IG1heFogPSBNYXRoLm1heChtYXhaLCB6KTtcbiAgICB9XG4gIH1cbiAgaWYgKG4gPT09IDApIHJldHVybiB7IHg6IC0yNjAsIHo6IC0yMzAsIHJ4OiAxMjAsIHJ6OiA5NSB9O1xuICByZXR1cm4ge1xuICAgIHg6IHN4IC8gbiwgejogc3ogLyBuLFxuICAgIHJ4OiBNYXRoLm1heCgzMCwgKG1heFggLSBtaW5YKSAvIDIgKyAxMCksIHJ6OiBNYXRoLm1heCgzMCwgKG1heFogLSBtaW5aKSAvIDIgKyAxMCksXG4gIH07XG59XG5cbi8qKlxuICogVHJhY2UgdGhlIGNhcnZlZCBsb3dsYW5kIGNoYW5uZWwgZnJvbSB0aGUgbGFrZSBvdXRmbG93IHNvdXRoIHRvIHRoZSBzZWEuIEZvclxuICogZWFjaCA0IG0gcm93IHRoZSBjaGFubmVsIGlzIHRoZSBsb3dlc3QgY29sdW1uIG5lYXIgdGhlIHByZXZpb3VzIGNlbnRyZTsgdGhlXG4gKiB0cmFjZSBpcyBzbW9vdGhlZCBzbyB0aGUgZmxvdyBmaWVsZCBkb2VzIG5vdCBqaXR0ZXIgd2l0aCB0aGUgMSBtIHZveGVscy5cbiAqL1xuZnVuY3Rpb24gdHJhY2VMb3dlclJpdmVyKGg6IEhlaWdodFNhbXBsZXIsIGxha2U6IEh5ZHJvbG9neVsnbGFrZSddKTogUml2ZXJSZWFjaCB7XG4gIGNvbnN0IHJhdzogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlciB9PiA9IFtdO1xuICBsZXQgY3ggPSBsYWtlLnggKyBsYWtlLnJ4ICogMC41NTtcbiAgbGV0IHogPSBNYXRoLnJvdW5kKGxha2UueiArIGxha2UucnogKiAwLjYpO1xuICAvLyBTdGFydCBhdCB0aGUgbGFrZSdzIHNvdXRoLWVhc3Qgb3V0ZmxvdyBhbmQgZm9sbG93IHRoZSBjaGFubmVsIGRvd25zdHJlYW0uXG4gIGZvciAoOyB6IDw9IDkwMDsgeiArPSA0KSB7XG4gICAgbGV0IGJlc3QgPSBJbmZpbml0eSwgYnggPSBjeDtcbiAgICBmb3IgKGxldCB4ID0gTWF0aC5yb3VuZChjeCAtIDQwKTsgeCA8PSBjeCArIDQwOyB4ICs9IDIpIHtcbiAgICAgIGNvbnN0IHYgPSBoKHgsIHopICsgTWF0aC5hYnMoeCAtIGN4KSAqIDAuMDI7XG4gICAgICBpZiAodiA8IGJlc3QpIHsgYmVzdCA9IHY7IGJ4ID0geDsgfVxuICAgIH1cbiAgICBjeCA9IGJ4O1xuICAgIHJhdy5wdXNoKHsgeDogYngsIHogfSk7XG4gICAgLy8gVGhlIHRyYWNlIGVuZHMgb25jZSBpdCByZWFjaGVzIG9wZW4gc2VhIGZvciBhIHN1c3RhaW5lZCBzdHJldGNoLlxuICAgIGlmIChiZXN0IDwgLTYgJiYgcmF3Lmxlbmd0aCA+IDIwICYmIGgoYngsIHogKyA4KSA8IC02ICYmIGgoYngsIHogKyAxNikgPCAtNikgYnJlYWs7XG4gIH1cbiAgY29uc3Qgc21vb3RoID0gcmF3Lm1hcCgocCwgaSkgPT4ge1xuICAgIGxldCBzeCA9IDAsIG4gPSAwO1xuICAgIGZvciAobGV0IGsgPSBNYXRoLm1heCgwLCBpIC0gNCk7IGsgPD0gTWF0aC5taW4ocmF3Lmxlbmd0aCAtIDEsIGkgKyA0KTsgaysrKSB7IHN4ICs9IHJhd1trXS54OyBuKys7IH1cbiAgICByZXR1cm4geyB4OiBzeCAvIG4sIHo6IHAueiB9O1xuICB9KTtcbiAgLy8gU3RvcmUgZG93bnN0cmVhbS1maXJzdDogaW5kZXggMCBpcyB0aGUgc2VhIG1vdXRoLlxuICBzbW9vdGgucmV2ZXJzZSgpO1xuICBjb25zdCBwb2ludHM6IFJpdmVyUG9pbnRbXSA9IFtdO1xuICBsZXQgcyA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgc21vb3RoLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKGkgPiAwKSBzICs9IE1hdGguaHlwb3Qoc21vb3RoW2ldLnggLSBzbW9vdGhbaSAtIDFdLngsIHNtb290aFtpXS56IC0gc21vb3RoW2kgLSAxXS56KTtcbiAgICBwb2ludHMucHVzaCh7IHg6IHNtb290aFtpXS54LCB6OiBzbW9vdGhbaV0ueiwgcywgbGV2ZWw6IDAsIHdpZHRoOiA2IH0pO1xuICB9XG4gIHJldHVybiBuZXcgUml2ZXJSZWFjaChwb2ludHMsIDQwKTtcbn1cblxuLyoqIFdhdGVyLXN1cmZhY2UgZHJvcHMgYWxvbmcgdGhlIHVwcGVyIHJpdmVyLCBhcyAoZnJhY3Rpb24gb2YgbGVuZ3RoLCBtZXRyZXMpLiAqL1xuY29uc3QgRkFMTFM6IFJlYWRvbmx5QXJyYXk8cmVhZG9ubHkgW251bWJlciwgbnVtYmVyXT4gPSBbWzAuMiwgN10sIFswLjQ4LCAxMV0sIFswLjc0LCAxM11dO1xuY29uc3QgVVBQRVJfR1JBRElFTlQgPSAwLjAzO1xuXG4vKipcbiAqIEF1dGhvciB0aGUgdjIgbW91bnRhaW4gcml2ZXI6IGEgc2VlZGVkIG1lYW5kZXJpbmcgY2VudHJlbGluZSBmcm9tIHRoZSBsYWtlJ3NcbiAqIG5vcnRoIHNob3JlIHRvIGEgaGlnaGxhbmQgdGFybiwgd2l0aCBhIGxldmVsIHByb2ZpbGUgdGhhdCBvbmx5IHJpc2VzXG4gKiB1cHN0cmVhbSAoZ2VudGxlIGdyYWRpZW50IHBsdXMgdGhyZWUgY2FzY2FkZXMpLlxuICovXG5mdW5jdGlvbiBhdXRob3JVcHBlclJpdmVyKHNlZWQ6IG51bWJlciwgbGFrZTogSHlkcm9sb2d5WydsYWtlJ10pOiB7XG4gIHJlYWNoOiBSaXZlclJlYWNoOyB0YXJuOiBOb25OdWxsYWJsZTxIeWRyb2xvZ3lbJ3Rhcm4nXT47XG59IHtcbiAgY29uc3Qgcm5kID0gbXVsYmVycnkzMigoc2VlZCBeIDB4NWVlZDIpID4+PiAwKTtcbiAgY29uc3QgaiA9IChhOiBudW1iZXIpID0+IChybmQoKSAtIDAuNSkgKiAyICogYTtcbiAgY29uc3QgbW91dGggPSB7IHg6IGxha2UueCArIGxha2UucnggKiAwLjEsIHo6IGxha2UueiAtIGxha2UucnogKiAwLjU1IH07XG4gIGNvbnN0IGNvbnRyb2xzID0gW1xuICAgIG1vdXRoLFxuICAgIHsgeDogbGFrZS54ICsgMjAgKyBqKDIwKSwgejogLTQxMCArIGooMTUpIH0sXG4gICAgeyB4OiAtMTkwICsgaigzNSksIHo6IC01MjAgKyBqKDIwKSB9LFxuICAgIHsgeDogLTIxNSArIGooMzUpLCB6OiAtNjQwICsgaigyMCkgfSxcbiAgICB7IHg6IC0xNjUgKyBqKDMwKSwgejogLTc3MCArIGooMTUpIH0sXG4gIF07XG4gIC8vIENhdG11bGwtUm9tIHRocm91Z2ggdGhlIGNvbnRyb2xzLCB0aGVuIHJlc2FtcGxlIGF0IH44IG0gc3BhY2luZyB3aXRoIGFcbiAgLy8gc21hbGwgc2VlZGVkIG1lYW5kZXIgc28gdGhlIGNoYW5uZWwgaXMgbm90IGEgc21vb3RoIHNwbGluZS5cbiAgY29uc3QgZGVuc2U6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT4gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb250cm9scy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICBjb25zdCBwMCA9IGNvbnRyb2xzW01hdGgubWF4KDAsIGkgLSAxKV0sIHAxID0gY29udHJvbHNbaV07XG4gICAgY29uc3QgcDIgPSBjb250cm9sc1tpICsgMV0sIHAzID0gY29udHJvbHNbTWF0aC5taW4oY29udHJvbHMubGVuZ3RoIC0gMSwgaSArIDIpXTtcbiAgICBmb3IgKGxldCBrID0gMDsgayA8IDI0OyBrKyspIHtcbiAgICAgIGNvbnN0IHQgPSBrIC8gMjQsIHQyID0gdCAqIHQsIHQzID0gdDIgKiB0O1xuICAgICAgZGVuc2UucHVzaCh7XG4gICAgICAgIHg6IDAuNSAqICgyICogcDEueCArICgtcDAueCArIHAyLngpICogdCArICgyICogcDAueCAtIDUgKiBwMS54ICsgNCAqIHAyLnggLSBwMy54KSAqIHQyXG4gICAgICAgICAgKyAoLXAwLnggKyAzICogcDEueCAtIDMgKiBwMi54ICsgcDMueCkgKiB0MyksXG4gICAgICAgIHo6IDAuNSAqICgyICogcDEueiArICgtcDAueiArIHAyLnopICogdCArICgyICogcDAueiAtIDUgKiBwMS56ICsgNCAqIHAyLnogLSBwMy56KSAqIHQyXG4gICAgICAgICAgKyAoLXAwLnogKyAzICogcDEueiAtIDMgKiBwMi56ICsgcDMueikgKiB0MyksXG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgZGVuc2UucHVzaChjb250cm9sc1tjb250cm9scy5sZW5ndGggLSAxXSk7XG4gIGNvbnN0IHJlc2FtcGxlZDogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlcjsgczogbnVtYmVyIH0+ID0gW3sgLi4uZGVuc2VbMF0sIHM6IDAgfV07XG4gIGxldCBhY2MgPSAwLCBzID0gMDtcbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBkZW5zZS5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHN0ZXAgPSBNYXRoLmh5cG90KGRlbnNlW2ldLnggLSBkZW5zZVtpIC0gMV0ueCwgZGVuc2VbaV0ueiAtIGRlbnNlW2kgLSAxXS56KTtcbiAgICBhY2MgKz0gc3RlcDsgcyArPSBzdGVwO1xuICAgIGlmIChhY2MgPj0gOCB8fCBpID09PSBkZW5zZS5sZW5ndGggLSAxKSB7XG4gICAgICBjb25zdCBtID0gKGZibTIocyAvIDYwLCAzLjEsIHNlZWQgKyA4MDEsIDIpIC0gMC41KSAqIDE0O1xuICAgICAgcmVzYW1wbGVkLnB1c2goeyB4OiBkZW5zZVtpXS54ICsgbSwgejogZGVuc2VbaV0ueiwgcyB9KTtcbiAgICAgIGFjYyA9IDA7XG4gICAgfVxuICB9XG4gIGNvbnN0IHRvdGFsID0gcmVzYW1wbGVkW3Jlc2FtcGxlZC5sZW5ndGggLSAxXS5zO1xuICBjb25zdCBsZXZlbEF0ID0gKHN2OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGxldCBsZXZlbCA9IHN2ICogVVBQRVJfR1JBRElFTlQ7XG4gICAgZm9yIChjb25zdCBbZnJhYywgZHJvcF0gb2YgRkFMTFMpIHtcbiAgICAgIC8vIEVhY2ggZmFsbCBpcyBhIHNob3J0IGNhc2NhZGUgb3ZlciB+MTAgbSBvZiBjaGFubmVsLlxuICAgICAgbGV2ZWwgKz0gZHJvcCAqIHNtb290aHN0ZXAodG90YWwgKiBmcmFjIC0gNSwgdG90YWwgKiBmcmFjICsgNSwgc3YpO1xuICAgIH1cbiAgICAvLyBUaGUgZmlyc3QgNDAgbSBpbnRvIHRoZSBsYWtlIHN0YXlzIGF0IGxha2UgbGV2ZWwuXG4gICAgcmV0dXJuIHN2IDwgNDAgPyAwIDogbGV2ZWwgLSA0MCAqIFVQUEVSX0dSQURJRU5UO1xuICB9O1xuICBjb25zdCBwb2ludHM6IFJpdmVyUG9pbnRbXSA9IHJlc2FtcGxlZC5tYXAoKHApID0+ICh7XG4gICAgeDogcC54LCB6OiBwLnosIHM6IHAucywgbGV2ZWw6IE1hdGgubWF4KDAsIGxldmVsQXQocC5zKSksXG4gICAgd2lkdGg6IDMuMiArIDIuMiAqIGZibTIocC5zIC8gNzAsIDkuNywgc2VlZCArIDgwMiwgMikgKyAoMSAtIHAucyAvIHRvdGFsKSAqIDEuNSxcbiAgfSkpO1xuICBjb25zdCBzb3VyY2UgPSBwb2ludHNbcG9pbnRzLmxlbmd0aCAtIDFdO1xuICByZXR1cm4ge1xuICAgIHJlYWNoOiBuZXcgUml2ZXJSZWFjaChwb2ludHMsIDExMCksXG4gICAgdGFybjogeyB4OiBzb3VyY2UueCwgejogc291cmNlLnosIHI6IDE4LCBsZXZlbDogc291cmNlLmxldmVsIH0sXG4gIH07XG59XG4iLCAiLy8gVm94ZWwgbWF0ZXJpYWwgaWRzLiBQdXJlIGRhdGEgc2hhcmVkIGJ5IHRoZSBzaW11bGF0aW9uIGxheWVyIChELTAwNSkuXG4vLyBJZHMgYXJlIHBlcnNpc3RlZCBpbiBzbmFwc2hvdCBlZGl0cywgc28gZXhpc3RpbmcgdmFsdWVzIG11c3QgbmV2ZXIgY2hhbmdlLlxuZXhwb3J0IGNvbnN0IE1BVCA9IHtcbiAgQUlSOiAwLFxuICBHUkFTUzogMSxcbiAgU09JTDogMixcbiAgU0FORDogMyxcbiAgR1JBVkVMOiA0LFxuICBTVE9ORTogNSxcbiAgT1JFOiA2LFxuICBXQVRFUjogNyxcbiAgQkVEUk9DSzogOCxcbiAgTU9TUzogOSxcbiAgLyoqIEdlbmVyYXRvciB2MiBoaWdobGFuZHMuIE5ldmVyIHByb2R1Y2VkIGJ5IGdlbmVyYXRvciB2MS4gKi9cbiAgU05PVzogMTAsXG59IGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgTWF0SWQgPSAodHlwZW9mIE1BVClba2V5b2YgdHlwZW9mIE1BVF07XG5cbmV4cG9ydCBjb25zdCBpc1NvbGlkID0gKG06IG51bWJlcik6IGJvb2xlYW4gPT4gbSAhPT0gTUFULkFJUiAmJiBtICE9PSBNQVQuV0FURVI7XG5leHBvcnQgY29uc3QgaXNPcGFxdWUgPSBpc1NvbGlkO1xuXG4vKiogSGlnaGVzdCBtYXRlcmlhbCBpZCB0aGF0IG1heSBhcHBlYXIgaW4gYSB2b3hlbCBlZGl0LiAqL1xuZXhwb3J0IGNvbnN0IE1BWF9NQVRfSUQgPSAxMDtcbiIsICIvLyBUZXJyYWluIGdlbmVyYXRvciB2MiBcdTIwMTQgdGhlIHZhbGxleS13aXRoLW1vdW50YWlucyBnZW9ncmFwaHkgKHB1cmUgVFMsIEQtMDA1KS5cbi8vXG4vLyBDb21wYXRpYmlsaXR5IGNvbnRyYWN0OiBpbnNpZGUgdGhlIGZvdW5kZXIgY29ycmlkb3IgKHRoZSBzZXR0bGVtZW50IHZhbGxleSxcbi8vIHRoZSBsYWtlIGFuZCB0aGUgbG93bGFuZCByaXZlcikgdjIgaGVpZ2h0cyBlcXVhbCB2MSBleGFjdGx5LCBzbyB0aGUgcGlubmVkXG4vLyBmb3VuZGVyIHByb2plY3RzLCB0aGVpciBwcmVwYXJhdGlvbiB0YXJnZXRzIGFuZCBuYXR1cmFsIGVudGl0aWVzIHRoZXJlIGFyZVxuLy8gdW5jaGFuZ2VkLiBPdXRzaWRlIGl0IHYyIGFkZHM6XG4vLyAgIC0gYSBub3J0aGVybiBtYXNzaWYgb24gYW4gZXh0ZW5kZWQgaXNsYW5kLCB3aXRoIHNub3cgYWJvdmUgdGhlIHNub3dsaW5lO1xuLy8gICAtIGZsYW5raW5nIHJhbmdlcyB3ZXN0IGFuZCBlYXN0IG9mIHRoZSB2YWxsZXksIHRlcnJhY2VkIGludG8gY2xpZmYgYmFuZHM7XG4vLyAgIC0gYSBtb3VudGFpbiByaXZlciBjYXJ2ZWQgaW50byB0aGUgbWFzc2lmIGZyb20gYSB0YXJuIGRvd24gdG8gdGhlIGxha2UsXG4vLyAgICAgd2hvc2Ugd2F0ZXIgc3VyZmFjZSBjb21lcyBmcm9tIEh5ZHJvbG9neSBhbmQgbmV2ZXIgcmlzZXMgZG93bnN0cmVhbTtcbi8vICAgLSBhIGNvbnRpbnVvdXMgbG93bGFuZCBjaGFubmVsICh2MSBoYXMgYSBkcnkgZm9yZCBzb3V0aCBvZiB0aGUgc2hlbGYpLlxuLy8gSGVpZ2h0cyBhcmUgaW50ZWdlcnMgaW4gWy0xNCwgMTA0XS5cbmltcG9ydCB7IGNsYW1wLCBmYm0yLCBsZXJwLCBzbW9vdGhzdGVwIH0gZnJvbSAnLi9ub2lzZSc7XG5pbXBvcnQgeyBNQVQsIE1hdElkIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuaW1wb3J0IHsgSHlkcm9sb2d5IH0gZnJvbSAnLi9oeWRyb2xvZ3knO1xuXG5leHBvcnQgY29uc3QgVjJfU05PV0xJTkUgPSA3NDtcbmV4cG9ydCBjb25zdCBWMl9NQVhfSEVJR0hUID0gMTA0O1xuXG5leHBvcnQgdHlwZSBWMUhlaWdodCA9IChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKSA9PiBudW1iZXI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVjJDb2x1bW4ge1xuICAvKiogVG9wIHNvbGlkIHkgKyAxIChzYW1lIGNvbnZlbnRpb24gYXMgc3VyZmFjZUhlaWdodEF0KS4gKi9cbiAgaDogbnVtYmVyO1xuICAvKiogV2F0ZXIgc3VyZmFjZSBmb3IgdGhpcyBjb2x1bW46IGNlbGxzIFtoLCBsZXZlbCkgaG9sZCB3YXRlci4gKi9cbiAgbGV2ZWw6IG51bWJlcjtcbiAgLyoqIFRydWUgd2hlbiB0aGlzIGNvbHVtbiBpcyBwYXJ0IG9mIHRoZSBjYXJ2ZWQgbW91bnRhaW4tcml2ZXIgY2hhbm5lbC4gKi9cbiAgY2hhbm5lbDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFRlcnJhaW5WMiB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHJlYWRvbmx5IHNlZWQ6IG51bWJlcixcbiAgICBwcml2YXRlIHJlYWRvbmx5IHYxOiBWMUhlaWdodCxcbiAgICByZWFkb25seSBoeWRyb2xvZ3k6IEh5ZHJvbG9neSxcbiAgKSB7fVxuXG4gIC8qKiAwID0gZXhhY3RseSB2MSAoZm91bmRlciBjb3JyaWRvcik7IDEgPSBmdWxsIHYyIHJlbGllZi4gKi9cbiAgcmVsaWVmTWFzayh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gICAgY29uc3Qgbm9ydGggPSBzbW9vdGhzdGVwKC0zOTAsIC00NzAsIHopO1xuICAgIC8vIFRoZSB3ZXN0IHJhbmdlIGtlZXBzIGNsZWFyIG9mIHRoZSBsYWtlIGJhc2luIHVudGlsIHRoZSBsYWtlIGlzIHBhc3NlZC5cbiAgICBjb25zdCB3ZXN0RWRnZSA9IGxlcnAoLTQ1MCwgLTMyMCwgc21vb3Roc3RlcCgtMjIwLCAtMTQwLCB6KSk7XG4gICAgY29uc3Qgd2VzdCA9IHNtb290aHN0ZXAod2VzdEVkZ2UsIHdlc3RFZGdlIC0gOTAsIHgpO1xuICAgIGNvbnN0IGVhc3QgPSBzbW9vdGhzdGVwKDIzMCwgMzMwLCB4KTtcbiAgICByZXR1cm4gTWF0aC5tYXgobm9ydGgsIHdlc3QsIGVhc3QpO1xuICB9XG5cbiAgLyoqIDAgYXQgdGhlIHJhbmdlIGZyb250LCAxIGRlZXAgaW5zaWRlOiBmb290aGlsbHMgZmlyc3QsIHBlYWtzIGJlaGluZC4gKi9cbiAgcmFuZ2VEZXB0aCh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gICAgY29uc3Qgbm9ydGggPSBzbW9vdGhzdGVwKC00MjAsIC03MDAsIHopO1xuICAgIGNvbnN0IHdlc3RFZGdlID0gbGVycCgtNDUwLCAtMzIwLCBzbW9vdGhzdGVwKC0yMjAsIC0xNDAsIHopKTtcbiAgICBjb25zdCB3ZXN0ID0gc21vb3Roc3RlcCh3ZXN0RWRnZSAtIDQwLCB3ZXN0RWRnZSAtIDMwMCwgeCk7XG4gICAgY29uc3QgZWFzdCA9IHNtb290aHN0ZXAoMjcwLCA1NjAsIHgpO1xuICAgIHJldHVybiBNYXRoLm1heChub3J0aCwgd2VzdCwgZWFzdCk7XG4gIH1cblxuICBjb2x1bW4oeDogbnVtYmVyLCB6OiBudW1iZXIpOiBWMkNvbHVtbiB7XG4gICAgY29uc3Qgc2VlZCA9IHRoaXMuc2VlZDtcbiAgICBjb25zdCBiYXNlID0gdGhpcy52MShzZWVkLCB4LCB6KTtcbiAgICBjb25zdCBtYXNrID0gdGhpcy5yZWxpZWZNYXNrKHgsIHopO1xuICAgIGxldCBoID0gYmFzZTtcblxuICAgIGlmIChtYXNrID4gMCkge1xuICAgICAgLy8gRXh0ZW5kIHRoZSBpc2xhbmQgbm9ydGggc28gdGhlIG1hc3NpZiBoYXMgcm9vbSAodjEgY29hc3QgaXMgfnogLTYwMCkuXG4gICAgICBjb25zdCBub3J0aExhbmQgPSBzbW9vdGhzdGVwKC00MjAsIC01MjAsIHopO1xuICAgICAgY29uc3Qgc2hvcmUgPSAxIC0gTWF0aC5oeXBvdCgoeCArIDE1MCkgLyA1NjAsICh6ICsgNjkwKSAvIDMwMClcbiAgICAgICAgKyAoZmJtMih4IC8gMTYwLCB6IC8gMTYwLCBzZWVkICsgNzAxLCAzKSAtIDAuNSkgKiAwLjM7XG4gICAgICBjb25zdCBsYW5kTiA9IHNtb290aHN0ZXAoMC4wLCAwLjE0LCBzaG9yZSkgKiBub3J0aExhbmQ7XG4gICAgICBjb25zdCBncm91bmQgPSBsZXJwKGJhc2UsIE1hdGgubWF4KGJhc2UsIDUgKyA1ICogZmJtMih4IC8gOTAsIHogLyA5MCwgc2VlZCArIDcwMiwgMikpLCBsYW5kTik7XG5cbiAgICAgIC8vIFJpZGdlZCBtYXNzaWYgd2l0aCB0ZXJyYWNlZCBjbGlmZiBiYW5kcy5cbiAgICAgIGNvbnN0IHd4ID0geCArIChmYm0yKHggLyAyNjAsIHogLyAyNjAsIHNlZWQgKyA3MDMsIDMpIC0gMC41KSAqIDEyMDtcbiAgICAgIGNvbnN0IHd6ID0geiArIChmYm0yKHggLyAyNjAgKyA1LjEsIHogLyAyNjAgLSAyLjcsIHNlZWQgKyA3MDQsIDMpIC0gMC41KSAqIDEyMDtcbiAgICAgIGNvbnN0IHIxID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMjEwLCB3eiAvIDIxMCwgc2VlZCArIDcwNSwgNCkgLSAxKTtcbiAgICAgIGNvbnN0IHIyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gODAsIHd6IC8gODAsIHNlZWQgKyA3MDYsIDMpIC0gMSk7XG4gICAgICBjb25zdCBsdW1wID0gZmJtMih3eCAvIDEyMCwgd3ogLyAxMjAsIHNlZWQgKyA3MDcsIDMpO1xuICAgICAgY29uc3QgZGVwdGggPSB0aGlzLnJhbmdlRGVwdGgoeCwgeik7XG4gICAgICBsZXQgbW91bnRhaW4gPSAxNiArICg4ICsgODAgKiBkZXB0aCkgKiAoMC41NSAqIHIxICogcjEgKyAwLjI4ICogcjIgKyAwLjE3ICogbHVtcClcbiAgICAgICAgKyAxOCAqIGRlcHRoICogc21vb3Roc3RlcCgwLjU1LCAwLjksIHIxKTtcbiAgICAgIGNvbnN0IGJhbmQgPSA2ICsgMiAqIGZibTIoeCAvIDE0MCwgeiAvIDE0MCwgc2VlZCArIDcwOCwgMik7XG4gICAgICBjb25zdCB0ID0gTWF0aC5mbG9vcihtb3VudGFpbiAvIGJhbmQpO1xuICAgICAgY29uc3QgZnJhYyA9IG1vdW50YWluIC8gYmFuZCAtIHQ7XG4gICAgICBtb3VudGFpbiA9ICh0ICsgc21vb3Roc3RlcCgwLjUsIDAuOCwgZnJhYykpICogYmFuZDtcblxuICAgICAgLy8gT25seSBsYW5kIHJpc2VzOyB0aGUgc2VhIHN0YXlzIHNlYSwgc28gcmFuZ2VzIGVuZCBpbiBjb2FzdGFsIGNsaWZmcy5cbiAgICAgIGNvbnN0IGxhbmRGYWN0b3IgPSBzbW9vdGhzdGVwKC0yLCA4LCBncm91bmQpO1xuICAgICAgaCA9IGxlcnAoZ3JvdW5kLCBNYXRoLm1heChncm91bmQsIG1vdW50YWluKSwgbWFzayAqIGxhbmRGYWN0b3IpO1xuICAgIH1cblxuICAgIGxldCBsZXZlbCA9IGggPCAwID8gMCA6IC1JbmZpbml0eTtcbiAgICBsZXQgY2hhbm5lbCA9IGZhbHNlO1xuXG4gICAgLy8gTW91bnRhaW4gcml2ZXI6IHZhbGxleSBmbG9vciwgYmFua3MgYW5kIGNoYW5uZWwgZm9sbG93IHRoZSB3YXRlciBsZXZlbC5cbiAgICBjb25zdCB1cHBlciA9IHRoaXMuaHlkcm9sb2d5LnVwcGVyO1xuICAgIGlmICh1cHBlcikge1xuICAgICAgY29uc3QgaGl0ID0gdXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQpIHtcbiAgICAgICAgY29uc3QgcmFpc2VkID0gaGl0LmxldmVsID4gMC4yNTtcbiAgICAgICAgY29uc3QgdncgPSA1NSArIDI4ICogZmJtMihoaXQucyAvIDkwLCAxLjcsIHNlZWQgKyA3MDksIDIpO1xuICAgICAgICBjb25zdCBmbG9vciA9IGhpdC5sZXZlbCArIDEuNSArIDIuMiAqIGZibTIoeCAvIDQwLCB6IC8gNDAsIHNlZWQgKyA3MTAsIDIpICsgaGl0LmQgKiAwLjA2O1xuICAgICAgICBjb25zdCB0ID0gc21vb3Roc3RlcCh2dyAqIDAuMywgdncsIGhpdC5kKTtcbiAgICAgICAgaCA9IE1hdGgubWluKGgsIGxlcnAoZmxvb3IsIGgsIHQpKTtcbiAgICAgICAgY29uc3QgdyA9IGhpdC53aWR0aDtcbiAgICAgICAgaWYgKHJhaXNlZCAmJiBoaXQuZCA8IHcgKyAzKSB7XG4gICAgICAgICAgLy8gQmFua3MgaG9sZCBhIHJhaXNlZCByaXZlcjogbmV2ZXIgYmVsb3cgaXRzIHdhdGVyIHN1cmZhY2UuIEF0IGxha2VcbiAgICAgICAgICAvLyBsZXZlbCB0aGUgc2VhLWxldmVsIGZpbGwgYWxyZWFkeSBjb250YWlucyB0aGUgd2F0ZXIuXG4gICAgICAgICAgaCA9IE1hdGgubWF4KGgsIE1hdGguY2VpbChoaXQubGV2ZWwpICsgMSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGhpdC5kIDwgdykge1xuICAgICAgICAgIGNvbnN0IGJlZCA9IGhpdC5sZXZlbCAtICgxLjIgKyAxLjMgKiAoMSAtIGhpdC5kIC8gdykpO1xuICAgICAgICAgIGggPSBNYXRoLm1pbihoLCBiZWQpO1xuICAgICAgICAgIGlmIChyYWlzZWQpIGxldmVsID0gTWF0aC5tYXgobGV2ZWwsIE1hdGgucm91bmQoaGl0LmxldmVsKSk7XG4gICAgICAgICAgY2hhbm5lbCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnN0IHRhcm4gPSB0aGlzLmh5ZHJvbG9neS50YXJuO1xuICAgICAgaWYgKHRhcm4pIHtcbiAgICAgICAgY29uc3QgdGQgPSBNYXRoLmh5cG90KHggLSB0YXJuLngsIHogLSB0YXJuLnopXG4gICAgICAgICAgKiAoMSArIDAuMiAqIChmYm0yKHggLyAzMCwgeiAvIDMwLCBzZWVkICsgNzExLCAyKSAtIDAuNSkpO1xuICAgICAgICBpZiAodGQgPCB0YXJuLnIgKyA2KSB7XG4gICAgICAgICAgY29uc3QgcmltID0gTWF0aC5jZWlsKHRhcm4ubGV2ZWwpICsgMTtcbiAgICAgICAgICBpZiAodGQgPj0gdGFybi5yKSBoID0gTWF0aC5tYXgoaCwgcmltKTtcbiAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGggPSBNYXRoLm1pbihNYXRoLm1heChoLCByaW0pLCB0YXJuLmxldmVsIC0gMSAtIDMgKiBzbW9vdGhzdGVwKHRhcm4uciwgMCwgdGQpKTtcbiAgICAgICAgICAgIGxldmVsID0gTWF0aC5tYXgobGV2ZWwsIE1hdGgucm91bmQodGFybi5sZXZlbCkpO1xuICAgICAgICAgICAgY2hhbm5lbCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gTG93bGFuZCBjaGFubmVsIGNvbnRpbnVpdHk6IHYxIGxlYXZlcyBhIGRyeSBmb3JkIHdoZXJlIHRoZSBzaGVsZiBtZWV0cyB0aGUgcml2ZXIuXG4gICAgY29uc3QgbG93ID0gdGhpcy5oeWRyb2xvZ3kubG93ZXIubmVhcmVzdCh4LCB6KTtcbiAgICBpZiAobG93ICYmIGxvdy5kIDwgMi41ICYmIGggPj0gMCAmJiBiYXNlIDwgNCkgaCA9IC0xO1xuXG4gICAgaCA9IE1hdGgucm91bmQoY2xhbXAoaCwgLTE0LCBWMl9NQVhfSEVJR0hUKSk7XG4gICAgaWYgKGggPCAwKSBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCAwKTtcbiAgICByZXR1cm4geyBoLCBsZXZlbDogbGV2ZWwgPT09IC1JbmZpbml0eSA/IGggOiBsZXZlbCwgY2hhbm5lbCB9O1xuICB9XG5cbiAgaGVpZ2h0KHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5jb2x1bW4oeCwgeikuaDtcbiAgfVxuXG4gIC8qKiB2MiB0b3AgbWF0ZXJpYWwuIEZhbGxzIGJhY2sgdG8gdGhlIHYxIHJ1bGVzIGZvciB0aGUgdW5jaGFuZ2VkIGNvcnJpZG9yLiAqL1xuICB0b3BNYXRlcmlhbChcbiAgICB4OiBudW1iZXIsIHo6IG51bWJlciwgY29sOiBWMkNvbHVtbiwgc2xvcGU6IG51bWJlcixcbiAgICB2MVRvcDogKGg6IG51bWJlciwgc2xvcGU6IG51bWJlcikgPT4gTWF0SWQsXG4gICk6IE1hdElkIHtcbiAgICBjb25zdCBoID0gY29sLmg7XG4gICAgaWYgKGNvbC5jaGFubmVsICYmIGNvbC5sZXZlbCA+IGgpIHJldHVybiBNQVQuR1JBVkVMO1xuICAgIGNvbnN0IHVwcGVyID0gdGhpcy5oeWRyb2xvZ3kudXBwZXI7XG4gICAgaWYgKHVwcGVyICYmIGggPiAxKSB7XG4gICAgICBjb25zdCBoaXQgPSB1cHBlci5uZWFyZXN0KHgsIHopO1xuICAgICAgaWYgKGhpdCAmJiBoaXQuZCA8IGhpdC53aWR0aCArIDIuNSAmJiBoaXQubGV2ZWwgPiAwLjI1KSB7XG4gICAgICAgIHJldHVybiBmYm0yKHggLyA2LCB6IC8gNiwgdGhpcy5zZWVkICsgNzEyLCAxKSA+IDAuNSA/IE1BVC5HUkFWRUwgOiBNQVQuU0FORDtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3Qgc25vd2xpbmUgPSBWMl9TTk9XTElORSArIChmYm0yKHggLyA3MCwgeiAvIDcwLCB0aGlzLnNlZWQgKyA3MTMsIDMpIC0gMC41KSAqIDE2O1xuICAgIGlmIChoID49IHNub3dsaW5lICYmIHNsb3BlIDw9IDMpIHJldHVybiBNQVQuU05PVztcbiAgICBpZiAoaCA+PSBzbm93bGluZSAtIDYgJiYgc2xvcGUgPD0gMSAmJiBmYm0yKHggLyAyMCwgeiAvIDIwLCB0aGlzLnNlZWQgKyA3MTQsIDIpID4gMC41NSkgcmV0dXJuIE1BVC5TTk9XO1xuICAgIGlmICh0aGlzLnJlbGllZk1hc2soeCwgeikgPiAwLjUgJiYgaCA+IDMwICYmIHNsb3BlID49IDIpIHJldHVybiBNQVQuU1RPTkU7XG4gICAgcmV0dXJuIHYxVG9wKGgsIHNsb3BlKTtcbiAgfVxufVxuIiwgIi8vIFNpbXVsYXRpb24gbGF5ZXIgXHUyMDE0IHB1cmUgVHlwZVNjcmlwdCwgbm8gdGhyZWUuanMgaW1wb3J0cyAoRC0wMDUpLlxuLy9cbi8vIE0wMDEgd29ybGQgZm91bmRhdGlvbjogYSBjaHVua2VkLCBnZW51aW5lbHkgdGhyZWUtZGltZW5zaW9uYWwgdm94ZWwgd29ybGQuXG4vLyBUaGUgc3RvcmVkIHN0YXRlIGlzIG9uZSBtYXRlcmlhbCBieXRlIHBlciBjZWxsICgwID0gYWlyKTsgb2NjdXBhbmN5IGlzXG4vLyBpbXBsaWNpdC4gU3VyZmFjZSBoZWlnaHQgaXMgYSBkZXJpdmVkIHF1ZXJ5LCBub3QgdGhlIHN0b3JhZ2UuIFRoaXMgcmVwbGFjZXNcbi8vIHRoZSBmb3JtZXIgMjU2IHggMjU2IGhlaWdodGZpZWxkIChzZWUgSVItMDA1KS5cbi8vXG4vLyBXb3JsZCBtZXRyZXM6IHgveiBpbiBbLTEwMjQsIDEwMjQpLCB5IGluIFstMTYsIDExMiksIHNlYSBsZXZlbCAwLlxuLy8gQSBjaHVuayBpcyAzMiB4IDMyIHggMTI4IGNlbGxzLiBHZW5lcmF0aW9uIGlzIGEgcHVyZSBmdW5jdGlvbiBvZiB0aGUgc2VlZCxcbi8vIGdlbmVyYXRvciB2ZXJzaW9uLCBwYXJhbWV0ZXJzIGFuZCBjaHVuayBjb29yZGluYXRlczsgZWRpdHMgYXJlIHJlY29yZGVkXG4vLyBzZXBhcmF0ZWx5IGFuZCByZS1hcHBsaWVkIHdoZW4gYSBjaHVuayBpcyByZWdlbmVyYXRlZC5cbmltcG9ydCB0eXBlIHsgU3RydWN0dXJlIH0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcbmltcG9ydCB0eXBlIHsgTGlmZVN0YXRlIH0gZnJvbSAnLi9lY29ub215JztcbmltcG9ydCB7IGlzU3RvbmVSZXBsYXkgfSBmcm9tICcuL3N0b25lLWNvbXBhdCc7XG5pbXBvcnQgeyBIeWRyb2xvZ3kgfSBmcm9tICcuL2h5ZHJvbG9neSc7XG5pbXBvcnQgeyBUZXJyYWluVjIsIFYyQ29sdW1uIH0gZnJvbSAnLi90ZXJyYWluLXYyJztcblxuZXhwb3J0IGNvbnN0IFdPUkxEX1NJWkUgPSAyMDQ4O1xuZXhwb3J0IGNvbnN0IEhBTEYgPSBXT1JMRF9TSVpFIC8gMjtcbmV4cG9ydCBjb25zdCBDSFVOS19TSVpFID0gMzI7XG5leHBvcnQgY29uc3QgQ0hVTktTX1BFUl9TSURFID0gV09STERfU0laRSAvIENIVU5LX1NJWkU7XG5leHBvcnQgY29uc3QgWV9NSU4gPSAtMTY7XG5leHBvcnQgY29uc3QgWV9NQVggPSAxMTI7XG5leHBvcnQgY29uc3QgV09STERfSEVJR0hUID0gWV9NQVggLSBZX01JTjtcbmV4cG9ydCBjb25zdCBTRUFfTEVWRUwgPSAwO1xuZXhwb3J0IGNvbnN0IFdBVEVSID0gU0VBX0xFVkVMO1xuLyoqIEdlbmVyYXRvciB2MTogdGhlIG9yaWdpbmFsIDIwNDggbSBpc2xhbmQuIERlZmF1bHQgZm9yIGNyZWF0ZVdvcmxkIGFuZCBhbGwgbGVnYWN5IHNhdmVzLiAqL1xuZXhwb3J0IGNvbnN0IEdFTkVSQVRPUl9WRVJTSU9OID0gMTtcbi8qKiBHZW5lcmF0b3IgdjI6IHZhbGxleS13aXRoLW1vdW50YWlucyBnZW9ncmFwaHkgd2l0aCBhIG1vdW50YWluIHJpdmVyIChzZWUgdGVycmFpbi12Mi50cykuICovXG5leHBvcnQgY29uc3QgR0VORVJBVE9SX1YyID0gMjtcbi8qKiBUaGUgZ2VuZXJhdG9yIG5ldyBicm93c2VyIHdvcmxkcyB1c2UgYnkgZGVmYXVsdC4gKi9cbmV4cG9ydCBjb25zdCBMQVRFU1RfR0VORVJBVE9SX1ZFUlNJT04gPSBHRU5FUkFUT1JfVjI7XG5leHBvcnQgY29uc3QgU1VQUE9SVEVEX0dFTkVSQVRPUl9WRVJTSU9OUzogcmVhZG9ubHkgbnVtYmVyW10gPSBbR0VORVJBVE9SX1ZFUlNJT04sIEdFTkVSQVRPUl9WMl07XG5leHBvcnQgY29uc3QgaXNTdXBwb3J0ZWRHZW5lcmF0b3IgPSAodjogdW5rbm93bik6IHYgaXMgbnVtYmVyID0+XG4gIHR5cGVvZiB2ID09PSAnbnVtYmVyJyAmJiBTVVBQT1JURURfR0VORVJBVE9SX1ZFUlNJT05TLmluY2x1ZGVzKHYpO1xuZXhwb3J0IGNvbnN0IENIVU5LX1ZPTFVNRSA9IENIVU5LX1NJWkUgKiBDSFVOS19TSVpFICogV09STERfSEVJR0hUO1xuZXhwb3J0IGNvbnN0IENIVU5LX0FSRUEgPSBDSFVOS19TSVpFICogQ0hVTktfU0laRTtcblxuZXhwb3J0IHsgTUFULCBpc1NvbGlkLCBpc09wYXF1ZSwgTUFYX01BVF9JRCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmV4cG9ydCB0eXBlIHsgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5pbXBvcnQgeyBNQVQsIGlzU29saWQsIE1hdElkIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuXG5leHBvcnQge1xuICBjbGFtcCwgbGVycCwgaGFzaDJpLCBoYXNoM2ksIG11bGJlcnJ5MzIsIGZibTIsXG59IGZyb20gJy4vbm9pc2UnO1xuaW1wb3J0IHtcbiAgY2xhbXAsIGxlcnAsIHNtb290aHN0ZXAsIGhhc2gyaSwgaGFzaDNpLCBtdWxiZXJyeTMyLCB2YWx1ZU5vaXNlMywgZmJtMiwgZmJtMyxcbn0gZnJvbSAnLi9ub2lzZSc7XG5cbi8vIC0tLS0tLS0tLS0gd29ybGQgdHlwZXMgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFBhcmFtcyB7XG4gIHNpemU6IG51bWJlcjtcbiAgY2h1bmtTaXplOiBudW1iZXI7XG4gIHlNaW46IG51bWJlcjtcbiAgeU1heDogbnVtYmVyO1xuICBzZWFMZXZlbDogbnVtYmVyO1xuICBnZW5lcmF0b3JWZXJzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1BBUkFNUzogV29ybGRQYXJhbXMgPSB7XG4gIHNpemU6IFdPUkxEX1NJWkUsXG4gIGNodW5rU2l6ZTogQ0hVTktfU0laRSxcbiAgeU1pbjogWV9NSU4sXG4gIHlNYXg6IFlfTUFYLFxuICBzZWFMZXZlbDogU0VBX0xFVkVMLFxuICBnZW5lcmF0b3JWZXJzaW9uOiBHRU5FUkFUT1JfVkVSU0lPTixcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxDaHVuayB7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIGtleTogc3RyaW5nO1xuICAvKiogeCArIHoqMzIgKyAoeS1ZX01JTikqMTAyNCAqL1xuICBkYXRhOiBVaW50OEFycmF5O1xuICAvKiogdG9wIHNvbGlkIHksIGVuY29kZWQgYXMgKHkgLSBZX01JTiksIDAuLjEyNzsgMCBtZWFucyBubyBzb2xpZC4gKi9cbiAgaGVpZ2h0czogVWludDhBcnJheTtcbiAgLyoqIHRvcCBtYXRlcmlhbCBwZXIgY29sdW1uLiAqL1xuICB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7XG4gIG5vbkFpcjogbnVtYmVyO1xuICBkaXJ0eTogYm9vbGVhbjtcbiAgZ2VuZXJhdGVkQXQ6IG51bWJlcjtcbn1cblxuLy8gTmF0dXJhbCBhc3NldHMgYXJlIHRoZSBwcm9qZWN0J3MgU3R5bCAoYG5hdF9gKSBwaXBlbGluZSAoQVMtMDAxIHYyKSwgbm90XG4vLyBOb3hlbCBhcmNoaXRlY3R1cmUuIE5veGVsIHJlbWFpbnMgdGhlIGh1bWFuLW1hZGUga2l0L3dheXN0b25lL21hcmtlciBzeXN0ZW0uXG4vLyBSZXRpcmVkIG9ubHkgYXMgd29ybGQgY29udGVudC4gVGhlIG5hbWVzIHJlbWFpbiBpbiB0aGUgc2VyaWFsaXplZCB0eXBlIHNvXG4vLyBvbGQgc25hcHNob3RzIGFuZCBhY2NlcHRlZCBoYXJ2ZXN0IGpvdXJuYWxzIGNhbiBiZSBtaWdyYXRlZCB3aXRob3V0IHJlamVjdGluZ1xuLy8gb3RoZXJ3aXNlIHZhbGlkIHNhdmVzLiBHZW5lcmF0aW9uLCBjb2xsaXNpb24gYW5kIGluc3BlY3Rpb24gbmV2ZXIgdXNlIHRoZW0uXG5leHBvcnQgY29uc3QgUkVUSVJFRF9TVE9ORV9LSU5EUyA9IG5ldyBTZXQ8RW50aXR5S2luZD4oW1xuICAnc3R5bF9yb2NrX3NtYWxsJywgJ3N0eWxfcm9ja19tZWRpdW0nLCAnc3R5bF9yb2NrX2xhcmdlJyxcbl0pO1xuZXhwb3J0IGNvbnN0IGlzUmV0aXJlZFN0b25lS2luZCA9IChraW5kOiBFbnRpdHlLaW5kKTogYm9vbGVhbiA9PiBSRVRJUkVEX1NUT05FX0tJTkRTLmhhcyhraW5kKTtcbmV4cG9ydCB0eXBlIEFjdGl2ZUVudGl0eUtpbmQgPSBFeGNsdWRlPEVudGl0eUtpbmQsXG4gICdzdHlsX3JvY2tfc21hbGwnIHwgJ3N0eWxfcm9ja19tZWRpdW0nIHwgJ3N0eWxfcm9ja19sYXJnZSc+O1xuXG5mdW5jdGlvbiBsaXZlRW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IEVudGl0eSB8IG51bGwge1xuICBjb25zdCBlbnRpdHkgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICByZXR1cm4gIWVudGl0eSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpXG4gICAgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGlkKSA/IG51bGwgOiBlbnRpdHk7XG59XG5cbmV4cG9ydCB0eXBlIEVudGl0eUtpbmQgPVxuICB8ICdzdHlsX3RyZWVfc3BpcmUnXG4gIHwgJ3N0eWxfdHJlZV90YWJsZSdcbiAgfCAnc3R5bF90cmVlX2NsdXN0ZXInXG4gIHwgJ3N0eWxfdHJlZV9ibG9zc29tJ1xuICB8ICdzdHlsX3NocnViJ1xuICB8ICdzdHlsX3JvY2tfc21hbGwnXG4gIHwgJ3N0eWxfcm9ja19tZWRpdW0nXG4gIHwgJ3N0eWxfcm9ja19sYXJnZSdcbiAgfCAnc3R5bF9vcmUnXG4gIHwgJ3N0eWxfY2Fpcm4nXG4gIHwgJ3dheXN0b25lJ1xuICB8ICdtYXJrZXInO1xuXG5leHBvcnQgdHlwZSBSZXNvdXJjZVR5cGUgPSAnd29vZCcgfCAnc3RvbmUnIHwgJ29yZScgfCAnZmliZXInO1xuXG5leHBvcnQgaW50ZXJmYWNlIEVudGl0eSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6IEVudGl0eUtpbmQ7XG4gIGNodW5rOiBzdHJpbmc7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBzY2FsZTogbnVtYmVyO1xuICB2YXJpYW50OiBudW1iZXI7XG4gIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsO1xuICByZW1haW5pbmc6IG51bWJlcjtcbiAgeWllbGRQZXJIYXJ2ZXN0OiBudW1iZXI7XG4gIC8qKiBUcnVlIG9uY2UgdGhlIGVudGl0eSBpcyBmdWxseSBkZXBsZXRlZC4gKi9cbiAgaGFydmVzdGVkOiBib29sZWFuO1xuICAvKiogVHJ1ZSBhZnRlciB0aGUgZmlyc3Qgc3VjY2Vzc2Z1bCBoYXJ2ZXN0LCBldmVuIGlmIHlpZWxkIHJlbWFpbnMuICovXG4gIGhhcnZlc3RlZE9uY2U/OiBib29sZWFuO1xuICBwcm92aXNpb25hbDogYm9vbGVhbjtcbiAgYXV0aG9yZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm94ZWxTaXRlIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogJ3dheXN0b25lJyB8ICdtYXJrZXInO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgcHJvdmlzaW9uYWw6IHRydWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVnaW9uSW5mbyB7XG4gIGlkOiBzdHJpbmc7XG4gIGxhYmVsOiBzdHJpbmc7XG4gIHR5cGU6ICdwbGFpbicgfCAnZm9yZXN0JyB8ICdoaWxscycgfCAnaGlnaGxhbmQnIHwgJ3dhdGVyJyB8ICdyaWRnZSc7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIHJ4OiBudW1iZXI7XG4gIHJ6OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRTdGF0cyB7XG4gIGNodW5rc0dlbmVyYXRlZDogbnVtYmVyO1xuICBjaHVua3NFdmljdGVkOiBudW1iZXI7XG4gIHZveGVsc0ZpbGxlZDogbnVtYmVyO1xuICBnZW5lcmF0aW9uTXM6IG51bWJlcjtcbiAgZW50aXRpZXM6IG51bWJlcjtcbiAgdHJlZXM6IG51bWJlcjtcbiAgcGlua1RyZWVzOiBudW1iZXI7XG4gIHBpbmtPdmVyZmxvdzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkIHtcbiAgc2VlZDogbnVtYmVyO1xuICBwYXJhbXM6IFdvcmxkUGFyYW1zO1xuICBjaHVua3M6IE1hcDxzdHJpbmcsIFZveGVsQ2h1bms+O1xuICBlbnRpdGllczogTWFwPHN0cmluZywgRW50aXR5PjtcbiAgZW50aXR5Q2h1bmtzOiBNYXA8c3RyaW5nLCBzdHJpbmdbXT47XG4gIC8qKiBDaHVua3Mgd2hvc2UgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsLWVudGl0eSBzdGF0ZSBoYXMgYmVlbiBjaGFuZ2VkLiAqL1xuICBlbnRpdHlDaGFuZ2VzOiBTZXQ8c3RyaW5nPjtcbiAgLyoqIFRvbWJzdG9uZXMgZm9yIHJlbW92ZWQgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsIGVudGl0aWVzLiAqL1xuICBlbnRpdHlSZW1vdmFsczogU2V0PHN0cmluZz47XG4gIC8qKiBBdXRob3JpdGF0aXZlIGJ1aWx0IHN0cnVjdHVyZXMgKGhvdXNlLCBwYXRoLCB0ZXJyYWNlcywgY3JvcHMpLiAqL1xuICBzdHJ1Y3R1cmVzOiBNYXA8c3RyaW5nLCBTdHJ1Y3R1cmU+O1xuICBzaXRlczogTm94ZWxTaXRlW107XG4gIHJlZ2lvbnM6IFJlZ2lvbkluZm9bXTtcbiAgLyoqIGNodW5rIGtleSAtPiBsb2NhbCB2b3hlbCBpbmRleCAtPiBtYXRlcmlhbC4gRHVyYWJsZSwgY29tcGFjdCBlZGl0cy4gKi9cbiAgZWRpdHM6IE1hcDxzdHJpbmcsIE1hcDxudW1iZXIsIG51bWJlcj4+O1xuICAvKiogR2xvYmFsIGxvY2FsLXBsYXllciBjYXJyaWVkIGJhZzsgYm91bmRlZCBpbiBzY2hlbWEgMywgbGVnYWN5IGluIDEvMi4gKi9cbiAgaW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICAvKiogUHJlc2VudCBvbmx5IGFmdGVyIHNjaGVtYS0zIGdlbmVzaXMvcmVzdG9yYXRpb24uICovXG4gIGxpZmU/OiBMaWZlU3RhdGU7XG4gIGRpcnR5OiBTZXQ8c3RyaW5nPjtcbiAgc3RhdHM6IFdvcmxkU3RhdHM7XG4gIGF1dGhvcmVkUGxhY2VkOiBib29sZWFuO1xuICAvKipcbiAgICogTW9ub3RvbmljIHJldmlzaW9uIG9mIGF1dGhvcml0YXRpdmUgc3RhdGUgKHZveGVscyBhbmQgZW50aXRpZXMpLiBEZXJpdmVkXG4gICAqIGNhY2hlcyBrZXllZCBvbiB0aGlzIHZhbHVlIGFyZSBkaXNjYXJkZWQgYWZ0ZXIgYW4gZWRpdDsgbWVzaC9uYXZpZ2F0aW9uXG4gICAqIHJldmlzaW9ucyBhcmUgc2VwYXJhdGUgYmVjYXVzZSB0aGV5IGFyZSBkZXJpdmVkLCBub3Qgd29ybGQgc3RhdGUuXG4gICAqL1xuICByZXZpc2lvbjogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgY2h1bmtLZXkgPSAoY3g6IG51bWJlciwgY3o6IG51bWJlcikgPT4gYCR7Y3h9LCR7Y3p9YDtcbmV4cG9ydCBjb25zdCBjaHVua09yaWdpblggPSAoY3g6IG51bWJlcikgPT4gY3ggKiBDSFVOS19TSVpFIC0gSEFMRjtcbmV4cG9ydCBjb25zdCBjaHVua09yaWdpblogPSAoY3o6IG51bWJlcikgPT4gY3ogKiBDSFVOS19TSVpFIC0gSEFMRjtcbmV4cG9ydCBjb25zdCBsb2NhbEluZGV4ID0gKGx4OiBudW1iZXIsIHlJbmRleDogbnVtYmVyLCBsejogbnVtYmVyKSA9PlxuICBseCArIGx6ICogQ0hVTktfU0laRSArIHlJbmRleCAqIENIVU5LX0FSRUE7XG5leHBvcnQgY29uc3Qgd29ybGRUb0NodW5rWCA9ICh4OiBudW1iZXIpID0+IE1hdGguZmxvb3IoKHggKyBIQUxGKSAvIENIVU5LX1NJWkUpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9DaHVua1ogPSAoejogbnVtYmVyKSA9PiBNYXRoLmZsb29yKCh6ICsgSEFMRikgLyBDSFVOS19TSVpFKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvTG9jYWxYID0gKHg6IG51bWJlcikgPT4geCAtICh3b3JsZFRvQ2h1bmtYKHgpICogQ0hVTktfU0laRSAtIEhBTEYpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9Mb2NhbFogPSAoejogbnVtYmVyKSA9PiB6IC0gKHdvcmxkVG9DaHVua1ooeikgKiBDSFVOS19TSVpFIC0gSEFMRik7XG5leHBvcnQgY29uc3QgeVRvSW5kZXggPSAoeTogbnVtYmVyKSA9PiB5IC0gWV9NSU47XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVXb3JsZChzZWVkID0gMTMzNywgZ2VuZXJhdG9yVmVyc2lvbiA9IEdFTkVSQVRPUl9WRVJTSU9OKTogV29ybGQge1xuICBpZiAoIWlzU3VwcG9ydGVkR2VuZXJhdG9yKGdlbmVyYXRvclZlcnNpb24pKSB0aHJvdyBuZXcgRXJyb3IoYHVuc3VwcG9ydGVkIGdlbmVyYXRvciB2ZXJzaW9uICR7Z2VuZXJhdG9yVmVyc2lvbn1gKTtcbiAgcmV0dXJuIHtcbiAgICBzZWVkLFxuICAgIHBhcmFtczogeyAuLi5ERUZBVUxUX1BBUkFNUywgZ2VuZXJhdG9yVmVyc2lvbiB9LFxuICAgIGNodW5rczogbmV3IE1hcCgpLFxuICAgIGVudGl0aWVzOiBuZXcgTWFwKCksXG4gICAgZW50aXR5Q2h1bmtzOiBuZXcgTWFwKCksXG4gICAgZW50aXR5Q2hhbmdlczogbmV3IFNldCgpLFxuICAgIGVudGl0eVJlbW92YWxzOiBuZXcgU2V0KCksXG4gICAgc3RydWN0dXJlczogbmV3IE1hcCgpLFxuICAgIHNpdGVzOiBbXSxcbiAgICByZWdpb25zOiBSRUdJT05TLFxuICAgIGVkaXRzOiBuZXcgTWFwKCksXG4gICAgaW52ZW50b3J5OiB7fSxcbiAgICBkaXJ0eTogbmV3IFNldCgpLFxuICAgIHN0YXRzOiB7XG4gICAgICBjaHVua3NHZW5lcmF0ZWQ6IDAsIGNodW5rc0V2aWN0ZWQ6IDAsIHZveGVsc0ZpbGxlZDogMCwgZ2VuZXJhdGlvbk1zOiAwLFxuICAgICAgZW50aXRpZXM6IDAsIHRyZWVzOiAwLCBwaW5rVHJlZXM6IDAsIHBpbmtPdmVyZmxvdzogMCxcbiAgICB9LFxuICAgIGF1dGhvcmVkUGxhY2VkOiBmYWxzZSxcbiAgICByZXZpc2lvbjogMCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlV29ybGQoc2VlZCA9IDEzMzcsIGluaXRpYWxSYWRpdXMgPSAwLCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04pOiBXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoc2VlZCwgZ2VuZXJhdG9yVmVyc2lvbik7XG4gIGNvbnN0IGNlbnRyZSA9IE1hdGguZmxvb3IoQ0hVTktTX1BFUl9TSURFIC8gMik7XG4gIGZvciAobGV0IGN6ID0gY2VudHJlIC0gaW5pdGlhbFJhZGl1czsgY3ogPD0gY2VudHJlICsgaW5pdGlhbFJhZGl1czsgY3orKykge1xuICAgIGZvciAobGV0IGN4ID0gY2VudHJlIC0gaW5pdGlhbFJhZGl1czsgY3ggPD0gY2VudHJlICsgaW5pdGlhbFJhZGl1czsgY3grKykge1xuICAgICAgZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgICB9XG4gIH1cbiAgcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkKTtcbiAgcmV0dXJuIHdvcmxkO1xufVxuXG4vLyAtLS0tLS0tLS0tIGdlb2dyYXBoeSAtLS0tLS0tLS0tXG5leHBvcnQgY29uc3QgUkVHSU9OUzogUmVnaW9uSW5mb1tdID0gW1xuICB7IGlkOiAnZm91bmRlcicsIGxhYmVsOiAnRm91bmRlciB2YWxsZXknLCB0eXBlOiAncGxhaW4nLCBjeDogMCwgY3o6IDAsIHJ4OiAxMTAsIHJ6OiA4NSB9LFxuICB7IGlkOiAnZWFzdHdvb2QnLCBsYWJlbDogJ0Vhc3R3b29kJywgdHlwZTogJ2ZvcmVzdCcsIGN4OiAyMjAsIGN6OiAtMTEwLCByeDogMjYwLCByejogMjIwIH0sXG4gIHsgaWQ6ICdjcm93bicsIGxhYmVsOiAnQ3Jvd24gaGlnaGxhbmRzJywgdHlwZTogJ2hpZ2hsYW5kJywgY3g6IC0zNjAsIGN6OiAtMzAwLCByeDogMzgwLCByejogMzAwIH0sXG4gIHsgaWQ6ICdsYWtlJywgbGFiZWw6ICdNaXJyb3IgbGFrZScsIHR5cGU6ICd3YXRlcicsIGN4OiAtMjYwLCBjejogLTIzMCwgcng6IDEyMCwgcno6IDk1IH0sXG4gIHsgaWQ6ICdzb3V0aGRvd25zJywgbGFiZWw6ICdTb3V0aCBkb3ducycsIHR5cGU6ICdoaWxscycsIGN4OiAxMjAsIGN6OiAzMzAsIHJ4OiAyNjAsIHJ6OiAxOTAgfSxcbiAgeyBpZDogJ3dlc3RyaXNlJywgbGFiZWw6ICdXZXN0IHJpc2UnLCB0eXBlOiAnaGlsbHMnLCBjeDogLTM2MCwgY3o6IDEyMCwgcng6IDIyMCwgcno6IDIxMCB9LFxuICB7IGlkOiAnY29hc3QnLCBsYWJlbDogJ0Jyb2tlbiBjb2FzdCcsIHR5cGU6ICdyaWRnZScsIGN4OiAwLCBjejogMCwgcng6IDc4MCwgcno6IDY2MCB9LFxuXTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJpdmVyQ2VudGVyWCh6OiBudW1iZXIpOiBudW1iZXIge1xuICAvLyBUaGUgcml2ZXIgcnVucyBub3J0aFx1MjAxM3NvdXRoIGFib3V0IDcwXHUyMDEzMTEwIG0gd2VzdCBvZiB0aGUgZm91bmRlciBzaGVsZiwgc29cbiAgLy8gdGhlIGRlZmF1bHQgbm9ydGgtd2VzdCB2aWV3IGhhcyB3YXRlciwgYSBuZWFyIGJhbmsgYW5kIGEgZmFyIGJhbmsuXG4gIHJldHVybiAtOTAgKyA1NSAqIE1hdGguc2luKCh6ICsgMTAwKSAvIDI0MCkgKyAxOCAqIE1hdGguc2luKCh6IC0gMjApIC8gODApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJEaXN0YW5jZSh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLmFicyh4IC0gcml2ZXJDZW50ZXJYKHopKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxha2VEaXN0YW5jZSh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLnNxcnQoKCh4ICsgMjYwKSAvIDEyMCkgKiogMiArICgoeiArIDIzMCkgLyA5NSkgKiogMik7XG59XG5cbi8qKlxuICogSW50ZWdlciB0b3Agc29saWQgeSBvZiB0aGUgYmFzZSBnZW5lcmF0ZWQgc3VyZmFjZSAobm8gZWRpdHMvb3ZlcmhhbmdzKS5cbiAqXG4gKiBUaGlzIGlzIHRoZSAqc2hhcGUqIHRoZSB2b3hlbCB2b2x1bWUgaXMgZmlsbGVkIGZyb20sIG5vdCB0aGUgc3RvcmVkIHdvcmxkLlxuICogVGhlIGltcG9ydGFudCBjb3JyZWN0aW9uIG92ZXIgdGhlIGZpcnN0IE0wMDEgcGFzcyBpcyB0aGF0IHRoZSBsYW5kc2NhcGUgaXNcbiAqIG5vdCBvbmUgc21vb3RoIHJhZGlhbCBib3dsOiBpdCBpcyBhIHdhcnBlZCBtdWx0aS1zY2FsZSBzdXJmYWNlIHdpdGggYSBicm9hZFxuICogcml2ZXIgdmFsbGV5LCBhIHNtYWxsIGJ1aWxkYWJsZSBzaGVsZiwgYW5kIHJpZGdlZCBoaWdobGFuZHMuIEEgc2hhbGxvd1xuICogc21vb3RoIHN1cmZhY2UgcXVhbnRpc2VkIHRvIDEgbSB2b3hlbHMgaXMgd2hhdCBwcm9kdWNlZCB0aGUgY29uY2VudHJpY1xuICogY29udG91ciByaW5nczsgdmFyaWVkIHJlbGllZiBhbmQgYSByaXZlciB2YWxsZXkgYnJlYWsgdGhlbSBuYXR1cmFsbHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdXJmYWNlSGVpZ2h0QXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFR3by1zY2FsZSBkb21haW4gd2FycC4gVGhlIGJyb2FkIHdhcnAgbW92ZXMgY29hc3RsaW5lcyBhbmQgaGlsbHM7IHRoZVxuICAvLyBzbWFsbCB3YXJwIGtlZXBzIHRoZSAxIG0gcXVhbnRpc2F0aW9uIGZyb20gZm9sbG93aW5nIGNsZWFuIGNvbnRvdXJzLlxuICBjb25zdCB3eCA9IHhcbiAgICArIChmYm0yKHggLyA0MjAsIHogLyA0MjAsIHNlZWQgKyAxMDEsIDMpIC0gMC41KSAqIDI0MFxuICAgICsgKGZibTIoeCAvIDk1LCB6IC8gOTUsIHNlZWQgKyAxMDIsIDIpIC0gMC41KSAqIDMwO1xuICBjb25zdCB3eiA9IHpcbiAgICArIChmYm0yKHggLyA0MjAgKyA3LjMsIHogLyA0MjAgLSAzLjEsIHNlZWQgKyAxMDMsIDMpIC0gMC41KSAqIDI0MFxuICAgICsgKGZibTIoeCAvIDk1ICsgMy43LCB6IC8gOTUgLSA4LjEsIHNlZWQgKyAxMDQsIDIpIC0gMC41KSAqIDMwO1xuXG4gIGNvbnN0IHJhZGlhbCA9IE1hdGguc3FydCgod3ggLyA3ODApICoqIDIgKyAod3ogLyA2NjApICoqIDIpO1xuICBjb25zdCBjb2FzdE5vaXNlID0gKGZibTIod3ggLyAzMDAsIHd6IC8gMzAwLCBzZWVkICsgMTA1LCA0KSAtIDAuNSkgKiAwLjM0XG4gICAgKyAoZmJtMih3eCAvIDk1LCB3eiAvIDk1LCBzZWVkICsgMTA2LCAyKSAtIDAuNSkgKiAwLjEwO1xuICBjb25zdCBsYW5kbmVzcyA9IDEuMCAtIHJhZGlhbCArIGNvYXN0Tm9pc2U7XG4gIGNvbnN0IGlubGFuZCA9IHNtb290aHN0ZXAoLTAuMDMsIDAuMTIsIGxhbmRuZXNzKTtcblxuICBjb25zdCBvY2VhbkZsb29yID0gLTEzICsgNiAqIGZibTIod3ggLyAxNzAsIHd6IC8gMTcwLCBzZWVkICsgMTA3LCAzKTtcblxuICAvLyBSb2xsaW5nIGxhbmQgYXQgdGhyZWUgc2NhbGVzLiBUaGUgNDAgbSBhbmQgMTUgbSBjb21wb25lbnRzIGFyZSByZWFsXG4gIC8vIHN1cmZhY2UgaGVpZ2h0LCBub3QgYSByZW5kZXIgZGVjb3JhdGlvbiwgc28gdGhlIG1hY3JvIHNhbXBsZXIgYWdyZWVzLlxuICBjb25zdCBzd2VsbCA9IDQgKyAxMSAqIGZibTIod3ggLyAzNDAsIHd6IC8gMzQwLCBzZWVkICsgMTA4LCA0KTtcbiAgY29uc3QgaGlsbHMgPSA4ICogZmJtMih3eCAvIDExNSwgd3ogLyAxMTUsIHNlZWQgKyAxMDksIDMpO1xuICBjb25zdCBidW1wcyA9IDIuMiAqIGZibTIoeCAvIDQyLCB6IC8gNDIsIHNlZWQgKyAxMTAsIDIpXG4gICAgKyAwLjkgKiBmYm0yKHggLyAxNSwgeiAvIDE1LCBzZWVkICsgMTExLCAyKTtcblxuICAvLyBSaWRnZWQgaGlnaGxhbmRzLiBUaGUgbWFzc2lmIG1hc2sgaXMgcmVnaW9uYWwgYW5kIGJpYXNlZCB0byB0aGVcbiAgLy8gbm9ydGgtd2VzdDsgd2l0aG91dCB0aGUgcmVnaW9uYWwgZ2F0ZSB0aGUgZmlyc3QgTTAwMSBwYXNzIHJhaXNlZCBhIDQ4IG1cbiAgLy8gbW91bnRhaW4gZGlyZWN0bHkgdW5kZXIgdGhlIGZvdW5kZXIgc2hlbGYuXG4gIGNvbnN0IG1hc3NpZk5vaXNlID0gZmJtMih3eCAvIDQ4MCArIDExLCB3eiAvIDQ4MCAtIDcsIHNlZWQgKyAxMTIsIDQpO1xuICBjb25zdCBtYXNzaWZNYXNrID0gc21vb3Roc3RlcCgwLjYwLCAwLjc4LCBtYXNzaWZOb2lzZSk7XG4gIGNvbnN0IHJpZGdlID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMjMwLCB3eiAvIDIzMCwgc2VlZCArIDExMywgNCkgLSAxKTtcbiAgY29uc3QgcmlkZ2UyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTQsIDMpIC0gMSk7XG4gIGNvbnN0IG53QmlhcyA9IE1hdGguZXhwKC0oKCh3eCArIDM2MCkgLyAzODApICoqIDIgKyAoKHd6ICsgMzAwKSAvIDMyMCkgKiogMikpO1xuICBjb25zdCBtb3VudCA9IE1hdGgubWluKDEsIG1hc3NpZk1hc2sgKiAoMC4zMCArIDAuNzAgKiBud0JpYXMpICsgMC4yMiAqIG53Qmlhcyk7XG5cbiAgbGV0IGggPSBzd2VsbCArIGhpbGxzICsgYnVtcHNcbiAgICArIG1vdW50ICogKDIwICsgNDAgKiByaWRnZSAqIHJpZGdlICsgMTIgKiByaWRnZTIpO1xuXG4gIC8vIFNwdXJzIGFuZCBndWxsaWVzIGF0IDMwXHUyMDEzOTAgbS4gV2l0aG91dCB0aGVzZSwgYSBzbW9vdGggaGlsbCBxdWFudGlzZWQgdG9cbiAgLy8gMSBtIHZveGVscyByZWFkcyBhcyBjb25jZW50cmljIGNvbnRvdXIgcmluZ3M7IHdpdGggdGhlbSwgdGhlIHNhbWUgaGlsbFxuICAvLyBicmVha3MgaW50byByaWRnZXMsIHNpZGUgdmFsbGV5cyBhbmQgcm9jayBmYWNlcy5cbiAgY29uc3Qgc3B1ciA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDg1LCB3eiAvIDg1LCBzZWVkICsgMTIwLCAzKSAtIDEpO1xuICBjb25zdCBndWxseSA9IE1hdGgucG93KDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDUyICsgMTMsIHd6IC8gNTIgLSA1LCBzZWVkICsgMTIxLCAzKSAtIDEpLCAyKTtcbiAgaCArPSAoc3B1ciAtIDAuNTUpICogNS4wIC0gZ3VsbHkgKiAzLjI7XG5cbiAgaCA9IG9jZWFuRmxvb3IgKyAoaCAtIG9jZWFuRmxvb3IpICogaW5sYW5kO1xuICBoICs9IDEuNiAqIHNtb290aHN0ZXAoMC4wLCAwLjEwLCBsYW5kbmVzcyk7XG5cbiAgLy8gQnJvYWQgcml2ZXIgdmFsbGV5LCB0aGVuIHRoZSBjaGFubmVsIGl0c2VsZi4gVGhlIHZhbGxleSBtYXNrIGlzIGdhdGVkIGJ5XG4gIC8vIGxhbmRuZXNzOiB3aXRob3V0IHRoZSBnYXRlIGl0IHB1bGxlZCB0aGUgb2NlYW4gZmxvb3IgdXAgdG8gdGhlIHZhbGxleVxuICAvLyBmbG9vciBvdXRzaWRlIHRoZSBpc2xhbmQsIHdoaWNoIHRoZSBtYXAgdmlldyBzaG93ZWQgYXMgcGFsZSByaXZlci1zaGFwZWRcbiAgLy8gYmFycyBydW5uaW5nIHRvIHRoZSBob3Jpem9uLlxuICBjb25zdCByZCA9IHJpdmVyRGlzdGFuY2Uod3gsIHd6KTtcbiAgY29uc3QgdmFsbGV5ID0gc21vb3Roc3RlcCg5NSwgMTAsIHJkKSAqIHNtb290aHN0ZXAoMC4wLCAwLjEwLCBsYW5kbmVzcyk7XG4gIGNvbnN0IHZhbGxleUZsb29yID0gMi41ICsgMS4wICogZmJtMih3eCAvIDYwLCB3eiAvIDYwLCBzZWVkICsgMTE1LCAyKTtcbiAgaCA9IGxlcnAoaCwgdmFsbGV5Rmxvb3IsIHZhbGxleSAqIDAuNzUpO1xuICBjb25zdCByaXZlclcgPSA1LjAgKyAzLjAgKiBmYm0yKHd4IC8gNDUsIHd6IC8gNDUsIHNlZWQgKyAxMTYsIDIpO1xuICAvLyBBIHdpZGUsIHNoYWxsb3cgY2hhbm5lbCBwcm9maWxlLiBUaGUgZmlyc3QgcGFzcyBjYXJ2ZWQgYSAxMiBtIHNsb3Qgd2l0aFxuICAvLyBuZWFyLXZlcnRpY2FsIGJhbmtzLCB3aGljaCByZWFkIGFzIGEgYnJpZ2h0IHN0b25lIHF1YXJyeSByYXRoZXIgdGhhbiBhXG4gIC8vIHJpdmVyLiBUaGUgb3V0ZXIgZWRnZSBpcyBub3cgfjI1IG0gZnJvbSB0aGUgY2VudHJlbGluZSwgYW5kIHRoZSBiZWQgaXNcbiAgLy8gb25seSAyIG0gYmVsb3cgc2VhIGxldmVsLlxuICBjb25zdCBjaGFubmVsID0gc21vb3Roc3RlcChyaXZlclcgKyAxOCwgcml2ZXJXICogMC40LCByZCk7XG4gIGlmIChsYW5kbmVzcyA+IDAuMCkgaCA9IGxlcnAoaCwgLTIuMCwgY2hhbm5lbCAqIDAuOTUpO1xuXG4gIC8vIExha2UgYmFzaW4gYXQgdGhlIGZvb3Qgb2YgdGhlIG5vcnRoLXdlc3QgaGlnaGxhbmRzLlxuICBjb25zdCBsYWtlRCA9IGxha2VEaXN0YW5jZSh3eCwgd3opXG4gICAgKiAoMSArIDAuMTggKiAoZmJtMih3eCAvIDkwLCB3eiAvIDkwLCBzZWVkICsgMTE3LCAyKSAtIDAuNSkgKiAyKTtcbiAgaWYgKGxha2VEIDwgMS4xNSkge1xuICAgIGNvbnN0IGxha2VNYXNrID0gc21vb3Roc3RlcCgxLjE1LCAwLjU1LCBsYWtlRCk7XG4gICAgaCA9IGxlcnAoaCwgLTYuNSwgbGFrZU1hc2sgKiAwLjk1KTtcbiAgfVxuXG4gIC8vIEZvdW5kZXIgc2hlbGY6IGEgc21hbGwsIGlycmVndWxhciBidWlsZGFibGUgdGVycmFjZSBvbiB0aGUgZWFzdCBiYW5rLlxuICAvLyBEZWxpYmVyYXRlbHkgbm90IGEgMjYwIG0gcmFkaWFsIGZsYXR0ZW47IHRoZSBwcmV2aW91cyBwYXNzIHNob3dlZCB0aGF0IGFcbiAgLy8gbGFyZ2UgZmxhdHRlbi10by1jb25zdGFudCBiZWNvbWVzIGEgdmlzaWJsZSBib3dsIG9mIGNvbnRvdXIgcmluZ3MuXG4gIGNvbnN0IHNoZWxmRCA9IE1hdGguc3FydCgoKHggKyA4KSAvIDYyKSAqKiAyICsgKCh6IC0gNCkgLyA0OCkgKiogMilcbiAgICArIChmYm0yKHggLyA0NSwgeiAvIDQ1LCBzZWVkICsgMTE4LCAyKSAtIDAuNSkgKiAwLjU1O1xuICBjb25zdCBzaGVsZiA9IHNtb290aHN0ZXAoMS4wNSwgMC41NSwgc2hlbGZEKTtcbiAgaWYgKHNoZWxmID4gMCkge1xuICAgIGNvbnN0IHRhcmdldCA9IDEzLjAgKyAxLjIgKiBmYm0yKHggLyAzNiwgeiAvIDM2LCBzZWVkICsgMTE5LCAyKSArIHggKiAwLjAxO1xuICAgIGggPSBsZXJwKGgsIHRhcmdldCwgc2hlbGYgKiAwLjc4KTtcbiAgfVxuXG4gIHJldHVybiBNYXRoLnJvdW5kKGNsYW1wKGgsIC0xNCwgOTIpKTtcbn1cblxuZnVuY3Rpb24gc2xvcGVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5tYXgoXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4IC0gMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCArIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogLSAxKSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6ICsgMSkpLFxuICApO1xufVxuXG5mdW5jdGlvbiB0b3BNYXRlcmlhbEF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyPzogYm9vbGVhbik6IE1hdElkIHtcbiAgLy8gUml2ZXIgYmVkIGlzIGdyYXZlbDsgdGhlIGJlYWNoIGlzIGEgbmFycm93IHNhbmQgYmFuZCwgbm90IHRoZSB3aG9sZVxuICAvLyB2YWxsZXkgZmxvb3IuIFRoZSBmaXJzdCBwYXNzIG1hcmtlZCBldmVyeSBjZWxsIHdpdGhpbiA0IG0gb2Ygc2VhIGxldmVsXG4gIC8vIGFzIHNhbmQsIHdoaWNoIHByb2R1Y2VkIGEgY29uc3BpY3VvdXMgcGFsZSBzdHJpcCBhbG9uZyB0aGUgcml2ZXIuXG4gIGlmIChyaXZlckRpc3RhbmNlKHgsIHopIDwgMTIgJiYgaCA8IFNFQV9MRVZFTCArIDEpIHJldHVybiBNQVQuR1JBVkVMO1xuICBpZiAoaCA8PSBTRUFfTEVWRUwgKyAwLjUpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKG5lYXJXYXRlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgbmVhcldhdGVyID1cbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4IC0gMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCArIDMsIHopIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogLSAzKSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6ICsgMykgPCBTRUFfTEVWRUwgKyAxO1xuICB9XG4gIGlmIChuZWFyV2F0ZXIgJiYgaCA8PSBTRUFfTEVWRUwgKyAxLjUpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKHNsb3BlID49IDMpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNTggJiYgZmJtMih4IC8gMTgsIHogLyAxOCwgc2VlZCArIDEyMCwgMikgPiAwLjQ1KSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDQ4ICYmIHNsb3BlID49IDIpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDAgJiYgc2xvcGUgPj0gMiAmJiBmYm0yKHggLyAxMiwgeiAvIDEyLCBzZWVkICsgMTIxLCAyKSA+IDAuNTUpIHJldHVybiBNQVQuU1RPTkU7XG4gIHJldHVybiBNQVQuR1JBU1M7XG5cbn1cblxuLyoqIFB1YmxpYyBiYXNlLW1hdGVyaWFsIHNlbGVjdG9yIGZvciBtYWNybyBMT0QgYW5kIHRlc3RzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VUb3BNYXRlcmlhbChcbiAgc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI6IGJvb2xlYW4sXG4pOiBNYXRJZCB7XG4gIHJldHVybiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xufVxuXG5mdW5jdGlvbiBzdWJzb2lsRm9yKHRvcDogTWF0SWQpOiBNYXRJZCB7XG4gIGlmICh0b3AgPT09IE1BVC5HUkFTUyB8fCB0b3AgPT09IE1BVC5NT1NTKSByZXR1cm4gTUFULlNPSUw7XG4gIGlmICh0b3AgPT09IE1BVC5TTk9XKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAodG9wID09PSBNQVQuU0FORCkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAodG9wID09PSBNQVQuR1JBVkVMKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgcmV0dXJuIE1BVC5TVE9ORTtcbn1cblxuZnVuY3Rpb24gb3JlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGNvbnN0IGNsdXN0ZXIgPSBmYm0yKHggLyA1NSwgeiAvIDU1LCBzZWVkICsgMTMwLCAyKTtcbiAgaWYgKGNsdXN0ZXIgPCAwLjU3KSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IG4gPSB2YWx1ZU5vaXNlMyh4ICogMC4wOSwgeSAqIDAuMTMsIHogKiAwLjA5LCBzZWVkICsgMTMxKTtcbiAgY29uc3QgbjIgPSB2YWx1ZU5vaXNlMyh4ICogMC4yMiArIDUsIHkgKiAwLjMxLCB6ICogMC4yMiAtIDMsIHNlZWQgKyAxMzIpO1xuICByZXR1cm4gbiA+IDAuNzAgJiYgbjIgPiAwLjUwO1xufVxuXG5mdW5jdGlvbiBjYXZlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiBmYm0zKHggKiAwLjA3NSwgeSAqIDAuMTEsIHogKiAwLjA3NSwgc2VlZCArIDE0MCwgMikgPiAwLjcyO1xufVxuXG5mdW5jdGlvbiBvdmVyaGFuZ0F0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gdmFsdWVOb2lzZTMoeCAqIDAuMTgsIHkgKiAwLjIyLCB6ICogMC4xOCwgc2VlZCArIDE0MSkgPiAwLjYyO1xufVxuXG4vLyAtLS0tLS0tLS0tIHZlcnNpb25lZCBnZW5lcmF0b3IgZGlzcGF0Y2ggLS0tLS0tLS0tLVxuY29uc3QgdjJDYWNoZSA9IG5ldyBNYXA8bnVtYmVyLCBUZXJyYWluVjI+KCk7XG5jb25zdCBoeWRyb0NhY2hlID0gbmV3IE1hcDxzdHJpbmcsIEh5ZHJvbG9neT4oKTtcblxuLyoqIERldGVybWluaXN0aWMgaHlkcm9sb2d5IG5ldHdvcmsgZm9yIGEgc2VlZCBhbmQgZ2VuZXJhdG9yIHZlcnNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gaHlkcm9sb2d5Rm9yKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyKTogSHlkcm9sb2d5IHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSByZXR1cm4gdGVycmFpblYyKHNlZWQpLmh5ZHJvbG9neTtcbiAgY29uc3Qga2V5ID0gYCR7c2VlZH06JHt2ZXJzaW9ufWA7XG4gIGxldCBoeWRybyA9IGh5ZHJvQ2FjaGUuZ2V0KGtleSk7XG4gIGlmICghaHlkcm8pIHtcbiAgICBoeWRybyA9IG5ldyBIeWRyb2xvZ3koeyBzZWVkLCB2ZXJzaW9uLCB2MUhlaWdodDogKHgsIHopID0+IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KSB9KTtcbiAgICBoeWRyb0NhY2hlLnNldChrZXksIGh5ZHJvKTtcbiAgfVxuICByZXR1cm4gaHlkcm87XG59XG5cbi8qKiBAaW50ZXJuYWwgVGhlIHYyIGdlbmVyYXRvciBmb3IgYSBzZWVkIChjYWNoZWQ7IHB1cmUgZnVuY3Rpb24gb2YgdGhlIHNlZWQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRlcnJhaW5WMihzZWVkOiBudW1iZXIpOiBUZXJyYWluVjIge1xuICBsZXQgZ2VuID0gdjJDYWNoZS5nZXQoc2VlZCk7XG4gIGlmICghZ2VuKSB7XG4gICAgY29uc3QgaHlkcm9sb2d5ID0gbmV3IEh5ZHJvbG9neSh7IHNlZWQsIHZlcnNpb246IEdFTkVSQVRPUl9WMiwgdjFIZWlnaHQ6ICh4LCB6KSA9PiBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeikgfSk7XG4gICAgZ2VuID0gbmV3IFRlcnJhaW5WMihzZWVkLCBzdXJmYWNlSGVpZ2h0QXQsIGh5ZHJvbG9neSk7XG4gICAgdjJDYWNoZS5zZXQoc2VlZCwgZ2VuKTtcbiAgfVxuICByZXR1cm4gZ2VuO1xufVxuXG4vKiogQmFzZSBnZW5lcmF0ZWQgaGVpZ2h0ICh0b3Agc29saWQgKyAxKSBmb3IgYW55IHN1cHBvcnRlZCBnZW5lcmF0b3IgdmVyc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlSGVpZ2h0QXQoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHZlcnNpb24gPj0gR0VORVJBVE9SX1YyID8gdGVycmFpblYyKHNlZWQpLmhlaWdodCh4LCB6KSA6IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbn1cblxuLyoqIEJhc2UgZ2VuZXJhdGVkIHdhdGVyIHN1cmZhY2U6IHdhdGVyIGZpbGxzIGNlbGxzIFtoZWlnaHQsIGxldmVsKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlV2F0ZXJMZXZlbEF0KHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikgcmV0dXJuIHRlcnJhaW5WMihzZWVkKS5jb2x1bW4oeCwgeikubGV2ZWw7XG4gIGNvbnN0IGggPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG4gIHJldHVybiBoIDwgU0VBX0xFVkVMID8gU0VBX0xFVkVMIDogaDtcbn1cblxuZnVuY3Rpb24gdmVyc2lvbmVkU2xvcGUoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5tYXgoXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4IC0gMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCArIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHogLSAxKSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4LCB6ICsgMSkpLFxuICApO1xufVxuXG4vKiogQmFzZSB0b3AgbWF0ZXJpYWwgZm9yIGFueSBnZW5lcmF0b3IgdmVyc2lvbiAobWFjcm8gTE9ELCBlbnRpdHkgcGxhY2VtZW50KS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlVG9wTWF0ZXJpYWxGb3IoXG4gIHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI/OiBib29sZWFuLFxuKTogTWF0SWQge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHtcbiAgICBjb25zdCBnZW4gPSB0ZXJyYWluVjIoc2VlZCk7XG4gICAgcmV0dXJuIGdlbi50b3BNYXRlcmlhbCh4LCB6LCBnZW4uY29sdW1uKHgsIHopLCBzbG9wZSxcbiAgICAgIChoaCwgc3MpID0+IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaGgsIHNzLCBuZWFyV2F0ZXIpKTtcbiAgfVxuICByZXR1cm4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdXJmYWNlU2FtcGxlIHtcbiAgeTogbnVtYmVyO1xuICB0b3A6IE1hdElkO1xuICBzbG9wZTogbnVtYmVyO1xufVxuXG4vKiogQmFzZSBzdXJmYWNlIHNhbXBsZSBmb3IgbWFjcm8gTE9ELiBEb2VzIG5vdCBpbmNsdWRlIHZveGVsIGVkaXRzL292ZXJoYW5ncy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW1wbGVTdXJmYWNlKHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBTdXJmYWNlU2FtcGxlIHtcbiAgY29uc3QgeSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbiAgY29uc3Qgc2xvcGUgPSBzbG9wZUF0KHNlZWQsIHgsIHosIHkpO1xuICByZXR1cm4geyB5LCB0b3A6IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgeSwgc2xvcGUpLCBzbG9wZSB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIGNodW5rIGdlbmVyYXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgcmV0dXJuIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChjaHVua0tleShjeCwgY3opKTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IGJhc2UgPSBnZW5lcmF0ZUJhc2VDaHVuayh3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiwgY3gsIGN6KTtcbiAgcmV0dXJuIGluc3RhbGxCYXNlQ2h1bmsod29ybGQsIGJhc2UsIHBlcmZvcm1hbmNlLm5vdygpIC0gdDApO1xufVxuXG4vKipcbiAqIEJhc2UgZ2VuZXJhdGVkIGNvbnRlbnRzIG9mIGEgY2h1bmsgYmVmb3JlIGR1cmFibGUgZWRpdHMuIEEgcHVyZSBmdW5jdGlvbiBvZlxuICogKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uLCBjeCwgY3opOiBzYWZlIHRvIGNvbXB1dGUgaW4gYSBXZWIgV29ya2VyLCBhbmQgdGhlXG4gKiBieXRlcyBhcmUgaWRlbnRpY2FsIHdoZXJldmVyIGl0IHJ1bnMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQmFzZUNodW5rIHtcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAgc2VlZDogbnVtYmVyO1xuICB2ZXJzaW9uOiBudW1iZXI7XG4gIGRhdGE6IFVpbnQ4QXJyYXk7XG4gIGhlaWdodHM6IFVpbnQ4QXJyYXk7XG4gIHRvcE1hdGVyaWFsczogVWludDhBcnJheTtcbiAgbm9uQWlyOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUJhc2VDaHVuayhzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IEJhc2VDaHVuayB7XG4gIGNvbnN0IGRhdGEgPSBuZXcgVWludDhBcnJheShDSFVOS19WT0xVTUUpO1xuICBjb25zdCBoZWlnaHRzID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSk7XG4gIGNvbnN0IHRvcE1hdGVyaWFscyA9IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjeCksIG96ID0gY2h1bmtPcmlnaW5aKGN6KTtcbiAgY29uc3QgdjIgPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMiA/IHRlcnJhaW5WMihzZWVkKSA6IG51bGw7XG5cbiAgLy8gUGFkZGVkIGhlaWdodCBjYWNoZTogYSB0aHJlZS1jZWxsIGJvcmRlciBjb3ZlcnMgc2xvcGUsIGJlYWNoIGFuZCBsZWRnZXMuXG4gIGNvbnN0IFAgPSAzO1xuICBjb25zdCBQVyA9IENIVU5LX1NJWkUgKyBQICogMjtcbiAgY29uc3QgYmFzZUggPSBuZXcgSW50MTZBcnJheShQVyAqIFBXKTtcbiAgY29uc3QgdjJDb2xzOiBWMkNvbHVtbltdIHwgbnVsbCA9IHYyID8gbmV3IEFycmF5KENIVU5LX0FSRUEpIDogbnVsbDtcbiAgZm9yIChsZXQgcHogPSAwOyBweiA8IFBXOyBweisrKSB7XG4gICAgZm9yIChsZXQgcHggPSAwOyBweCA8IFBXOyBweCsrKSB7XG4gICAgICBjb25zdCB3eCA9IG94ICsgcHggLSBQLCB3eiA9IG96ICsgcHogLSBQO1xuICAgICAgaWYgKHYyKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IHYyLmNvbHVtbih3eCwgd3opO1xuICAgICAgICBiYXNlSFtweiAqIFBXICsgcHhdID0gY29sLmg7XG4gICAgICAgIGNvbnN0IGx4ID0gcHggLSBQLCBseiA9IHB6IC0gUDtcbiAgICAgICAgaWYgKGx4ID49IDAgJiYgbHogPj0gMCAmJiBseCA8IENIVU5LX1NJWkUgJiYgbHogPCBDSFVOS19TSVpFKSB2MkNvbHMhW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNvbDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJhc2VIW3B6ICogUFcgKyBweF0gPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgd3gsIHd6KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBsZXQgbm9uQWlyID0gMDtcbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3Qgd3ggPSBveCArIGx4LCB3eiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBoID0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFApXTtcbiAgICAgIGNvbnN0IHNsb3BlID0gTWF0aC5tYXgoXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQIC0gMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQICsgMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICApO1xuICAgICAgY29uc3QgbmVhcldhdGVyID1cbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMyldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQIC0gMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCArIDMpICogUFcgKyAobHggKyBQKV0gPCBTRUFfTEVWRUwgKyAxO1xuICAgICAgY29uc3QgdjJDb2wgPSB2MkNvbHMgPyB2MkNvbHNbbHogKiBDSFVOS19TSVpFICsgbHhdIDogbnVsbDtcbiAgICAgIGNvbnN0IHRvcCA9IHYyICYmIHYyQ29sXG4gICAgICAgID8gdjIudG9wTWF0ZXJpYWwod3gsIHd6LCB2MkNvbCwgc2xvcGUsIChoaCwgc3MpID0+IHRvcE1hdGVyaWFsQXQoc2VlZCwgd3gsIHd6LCBoaCwgc3MsIG5lYXJXYXRlcikpXG4gICAgICAgIDogdG9wTWF0ZXJpYWxBdChzZWVkLCB3eCwgd3osIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xuICAgICAgY29uc3Qgc3ViID0gc3Vic29pbEZvcih0b3ApO1xuICAgICAgY29uc3Qgb3JlUG90ZW50aWFsID0gZmJtMih3eCAvIDU1LCB3eiAvIDU1LCBzZWVkICsgMTMwLCAyKSA+IDAuNTc7XG4gICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcblxuICAgICAgY29uc3Qgc3RhcnQgPSBZX01JTjtcbiAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWluKFlfTUFYIC0gMSwgaCAtIDEpO1xuICAgICAgZm9yIChsZXQgeSA9IHN0YXJ0OyB5IDw9IGVuZDsgeSsrKSB7XG4gICAgICAgIGNvbnN0IGRlcHRoID0gaCAtIDEgLSB5O1xuICAgICAgICBsZXQgbTogTWF0SWQ7XG4gICAgICAgIGlmICh5ID09PSBZX01JTikgbSA9IE1BVC5CRURST0NLO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA9PT0gMCkgbSA9IHRvcDtcbiAgICAgICAgZWxzZSBpZiAoZGVwdGggPD0gMikgbSA9IHN1YjtcbiAgICAgICAgZWxzZSBtID0gTUFULlNUT05FO1xuXG4gICAgICAgIGlmIChtID09PSBNQVQuU1RPTkUgJiYgZGVwdGggPiA0ICYmIG9yZVBvdGVudGlhbCAmJiBvcmVBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5PUkU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTcGFyc2UgM0Qgb3ZlcmhhbmdzL3VuZGVyY3V0cyBhdCBzdGVlcCBmYWNlcy4gVGhpcyBpcyBhIHJlYWxcbiAgICAgICAgLy8gb2NjdXBhbmN5IGNoYW5nZSwgbm90IGEgZGVjb3JhdGlvbiBvbiB0b3Agb2YgYSBoZWlnaHRmaWVsZC5cbiAgICAgICAgaWYgKGRlcHRoIDw9IDIgJiYgc2xvcGUgPj0gMiAmJiBvdmVyaGFuZ0F0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuICAgICAgICAvLyBEZWVwIGNhdmVzLCBrZXB0IGF3YXkgZnJvbSB0aGUgc3VyZmFjZSBzbyB0aGV5IGRvIG5vdCBjcmVhdGUgaG9sZXMuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSICYmIGRlcHRoID4gNyAmJiBkZXB0aCA8IDI0ICYmIGNhdmVBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5BSVI7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobSAhPT0gTUFULkFJUikge1xuICAgICAgICAgIGRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV0gPSBtO1xuICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFdhdGVyIHZvbHVtZTogZXZlcnl0aGluZyBhYm92ZSB0aGUgc29saWQgc3VyZmFjZSB1cCB0byB0aGUgY29sdW1uJ3NcbiAgICAgIC8vIHdhdGVyIGxldmVsIChzZWEgbGV2ZWwgaW4gdjE7IHRoZSBoeWRyb2xvZ2ljYWwgbGV2ZWwgaW4gdjIpLlxuICAgICAgY29uc3Qgd2F0ZXJMZXZlbCA9IHYyQ29sID8gTWF0aC5taW4oWV9NQVgsIHYyQ29sLmxldmVsKSA6IFNFQV9MRVZFTDtcbiAgICAgIGlmIChoIDwgd2F0ZXJMZXZlbCkge1xuICAgICAgICBmb3IgKGxldCB5ID0gTWF0aC5tYXgoWV9NSU4sIGgpOyB5IDwgd2F0ZXJMZXZlbDsgeSsrKSB7XG4gICAgICAgICAgY29uc3QgaWR4ID0gbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KTtcbiAgICAgICAgICBpZiAoZGF0YVtpZHhdID09PSBNQVQuQUlSKSB7XG4gICAgICAgICAgICBkYXRhW2lkeF0gPSBNQVQuV0FURVI7XG4gICAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9wU29saWQgPSBNYXRoLm1pbihZX01BWCAtIDEsIE1hdGgubWF4KFlfTUlOLCBoIC0gMSkpO1xuICAgICAgaGVpZ2h0c1tjb2xdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICB0b3BNYXRlcmlhbHNbY29sXSA9IHRvcDtcbiAgICB9XG4gIH1cblxuICAvLyBQcm90cnVkaW5nIGxlZGdlczogb25lIG9yIHR3byBzdG9uZSBibG9ja3MgZXh0ZW5kIGZyb20gYSBoaWdoIGNvbHVtbiBvdmVyXG4gIC8vIGEgbG93ZXIgbmVpZ2hib3VyLiBUaGV5IGNyZWF0ZSByZWFkYWJsZSBvdmVyaGFuZ3Mgd2l0aG91dCBhIGZ1bGwgY2F2ZSBwYXNzLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCBoID0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFApXTtcbiAgICAgIGNvbnN0IHNsb3BlID0gTWF0aC5tYXgoXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQIC0gMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQICsgMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICApO1xuICAgICAgaWYgKHNsb3BlIDwgMikgY29udGludWU7XG4gICAgICBjb25zdCBkaXJzOiBBcnJheTxbbnVtYmVyLCBudW1iZXJdPiA9IFtbLTEsIDBdLCBbMSwgMF0sIFswLCAtMV0sIFswLCAxXV07XG4gICAgICBmb3IgKGNvbnN0IFtkeCwgZHpdIG9mIGRpcnMpIHtcbiAgICAgICAgY29uc3QgbnggPSBseCArIGR4LCBueiA9IGx6ICsgZHo7XG4gICAgICAgIGlmIChueCA8IDAgfHwgbnogPCAwIHx8IG54ID49IENIVU5LX1NJWkUgfHwgbnogPj0gQ0hVTktfU0laRSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IG5oID0gYmFzZUhbKG56ICsgUCkgKiBQVyArIChueCArIFApXTtcbiAgICAgICAgaWYgKGggLSBuaCA8IDIpIGNvbnRpbnVlO1xuICAgICAgICBpZiAoaGFzaDNpKGx4LCBseiwgZHggKiAzICsgZHogKiA3LCBzZWVkICsgMTUwKSA8IDAuNTUpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCB5ID0gaCAtIDI7XG4gICAgICAgIGlmICh5IDwgWV9NSU4gfHwgeSA+PSBoKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgaWR4ID0gbG9jYWxJbmRleChueCwgeVRvSW5kZXgoeSksIG56KTtcbiAgICAgICAgaWYgKGRhdGFbaWR4XSA9PT0gTUFULkFJUikge1xuICAgICAgICAgIGRhdGFbaWR4XSA9IE1BVC5TVE9ORTtcbiAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFJlY29tcHV0ZSB0aGUgY29sdW1uIGNhY2hlIGFmdGVyIGxlZGdlcy9jYXZlcy4gVGhlIGV4cG9zZWQgdG9wIG1hdGVyaWFsXG4gIC8vIG11c3QgY29tZSBmcm9tIHRoZSBhY3R1YWwgdG9wIHNvbGlkIHZveGVsLCBub3QgdGhlIHByZS1jYXJ2ZSBndWVzcy5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gICAgICBsZXQgdG9wTWF0OiBudW1iZXIgPSB0b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICAgICAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgICAgIGNvbnN0IG0gPSBkYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildO1xuICAgICAgICBpZiAoaXNTb2xpZChtKSkgeyB0b3BTb2xpZCA9IHk7IHRvcE1hdCA9IG07IGJyZWFrOyB9XG4gICAgICB9XG4gICAgICBoZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgdG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IHRvcE1hdDtcbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBjeCwgY3osIHNlZWQsIHZlcnNpb24sIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyIH07XG59XG5cbi8qKlxuICogSW5zdGFsbCBiYXNlIGNvbnRlbnRzIGFzIGEgcmVzaWRlbnQgY2h1bms6IGFwcGx5IGR1cmFibGUgZWRpdHMsIHVwZGF0ZVxuICogc3RhdHMsIGFuZCBydW4gZGV0ZXJtaW5pc3RpYyBlbnRpdHkgZ2VuZXJhdGlvbi4gTWFpbi10aHJlYWQgb25seTsgdGhpcyBpc1xuICogdGhlIHNpbmdsZSB3cml0ZXIgb2YgV29ybGQuIFJldHVybnMgdGhlIGFscmVhZHktcmVzaWRlbnQgY2h1bmsgaWYgb25lIGV4aXN0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluc3RhbGxCYXNlQ2h1bmsod29ybGQ6IFdvcmxkLCBiYXNlOiBCYXNlQ2h1bmssIGdlbmVyYXRpb25NcyA9IDApOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChiYXNlLnNlZWQgIT09IHdvcmxkLnNlZWQgfHwgYmFzZS52ZXJzaW9uICE9PSB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbikge1xuICAgIHRocm93IG5ldyBFcnJvcignYmFzZSBjaHVuayBiZWxvbmdzIHRvIGEgZGlmZmVyZW50IHdvcmxkIGNvbmZpZ3VyYXRpb24nKTtcbiAgfVxuICBjb25zdCB7IGN4LCBjeiwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIgfSA9IGJhc2U7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gIGNvbnN0IGNodW5rOiBWb3hlbENodW5rID0ge1xuICAgIGN4LCBjeiwga2V5LCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpcixcbiAgICBkaXJ0eTogdHJ1ZSxcbiAgICBnZW5lcmF0ZWRBdDogcGVyZm9ybWFuY2Uubm93KCksXG4gIH07XG5cbiAgLy8gQXBwbHkgZHVyYWJsZSBlZGl0cyBhZnRlciBiYXNlIGdlbmVyYXRpb24uXG4gIGNvbnN0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGtleSk7XG4gIGlmIChlZGl0cykge1xuICAgIGZvciAoY29uc3QgW2lkeCwgbV0gb2YgZWRpdHMpIHtcbiAgICAgIGNodW5rLmRhdGFbaWR4XSA9IG07XG4gICAgfVxuICAgIC8vIFJlY29tcHV0ZSB0aGUgY2FjaGUgZm9yIGVkaXRlZCBjaHVua3MuXG4gICAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB1cGRhdGVDb2x1bW5DYWNoZShjaHVuaywgbHgsIGx6KTtcbiAgICB9XG4gIH1cbiAgLy8gTm9uLWFpciBjb3VudHMgYXJlIGRlcml2ZWQgcmVuZGVyZXIgc3RhdGlzdGljcywgbm90IGR1cmFibGUgd29ybGQgc3RhdGUuXG4gIC8vIEVkaXRlZCBiYXNlIGFpciBtYXkgYmVjb21lIHNvbGlkIChhbmQgdmljZSB2ZXJzYSkgZHVyaW5nIHJlc3RvcmF0aW9uLlxuICBsZXQgZWRpdGVkTm9uQWlyID0gMDtcbiAgZm9yIChjb25zdCBtYXRlcmlhbCBvZiBjaHVuay5kYXRhKSBpZiAobWF0ZXJpYWwgIT09IE1BVC5BSVIpIGVkaXRlZE5vbkFpcisrO1xuICB3b3JsZC5zdGF0cy52b3hlbHNGaWxsZWQgKz0gZWRpdGVkTm9uQWlyIC0gbm9uQWlyO1xuXG4gIHdvcmxkLmNodW5rcy5zZXQoa2V5LCBjaHVuayk7XG4gIHdvcmxkLnN0YXRzLmNodW5rc0dlbmVyYXRlZCsrO1xuICB3b3JsZC5zdGF0cy52b3hlbHNGaWxsZWQgKz0gbm9uQWlyO1xuICB3b3JsZC5zdGF0cy5nZW5lcmF0aW9uTXMgKz0gZ2VuZXJhdGlvbk1zO1xuICB3b3JsZC5kaXJ0eS5hZGQoa2V5KTtcblxuICBnZW5lcmF0ZUVudGl0aWVzKHdvcmxkLCBjaHVuayk7XG4gIHJldHVybiBjaHVuaztcbn1cblxuLyoqIEEgYmFzZS10ZXJyYWluIGNhY2hlIHNoYXJlZCBieSBlZGl0ZWQgYW5kIHVuZWRpdGVkIHJlZ2VuZXJhdGlvbi4gTmF0dXJhbFxuICogc2NlbmVyeSBuZXZlciBkZXBlbmRzIG9uIGxhdGVyIHZveGVsIGVkaXRzOyB0aGlzIGFsc28gbGV0cyBhIHNuYXBzaG90IHJlc3RvcmVcbiAqIGEgaGFydmVzdGVkIGNodW5rIHdpdGhvdXQgbWF0ZXJpYWxpemluZyB1bnJlbGF0ZWQgbmVpZ2hib3VyaW5nIGNodW5rcy4gKi9cbmNvbnN0IGJhc2VDb2x1bW5DYWNoZSA9IG5ldyBXZWFrTWFwPFdvcmxkLCBNYXA8c3RyaW5nLCB7IGhlaWdodHM6IFVpbnQ4QXJyYXk7IHRvcE1hdGVyaWFsczogVWludDhBcnJheSB9Pj4oKTtcblxuZXhwb3J0IGludGVyZmFjZSBCYXNlQ29sdW1ucyB7IGhlaWdodHM6IFVpbnQ4QXJyYXk7IHRvcE1hdGVyaWFsczogVWludDhBcnJheTsgfVxuXG4vKiogQmFzZSAocHJlLWNhcnZlLCBwcmUtZWRpdCkgY29sdW1uIGhlaWdodHMvbWF0ZXJpYWxzIHVzZWQgZm9yIGVudGl0eSBwbGFjZW1lbnQuIFB1cmUuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZUJhc2VDb2x1bW5zKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogQmFzZUNvbHVtbnMge1xuICBjb25zdCBjb2x1bW5zID0geyBoZWlnaHRzOiBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKSwgdG9wTWF0ZXJpYWxzOiBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKSB9O1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB4ID0gY2h1bmtPcmlnaW5YKGN4KSArIGx4LCB6ID0gY2h1bmtPcmlnaW5aKGN6KSArIGx6O1xuICAgICAgY29uc3QgaCA9IGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4LCB6KTtcbiAgICAgIGNvbnN0IHNsb3BlID0gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjJcbiAgICAgICAgPyB2ZXJzaW9uZWRTbG9wZShzZWVkLCB2ZXJzaW9uLCB4LCB6LCBoKSA6IHNsb3BlQXQoc2VlZCwgeCwgeiwgaCk7XG4gICAgICBjb25zdCBpbmRleCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgY29sdW1ucy5oZWlnaHRzW2luZGV4XSA9IGNsYW1wKGggLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICBjb2x1bW5zLnRvcE1hdGVyaWFsc1tpbmRleF0gPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMlxuICAgICAgICA/IGJhc2VUb3BNYXRlcmlhbEZvcihzZWVkLCB2ZXJzaW9uLCB4LCB6LCBoLCBzbG9wZSlcbiAgICAgICAgOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNvbHVtbnM7XG59XG5cbi8qKiBQcm92aWRlIHByZWNvbXB1dGVkIGJhc2UgY29sdW1ucyAoZm9yIGV4YW1wbGUgZnJvbSBhIHdvcmtlcikgYmVmb3JlIGluc3RhbGxpbmcgYSBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZWVkQmFzZUNvbHVtbnMod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZywgY29sdW1uczogQmFzZUNvbHVtbnMpOiB2b2lkIHtcbiAgbGV0IGNhY2hlID0gYmFzZUNvbHVtbkNhY2hlLmdldCh3b3JsZCk7XG4gIGlmICghY2FjaGUpIHsgY2FjaGUgPSBuZXcgTWFwKCk7IGJhc2VDb2x1bW5DYWNoZS5zZXQod29ybGQsIGNhY2hlKTsgfVxuICBpZiAoIWNhY2hlLmhhcyhrZXkpKSBjYWNoZS5zZXQoa2V5LCBjb2x1bW5zKTtcbn1cblxuZnVuY3Rpb24gYmFzZUNvbHVtbnMod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IEJhc2VDb2x1bW5zIHtcbiAgbGV0IGNhY2hlID0gYmFzZUNvbHVtbkNhY2hlLmdldCh3b3JsZCk7XG4gIGlmICghY2FjaGUpIHsgY2FjaGUgPSBuZXcgTWFwKCk7IGJhc2VDb2x1bW5DYWNoZS5zZXQod29ybGQsIGNhY2hlKTsgfVxuICBjb25zdCBjYWNoZWQgPSBjYWNoZS5nZXQoY2h1bmsua2V5KTtcbiAgaWYgKGNhY2hlZCkgcmV0dXJuIGNhY2hlZDtcbiAgY29uc3QgY29sdW1ucyA9IGNvbXB1dGVCYXNlQ29sdW1ucyh3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiwgY2h1bmsuY3gsIGNodW5rLmN6KTtcbiAgY2FjaGUuc2V0KGNodW5rLmtleSwgY29sdW1ucyk7XG4gIHJldHVybiBjb2x1bW5zO1xufVxuXG4vLyAtLS0tLS0tLS0tIGRlcml2ZWQgY2hhbmdlIHRyYWNraW5nIChub3QgYXV0aG9yaXRhdGl2ZSBzdGF0ZSkgLS0tLS0tLS0tLVxuLy8gUmVuZGVyZXJzIG5lZWQgdG8ga25vdyB3aGVuIHRoZSBlZGl0IG92ZXJsYXkgY2hhbmdlZCB3aXRob3V0IHdhbGtpbmcgZXZlcnlcbi8vIGVkaXQgZWFjaCBmcmFtZS4gVGhlIGNvdW50ZXIgbGl2ZXMgb3V0c2lkZSBXb3JsZCBzbyBpdCBuZXZlciBlbnRlcnMgYVxuLy8gc25hcHNob3Qgb3IgY2Fub25pY2FsIGhhc2guXG5jb25zdCBlZGl0VmVyc2lvbnMgPSBuZXcgV2Vha01hcDxXb3JsZCwgbnVtYmVyPigpO1xuXG4vKiogTW9ub3RvbmljIGNvdW50IG9mIGVkaXQtb3ZlcmxheSBjaGFuZ2VzIGZvciB0aGlzIFdvcmxkIG9iamVjdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZGl0VmVyc2lvbih3b3JsZDogV29ybGQpOiBudW1iZXIge1xuICByZXR1cm4gZWRpdFZlcnNpb25zLmdldCh3b3JsZCkgPz8gMDtcbn1cblxuLyoqIENhbGwgYWZ0ZXIgcmVwbGFjaW5nIG9yIGJ1bGstY2hhbmdpbmcgYHdvcmxkLmVkaXRzYCBvdXRzaWRlIHNldFZveGVsLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcmtFZGl0c0NoYW5nZWQod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGVkaXRWZXJzaW9ucy5zZXQod29ybGQsIGVkaXRWZXJzaW9uKHdvcmxkKSArIDEpO1xufVxuXG4vLyAtLS0tLS0tLS0tIG5vbi1nZW5lcmF0aW5nIHF1ZXJpZXMgLS0tLS0tLS0tLVxuLy8gTW92aW5nIHByZXNlbnRhdGlvbiAoY2hhcmFjdGVycywgYW5pbWFscywgY2FtZXJhKSBtdXN0IG5ldmVyIHRyaWdnZXIgY2h1bmtcbi8vIGdlbmVyYXRpb24gYXMgYSBzaWRlIGVmZmVjdCBvZiBhc2tpbmcgYWJvdXQgdGVycmFpbi4gVGhlc2UgcmV0dXJuIG51bGwgd2hlblxuLy8gdGhlIGNvbHVtbidzIGNodW5rIGlzIG5vdCByZXNpZGVudC5cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50Q2h1bmtBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHdvcmxkLmNodW5rcy5nZXQoY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSkpID8/IG51bGw7XG59XG5cbi8qKiBMaWtlIHN1cmZhY2VBdCwgYnV0IG51bGwgaW5zdGVhZCBvZiBnZW5lcmF0aW5nIGEgbWlzc2luZyBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudFN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHwgbnVsbCB7XG4gIGNvbnN0IGNodW5rID0gcmVzaWRlbnRDaHVua0F0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIG51bGw7XG4gIHJldHVybiBjaHVuay5oZWlnaHRzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gKyBZX01JTiArIDE7XG59XG5cbi8qKiBMaWtlIGdldFZveGVsLCBidXQgbnVsbCBpbnN0ZWFkIG9mIGdlbmVyYXRpbmcgYSBtaXNzaW5nIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50Vm94ZWxBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB8IG51bGwge1xuICBpZiAoeSA8IFlfTUlOKSByZXR1cm4gTUFULkJFRFJPQ0s7XG4gIGlmICh5ID49IFlfTUFYKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY2h1bmsgPSByZXNpZGVudENodW5rQXQod29ybGQsIHgsIHopO1xuICBpZiAoIWNodW5rKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGNodW5rLmRhdGFbbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXZpY3RDaHVuayh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmICghd29ybGQuY2h1bmtzLmhhcyhrZXkpKSByZXR1cm4gZmFsc2U7XG4gIHdvcmxkLmNodW5rcy5kZWxldGUoa2V5KTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzRXZpY3RlZCsrO1xuICAvLyBDaHVuayBieXRlcyBhbmQgY29sdW1uIGNhY2hlcyBhcmUgcmVnZW5lcmF0ZWQgb24gZGVtYW5kLiBFbnRpdGllcyByZW1haW5cbiAgLy8gYXV0aG9yaXRhdGl2ZTogZXZpY3Rpb24gbXVzdCBub3QgZm9yZ2V0IHRoZWlyIHBlcnNpc3RlbnQgc3RhdGUuXG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyAtLS0tLS0tLS0tIHF1ZXJpZXMgLyBlZGl0cyAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZ2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeSA8IFlfTUlOKSByZXR1cm4gTUFULkJFRFJPQ0s7XG4gIGlmICh5ID49IFlfTUFYKSByZXR1cm4gTUFULkFJUjtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLmRhdGFbbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBtOiBNYXRJZCk6IGJvb2xlYW4ge1xuICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gWV9NQVgpIHJldHVybiBmYWxzZTtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgaWR4ID0gbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSk7XG4gIGNvbnN0IHByZXZpb3VzRWRpdCA9IHdvcmxkLmVkaXRzLmdldChjaHVua0tleShjeCwgY3opKT8uZ2V0KGlkeCk7XG4gIC8vIEEgY2h1bmsgZXZpY3RlZCBhZnRlciBhbiBlYXJsaWVyIGVkaXQgY2FuIHJlZ2VuZXJhdGUgd2l0aCB0aGF0IGR1cmFibGVcbiAgLy8gbWF0ZXJpYWwgYWxyZWFkeSBhcHBsaWVkLiBEcm9wcGluZyB0aGUgZWRpdCBoZXJlIHdvdWxkIG1ha2UgaXQgZGlzYXBwZWFyXG4gIC8vIG9uIHRoZSBuZXh0IGV2aWN0aW9uL3Jlc3RvcmF0aW9uLCBldmVuIHRob3VnaCB0aGUgY3VycmVudCB3cml0ZSBuby1vcHMuXG4gIGlmIChwcmV2aW91c0VkaXQgPT09IG0pIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIGZhbHNlO1xuICBsZXQgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoY2h1bmsua2V5KTtcbiAgaWYgKCFlZGl0cykgeyBlZGl0cyA9IG5ldyBNYXAoKTsgd29ybGQuZWRpdHMuc2V0KGNodW5rLmtleSwgZWRpdHMpOyB9XG4gIC8vIEFuIGlkZW1wb3RlbnQgd3JpdGUgbXVzdCBzdGlsbCByZXN0b3JlIGEgZHVyYWJsZSBkZWx0YSBkaXNjYXJkZWQgYnkgYW5cbiAgLy8gb2xkZXIgc25hcHNob3Qgb3IgZGVsdGEgZGVjb2Rlci4gSXQgaXMgbm90IGEgbmV3IGF1dGhvcml0YXRpdmUgcmV2aXNpb24uXG4gIGlmIChjaHVuay5kYXRhW2lkeF0gPT09IG0pIHtcbiAgICBpZiAoIWVkaXRzLmhhcyhpZHgpKSBlZGl0cy5zZXQoaWR4LCBtKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgZWRpdHMuc2V0KGlkeCwgbSk7XG4gIG1hcmtFZGl0c0NoYW5nZWQod29ybGQpO1xuICBjaHVuay5kaXJ0eSA9IHRydWU7XG4gIHdvcmxkLmRpcnR5LmFkZChjaHVuay5rZXkpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICB1cGRhdGVDb2x1bW5DYWNoZShjaHVuaywgd29ybGRUb0xvY2FsWCh4KSwgd29ybGRUb0xvY2FsWih6KSk7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVDb2x1bW5DYWNoZShjaHVuazogVm94ZWxDaHVuaywgbHg6IG51bWJlciwgbHo6IG51bWJlcik6IHZvaWQge1xuICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgaWYgKGlzU29saWQoY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSkpIHsgdG9wU29saWQgPSB5OyBicmVhazsgfVxuICB9XG4gIGNodW5rLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gIGNvbnN0IHRtID0gY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgaWYgKHRvcFNvbGlkID49IFlfTUlOKSB7XG4gICAgY29uc3QgbSA9IGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgodG9wU29saWQpLCBseildO1xuICAgIGlmIChtICE9PSBNQVQuV0FURVIpIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBtO1xuICB9IGVsc2Uge1xuICAgIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0bTtcbiAgfVxufVxuXG4vKipcbiAqIFRoZSB5IGNvb3JkaW5hdGUgb2YgdGhlIGV4cG9zZWQgdG9wIGZhY2Ugb2YgdGhlIHNvbGlkIGNvbHVtbiBhdCB4L3ouXG4gKiBBIHNvbGlkIHZveGVsIGF0IHkgb2NjdXBpZXMgW3ksIHkrMSksIHNvIHRoZSB3YWxrYWJsZSBzdXJmYWNlIGlzIHRvcFNvbGlkKzEuXG4gKiBUaGlzIGlzIGEgZGVyaXZlZCBxdWVyeTsgdGhlIGF1dGhvcml0YXRpdmUgc3RhdGUgcmVtYWlucyB0aGUgdm94ZWwgdm9sdW1lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gWV9NSU47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gWV9NSU47XG4gIHJldHVybiBjaHVuay5oZWlnaHRzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gKyBZX01JTiArIDE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLnRvcE1hdGVyaWFsc1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGVpZ2h0QXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJEZXB0aEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAod29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24gPCBHRU5FUkFUT1JfVjIpIHtcbiAgICBjb25zdCBoID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgICByZXR1cm4gaCA8IFNFQV9MRVZFTCA/IFNFQV9MRVZFTCAtIGggOiAwO1xuICB9XG4gIHJldHVybiB3YXRlclN1cmZhY2VBdCh3b3JsZCwgeCwgeikgLSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG4vKipcbiAqIFRvcCBvZiB0aGUgd2F0ZXIgY29sdW1uIHN0YW5kaW5nIG9uIHRoZSBzb2xpZCBzdXJmYWNlIChlcXVhbCB0byB0aGUgc3VyZmFjZVxuICogd2hlbiBkcnkpLiBSZWFkcyB0aGUgYXV0aG9yaXRhdGl2ZSB2b3hlbHMsIHNvIGVkaXRzIGFuZCBkdWcgcGl0cyBhcmUgZXhhY3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YXRlclN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICB3aGlsZSAoeSA8IFlfTUFYICYmIGdldFZveGVsKHdvcmxkLCB4LCB5LCB6KSA9PT0gTUFULldBVEVSKSB5Kys7XG4gIHJldHVybiB5O1xufVxuXG4vLyAtLS0tLS0tLS0tIGVudGl0aWVzIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIGFkZEVudGl0eSh3b3JsZDogV29ybGQsIGU6IEVudGl0eSk6IHZvaWQge1xuICBpZiAod29ybGQuZW50aXRpZXMuaGFzKGUuaWQpIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpXG4gICAgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpKSByZXR1cm47XG4gIHdvcmxkLmVudGl0aWVzLnNldChlLmlkLCBlKTtcbiAgbGV0IGxpc3QgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGUuY2h1bmspO1xuICBpZiAoIWxpc3QpIHsgbGlzdCA9IFtdOyB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIGxpc3QpOyB9XG4gIGxpc3QucHVzaChlLmlkKTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICAvLyBHZW5lcmF0aW9uIGlzIGRldGVybWluaXN0aWMgYW5kIGFkdmFuY2VzIG5vIHBsYXllci1jb21tYW5kIHByZWNvbmRpdGlvbi5cbiAgLy8gQXV0aG9yZWQgc2NhZmZvbGRpbmcgbWF5IHRyYW5zaWVudGx5IGNoYW5nZSBpdDsgdGhlIHNuYXBzaG90IHJlc3RvcmVzIHRoZVxuICAvLyBzYXZlZCByZXZpc2lvbiBhZnRlciBwbGFjaW5nIHRoYXQgc2NhZmZvbGRpbmcuXG59XG5cbi8qKlxuICogUmVtb3ZlIGFuIGVudGl0eSBmcm9tIHRoZSBhdXRob3JpdGF0aXZlIHdvcmxkLiBVc2VkIHdoZW4gYSBzaXRlIGlzIGNsZWFyZWQ6XG4gKiB0aGUgcmVzb3VyY2UgeWllbGQgaXMgYWNjb3VudGVkIGZvciBieSB0aGUgY2FsbGVyLCBhbmQgdGhlIGVudGl0eSBtdXN0IHN0b3BcbiAqIGV4aXN0aW5nIGZvciBjb2xsaXNpb24sIG9ic3RydWN0aW9uIGFuZCBwZXJzaXN0ZW5jZSwgbm90IGp1c3QgYmUgaGlkZGVuIGJ5XG4gKiB0aGUgcmVuZGVyZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICBpZiAoIWUgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgY29uc3QgbGlzdCA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoZS5jaHVuayk7XG4gIGlmIChsaXN0KSB7XG4gICAgY29uc3QgaSA9IGxpc3QuaW5kZXhPZihpZCk7XG4gICAgaWYgKGkgPj0gMCkgbGlzdC5zcGxpY2UoaSwgMSk7XG4gICAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoaWQpO1xuICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnRyZWVzIC0gMSk7XG4gIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyAtIDEpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBlbnRpdHlJZChjaHVuazogc3RyaW5nLCBpOiBudW1iZXIpOiBzdHJpbmcge1xuICByZXR1cm4gYGU6JHtjaHVua306JHtpfWA7XG59XG5cbmZ1bmN0aW9uIGZvcmVzdFNjb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGVhc3QgPSBNYXRoLmV4cCgtKCgod3ggLSAyMjApIC8gMjYwKSAqKiAyICsgKCh3eiArIDExMCkgLyAyMjApICoqIDIpKTtcbiAgY29uc3Qgbm9ydGggPSBNYXRoLmV4cCgtKCgod3ggLSAyMCkgLyAzMDApICoqIDIgKyAoKHd6ICsgMzAwKSAvIDE5MCkgKiogMikpO1xuICBjb25zdCB3ZXN0ID0gTWF0aC5leHAoLSgoKHd4ICsgMzQwKSAvIDIwMCkgKiogMiArICgod3ogLSAxMjApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IHNvdXRoID0gTWF0aC5leHAoLSgoKHd4IC0gMTIwKSAvIDI0MCkgKiogMiArICgod3ogLSAzMzApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IG1vaXN0dXJlID0gZmJtMih3eCAvIDI2MCwgd3ogLyAyNjAsIHNlZWQgKyAyMDEsIDQpO1xuICBjb25zdCB2YWxsZXkgPSBNYXRoLmV4cCgtKCh3eCAvIDE0MCkgKiogMiArICh3eiAvIDEwNSkgKiogMikpO1xuICByZXR1cm4gTWF0aC5tYXgoZWFzdCwgbm9ydGggKiAwLjkyLCB3ZXN0ICogMC44MCwgc291dGggKiAwLjc4KSAqIDAuODJcbiAgICArIG1vaXN0dXJlICogMC4zOCAtIDAuMjIgLSB2YWxsZXkgKiAwLjM0O1xufVxuXG5mdW5jdGlvbiByb2NrU2NvcmUod3g6IG51bWJlciwgd3o6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgbW91bnRhaW4gPSBmYm0yKHd4IC8gMzMwLCB3eiAvIDMzMCwgc2VlZCArIDIwMiwgMyk7XG4gIGNvbnN0IHJpZGdlID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMTQwLCB3eiAvIDE0MCwgc2VlZCArIDIwMywgMykgLSAxKTtcbiAgcmV0dXJuIG1vdW50YWluICogMC41NSArIHJpZGdlICogMC40NTtcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVFbnRpdGllcyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogdm9pZCB7XG4gIGdlbmVyYXRlRW50aXR5Q2h1bmsod29ybGQsIGNodW5rLmN4LCBjaHVuay5jeik7XG59XG5cbi8qKiBAaW50ZXJuYWwgUmVwbGF5cyBkZXRlcm1pbmlzdGljIGdlbmVyYXRpb24gZm9yIHNuYXBzaG90IGVudGl0eSBkZWx0YXMuICovXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVFbnRpdHlDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgaWYgKHdvcmxkLmVudGl0eUNodW5rcy5oYXMoa2V5KSkgcmV0dXJuO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm47XG5cbiAgY29uc3Qgcm5kID0gbXVsYmVycnkzMigoaGFzaDJpKGNodW5rLmN4LCBjaHVuay5jeiwgd29ybGQuc2VlZCArIDkwMCkgKiA0Mjk0OTY3Mjk2KSA+Pj4gMCk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICBjb25zdCBjb2x1bW5zID0gYmFzZUNvbHVtbnMod29ybGQsIGNodW5rKTtcbiAgbGV0IG4gPSAwO1xuICBsZXQgbmF0dXJhbFRyZWVzID0gMDtcbiAgbGV0IG5hdHVyYWxQaW5rVHJlZXMgPSAwO1xuXG4gIGNvbnN0IGxvY2FsU3VyZmFjZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICByZXR1cm4gY29sdW1ucy5oZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSArIFlfTUlOO1xuICB9O1xuICBjb25zdCBsb2NhbFRvcCA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogTWF0SWQgPT4ge1xuICAgIHJldHVybiBjb2x1bW5zLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gYXMgTWF0SWQ7XG4gIH07XG4gIGNvbnN0IGxvY2FsU2xvcGUgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgIHJldHVybiBNYXRoLm1heChcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggLSAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGNsYW1wKGx4ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpLCBseikpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogLSAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UobHgsIGNsYW1wKGx6ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpKSksXG4gICAgKTtcbiAgfTtcblxuICAvLyBBIGppdHRlcmVkIDggbSBsYXR0aWNlIGdpdmVzIGNvaGVyZW50IG1hc3NlcyBhbmQgYXZvaWRzIHBlci1mcmFtZSBzY2F0dGVyLlxuICBmb3IgKGxldCBneiA9IDA7IGd6IDwgQ0hVTktfU0laRTsgZ3ogKz0gOCkge1xuICAgIGZvciAobGV0IGd4ID0gMDsgZ3ggPCBDSFVOS19TSVpFOyBneCArPSA4KSB7XG4gICAgICBjb25zdCBseCA9IGNsYW1wKE1hdGguZmxvb3IoZ3ggKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCBseiA9IGNsYW1wKE1hdGguZmxvb3IoZ3ogKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBsb2NhbFN1cmZhY2UobHgsIGx6KTtcbiAgICAgIGlmIChoIDw9IFNFQV9MRVZFTCArIDEpIGNvbnRpbnVlO1xuICAgICAgY29uc3Qgc2xvcGUgPSBsb2NhbFNsb3BlKGx4LCBseik7XG4gICAgICBjb25zdCB0b3AgPSBsb2NhbFRvcChseCwgbHopO1xuICAgICAgaWYgKHRvcCA9PT0gTUFULldBVEVSKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGZvcmVzdCA9IGZvcmVzdFNjb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2NreSA9IHJvY2tTY29yZSh3eCwgd3osIHdvcmxkLnNlZWQpO1xuICAgICAgY29uc3Qgcm9sbCA9IHJuZCgpO1xuXG4gICAgICBjb25zdCB0cmVlQ2hhbmNlID0gZm9yZXN0ID4gMC41MCA/IDAuNzIgOiBmb3Jlc3QgPiAwLjMwID8gMC4yNSA6IDAuMDU7XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMiAmJiByb2xsIDwgdHJlZUNoYW5jZSkge1xuICAgICAgICAvLyBUaGUgY2FwIGlzIGEgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsLWdlbmVyYXRpb24gcHJvcGVydHkuIEl0IGNhbm5vdFxuICAgICAgICAvLyBkZXBlbmQgb24gd2hpY2ggY2h1bmtzIGEgcmVuZGVyZXIgbG9hZGVkIGJlZm9yZSB0aGlzIG9uZS5cbiAgICAgICAgbGV0IGtpbmQ6IEVudGl0eUtpbmQ7XG4gICAgICAgIGxldCB2YXJpYW50OiBudW1iZXI7XG4gICAgICAgIGNvbnN0IHNwZWNpZXNSb2xsID0gcm5kKCk7XG4gICAgICAgIGlmIChzcGVjaWVzUm9sbCA8IDAuMTIpIHtcbiAgICAgICAgICBpZiAoKG5hdHVyYWxQaW5rVHJlZXMgKyAxKSA+IDAuMjUgKiAobmF0dXJhbFRyZWVzICsgMSkpIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2NsdXN0ZXInO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAzKTtcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtPdmVyZmxvdysrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9ibG9zc29tJztcbiAgICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMik7XG4gICAgICAgICAgICBuYXR1cmFsUGlua1RyZWVzKys7XG4gICAgICAgICAgICB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoc3BlY2llc1JvbGwgPCAwLjQwKSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfc3BpcmUnO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogNCk7XG4gICAgICAgIH0gZWxzZSBpZiAoc3BlY2llc1JvbGwgPCAwLjc0KSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfdGFibGUnO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogNCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAzKTtcbiAgICAgICAgfVxuICAgICAgICBuYXR1cmFsVHJlZXMrKztcbiAgICAgICAgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuODggKyBybmQoKSAqIDAuMjQsIHZhcmlhbnQsXG4gICAgICAgICAgcmVzb3VyY2U6ICd3b29kJywgcmVtYWluaW5nOiAxMiwgeWllbGRQZXJIYXJ2ZXN0OiA0LFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiByb2NreSA+IDAuNDYgJiYgcm9sbCA8IDAuMzgpIHtcbiAgICAgICAgLy8gQ29uc3VtZSB0aGUgcmV0aXJlZCBzdG9uZSBmb3JtJ3MgcmFuZG9tIGRyYXdzIGFuZCBhbGxvY2F0ZSBpdHMgb2xkXG4gICAgICAgIC8vIHNlcXVlbmNlIElELCBidXQgZG8gbm90IGluc2VydCBhbiBlbnRpdHkuIExhdGVyIG5hdHVyYWwgcGxhY2VtZW50c1xuICAgICAgICAvLyB0aGVyZWZvcmUgcmVtYWluIGJ5dGUtZm9yLWJ5dGUgY29tcGF0aWJsZSB3aXRoIHJlY29yZGVkIHNhdmVzLlxuICAgICAgICBjb25zdCBzaXplUm9sbCA9IHJuZCgpO1xuICAgICAgICBjb25zdCBraW5kOiBFbnRpdHlLaW5kID0gc2l6ZVJvbGwgPCAwLjU1ID8gJ3N0eWxfcm9ja19zbWFsbCdcbiAgICAgICAgICA6IHNpemVSb2xsIDwgMC45MCA/ICdzdHlsX3JvY2tfbWVkaXVtJyA6ICdzdHlsX3JvY2tfbGFyZ2UnO1xuICAgICAgICBjb25zdCBpZCA9IGVudGl0eUlkKGNodW5rLmtleSwgbisrKTtcbiAgICAgICAgY29uc3QgcmVjb3JkID0ge1xuICAgICAgICAgIGlkLCBraW5kLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcmVzb3VyY2U6ICdzdG9uZScgYXMgY29uc3QsXG4gICAgICAgICAgcmVtYWluaW5nOiBraW5kID09PSAnc3R5bF9yb2NrX3NtYWxsJyA/IDQgOiBraW5kID09PSAnc3R5bF9yb2NrX21lZGl1bScgPyA4IDogMTIsXG4gICAgICAgICAgeWllbGRQZXJIYXJ2ZXN0OiAzLCBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjkgKyBybmQoKSAqIDAuMiwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDMpLFxuICAgICAgICB9O1xuICAgICAgICAvLyBPbmx5IGVudGl0aWVzIHRoYXQgZXhpc3RlZCBpbiBhbiBhY2NlcHRlZCBvbGQgc2F2ZSBnZXQgdG9tYnN0b25lcyxcbiAgICAgICAgLy8gZHVyaW5nIGV4cGxpY2l0IG1pZ3JhdGlvbi4gT3JkaW5hcnkgZ2VuZXJhdGlvbiBtdXN0IHJlc3RvcmUgZXhhY3RseS5cbiAgICAgICAgaWYgKGlzU3RvbmVSZXBsYXkod29ybGQpKSBhZGRFbnRpdHkod29ybGQsIHJlY29yZCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULlNUT05FICYmIHJvY2t5ID4gMC41OCAmJiByb2xsIDwgMC4xOCkge1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQ6ICdzdHlsX29yZScsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC45ICsgcm5kKCkgKiAwLjIsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAyKSxcbiAgICAgICAgICByZXNvdXJjZTogJ29yZScsIHJlbWFpbmluZzogOCwgeWllbGRQZXJIYXJ2ZXN0OiAyLFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiBzbG9wZSA8PSAxICYmIHJvbGwgPCAwLjMwKSB7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZDogJ3N0eWxfc2hydWInLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOCArIHJuZCgpICogMC40LCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgICAgcmVzb3VyY2U6ICdmaWJlcicsIHJlbWFpbmluZzogNCwgeWllbGRQZXJIYXJ2ZXN0OiAxLFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRBdXRob3JlZEVudGl0eSh3b3JsZDogV29ybGQsIGtpbmQ6IEVudGl0eUtpbmQsIHg6IG51bWJlciwgejogbnVtYmVyLCB2YXJpYW50OiBudW1iZXIsIHJvdDogbnVtYmVyLCBzY2FsZTogbnVtYmVyLCByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbCwgcmVtYWluaW5nOiBudW1iZXIsIHlpZWxkUGVySGFydmVzdDogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBpZiAoeSA8PSBTRUFfTEVWRUwpIHJldHVybjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIC8vIEEgaGVybyBhc3NldCBvd25zIGl0cyBzcG90OiBjbGVhciBhbnkgZ2VuZXJhdGVkIGVudGl0eSB0aGF0IHdvdWxkIG92ZXJsYXBcbiAgLy8gaXQsIHJhdGhlciB0aGFuIHNpbGVudGx5IGRyb3BwaW5nIHRoZSBhdXRob3JlZCBjb21wb3NpdGlvbi5cbiAgY29uc3QgaWRzID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpID8/IFtdO1xuICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkgcmV0dXJuO1xuICBmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgIGlmIChlICYmIE1hdGguaHlwb3QoZS54IC0geCwgZS56IC0geikgPCAyLjYpIHtcbiAgICAgIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gICAgICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnRyZWVzIC0gMSk7XG4gICAgICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy5waW5rVHJlZXMgLSAxKTtcbiAgICB9XG4gIH1cbiAgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGlkcy5maWx0ZXIoKGlkKSA9PiB3b3JsZC5lbnRpdGllcy5oYXMoaWQpKSk7XG4gIC8vIEF1dGhvcmVkIGNvbXBvc2l0aW9uIGlzIGR1cmFibGUgc3RhdGU6IGl0IGNhbiBjbGVhciBvdmVybGFwcGluZyBuYXR1cmFsXG4gIC8vIGVudGl0aWVzLCBzbyBzYXZlIHRoZSBjb21wbGV0ZSBhZmZlY3RlZCBjaHVuayByYXRoZXIgdGhhbiBvbmx5IGl0cyBoZXJvZXMuXG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGtleSk7XG5cbiAgY29uc3QgaWQgPSBgaGVybzoke2tpbmR9OiR7TWF0aC5yb3VuZCh4KX06JHtNYXRoLnJvdW5kKHopfWA7XG4gIGNvbnN0IGJlZm9yZSA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIGNvbnN0IGVudGl0eTogRW50aXR5ID0ge1xuICAgIGlkLCBraW5kLCBjaHVuazoga2V5LCB4OiB4ICsgMC41LCB5LCB6OiB6ICsgMC41LFxuICAgIHJvdCwgc2NhbGUsIHZhcmlhbnQsIHJlc291cmNlLCByZW1haW5pbmcsIHlpZWxkUGVySGFydmVzdCxcbiAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IHRydWUsXG4gIH07XG4gIGFkZEVudGl0eSh3b3JsZCwgZW50aXR5KTtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLnNpemUgPiBiZWZvcmUgJiYga2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkge1xuICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgaWYgKGtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGlmICh3b3JsZC5hdXRob3JlZFBsYWNlZCkgcmV0dXJuO1xuICB3b3JsZC5hdXRob3JlZFBsYWNlZCA9IHRydWU7XG5cbiAgY29uc3Qgc2l0ZXM6IEFycmF5PHsga2luZDogJ3dheXN0b25lJyB8ICdtYXJrZXInOyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcm90OiBudW1iZXIgfT4gPSBbXG4gICAgeyBraW5kOiAnd2F5c3RvbmUnLCB4OiAtMTAsIHo6IC0xNCwgcm90OiAwIH0sXG4gICAgeyBraW5kOiAnbWFya2VyJywgeDogLTMyLCB6OiAtOCwgcm90OiBNYXRoLlBJIC8gMiB9LFxuICBdO1xuICBmb3IgKGNvbnN0IHMgb2Ygc2l0ZXMpIHtcbiAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCBzLngsIHMueik7XG4gICAgaWYgKHkgPD0gU0VBX0xFVkVMKSBjb250aW51ZTtcbiAgICB3b3JsZC5zaXRlcy5wdXNoKHtcbiAgICAgIGlkOiBgc2l0ZToke3Mua2luZH1gLFxuICAgICAga2luZDogcy5raW5kLFxuICAgICAgeDogcy54ICsgMC41LCB5LCB6OiBzLnogKyAwLjUsXG4gICAgICByb3Q6IHMucm90LFxuICAgICAgcHJvdmlzaW9uYWw6IHRydWUsXG4gICAgfSk7XG4gIH1cblxuICAvLyBBIGhlcm8gZ3JvdmUgY29tcG9zZWQgaW4gdGhlIGRlZmF1bHQgY2FtZXJhJ3MgdmlldyBkaXJlY3Rpb24uIFRoZXNlIGFyZVxuICAvLyBTdHlsIG5hdHVyYWwgYXNzZXRzIChBUy0wMDEgdjIpLCBub3QgTm94ZWwgYXJjaGl0ZWN0dXJlOyB0aGUgTm94ZWxcbiAgLy8gd2F5c3RvbmUvbWFya2VyIGFib3ZlIHJlbWFpbiB0aGUgaHVtYW4tbWFkZSBsYW5kbWFya3MuXG4gIGNvbnN0IGdyb3ZlOiBBcnJheTxbRW50aXR5S2luZCwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXJdPiA9IFtcbiAgICBbJ3N0eWxfdHJlZV9zcGlyZScsIC0yMiwgLTI2LCAwLCAxLjAwLCAwXSxcbiAgICBbJ3N0eWxfdHJlZV90YWJsZScsIC0zNCwgLTE4LCAxLCAwLjk1LCBNYXRoLlBJIC8gMTJdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTYsIC0zNCwgMiwgMS4wMCwgTWF0aC5QSSAvIDZdLFxuICAgIFsnc3R5bF90cmVlX2Jsb3Nzb20nLCAtMjgsIC0zOCwgMCwgMC45MCwgTWF0aC5QSSAvIDRdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTQwLCAtMzAsIDIsIDEuMDUsIE1hdGguUEkgLyAzXSxcbiAgICBbJ3N0eWxfdHJlZV9jbHVzdGVyJywgLTEyLCAtMjQsIDAsIDAuOTAsIE1hdGguUEkgLyAyLjRdLFxuICBdO1xuICBmb3IgKGNvbnN0IFtraW5kLCB4LCB6LCB2YXJpYW50LCBzY2FsZSwgcm90XSBvZiBncm92ZSkge1xuICAgIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCBraW5kLCB4LCB6LCB2YXJpYW50LCByb3QsIHNjYWxlLCAnd29vZCcsIDEyLCA0KTtcbiAgfVxuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfcm9ja19tZWRpdW0nLCAtNiwgLTEwLCAwLCAwLCAxLjAsICdzdG9uZScsIDgsIDMpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfc2hydWInLCAtMTQsIC04LCAxLCBNYXRoLlBJIC8gMTIsIDEuMSwgJ2ZpYmVyJywgNCwgMSk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9jYWlybicsIC0yMCwgLTYsIDAsIDAsIDEuMCwgJ3N0b25lJywgNiwgMik7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9vcmUnLCAtMzgsIC00MiwgMCwgTWF0aC5QSSAvIDQsIDEuMSwgJ29yZScsIDgsIDIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbmVhcmVzdEhhcnZlc3RhYmxlKFxuICB3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCByYWRpdXM6IG51bWJlciwgcmVzb3VyY2U/OiBSZXNvdXJjZVR5cGUsXG4pOiBFbnRpdHkgfCBudWxsIHtcbiAgbGV0IGJlc3Q6IEVudGl0eSB8IG51bGwgPSBudWxsO1xuICBsZXQgYmVzdEQgPSByYWRpdXMgKiByYWRpdXM7XG4gIGZvciAoY29uc3QgZSBvZiB3b3JsZC5lbnRpdGllcy52YWx1ZXMoKSkge1xuICAgIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZClcbiAgICAgIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIGNvbnRpbnVlO1xuICAgIGlmIChyZXNvdXJjZSAmJiBlLnJlc291cmNlICE9PSByZXNvdXJjZSkgY29udGludWU7XG4gICAgY29uc3QgZCA9IChlLnggLSB4KSAqKiAyICsgKGUueiAtIHopICoqIDI7XG4gICAgaWYgKGQgPCBiZXN0RCkgeyBiZXN0RCA9IGQ7IGJlc3QgPSBlOyB9XG4gIH1cbiAgcmV0dXJuIGJlc3Q7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGFydmVzdFJlc3VsdCB7IGVudGl0eTogRW50aXR5OyByZXNvdXJjZTogUmVzb3VyY2VUeXBlOyBhbW91bnQ6IG51bWJlcjsgfVxuXG5leHBvcnQgZnVuY3Rpb24gaGFydmVzdEVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBIYXJ2ZXN0UmVzdWx0IHwgbnVsbCB7XG4gIGNvbnN0IGUgPSBsaXZlRW50aXR5KHdvcmxkLCBpZCk7XG4gIGlmICghZSB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgYW1vdW50ID0gTWF0aC5taW4oZS55aWVsZFBlckhhcnZlc3QsIGUucmVtYWluaW5nKTtcbiAgaWYgKHdvcmxkLmxpZmUgJiYgT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBuKSA9PiBzdW0gKyBuLCAwKSArIGFtb3VudCA+IDEyMCkgcmV0dXJuIG51bGw7XG4gIGUucmVtYWluaW5nIC09IGFtb3VudDtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgZS5oYXJ2ZXN0ZWRPbmNlID0gdHJ1ZTtcbiAgaWYgKGUucmVtYWluaW5nIDw9IDApIGUuaGFydmVzdGVkID0gdHJ1ZTtcbiAgd29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID0gKHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgZW50aXR5OiBlLCByZXNvdXJjZTogZS5yZXNvdXJjZSwgYW1vdW50IH07XG59XG5cbi8qKiBSZW1vdmUgZXZlcnkgcmV0aXJlZCBzb3VyY2UgYWZ0ZXIgdmVyaWZpZWQgaGlzdG9yaWNhbCByZXBsYXkuIFRoaXMgbWlncmF0aW9uXG4gKiBjcmVhdGVzIGRldGVybWluaXN0aWMgdG9tYnN0b25lcyBidXQgaXMgbm90IGEgcGxheWVyIGNvbW1hbmQgb3IgcmV2aXNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gcmV0aXJlU3RvbmVFbnRpdGllcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZm9yIChjb25zdCBlIG9mIFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0pIHtcbiAgICBpZiAoIWlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpKSBjb250aW51ZTtcbiAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoZS5pZCk7XG4gICAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoZS5pZCk7XG4gICAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gICAgaWYgKCF3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGUuY2h1bmspKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICBmb3IgKGNvbnN0IFtrZXksIGlkc10gb2Ygd29ybGQuZW50aXR5Q2h1bmtzKSB7XG4gICAgY29uc3QgYWN0aXZlID0gaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpO1xuICAgIGlmIChhY3RpdmUubGVuZ3RoID4gMCB8fCB3b3JsZC5lbnRpdHlDaGFuZ2VzLmhhcyhrZXkpKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgYWN0aXZlKTtcbiAgICBlbHNlIHdvcmxkLmVudGl0eUNodW5rcy5kZWxldGUoa2V5KTtcbiAgfVxuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcGVyc2lzdGVuY2UgLyBhdXRob3JpdHkgYm91bmRhcnkgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZE1hbmlmZXN0IHtcbiAgc2NoZW1hOiAxO1xuICBzZWVkOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIHBhcmFtc0hhc2g6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZm52MWEodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGggPSAweDgxMWM5ZGM1O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcbiAgICBoIF49IHRleHQuY2hhckNvZGVBdChpKTtcbiAgICBoID0gTWF0aC5pbXVsKGgsIDB4MDEwMDAxOTMpO1xuICB9XG4gIHJldHVybiAoaCA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3b3JsZE1hbmlmZXN0KHdvcmxkOiBXb3JsZCk6IFdvcmxkTWFuaWZlc3Qge1xuICBjb25zdCBwID0gd29ybGQucGFyYW1zO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBzZWVkOiB3b3JsZC5zZWVkLFxuICAgIGdlbmVyYXRvclZlcnNpb246IHAuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBzaXplOiBwLnNpemUsXG4gICAgY2h1bmtTaXplOiBwLmNodW5rU2l6ZSxcbiAgICB5TWluOiBwLnlNaW4sXG4gICAgeU1heDogcC55TWF4LFxuICAgIHNlYUxldmVsOiBwLnNlYUxldmVsLFxuICAgIHBhcmFtc0hhc2g6IGZudjFhKEpTT04uc3RyaW5naWZ5KHApKSxcbiAgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbEVkaXQgeyBpOiBudW1iZXI7IG06IG51bWJlcjsgfVxuZXhwb3J0IGludGVyZmFjZSBDaHVua0RlbHRhIHtcbiAgc2NoZW1hOiAxO1xuICBrZXk6IHN0cmluZztcbiAgYmFzZVZlcnNpb246IG51bWJlcjtcbiAgZWRpdHM6IFZveGVsRWRpdFtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwb3J0Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogQ2h1bmtEZWx0YSB7XG4gIGNvbnN0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGtleSk7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIGtleSxcbiAgICBiYXNlVmVyc2lvbjogd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sXG4gICAgZWRpdHM6IGVkaXRzID8gWy4uLmVkaXRzLmVudHJpZXMoKV0ubWFwKChbaSwgbV0pID0+ICh7IGksIG0gfSkpLnNvcnQoKGEsIGIpID0+IGEuaSAtIGIuaSkgOiBbXSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGRlbHRhOiBDaHVua0RlbHRhKTogdm9pZCB7XG4gIGNvbnN0IFtjeCwgY3pdID0gZGVsdGEua2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gIGZvciAoY29uc3QgZSBvZiBkZWx0YS5lZGl0cykge1xuICAgIGNvbnN0IHlJbmRleCA9IE1hdGguZmxvb3IoZS5pIC8gQ0hVTktfQVJFQSk7XG4gICAgY29uc3QgcmVtID0gZS5pICUgQ0hVTktfQVJFQTtcbiAgICBjb25zdCBseiA9IE1hdGguZmxvb3IocmVtIC8gQ0hVTktfU0laRSk7XG4gICAgY29uc3QgbHggPSByZW0gJSBDSFVOS19TSVpFO1xuICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY3gpICsgbHg7XG4gICAgY29uc3QgeSA9IFlfTUlOICsgeUluZGV4O1xuICAgIGNvbnN0IHogPSBjaHVua09yaWdpblooY3opICsgbHo7XG4gICAgc2V0Vm94ZWwod29ybGQsIHgsIHksIHosIGUubSBhcyBNYXRJZCk7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSB0aW1lIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgVGltZVN0YXRlIHsgdDogbnVtYmVyOyBkYXlMZW5ndGhTZWM6IG51bWJlcjsgcGF1c2VkOiBib29sZWFuOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBhZHZhbmNlVGltZShzOiBUaW1lU3RhdGUsIGR0OiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKHMucGF1c2VkKSByZXR1cm47XG4gIHMudCA9IChzLnQgKyBkdCAvIHMuZGF5TGVuZ3RoU2VjKSAlIDE7XG59XG4iLCAiLy8gUmVuZGVyLW9ubHkgc2V0dGxlbWVudCBsaWZlIHBhbmVsLiBUaGUgc2Vzc2lvbiBvd25zIGV2ZXJ5IHN0YXRlIHRyYW5zaXRpb247XG4vLyB0aGVzZSBjb250cm9scyBvbmx5IGVtaXQgaW50ZW50cyBhbmQgcmVuZGVyIHRoZSBsYXRlc3QgYXV0aG9yaXRhdGl2ZSB3b3JsZC5cbmltcG9ydCB7XG4gIENBUlJJRURfQ0FQQUNJVFksIENST1BfUExPVF9JRFMsIEZPVU5ERVJfU1RPQ0tQSUxFX0lELCBMSUZFX1JFU09VUkNFUyxcbiAgTGlmZVJlc291cmNlLCBNQVhfUFJPRFVDVElPTl9KT0JTLCBSRUNJUEVTLCBSZWNpcGVJZCwgU1RPQ0tQSUxFX0NBUEFDSVRZLFxuICBjcm9wUmVhZHksXG59IGZyb20gJy4uL3NpbS9lY29ub215JztcbmltcG9ydCB0eXBlIHsgV29ybGQgfSBmcm9tICcuLi9zaW0vd29ybGQnO1xuXG5leHBvcnQgdHlwZSBMaWZlSW50ZW50ID1cbiAgfCB7IHR5cGU6ICdkZXBvc2l0JyB8ICd3aXRoZHJhdyc7IHJlc291cmNlOiBMaWZlUmVzb3VyY2U7IGFtb3VudDogbnVtYmVyIH1cbiAgfCB7IHR5cGU6ICdwcm9kdWNlJzsgcmVjaXBlOiBSZWNpcGVJZCB9XG4gIHwgeyB0eXBlOiAndGljayc7IHRpY2tzOiBudW1iZXIgfVxuICB8IHsgdHlwZTogJ3BsYW50JyB8ICdoYXJ2ZXN0X2Nyb3AnOyBwbG90SWQ6IHN0cmluZyB9O1xuXG5leHBvcnQgaW50ZXJmYWNlIExpZmVQYW5lbENhbGxiYWNrcyB7XG4gIG9uSW50ZW50KGludGVudDogTGlmZUludGVudCk6IHZvaWQ7XG4gIG9uVG9hc3Q/KG1lc3NhZ2U6IHN0cmluZywga2luZDogJ2dvb2QnIHwgJ3dhcm4nIHwgJ2JhZCcpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgVHJhbnNmZXJDb250cm9scyB7XG4gIHNlbGVjdDogSFRNTFNlbGVjdEVsZW1lbnQ7XG4gIGlucHV0OiBIVE1MSW5wdXRFbGVtZW50O1xuICBidXR0b246IEhUTUxCdXR0b25FbGVtZW50O1xufVxuXG5mdW5jdGlvbiBlbGVtZW50PEsgZXh0ZW5kcyBrZXlvZiBIVE1MRWxlbWVudFRhZ05hbWVNYXA+KFxuICB0YWc6IEssIGNsYXNzTmFtZT86IHN0cmluZywgdGV4dD86IHN0cmluZyxcbik6IEhUTUxFbGVtZW50VGFnTmFtZU1hcFtLXSB7XG4gIGNvbnN0IG5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRhZyk7XG4gIGlmIChjbGFzc05hbWUpIG5vZGUuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICBpZiAodGV4dCAhPT0gdW5kZWZpbmVkKSBub2RlLnRleHRDb250ZW50ID0gdGV4dDtcbiAgcmV0dXJuIG5vZGU7XG59XG5cbmZ1bmN0aW9uIGJ1dHRvbih0ZXh0OiBzdHJpbmcsIGFjdGlvbjogc3RyaW5nKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICBjb25zdCBub2RlID0gZWxlbWVudCgnYnV0dG9uJywgdW5kZWZpbmVkLCB0ZXh0KTtcbiAgbm9kZS50eXBlID0gJ2J1dHRvbic7XG4gIG5vZGUuZGF0YXNldC5hY3Rpb24gPSBhY3Rpb247XG4gIHJldHVybiBub2RlO1xufVxuXG5leHBvcnQgY2xhc3MgTGlmZVBhbmVsIHtcbiAgcHJpdmF0ZSByZWFkb25seSByb290OiBIVE1MRWxlbWVudDtcbiAgcHJpdmF0ZSByZWFkb25seSBib2R5OiBIVE1MRWxlbWVudDtcbiAgcHJpdmF0ZSByZWFkb25seSB0b2FzdEVsOiBIVE1MRWxlbWVudDtcbiAgcHJpdmF0ZSByZWFkb25seSB0cmFuc2ZlckNvbnRyb2xzID0gbmV3IE1hcDwnZGVwb3NpdCcgfCAnd2l0aGRyYXcnLCBUcmFuc2ZlckNvbnRyb2xzPigpO1xuICBwcml2YXRlIHJlYWRvbmx5IGNhcnJpZWRWYWx1ZXMgPSBuZXcgTWFwPExpZmVSZXNvdXJjZSwgSFRNTEVsZW1lbnQ+KCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgc3RvY2tWYWx1ZXMgPSBuZXcgTWFwPExpZmVSZXNvdXJjZSwgSFRNTEVsZW1lbnQ+KCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjZUJ1dHRvbnMgPSBuZXcgTWFwPFJlY2lwZUlkLCBIVE1MQnV0dG9uRWxlbWVudD4oKTtcbiAgcHJpdmF0ZSByZWFkb25seSBjcm9wQnV0dG9ucyA9IG5ldyBNYXA8c3RyaW5nLCBIVE1MQnV0dG9uRWxlbWVudD4oKTtcbiAgcHJpdmF0ZSByZWFkb25seSB0aWNrQnV0dG9uczogSFRNTEJ1dHRvbkVsZW1lbnRbXSA9IFtdO1xuICBwcml2YXRlIGNhcnJpZWRDYXBhY2l0eSE6IEhUTUxFbGVtZW50O1xuICBwcml2YXRlIHN0b2NrQ2FwYWNpdHkhOiBIVE1MRWxlbWVudDtcbiAgcHJpdmF0ZSBqb2JzITogSFRNTEVsZW1lbnQ7XG4gIHByaXZhdGUgdGljayE6IEhUTUxFbGVtZW50O1xuICBwcml2YXRlIGZhcm1TdGF0dXMhOiBIVE1MRWxlbWVudDtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGNhbGxiYWNrczogTGlmZVBhbmVsQ2FsbGJhY2tzKSB7XG4gICAgdGhpcy5yb290ID0gZWxlbWVudCgnc2VjdGlvbicsICdsaWZlLXBhbmVsJyk7XG4gICAgdGhpcy5yb290LmlkID0gJ2xpZmUtcGFuZWwnO1xuICAgIHRoaXMucm9vdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnU2V0dGxlbWVudCcpO1xuICAgIC8vIFdvcmxkIG1vZGUgb3ducyB0aGUgcGFuZWwgYnkgZGVmYXVsdDsgY2xlYW4gbW9kZSBoaWRlcyBpdCBleHBsaWNpdGx5LlxuICAgIHRoaXMucm9vdC5oaWRkZW4gPSBmYWxzZTtcblxuICAgIGNvbnN0IGhlYWRlciA9IGVsZW1lbnQoJ2hlYWRlcicsICdsaWZlLWhlYWQnKTtcbiAgICBoZWFkZXIuYXBwZW5kKGVsZW1lbnQoJ2gyJywgdW5kZWZpbmVkLCAnU2V0dGxlbWVudCcpKTtcbiAgICB0aGlzLnJvb3QuYXBwZW5kKGhlYWRlcik7XG5cbiAgICB0aGlzLmJvZHkgPSBlbGVtZW50KCdkaXYnLCAnbGlmZS1ib2R5Jyk7XG4gICAgY29uc3QgdW5hdmFpbGFibGUgPSBlbGVtZW50KCdwJywgJ2xpZmUtdW5hdmFpbGFibGUnLFxuICAgICAgJ1NldHRsZW1lbnQgbGlmZSBpcyB1bmF2YWlsYWJsZSBpbiB0aGlzIGxlZ2FjeSB3b3JsZC4nKTtcbiAgICB0aGlzLmJvZHkuYXBwZW5kKHVuYXZhaWxhYmxlLCB0aGlzLm1ha2VCYWdTZWN0aW9uKCdjYXJyaWVkJywgJ0dhdGhlcmVkIFx1MDBCNyBjYXJyaWVkIGJhZycsXG4gICAgICBDQVJSSUVEX0NBUEFDSVRZLCB0aGlzLmNhcnJpZWRWYWx1ZXMpLCB0aGlzLm1ha2VCYWdTZWN0aW9uKCdzdG9ja3BpbGUnLCAnRm91bmRlciBzdG9ja3BpbGUnLFxuICAgICAgU1RPQ0tQSUxFX0NBUEFDSVRZLCB0aGlzLnN0b2NrVmFsdWVzKSwgdGhpcy5tYWtlVHJhbnNmZXJzKCksIHRoaXMubWFrZVByb2R1Y3Rpb24oKSxcbiAgICAgIHRoaXMubWFrZUNyb3BzKCkpO1xuICAgIHRoaXMucm9vdC5hcHBlbmQodGhpcy5ib2R5KTtcblxuICAgIHRoaXMudG9hc3RFbCA9IGVsZW1lbnQoJ2RpdicsICdsaWZlLXRvYXN0Jyk7XG4gICAgdGhpcy50b2FzdEVsLmlkID0gJ2xpZmUtdG9hc3QnO1xuICAgIHRoaXMudG9hc3RFbC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnc3RhdHVzJyk7XG4gICAgdGhpcy50b2FzdEVsLnNldEF0dHJpYnV0ZSgnYXJpYS1saXZlJywgJ3BvbGl0ZScpO1xuICAgIHRoaXMudG9hc3RFbC5oaWRkZW4gPSB0cnVlO1xuXG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmQodGhpcy5yb290LCB0aGlzLnRvYXN0RWwpO1xuICB9XG5cbiAgcHJpdmF0ZSBtYWtlQmFnU2VjdGlvbihcbiAgICBpZDogJ2NhcnJpZWQnIHwgJ3N0b2NrcGlsZScsIHRpdGxlOiBzdHJpbmcsIGNhcGFjaXR5OiBudW1iZXIsXG4gICAgdmFsdWVzOiBNYXA8TGlmZVJlc291cmNlLCBIVE1MRWxlbWVudD4sXG4gICk6IEhUTUxFbGVtZW50IHtcbiAgICBjb25zdCBzZWN0aW9uID0gZWxlbWVudCgnc2VjdGlvbicsIGBsaWZlLWJhZyBsaWZlLSR7aWR9YCk7XG4gICAgc2VjdGlvbi5kYXRhc2V0LmJhZyA9IGlkO1xuICAgIHNlY3Rpb24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGl0bGUpO1xuICAgIGNvbnN0IGhlYWRpbmcgPSBlbGVtZW50KCdoMycsIHVuZGVmaW5lZCwgdGl0bGUpO1xuICAgIGNvbnN0IHRvdGFsID0gZWxlbWVudCgnc3Ryb25nJywgJ2xpZmUtY2FwYWNpdHknLCBgMCAvICR7Y2FwYWNpdHl9YCk7XG4gICAgdG90YWwuZGF0YXNldC5jYXBhY2l0eSA9IGlkO1xuICAgIGlmIChpZCA9PT0gJ2NhcnJpZWQnKSB0aGlzLmNhcnJpZWRDYXBhY2l0eSA9IHRvdGFsO1xuICAgIGVsc2UgdGhpcy5zdG9ja0NhcGFjaXR5ID0gdG90YWw7XG4gICAgaGVhZGluZy5hcHBlbmQodG90YWwpO1xuICAgIHNlY3Rpb24uYXBwZW5kKGhlYWRpbmcpO1xuICAgIGNvbnN0IGxpc3QgPSBlbGVtZW50KCdkbCcsICdsaWZlLXJlc291cmNlcycpO1xuICAgIGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgTElGRV9SRVNPVVJDRVMpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gZWxlbWVudCgnZGQnLCAnbGlmZS1yZXNvdXJjZS12YWx1ZScsICcwJyk7XG4gICAgICB2YWx1ZS5kYXRhc2V0LnJlc291cmNlID0gcmVzb3VyY2U7XG4gICAgICB2YWx1ZXMuc2V0KHJlc291cmNlLCB2YWx1ZSk7XG4gICAgICBjb25zdCBsYWJlbCA9IGVsZW1lbnQoJ2R0JywgdW5kZWZpbmVkLCByZXNvdXJjZSk7XG4gICAgICBjb25zdCByb3cgPSBlbGVtZW50KCdkaXYnLCAnbGlmZS1yZXNvdXJjZScpO1xuICAgICAgcm93LmRhdGFzZXQucmVzb3VyY2UgPSByZXNvdXJjZTtcbiAgICAgIHJvdy5hcHBlbmQobGFiZWwsIHZhbHVlKTtcbiAgICAgIGxpc3QuYXBwZW5kKHJvdyk7XG4gICAgfVxuICAgIHNlY3Rpb24uYXBwZW5kKGxpc3QpO1xuICAgIHJldHVybiBzZWN0aW9uO1xuICB9XG5cbiAgcHJpdmF0ZSBtYWtlVHJhbnNmZXJzKCk6IEhUTUxFbGVtZW50IHtcbiAgICBjb25zdCBzZWN0aW9uID0gZWxlbWVudCgnc2VjdGlvbicsICdsaWZlLXRyYW5zZmVycycpO1xuICAgIHNlY3Rpb24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ01vdmUgcmVzb3VyY2VzJyk7XG4gICAgc2VjdGlvbi5hcHBlbmQoZWxlbWVudCgnaDMnLCB1bmRlZmluZWQsICdNb3ZlIHJlc291cmNlcycpKTtcbiAgICBzZWN0aW9uLmFwcGVuZCh0aGlzLm1ha2VUcmFuc2ZlcignZGVwb3NpdCcsICdmaWJlcicpKTtcbiAgICBzZWN0aW9uLmFwcGVuZCh0aGlzLm1ha2VUcmFuc2Zlcignd2l0aGRyYXcnLCAnZm9vZCcpKTtcbiAgICByZXR1cm4gc2VjdGlvbjtcbiAgfVxuXG4gIHByaXZhdGUgbWFrZVRyYW5zZmVyKHR5cGU6ICdkZXBvc2l0JyB8ICd3aXRoZHJhdycsIGRlZmF1bHRSZXNvdXJjZTogTGlmZVJlc291cmNlKTogSFRNTEVsZW1lbnQge1xuICAgIGNvbnN0IHJvdyA9IGVsZW1lbnQoJ2RpdicsIGBsaWZlLXRyYW5zZmVyIGxpZmUtJHt0eXBlfWApO1xuICAgIHJvdy5kYXRhc2V0LnRyYW5zZmVyID0gdHlwZTtcbiAgICBjb25zdCB0aXRsZSA9IHR5cGUgPT09ICdkZXBvc2l0JyA/ICdEZXBvc2l0IHRvIHN0b2NrcGlsZScgOiAnV2l0aGRyYXcgdG8gYmFnJztcbiAgICByb3cuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGl0bGUpO1xuICAgIGNvbnN0IGlkID0gYGxpZmUtJHt0eXBlfWA7XG4gICAgY29uc3QgcmVzb3VyY2VMYWJlbCA9IGVsZW1lbnQoJ2xhYmVsJywgdW5kZWZpbmVkLCBgJHt0aXRsZX0gcmVzb3VyY2VgKTtcbiAgICByZXNvdXJjZUxhYmVsLmh0bWxGb3IgPSBgJHtpZH0tcmVzb3VyY2VgO1xuICAgIGNvbnN0IHNlbGVjdCA9IGVsZW1lbnQoJ3NlbGVjdCcpO1xuICAgIHNlbGVjdC5pZCA9IGAke2lkfS1yZXNvdXJjZWA7XG4gICAgc2VsZWN0Lm5hbWUgPSBgJHt0eXBlfS1yZXNvdXJjZWA7XG4gICAgc2VsZWN0LmRhdGFzZXQucmVzb3VyY2UgPSB0eXBlO1xuICAgIHNlbGVjdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBgJHt0aXRsZX0gcmVzb3VyY2VgKTtcbiAgICBmb3IgKGNvbnN0IHJlc291cmNlIG9mIExJRkVfUkVTT1VSQ0VTKSB7XG4gICAgICBjb25zdCBvcHRpb24gPSBlbGVtZW50KCdvcHRpb24nLCB1bmRlZmluZWQsIHJlc291cmNlKTtcbiAgICAgIG9wdGlvbi52YWx1ZSA9IHJlc291cmNlO1xuICAgICAgc2VsZWN0LmFwcGVuZChvcHRpb24pO1xuICAgIH1cbiAgICBzZWxlY3QudmFsdWUgPSBkZWZhdWx0UmVzb3VyY2U7XG4gICAgcmVzb3VyY2VMYWJlbC5hcHBlbmQoc2VsZWN0KTtcblxuICAgIGNvbnN0IGFtb3VudExhYmVsID0gZWxlbWVudCgnbGFiZWwnLCB1bmRlZmluZWQsICdBbW91bnQnKTtcbiAgICBhbW91bnRMYWJlbC5odG1sRm9yID0gYCR7aWR9LWFtb3VudGA7XG4gICAgY29uc3QgaW5wdXQgPSBlbGVtZW50KCdpbnB1dCcpO1xuICAgIGlucHV0LmlkID0gYCR7aWR9LWFtb3VudGA7XG4gICAgaW5wdXQubmFtZSA9IGAke3R5cGV9LWFtb3VudGA7XG4gICAgaW5wdXQudHlwZSA9ICdudW1iZXInO1xuICAgIGlucHV0Lm1pbiA9ICcxJztcbiAgICBpbnB1dC5zdGVwID0gJzEnO1xuICAgIGlucHV0LnJlcXVpcmVkID0gdHJ1ZTtcbiAgICBpbnB1dC52YWx1ZSA9ICcyJztcbiAgICBpbnB1dC5kYXRhc2V0LmFtb3VudCA9IHR5cGU7XG4gICAgYW1vdW50TGFiZWwuYXBwZW5kKGlucHV0KTtcblxuICAgIGNvbnN0IGFjdGlvbiA9IGJ1dHRvbih0eXBlID09PSAnZGVwb3NpdCcgPyAnRGVwb3NpdCcgOiAnV2l0aGRyYXcnLCB0eXBlKTtcbiAgICBhY3Rpb24uZGF0YXNldC5yZXNvdXJjZSA9IHR5cGU7XG4gICAgYWN0aW9uLmRhdGFzZXQuYW1vdW50ID0gdHlwZTtcbiAgICBhY3Rpb24uZGlzYWJsZWQgPSB0cnVlO1xuICAgIGFjdGlvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgIGNvbnN0IHJlc291cmNlID0gc2VsZWN0LnZhbHVlIGFzIExpZmVSZXNvdXJjZTtcbiAgICAgIGNvbnN0IHJhdyA9IGlucHV0LnZhbHVlLnRyaW0oKTtcbiAgICAgIGNvbnN0IGFtb3VudCA9IE51bWJlcihyYXcpO1xuICAgICAgaWYgKCFMSUZFX1JFU09VUkNFUy5pbmNsdWRlcyhyZXNvdXJjZSkgfHwgcmF3ID09PSAnJ1xuICAgICAgICB8fCAhTnVtYmVyLmlzU2FmZUludGVnZXIoYW1vdW50KSB8fCBhbW91bnQgPD0gMCkge1xuICAgICAgICBpbnB1dC5zZXRDdXN0b21WYWxpZGl0eSgnRW50ZXIgYSBwb3NpdGl2ZSB3aG9sZS1udW1iZXIgYW1vdW50LicpO1xuICAgICAgICBpbnB1dC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaW52YWxpZCcsICd0cnVlJyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlucHV0LnNldEN1c3RvbVZhbGlkaXR5KCcnKTtcbiAgICAgIGlucHV0LnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1pbnZhbGlkJyk7XG4gICAgICB0aGlzLmNhbGxiYWNrcy5vbkludGVudCh7IHR5cGUsIHJlc291cmNlLCBhbW91bnQgfSk7XG4gICAgfSk7XG4gICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoKSA9PiB7XG4gICAgICBpbnB1dC5zZXRDdXN0b21WYWxpZGl0eSgnJyk7XG4gICAgICBpbnB1dC5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtaW52YWxpZCcpO1xuICAgIH0pO1xuICAgIHNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgICBhY3Rpb24uZGF0YXNldC5yZXNvdXJjZSA9IHNlbGVjdC52YWx1ZTtcbiAgICB9KTtcblxuICAgIHRoaXMudHJhbnNmZXJDb250cm9scy5zZXQodHlwZSwgeyBzZWxlY3QsIGlucHV0LCBidXR0b246IGFjdGlvbiB9KTtcbiAgICByb3cuYXBwZW5kKHJlc291cmNlTGFiZWwsIGFtb3VudExhYmVsLCBhY3Rpb24pO1xuICAgIHJldHVybiByb3c7XG4gIH1cblxuICBwcml2YXRlIG1ha2VQcm9kdWN0aW9uKCk6IEhUTUxFbGVtZW50IHtcbiAgICBjb25zdCBzZWN0aW9uID0gZWxlbWVudCgnc2VjdGlvbicsICdsaWZlLXByb2R1Y3Rpb24nKTtcbiAgICBzZWN0aW9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdQcm9jZXNzaW5nIGFuZCB0aWNrcycpO1xuICAgIHNlY3Rpb24uYXBwZW5kKGVsZW1lbnQoJ2gzJywgdW5kZWZpbmVkLCAnUHJvY2Vzc2luZycpKTtcbiAgICB0aGlzLmpvYnMgPSBlbGVtZW50KCdwJywgJ2xpZmUtam9icycpO1xuICAgIHRoaXMuam9icy5kYXRhc2V0LmpvYnMgPSAnJztcbiAgICB0aGlzLnRpY2sgPSBlbGVtZW50KCdwJywgJ2xpZmUtdGljaycpO1xuICAgIHRoaXMudGljay5kYXRhc2V0LnRpY2sgPSAnJztcbiAgICBzZWN0aW9uLmFwcGVuZCh0aGlzLmpvYnMsIHRoaXMudGljayk7XG5cbiAgICBmb3IgKGNvbnN0IHJlY2lwZUlkIG9mIFsnc2VlZCcsICdyYXRpb25zJ10gYXMgY29uc3QpIHtcbiAgICAgIGNvbnN0IHJlY2lwZSA9IFJFQ0lQRVNbcmVjaXBlSWRdO1xuICAgICAgY29uc3QgW2lucHV0LCBpbnB1dEFtb3VudF0gPSBPYmplY3QuZW50cmllcyhyZWNpcGUuaW5wdXQpWzBdO1xuICAgICAgY29uc3QgW291dHB1dCwgb3V0cHV0QW1vdW50XSA9IE9iamVjdC5lbnRyaWVzKHJlY2lwZS5vdXRwdXQpWzBdO1xuICAgICAgY29uc3QgYWN0aW9uID0gYnV0dG9uKFxuICAgICAgICBgTWFrZSAke3JlY2lwZUlkfTogJHtpbnB1dEFtb3VudH0gJHtpbnB1dH0gXHUyMTkyICR7b3V0cHV0QW1vdW50fSAke291dHB1dH0gXHUwMEI3ICR7cmVjaXBlLnRpY2tzfSAke3JlY2lwZS50aWNrcyA9PT0gMSA/ICd0aWNrJyA6ICd0aWNrcyd9YCxcbiAgICAgICAgJ3Byb2R1Y2UnLFxuICAgICAgKTtcbiAgICAgIGFjdGlvbi5kYXRhc2V0LnJlY2lwZSA9IHJlY2lwZUlkO1xuICAgICAgYWN0aW9uLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgIGFjdGlvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgdGhpcy5jYWxsYmFja3Mub25JbnRlbnQoeyB0eXBlOiAncHJvZHVjZScsIHJlY2lwZTogcmVjaXBlSWQgfSk7XG4gICAgICB9KTtcbiAgICAgIHRoaXMucHJvZHVjZUJ1dHRvbnMuc2V0KHJlY2lwZUlkLCBhY3Rpb24pO1xuICAgICAgc2VjdGlvbi5hcHBlbmQoYWN0aW9uKTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHRpY2tzIG9mIFsxLCA0XSkge1xuICAgICAgY29uc3QgYWN0aW9uID0gYnV0dG9uKGArJHt0aWNrc30gJHt0aWNrcyA9PT0gMSA/ICd0aWNrJyA6ICd0aWNrcyd9YCwgJ3RpY2snKTtcbiAgICAgIGFjdGlvbi5kYXRhc2V0LnRpY2tzID0gU3RyaW5nKHRpY2tzKTtcbiAgICAgIGFjdGlvbi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICBhY3Rpb24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB0aGlzLmNhbGxiYWNrcy5vbkludGVudCh7IHR5cGU6ICd0aWNrJywgdGlja3MgfSkpO1xuICAgICAgdGhpcy50aWNrQnV0dG9ucy5wdXNoKGFjdGlvbik7XG4gICAgICBzZWN0aW9uLmFwcGVuZChhY3Rpb24pO1xuICAgIH1cbiAgICByZXR1cm4gc2VjdGlvbjtcbiAgfVxuXG4gIHByaXZhdGUgbWFrZUNyb3BzKCk6IEhUTUxFbGVtZW50IHtcbiAgICBjb25zdCBzZWN0aW9uID0gZWxlbWVudCgnc2VjdGlvbicsICdsaWZlLWNyb3BzJyk7XG4gICAgc2VjdGlvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnVGVycmFjZWQgZmFybSBjcm9wcycpO1xuICAgIHNlY3Rpb24uYXBwZW5kKGVsZW1lbnQoJ2gzJywgdW5kZWZpbmVkLCAnVGVycmFjZWQgZmFybSBjcm9wcycpKTtcbiAgICB0aGlzLmZhcm1TdGF0dXMgPSBlbGVtZW50KCdwJywgJ2xpZmUtZmFybS1zdGF0dXMnKTtcbiAgICB0aGlzLmZhcm1TdGF0dXMuZGF0YXNldC5mYXJtID0gJyc7XG4gICAgc2VjdGlvbi5hcHBlbmQodGhpcy5mYXJtU3RhdHVzKTtcbiAgICBjb25zdCBwbG90cyA9IGVsZW1lbnQoJ2RpdicsICdsaWZlLXBsb3RzJyk7XG4gICAgZm9yIChjb25zdCBwbG90SWQgb2YgQ1JPUF9QTE9UX0lEUykge1xuICAgICAgY29uc3QgYWN0aW9uID0gYnV0dG9uKCdQbGFudCAxIHNlZWQnLCAncGxhbnQnKTtcbiAgICAgIGFjdGlvbi5kYXRhc2V0LnBsb3QgPSBwbG90SWQ7XG4gICAgICBhY3Rpb24uZGF0YXNldC5hY3Rpb24gPSAncGxhbnQnO1xuICAgICAgYWN0aW9uLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgIGFjdGlvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgdGhpcy5jYWxsYmFja3Mub25JbnRlbnQoe1xuICAgICAgICAgIHR5cGU6IGFjdGlvbi5kYXRhc2V0LmFjdGlvbiA9PT0gJ2hhcnZlc3RfY3JvcCcgPyAnaGFydmVzdF9jcm9wJyA6ICdwbGFudCcsIHBsb3RJZCxcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICAgIHRoaXMuY3JvcEJ1dHRvbnMuc2V0KHBsb3RJZCwgYWN0aW9uKTtcbiAgICAgIHBsb3RzLmFwcGVuZChhY3Rpb24pO1xuICAgIH1cbiAgICBzZWN0aW9uLmFwcGVuZChwbG90cyk7XG4gICAgcmV0dXJuIHNlY3Rpb247XG4gIH1cblxuICByZW5kZXIod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gICAgY29uc3QgbGlmZSA9IHdvcmxkLmxpZmU7XG4gICAgdGhpcy5ib2R5LmRhdGFzZXQuYXZhaWxhYmxlID0gU3RyaW5nKEJvb2xlYW4obGlmZSkpO1xuICAgIHRoaXMucm9vdC5jbGFzc0xpc3QudG9nZ2xlKCdpcy1sZWdhY3knLCAhbGlmZSk7XG4gICAgY29uc3QgdW5hdmFpbGFibGUgPSB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5saWZlLXVuYXZhaWxhYmxlJyk7XG4gICAgaWYgKHVuYXZhaWxhYmxlKSB1bmF2YWlsYWJsZS5oaWRkZW4gPSBCb29sZWFuKGxpZmUpO1xuXG4gICAgY29uc3QgY2FycmllZFZhbHVlczogUmVjb3JkPHN0cmluZywgbnVtYmVyIHwgbnVsbD4gPSB7fTtcbiAgICBjb25zdCBzdG9ja1ZhbHVlczogUmVjb3JkPHN0cmluZywgbnVtYmVyIHwgbnVsbD4gPSB7fTtcbiAgICBpZiAobGlmZSkge1xuICAgICAgY29uc3Qgc3RvY2sgPSBsaWZlLnN0b2NrcGlsZXMuZ2V0KEZPVU5ERVJfU1RPQ0tQSUxFX0lEKTtcbiAgICAgIGNvbnN0IGludmVudG9yeSA9IHN0b2NrPy5pbnZlbnRvcnkgPz8ge307XG4gICAgICBmb3IgKGNvbnN0IHJlc291cmNlIG9mIExJRkVfUkVTT1VSQ0VTKSB7XG4gICAgICAgIGNhcnJpZWRWYWx1ZXNbcmVzb3VyY2VdID0gd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwO1xuICAgICAgICBzdG9ja1ZhbHVlc1tyZXNvdXJjZV0gPSBzdG9jayA/IGludmVudG9yeVtyZXNvdXJjZV0gPz8gMCA6IG51bGw7XG4gICAgICB9XG4gICAgICB0aGlzLmNhcnJpZWRDYXBhY2l0eS50ZXh0Q29udGVudCA9IGAke09iamVjdC52YWx1ZXMod29ybGQuaW52ZW50b3J5KS5yZWR1Y2UoKHN1bSwgbikgPT4gc3VtICsgbiwgMCl9IC8gJHtDQVJSSUVEX0NBUEFDSVRZfWA7XG4gICAgICB0aGlzLnN0b2NrQ2FwYWNpdHkudGV4dENvbnRlbnQgPSBzdG9ja1xuICAgICAgICA/IGAke09iamVjdC52YWx1ZXMoaW52ZW50b3J5KS5yZWR1Y2UoKHN1bSwgbikgPT4gc3VtICsgbiwgMCl9IC8gJHtTVE9DS1BJTEVfQ0FQQUNJVFl9YFxuICAgICAgICA6ICdVbmF2YWlsYWJsZSc7XG4gICAgICB0aGlzLmpvYnMudGV4dENvbnRlbnQgPSBgJHtsaWZlLmpvYnMuc2l6ZX0gLyAke01BWF9QUk9EVUNUSU9OX0pPQlN9IGFjdGl2ZSBqb2JzYDtcbiAgICAgIHRoaXMudGljay50ZXh0Q29udGVudCA9IGBTZXR0bGVtZW50IHRpY2sgJHtsaWZlLnRpY2t9YDtcbiAgICAgIGNvbnN0IGhhc0Zhcm0gPSBbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV0uc29tZSgoc3RydWN0dXJlKSA9PiBzdHJ1Y3R1cmUua2luZCA9PT0gJ3RlcnJhY2UnKTtcbiAgICAgIHRoaXMuZmFybVN0YXR1cy50ZXh0Q29udGVudCA9IGhhc0Zhcm0gPyAnRm91bmRlciB0ZXJyYWNlZCBmYXJtIFx1MDBCNyA5IHBsb3RzJyA6ICdGYXJtIG1pc3NpbmcnO1xuICAgICAgdGhpcy5mYXJtU3RhdHVzLmRhdGFzZXQuZmFybSA9IGhhc0Zhcm0gPyAncHJlc2VudCcgOiAnbWlzc2luZyc7XG5cbiAgICAgIGZvciAoY29uc3QgW3JlY2lwZUlkLCBhY3Rpb25dIG9mIHRoaXMucHJvZHVjZUJ1dHRvbnMpIHtcbiAgICAgICAgY29uc3QgZW5vdWdoSW5wdXQgPSBPYmplY3QuZW50cmllcyhSRUNJUEVTW3JlY2lwZUlkXS5pbnB1dClcbiAgICAgICAgICAuZXZlcnkoKFtyZXNvdXJjZSwgYW1vdW50XSkgPT4gKGludmVudG9yeVtyZXNvdXJjZV0gPz8gMCkgPj0gKGFtb3VudCA/PyAwKSk7XG4gICAgICAgIGFjdGlvbi5kaXNhYmxlZCA9ICFzdG9jayB8fCBsaWZlLmpvYnMuc2l6ZSA+PSBNQVhfUFJPRFVDVElPTl9KT0JTIHx8ICFlbm91Z2hJbnB1dDtcbiAgICAgIH1cbiAgICAgIGZvciAoY29uc3QgYWN0aW9uIG9mIHRoaXMudGlja0J1dHRvbnMpIGFjdGlvbi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgZm9yIChjb25zdCBwbG90SWQgb2YgQ1JPUF9QTE9UX0lEUykge1xuICAgICAgICBjb25zdCBhY3Rpb24gPSB0aGlzLmNyb3BCdXR0b25zLmdldChwbG90SWQpITtcbiAgICAgICAgY29uc3QgY3JvcCA9IGxpZmUuY3JvcHMuZ2V0KHBsb3RJZCk7XG4gICAgICAgIGlmICghY3JvcCkge1xuICAgICAgICAgIGFjdGlvbi5kYXRhc2V0LmFjdGlvbiA9ICdwbGFudCc7XG4gICAgICAgICAgYWN0aW9uLnRleHRDb250ZW50ID0gJ1BsYW50IDEgc2VlZCc7XG4gICAgICAgICAgYWN0aW9uLmRpc2FibGVkID0gIWhhc0Zhcm0gfHwgKGludmVudG9yeS5zZWVkID8/IDApIDwgMTtcbiAgICAgICAgfSBlbHNlIGlmIChjcm9wUmVhZHkoY3JvcCwgbGlmZS50aWNrKSkge1xuICAgICAgICAgIGFjdGlvbi5kYXRhc2V0LmFjdGlvbiA9ICdoYXJ2ZXN0X2Nyb3AnO1xuICAgICAgICAgIGFjdGlvbi50ZXh0Q29udGVudCA9ICdIYXJ2ZXN0IGNyb3AnO1xuICAgICAgICAgIGFjdGlvbi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFjdGlvbi5kYXRhc2V0LmFjdGlvbiA9ICdwbGFudCc7XG4gICAgICAgICAgY29uc3QgcmVtYWluaW5nID0gTWF0aC5tYXgoMCwgY3JvcC5wbGFudGVkVGljayArIGNyb3AuZ3Jvd3RoVGlja3MgLSBsaWZlLnRpY2spO1xuICAgICAgICAgIGFjdGlvbi50ZXh0Q29udGVudCA9IGBHcm93aW5nICR7cmVtYWluaW5nfS8ke2Nyb3AuZ3Jvd3RoVGlja3N9IHRpY2tzYDtcbiAgICAgICAgICBhY3Rpb24uZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuY2FycmllZENhcGFjaXR5LnRleHRDb250ZW50ID0gYFVuYXZhaWxhYmxlIC8gJHtDQVJSSUVEX0NBUEFDSVRZfWA7XG4gICAgICB0aGlzLnN0b2NrQ2FwYWNpdHkudGV4dENvbnRlbnQgPSBgVW5hdmFpbGFibGUgLyAke1NUT0NLUElMRV9DQVBBQ0lUWX1gO1xuICAgICAgdGhpcy5qb2JzLnRleHRDb250ZW50ID0gJ0pvYnMgdW5hdmFpbGFibGUnO1xuICAgICAgdGhpcy50aWNrLnRleHRDb250ZW50ID0gJ1NldHRsZW1lbnQgdGljayB1bmF2YWlsYWJsZSc7XG4gICAgICB0aGlzLmZhcm1TdGF0dXMudGV4dENvbnRlbnQgPSAnRmFybSBtaXNzaW5nIFx1MDBCNyBzZXR0bGVtZW50IGxpZmUgdW5hdmFpbGFibGUnO1xuICAgICAgdGhpcy5mYXJtU3RhdHVzLmRhdGFzZXQuZmFybSA9ICdtaXNzaW5nJztcbiAgICAgIGZvciAoY29uc3QgYWN0aW9uIG9mIHRoaXMucHJvZHVjZUJ1dHRvbnMudmFsdWVzKCkpIGFjdGlvbi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICBmb3IgKGNvbnN0IGFjdGlvbiBvZiB0aGlzLnRpY2tCdXR0b25zKSBhY3Rpb24uZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgZm9yIChjb25zdCBwbG90SWQgb2YgQ1JPUF9QTE9UX0lEUykge1xuICAgICAgICBjb25zdCBhY3Rpb24gPSB0aGlzLmNyb3BCdXR0b25zLmdldChwbG90SWQpITtcbiAgICAgICAgYWN0aW9uLmRhdGFzZXQuYWN0aW9uID0gJ3BsYW50JztcbiAgICAgICAgYWN0aW9uLnRleHRDb250ZW50ID0gJ1BsYW50IDEgc2VlZCc7XG4gICAgICAgIGFjdGlvbi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCByZXNvdXJjZSBvZiBMSUZFX1JFU09VUkNFUykge1xuICAgICAgY29uc3QgY2FycmllZCA9IHRoaXMuY2FycmllZFZhbHVlcy5nZXQocmVzb3VyY2UpITtcbiAgICAgIGNvbnN0IHN0b2NrID0gdGhpcy5zdG9ja1ZhbHVlcy5nZXQocmVzb3VyY2UpITtcbiAgICAgIGNhcnJpZWQudGV4dENvbnRlbnQgPSAhbGlmZSA/ICdVbmF2YWlsYWJsZScgOiBTdHJpbmcoY2FycmllZFZhbHVlc1tyZXNvdXJjZV0gPz8gMCk7XG4gICAgICBzdG9jay50ZXh0Q29udGVudCA9ICFsaWZlIHx8IHN0b2NrVmFsdWVzW3Jlc291cmNlXSA9PT0gbnVsbCA/ICdVbmF2YWlsYWJsZScgOiBTdHJpbmcoc3RvY2tWYWx1ZXNbcmVzb3VyY2VdKTtcbiAgICAgIGNhcnJpZWQuZGF0YXNldC52YWx1ZSA9ICFsaWZlID8gJ3VuYXZhaWxhYmxlJyA6IFN0cmluZyhjYXJyaWVkVmFsdWVzW3Jlc291cmNlXSA/PyAwKTtcbiAgICAgIHN0b2NrLmRhdGFzZXQudmFsdWUgPSAhbGlmZSB8fCBzdG9ja1ZhbHVlc1tyZXNvdXJjZV0gPT09IG51bGwgPyAndW5hdmFpbGFibGUnIDogU3RyaW5nKHN0b2NrVmFsdWVzW3Jlc291cmNlXSk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgY29udHJvbHMgb2YgdGhpcy50cmFuc2ZlckNvbnRyb2xzLnZhbHVlcygpKSB7XG4gICAgICBjb250cm9scy5idXR0b24uZGlzYWJsZWQgPSAhbGlmZTtcbiAgICAgIGNvbnRyb2xzLnNlbGVjdC5kaXNhYmxlZCA9ICFsaWZlO1xuICAgICAgY29udHJvbHMuaW5wdXQuZGlzYWJsZWQgPSAhbGlmZTtcbiAgICB9XG4gIH1cblxuICBzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICB0aGlzLnJvb3QuaGlkZGVuID0gIXZpc2libGU7XG4gIH1cblxuICB0b2FzdChtZXNzYWdlOiBzdHJpbmcsIGtpbmQ6ICdnb29kJyB8ICd3YXJuJyB8ICdiYWQnID0gJ2dvb2QnKTogdm9pZCB7XG4gICAgdGhpcy50b2FzdEVsLnRleHRDb250ZW50ID0gbWVzc2FnZTtcbiAgICB0aGlzLnRvYXN0RWwuY2xhc3NOYW1lID0gYGxpZmUtdG9hc3Qgc2hvdyAke2tpbmR9YDtcbiAgICB0aGlzLnRvYXN0RWwuaGlkZGVuID0gZmFsc2U7XG4gICAgdGhpcy5jYWxsYmFja3Mub25Ub2FzdD8uKG1lc3NhZ2UsIGtpbmQpO1xuICB9XG59XG4iLCAiLy8gUGxheWFibGUgc2NoZW1hLTMgbGlmZSBsb29wLiBFdmVyeSB3cml0ZSBpcyBhIEdhbWVTZXNzaW9uIGNvbW1hbmQ7IHRoZSBVSSxcbi8vIG1lc2hlcyBhbmQgcGVyc2lzdGVuY2UgYXJlIGRlcml2ZWQgZnJvbSB0aGUgcmVzdWx0aW5nIGF1dGhvcml0YXRpdmUgd29ybGQuXG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSc7XG5pbXBvcnQgeyBDUk9QX1lJRUxEX0xBQkVMLCBGT1VOREVSX1NUT0NLUElMRV9JRCwgTGlmZVJlc291cmNlLCBjcm9wUmVhZHkgfSBmcm9tICcuLi9zaW0vZWNvbm9teSc7XG5pbXBvcnQgeyBXb3JsZCB9IGZyb20gJy4uL3NpbS93b3JsZCc7XG5pbXBvcnQgeyBidWlsZExpZmVNZXNoZXMsIGRpc3Bvc2VMaWZlTWVzaGVzIH0gZnJvbSAnLi4vcmVuZGVyL2xpZmUnO1xuaW1wb3J0IHsgTGlmZUludGVudCwgTGlmZVBhbmVsIH0gZnJvbSAnLi4vdWkvbGlmZSc7XG5pbXBvcnQgeyBCcm93c2VyU2F2ZVN0b3JlIH0gZnJvbSAnLi9wZXJzaXN0ZW5jZSc7XG5pbXBvcnQgeyBDb21tYW5kLCBHYW1lU2Vzc2lvbiB9IGZyb20gJy4vc2Vzc2lvbic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTGlmZUdhbWVPcHRpb25zIHtcbiAgc2Vzc2lvbjogR2FtZVNlc3Npb247XG4gIHN0b3JlOiBCcm93c2VyU2F2ZVN0b3JlO1xuICBzY2VuZTogVEhSRUUuU2NlbmU7XG4gIHRvYXN0OiAobWVzc2FnZTogc3RyaW5nLCBraW5kOiAnZ29vZCcgfCAnd2FybicgfCAnYmFkJykgPT4gdm9pZDtcbiAgLyoqIENhbGxlZCBhZnRlciBhIHBsYXllciBjb21tYW5kIHdhcyBzYXZlZCBpbW1lZGlhdGVseS4gKi9cbiAgb25TYXZlZD86ICgpID0+IHZvaWQ7XG59XG5cbi8qKiBBIHNuYXBzaG90IGZvciB0aGUgcmVhZC1vbmx5IGJyb3dzZXIgZXZpZGVuY2Ugc3VyZmFjZSwgbmV2ZXIgYSB3cml0ZSBBUEkuICovXG5leHBvcnQgZnVuY3Rpb24gbGlmZU1ldHJpY3Mod29ybGQ6IFdvcmxkKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCBudWxsIHtcbiAgY29uc3QgbGlmZSA9IHdvcmxkLmxpZmU7XG4gIGlmICghbGlmZSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHN0b2NrID0gbGlmZS5zdG9ja3BpbGVzLmdldChGT1VOREVSX1NUT0NLUElMRV9JRCk7XG4gIHJldHVybiB7XG4gICAgdGljazogbGlmZS50aWNrLFxuICAgIHN0b2NrcGlsZTogc3RvY2sgPyB7IC4uLnN0b2NrLCBpbnZlbnRvcnk6IHsgLi4uc3RvY2suaW52ZW50b3J5IH0gfSA6IG51bGwsXG4gICAgam9iczogWy4uLmxpZmUuam9icy52YWx1ZXMoKV0ubWFwKChqb2IpID0+ICh7IC4uLmpvYiB9KSlcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLFxuICAgIGNyb3BzOiBBcnJheS5mcm9tKHsgbGVuZ3RoOiA5IH0sIChfLCBpbmRleCkgPT4ge1xuICAgICAgY29uc3QgaWQgPSBgY3JvcDoke2luZGV4fWA7XG4gICAgICBjb25zdCBjcm9wID0gbGlmZS5jcm9wcy5nZXQoaWQpO1xuICAgICAgcmV0dXJuIGNyb3AgPyB7IC4uLmNyb3AsIHJlYWR5OiBjcm9wUmVhZHkoY3JvcCwgbGlmZS50aWNrKSB9XG4gICAgICAgIDogeyBpZCwgcGxhbnRlZFRpY2s6IG51bGwsIGdyb3d0aFRpY2tzOiBudWxsLCByZWFkeTogZmFsc2UgfTtcbiAgICB9KSxcbiAgfTtcbn1cblxuZXhwb3J0IGNsYXNzIExpZmVHYW1lIHtcbiAgcHJpdmF0ZSByZWFkb25seSBwYW5lbDogTGlmZVBhbmVsO1xuICBwcml2YXRlIHJlYWRvbmx5IG1lc2hlczogVEhSRUUuR3JvdXA7XG4gIHByaXZhdGUgbGFzdFJldmlzaW9uID0gLTE7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBMaWZlR2FtZU9wdGlvbnMpIHtcbiAgICB0aGlzLm1lc2hlcyA9IGJ1aWxkTGlmZU1lc2hlcyhvcHRpb25zLnNlc3Npb24ud29ybGQpO1xuICAgIG9wdGlvbnMuc2NlbmUuYWRkKHRoaXMubWVzaGVzKTtcbiAgICB0aGlzLmxhc3RSZXZpc2lvbiA9IG9wdGlvbnMuc2Vzc2lvbi53b3JsZC5yZXZpc2lvbjtcbiAgICB0aGlzLnBhbmVsID0gbmV3IExpZmVQYW5lbCh7XG4gICAgICBvbkludGVudDogKGludGVudCkgPT4gdGhpcy5zdWJtaXQoaW50ZW50KSxcbiAgICB9KTtcbiAgICB0aGlzLnBhbmVsLnJlbmRlcihvcHRpb25zLnNlc3Npb24ud29ybGQpO1xuICB9XG5cbiAgcHJpdmF0ZSBzdWJtaXQoaW50ZW50OiBMaWZlSW50ZW50KTogdm9pZCB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMub3B0aW9ucy5zZXNzaW9uO1xuICAgIGlmIChzZXNzaW9uLmpvdXJuYWwuc2NoZW1hICE9PSAzKSByZXR1cm47XG4gICAgY29uc3QgdGFyZ2V0ID0gaW50ZW50LnR5cGUgPT09ICdkZXBvc2l0JyB8fCBpbnRlbnQudHlwZSA9PT0gJ3dpdGhkcmF3JyA/IGludGVudC5yZXNvdXJjZVxuICAgICAgOiBpbnRlbnQudHlwZSA9PT0gJ3Byb2R1Y2UnID8gaW50ZW50LnJlY2lwZVxuICAgICAgICA6IGludGVudC50eXBlID09PSAndGljaycgPyBTdHJpbmcoaW50ZW50LnRpY2tzKVxuICAgICAgICAgIDogaW50ZW50LnR5cGUgPT09ICdwbGFudCcgfHwgaW50ZW50LnR5cGUgPT09ICdoYXJ2ZXN0X2Nyb3AnID8gaW50ZW50LnBsb3RJZCA6ICcnO1xuICAgIGNvbnN0IGJhc2UgPSB7XG4gICAgICBzY2hlbWE6IDMgYXMgY29uc3QsXG4gICAgICBpZDogc2Vzc2lvbi5jb21tYW5kSWQoaW50ZW50LnR5cGUsIHRhcmdldCksXG4gICAgICBleHBlY3RlZFJldmlzaW9uOiBzZXNzaW9uLndvcmxkLnJldmlzaW9uLFxuICAgIH07XG4gICAgbGV0IGNvbW1hbmQ6IENvbW1hbmQ7XG4gICAgaWYgKGludGVudC50eXBlID09PSAnZGVwb3NpdCcgfHwgaW50ZW50LnR5cGUgPT09ICd3aXRoZHJhdycpIHtcbiAgICAgIGNvbW1hbmQgPSB7IC4uLmJhc2UsIHR5cGU6IGludGVudC50eXBlLCBzdG9ja3BpbGVJZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsXG4gICAgICAgIHJlc291cmNlczogeyBbaW50ZW50LnJlc291cmNlXTogaW50ZW50LmFtb3VudCB9IGFzIFBhcnRpYWw8UmVjb3JkPExpZmVSZXNvdXJjZSwgbnVtYmVyPj4gfTtcbiAgICB9IGVsc2UgaWYgKGludGVudC50eXBlID09PSAncHJvZHVjZScpIHtcbiAgICAgIGNvbW1hbmQgPSB7IC4uLmJhc2UsIHR5cGU6IGludGVudC50eXBlLCBzdG9ja3BpbGVJZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsXG4gICAgICAgIHJlY2lwZTogaW50ZW50LnJlY2lwZSB9O1xuICAgIH0gZWxzZSBpZiAoaW50ZW50LnR5cGUgPT09ICd0aWNrJykge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogaW50ZW50LnR5cGUsIHRpY2tzOiBpbnRlbnQudGlja3MgfTtcbiAgICB9IGVsc2UgaWYgKGludGVudC50eXBlID09PSAncGxhbnQnIHx8IGludGVudC50eXBlID09PSAnaGFydmVzdF9jcm9wJykge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogaW50ZW50LnR5cGUsIHBsb3RJZDogaW50ZW50LnBsb3RJZCB9O1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3Vuc3VwcG9ydGVkIGxpZmUgaW50ZW50Jyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IHNlc3Npb24uZGlzcGF0Y2goY29tbWFuZCk7XG4gICAgaWYgKCFyZXN1bHQub2spIHtcbiAgICAgIHRoaXMub3B0aW9ucy50b2FzdChgJHtpbnRlbnQudHlwZS5yZXBsYWNlKCdfJywgJyAnKX06ICR7cmVzdWx0LnJlYXNvbnMuam9pbignOyAnKX1gLCAnYmFkJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGxldCBzYXZlZDogeyBvazogYm9vbGVhbjsgbWVzc2FnZTogc3RyaW5nIH0gfCBudWxsID0gbnVsbDtcbiAgICBpZiAoIXJlc3VsdC5kdXBsaWNhdGUpIHsgc2F2ZWQgPSB0aGlzLm9wdGlvbnMuc3RvcmUuc2F2ZShzZXNzaW9uKTsgdGhpcy5vcHRpb25zLm9uU2F2ZWQ/LigpOyB9XG4gICAgY29uc3QgbWVzc2FnZSA9IGxpZmVNZXNzYWdlKGludGVudCkgKyAoc2F2ZWQgPyBgIFx1MDBCNyAke3NhdmVkLm1lc3NhZ2V9YCA6ICcnKTtcbiAgICB0aGlzLm9wdGlvbnMudG9hc3QobWVzc2FnZSwgc2F2ZWQ/Lm9rID09PSBmYWxzZSA/ICdiYWQnIDogJ2dvb2QnKTtcbiAgICAvLyBSZWplY3RlZCBjb21tYW5kcyBhbmQgZHVwbGljYXRlIHJlY2VpcHRzIGNhbm5vdCByZWZyZXNoIGF1dGhvcml0YXRpdmUgbGlmZS5cbiAgICBpZiAoIXJlc3VsdC5kdXBsaWNhdGUpIHRoaXMucmVmcmVzaCgpO1xuICB9XG5cbiAgLyoqXG4gICAqIElzc3VlIG9uZSByZWFsLXRpbWUgc2V0dGxlbWVudCB0aWNrIHRocm91Z2ggdGhlIG5vcm1hbCBqb3VybmFsZWQgY29tbWFuZFxuICAgKiBwYXRoLiBTYXZpbmcgaXMgbGVmdCB0byB0aGUgY2FsbGVyJ3MgU2F2ZVNjaGVkdWxlciAodGhyb3R0bGVkKSwgc28gdGhpc1xuICAgKiByZXR1cm5zIHdoZXRoZXIgYW4gYWNjZXB0ZWQgdGljayBjaGFuZ2VkIHN0YXRlLlxuICAgKi9cbiAgcmVhbHRpbWVUaWNrKCk6IHsgb2s6IGJvb2xlYW47IHJlYXNvbnM6IHN0cmluZ1tdIH0ge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLm9wdGlvbnMuc2Vzc2lvbjtcbiAgICBpZiAoc2Vzc2lvbi5qb3VybmFsLnNjaGVtYSAhPT0gMyB8fCAhc2Vzc2lvbi53b3JsZC5saWZlKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbnM6IFsnbGVnYWN5IHdvcmxkJ10gfTtcbiAgICBjb25zdCByZXN1bHQgPSBzZXNzaW9uLmRpc3BhdGNoKHtcbiAgICAgIHNjaGVtYTogMywgaWQ6IHNlc3Npb24uY29tbWFuZElkKCd0aWNrJywgJ3JlYWx0aW1lJyksIHR5cGU6ICd0aWNrJywgdGlja3M6IDEsXG4gICAgICBleHBlY3RlZFJldmlzaW9uOiBzZXNzaW9uLndvcmxkLnJldmlzaW9uLFxuICAgIH0pO1xuICAgIGlmICghcmVzdWx0Lm9rKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbnM6IHJlc3VsdC5yZWFzb25zIH07XG4gICAgaWYgKHJlc3VsdC5vdXRjb21lLnR5cGUgPT09ICd0aWNrJykge1xuICAgICAgY29uc3QgZG9uZSA9IHJlc3VsdC5vdXRjb21lLmNvbXBsZXRlZEpvYnMubWFwKChqKSA9PiBqLnJlY2lwZSk7XG4gICAgICBjb25zdCByZWFkeSA9IHJlc3VsdC5vdXRjb21lLnJlYWR5Q3JvcHMubGVuZ3RoO1xuICAgICAgaWYgKGRvbmUubGVuZ3RoIHx8IHJlYWR5KSB7XG4gICAgICAgIHRoaXMub3B0aW9ucy50b2FzdChbXG4gICAgICAgICAgZG9uZS5sZW5ndGggPyBgRmluaXNoZWQgJHtkb25lLmpvaW4oJywgJyl9YCA6ICcnLFxuICAgICAgICAgIHJlYWR5ID8gYCR7cmVhZHl9IGNyb3Ake3JlYWR5ID09PSAxID8gJycgOiAncyd9IHJlYWR5IHRvIGhhcnZlc3RgIDogJycsXG4gICAgICAgIF0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJyBcdTAwQjcgJyksICdnb29kJyk7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMucmVmcmVzaCgpO1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCByZWFzb25zOiBbXSB9O1xuICB9XG5cbiAgcmVmcmVzaCgpOiB2b2lkIHtcbiAgICBjb25zdCB3b3JsZCA9IHRoaXMub3B0aW9ucy5zZXNzaW9uLndvcmxkO1xuICAgIC8vIFJlbmRlcmluZyBhbmQgY29udHJvbHMgY29uc3VtZSBjb21taXR0ZWQgcmV2aXNpb25zOyBhdm9pZCByZWJ1aWxkaW5nIGFcbiAgICAvLyBmdWxsIHNuYXBzaG90IGR1cmluZyBldmVyeSBhbmltYXRpb24gZnJhbWUuXG4gICAgaWYgKHdvcmxkLnJldmlzaW9uID09PSB0aGlzLmxhc3RSZXZpc2lvbikgcmV0dXJuO1xuICAgIHRoaXMucGFuZWwucmVuZGVyKHdvcmxkKTtcbiAgICBjb25zdCBuZXh0ID0gYnVpbGRMaWZlTWVzaGVzKHdvcmxkKTtcbiAgICAvLyBUaGUgbnVtYmVyIG9mIGNoaWxkcmVuIGdyb3dzIHdoZW4gdGhlIGZhcm0gaXMgZmlyc3QgYnVpbHQuIERpc3Bvc2UgdGhlXG4gICAgLy8gY29tbWl0dGVkIG92ZXJsYXkgYXMgYSBncm91cCByYXRoZXIgdGhhbiBhc3N1bWluZyBtYXRjaGluZyBjaGlsZCBjb3VudHMuXG4gICAgZGlzcG9zZUxpZmVNZXNoZXModGhpcy5tZXNoZXMpO1xuICAgIHRoaXMubWVzaGVzLmFkZCguLi5uZXh0LmNoaWxkcmVuKTtcbiAgICBkaXNwb3NlTGlmZU1lc2hlcyhuZXh0KTtcbiAgICB0aGlzLmxhc3RSZXZpc2lvbiA9IHdvcmxkLnJldmlzaW9uO1xuICB9XG5cbiAgZ2V0IGluc3BlY3RhYmxlUm9vdCgpOiBUSFJFRS5Hcm91cCB7IHJldHVybiB0aGlzLm1lc2hlczsgfVxuXG4gIHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuICAgIHRoaXMucGFuZWwuc2V0VmlzaWJsZSh2aXNpYmxlKTtcbiAgICB0aGlzLm1lc2hlcy52aXNpYmxlID0gdmlzaWJsZSB8fCAhZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuY29udGFpbnMoJ2NsZWFuJyk7XG4gIH1cbn1cblxuZnVuY3Rpb24gbGlmZU1lc3NhZ2UoaW50ZW50OiBMaWZlSW50ZW50KTogc3RyaW5nIHtcbiAgaWYgKGludGVudC50eXBlID09PSAnZGVwb3NpdCcgfHwgaW50ZW50LnR5cGUgPT09ICd3aXRoZHJhdycpIHtcbiAgICByZXR1cm4gYCR7aW50ZW50LnR5cGUgPT09ICdkZXBvc2l0JyA/ICdTdG9yZWQnIDogJ0NvbGxlY3RlZCd9ICR7aW50ZW50LmFtb3VudH0gJHtpbnRlbnQucmVzb3VyY2V9YDtcbiAgfVxuICBpZiAoaW50ZW50LnR5cGUgPT09ICdwcm9kdWNlJykgcmV0dXJuIGBTdGFydGVkICR7aW50ZW50LnJlY2lwZX0gcHJvZHVjdGlvbmA7XG4gIGlmIChpbnRlbnQudHlwZSA9PT0gJ3RpY2snKSByZXR1cm4gYEFkdmFuY2VkICR7aW50ZW50LnRpY2tzfSBzaW11bGF0aW9uIHRpY2ske2ludGVudC50aWNrcyA9PT0gMSA/ICcnIDogJ3MnfWA7XG4gIGlmIChpbnRlbnQudHlwZSA9PT0gJ3BsYW50JyB8fCBpbnRlbnQudHlwZSA9PT0gJ2hhcnZlc3RfY3JvcCcpIHtcbiAgICByZXR1cm4gaW50ZW50LnR5cGUgPT09ICdwbGFudCcgPyBgUGxhbnRlZCAke2ludGVudC5wbG90SWR9YFxuICAgICAgOiBgSGFydmVzdGVkICR7aW50ZW50LnBsb3RJZH06ICR7Q1JPUF9ZSUVMRF9MQUJFTH1gO1xuICB9XG4gIHJldHVybiAnJztcbn1cbiIsICIvLyBUZXJyYWluIHF1ZXJ5IGxheWVyIFx1MjAxNCBwdXJlIHNpbXVsYXRpb24sIG5vIHRocmVlLmpzIGltcG9ydHMgKEQtMDA1KS5cbi8vXG4vLyBNMDAyIFN5c3RlbSAxOiBvbmUgc2hhcmVkLCBjYWNoZWQgY29udHJhY3QgZm9yIGNvbnN0cnVjdGlvbiwgZmFybWluZyxcbi8vIG1vdmVtZW50LCBuYXZpZ2F0aW9uIGFuZCB0aGUgQUkgYWdlbnQuIFRoZXNlIHF1ZXJpZXMgZGVzY3JpYmUgdGhlXG4vLyBhdXRob3JpdGF0aXZlIHZveGVsIHZvbHVtZTsgdGhleSBuZXZlciBtdXRhdGUgaXQgYW5kIG5ldmVyIGNyZWF0ZSBhIHNlY29uZFxuLy8gdGVycmFpbiByZXByZXNlbnRhdGlvbi5cbi8vXG4vLyBDb252ZW50aW9uczpcbi8vICAgKiB4L3ogYXJlIGludGVnZXIgY29sdW1uIGNvb3JkaW5hdGVzIGluIFstMTAyNCwgMTAyNCkuXG4vLyAgICogeSBpcyBhbiBpbnRlZ2VyIHZveGVsIGNvb3JkaW5hdGUgaW4gWy0xNiwgMTEyKS5cbi8vICAgKiBzdXJmYWNlWSBpcyB0aGUgZXhwb3NlZCB0b3AgZmFjZSAodG9wU29saWQgKyAxKSwgbWF0Y2hpbmcgTTAwMS5cbi8vICAgKiBBIHJlY3QgaXMgaW5jbHVzaXZlIG9uIGFsbCBmb3VyIGVkZ2VzLlxuaW1wb3J0IHtcbiAgV29ybGQsIE1hdElkLCBNQVQsIFNFQV9MRVZFTCwgWV9NSU4sIFlfTUFYLCBIQUxGLFxuICBzdXJmYWNlQXQsIHRvcE1hdGVyaWFsQXRXb3JsZCwgZ2V0Vm94ZWwsIGlzU29saWQsXG4gIHdvcmxkVG9DaHVua1gsIHdvcmxkVG9DaHVua1osIGNodW5rS2V5LFxuICBBY3RpdmVFbnRpdHlLaW5kLCBFbnRpdHlLaW5kLCBpc1JldGlyZWRTdG9uZUtpbmQsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgaXNTdG9uZVJlcGxheSB9IGZyb20gJy4vc3RvbmUtY29tcGF0JztcblxuZXhwb3J0IGludGVyZmFjZSBSZWN0IHtcbiAgeDA6IG51bWJlcjtcbiAgejA6IG51bWJlcjtcbiAgeDE6IG51bWJlcjtcbiAgejE6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbFJlZ2lvbiBleHRlbmRzIFJlY3Qge1xuICB5MDogbnVtYmVyO1xuICB5MTogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplUmVjdChyZWN0OiBSZWN0KTogUmVjdCB7XG4gIHJldHVybiB7XG4gICAgeDA6IE1hdGgubWluKHJlY3QueDAsIHJlY3QueDEpLFxuICAgIHowOiBNYXRoLm1pbihyZWN0LnowLCByZWN0LnoxKSxcbiAgICB4MTogTWF0aC5tYXgocmVjdC54MCwgcmVjdC54MSksXG4gICAgejE6IE1hdGgubWF4KHJlY3QuejAsIHJlY3QuejEpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjdENvbHVtbnMocmVjdDogUmVjdCk6IG51bWJlciB7XG4gIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICByZXR1cm4gKHIueDEgLSByLngwICsgMSkgKiAoci56MSAtIHIuejAgKyAxKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlY3RDb250YWlucyhyZWN0OiBSZWN0LCB4OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4geCA+PSByZWN0LngwICYmIHggPD0gcmVjdC54MSAmJiB6ID49IHJlY3QuejAgJiYgeiA8PSByZWN0LnoxO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwYW5kUmVjdChyZWN0OiBSZWN0LCBhbW91bnQ6IG51bWJlcik6IFJlY3Qge1xuICByZXR1cm4ge1xuICAgIHgwOiByZWN0LngwIC0gYW1vdW50LFxuICAgIHowOiByZWN0LnowIC0gYW1vdW50LFxuICAgIHgxOiByZWN0LngxICsgYW1vdW50LFxuICAgIHoxOiByZWN0LnoxICsgYW1vdW50LFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjdFRvUmVnaW9uKHJlY3Q6IFJlY3QsIHkwID0gWV9NSU4sIHkxID0gWV9NQVggLSAxKTogVm94ZWxSZWdpb24ge1xuICByZXR1cm4geyAuLi5ub3JtYWxpemVSZWN0KHJlY3QpLCB5MCwgeTEgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lvbnNPdmVybGFwKGE6IFZveGVsUmVnaW9uLCBiOiBWb3hlbFJlZ2lvbik6IGJvb2xlYW4ge1xuICByZXR1cm4gYS54MCA8PSBiLngxICYmIGEueDEgPj0gYi54MCAmJiBhLnowIDw9IGIuejEgJiYgYS56MSA+PSBiLnowXG4gICAgJiYgYS55MCA8PSBiLnkxICYmIGEueTEgPj0gYi55MDtcbn1cblxuLyoqIEluY2x1c2l2ZSBjb250YWlubWVudCBvZiBhIHZveGVsIGluIGEgd29yayBlbnZlbG9wZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbnZlbG9wZUNvbnRhaW5zKHJlY3RzOiByZWFkb25seSBWb3hlbFJlZ2lvbltdLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGZvciAoY29uc3QgciBvZiByZWN0cykge1xuICAgIGlmICh4ID49IHIueDAgJiYgeCA8PSByLngxICYmIHkgPj0gci55MCAmJiB5IDw9IHIueTEgJiYgeiA+PSByLnowICYmIHogPD0gci56MSkgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRlcnJhaW5Db2x1bW4ge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgLyoqIEV4cG9zZWQgdG9wIGZhY2Ugb2YgdGhlIHNvbGlkIGNvbHVtbjsgdGhlIGZpcnN0IGFpciBjZWxsIGFib3ZlIGl0LiAqL1xuICBzdXJmYWNlWTogbnVtYmVyO1xuICAvKiogVGhlIGhpZ2hlc3Qgc29saWQgdm94ZWwsIG9yIFlfTUlOIC0gMSBpZiB0aGUgY29sdW1uIGhhcyBubyBzb2xpZC4gKi9cbiAgdG9wU29saWRZOiBudW1iZXI7XG4gIHRvcE1hdGVyaWFsOiBNYXRJZDtcbiAgc29saWQ6IGJvb2xlYW47XG4gIC8qKiBXYXRlciBhYm92ZSB0aGUgc29saWQgc3VyZmFjZSwgdXAgdG8gc2VhIGxldmVsLiAwIG9uIGRyeSBsYW5kLiAqL1xuICB3YXRlckRlcHRoOiBudW1iZXI7XG4gIHVuZGVyd2F0ZXI6IGJvb2xlYW47XG4gIC8qKiBMYXJnZXN0IDQtbmVpZ2hib3VyIHN1cmZhY2Ugc3RlcCBpbiBtZXRyZXMgKDEgPSBhIHNpbmdsZSB2b3hlbCByaXNlcikuICovXG4gIHNsb3BlOiBudW1iZXI7XG4gIC8qKiBGcmVlIGFpciBjZWxscyBhYm92ZSB0aGUgc3VyZmFjZSwgY2FwcGVkIGF0IENMRUFSQU5DRV9QUk9CRS4gKi9cbiAgY2xlYXJhbmNlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBDTEVBUkFOQ0VfUFJPQkUgPSA4O1xuXG5mdW5jdGlvbiBzdXJmYWNlQXRTYWZlKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGZhbGxiYWNrOiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gZmFsbGJhY2s7XG4gIHJldHVybiBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG4vKiogV2F0ZXIgZGVwdGggdGhhdCByZXNwZWN0cyBhIGRyeSBwaXQgYmVsb3cgc2VhIGxldmVsICh1bmxpa2UgaGVpZ2h0IGFsb25lKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YXRlckRlcHRoQXRDb2x1bW4od29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBpZiAoc3VyZmFjZSA+PSBTRUFfTEVWRUwpIHJldHVybiAwO1xuICBpZiAoZ2V0Vm94ZWwod29ybGQsIHgsIFNFQV9MRVZFTCAtIDEsIHopICE9PSBNQVQuV0FURVIpIHJldHVybiAwO1xuICByZXR1cm4gU0VBX0xFVkVMIC0gc3VyZmFjZTtcbn1cblxuLyoqIFRydWUgd2hlbiBgaGVpZ2h0YCBhaXIgY2VsbHMgYWJvdmUgdGhlIHN1cmZhY2UgYXJlIGZyZWUgb2Ygc29saWQgb3Igd2F0ZXIuICovXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJhbmNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaGVpZ2h0OyBpKyspIHtcbiAgICBpZiAoZ2V0Vm94ZWwod29ybGQsIHgsIHN1cmZhY2UgKyBpLCB6KSAhPT0gTUFULkFJUikgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29sdW1uQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFRlcnJhaW5Db2x1bW4ge1xuICBjb25zdCBjeCA9IE1hdGguZmxvb3IoeCksIGN6ID0gTWF0aC5mbG9vcih6KTtcbiAgY29uc3Qgc3VyZmFjZVkgPSBzdXJmYWNlQXQod29ybGQsIGN4LCBjeik7XG4gIGNvbnN0IHRvcE1hdGVyaWFsID0gdG9wTWF0ZXJpYWxBdFdvcmxkKHdvcmxkLCBjeCwgY3opO1xuICBjb25zdCBzb2xpZCA9IHN1cmZhY2VZID4gWV9NSU4gJiYgaXNTb2xpZCh0b3BNYXRlcmlhbCk7XG4gIGNvbnN0IHdhdGVyRGVwdGggPSB3YXRlckRlcHRoQXRDb2x1bW4od29ybGQsIGN4LCBjeik7XG4gIGNvbnN0IHNsb3BlID0gTWF0aC5tYXgoXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCAtIDEsIGN6LCBzdXJmYWNlWSkpLFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3ggKyAxLCBjeiwgc3VyZmFjZVkpKSxcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4LCBjeiAtIDEsIHN1cmZhY2VZKSksXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCwgY3ogKyAxLCBzdXJmYWNlWSkpLFxuICApO1xuICBsZXQgY2xlYXJhbmNlID0gMDtcbiAgd2hpbGUgKGNsZWFyYW5jZSA8IENMRUFSQU5DRV9QUk9CRSAmJiBnZXRWb3hlbCh3b3JsZCwgY3gsIHN1cmZhY2VZICsgY2xlYXJhbmNlLCBjeikgPT09IE1BVC5BSVIpIHtcbiAgICBjbGVhcmFuY2UrKztcbiAgfVxuICByZXR1cm4ge1xuICAgIHg6IGN4LCB6OiBjeiwgc3VyZmFjZVksIHRvcFNvbGlkWTogc3VyZmFjZVkgLSAxLCB0b3BNYXRlcmlhbCxcbiAgICBzb2xpZCwgd2F0ZXJEZXB0aCwgdW5kZXJ3YXRlcjogd2F0ZXJEZXB0aCA+IDAsIHNsb3BlLCBjbGVhcmFuY2UsXG4gIH07XG59XG5cbi8vIEVudGl0eSBmb290cHJpbnRzIGFyZSBkZWxpYmVyYXRlbHkgZXhwbGljaXQuIEEgdHJlZSBvY2N1cGllcyBtb3JlIHNpdGUgdGhhblxuLy8gaXRzIHRydW5rOyBhIHBlYmJsZSBvY2N1cGllcyBsZXNzIHRoYW4gYSBib3VsZGVyLiBUaGVzZSBhcmUgc2ltdWxhdGlvblxuLy8gY2xlYXJhbmNlIHJhZGlpLCBub3QgcmVuZGVyIGJvdW5kcy5cbmV4cG9ydCBjb25zdCBPQlNUUlVDVElPTl9SQURJVVM6IFJlY29yZDxBY3RpdmVFbnRpdHlLaW5kLCBudW1iZXI+ID0ge1xuICBzdHlsX3RyZWVfc3BpcmU6IDEuNSxcbiAgc3R5bF90cmVlX3RhYmxlOiAxLjgsXG4gIHN0eWxfdHJlZV9jbHVzdGVyOiAxLjksXG4gIHN0eWxfdHJlZV9ibG9zc29tOiAxLjYsXG4gIHN0eWxfc2hydWI6IDAuNixcbiAgc3R5bF9vcmU6IDAuOSxcbiAgc3R5bF9jYWlybjogMC44LFxuICB3YXlzdG9uZTogMS40LFxuICBtYXJrZXI6IDAuNSxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgT2JzdHJ1Y3Rpb24ge1xuICBlbnRpdHlJZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcmFkaXVzOiBudW1iZXI7XG4gIC8qKiBGb290cHJpbnQgY2VsbHMgb3ZlcmxhcHBlZCBieSB0aGlzIGVudGl0eS4gKi9cbiAgY2VsbHM6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gZW50aXR5Q2h1bmtzRm9yUmVjdCh3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICAvLyBBIHJlY3Qgb3ducyB3aG9sZSB2b3hlbCBjZWxscy4gSW5jbHVkZSBldmVyeSBjaHVuayB3aG9zZSByb290IGNvdWxkIG92ZXJsYXBcbiAgLy8gdGhvc2UgY2VsbHMsIHdpdGhvdXQgc2Nhbm5pbmcgdGhlIGVudGlyZSAyMDQ4IG0gd29ybGQuXG4gIGNvbnN0IHJhZGl1cyA9IE1hdGgubWF4KC4uLk9iamVjdC52YWx1ZXMoT0JTVFJVQ1RJT05fUkFESVVTKSwgMS41KTtcbiAgY29uc3QgbWluQ2VsbFggPSBNYXRoLmZsb29yKHIueDAgKyAwLjUgLSByYWRpdXMpO1xuICBjb25zdCBtYXhDZWxsWCA9IE1hdGguY2VpbChyLngxICsgMC41ICsgcmFkaXVzKSAtIDE7XG4gIGNvbnN0IG1pbkNlbGxaID0gTWF0aC5mbG9vcihyLnowICsgMC41IC0gcmFkaXVzKTtcbiAgY29uc3QgbWF4Q2VsbFogPSBNYXRoLmNlaWwoci56MSArIDAuNSArIHJhZGl1cykgLSAxO1xuICBjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBjeDAgPSBNYXRoLm1heCgwLCB3b3JsZFRvQ2h1bmtYKG1pbkNlbGxYKSksIGN4MSA9IHdvcmxkVG9DaHVua1gobWF4Q2VsbFgpO1xuICBjb25zdCBjejAgPSBNYXRoLm1heCgwLCB3b3JsZFRvQ2h1bmtaKG1pbkNlbGxaKSksIGN6MSA9IHdvcmxkVG9DaHVua1oobWF4Q2VsbFopO1xuICBmb3IgKGxldCBjeiA9IGN6MDsgY3ogPD0gY3oxOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjeDA7IGN4IDw9IGN4MTsgY3grKykga2V5cy5wdXNoKGNodW5rS2V5KGN4LCBjeikpO1xuICB9XG4gIHJldHVybiBrZXlzO1xufVxuXG4vKiogRW50aXRpZXMgd2hvc2Ugc2ltdWxhdGlvbiBmb290cHJpbnQgb3ZlcmxhcHMgdGhlIHJlY3QuICovXG5leHBvcnQgZnVuY3Rpb24gb2JzdHJ1Y3Rpb25zSW4od29ybGQ6IFdvcmxkLCByZWN0OiBSZWN0KTogT2JzdHJ1Y3Rpb25bXSB7XG4gIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IG91dDogT2JzdHJ1Y3Rpb25bXSA9IFtdO1xuICBmb3IgKGNvbnN0IGtleSBvZiBlbnRpdHlDaHVua3NGb3JSZWN0KHdvcmxkLCByKSkge1xuICAgIGNvbnN0IGlkcyA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWlkcykgY29udGludWU7XG4gICAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICAgIGlmIChzZWVuLmhhcyhpZCkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgICBpZiAoIWUgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpKSBjb250aW51ZTtcbiAgICAgIHNlZW4uYWRkKGlkKTtcbiAgICAgIGNvbnN0IHJhZGl1cyA9IGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpXG4gICAgICAgID8gZS5raW5kID09PSAnc3R5bF9yb2NrX3NtYWxsJyA/IDAuNiA6IGUua2luZCA9PT0gJ3N0eWxfcm9ja19tZWRpdW0nID8gMS4xIDogMS41XG4gICAgICAgIDogT0JTVFJVQ1RJT05fUkFESVVTW2Uua2luZCBhcyBBY3RpdmVFbnRpdHlLaW5kXTtcbiAgICAgIGxldCBjZWxscyA9IDA7XG4gICAgICBjb25zdCBleDAgPSBNYXRoLm1heChyLngwLCBNYXRoLmZsb29yKGUueCAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXgxID0gTWF0aC5taW4oci54MSwgTWF0aC5jZWlsKGUueCArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXowID0gTWF0aC5tYXgoci56MCwgTWF0aC5mbG9vcihlLnogLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MSA9IE1hdGgubWluKHIuejEsIE1hdGguY2VpbChlLnogKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGZvciAobGV0IHogPSBlejA7IHogPD0gZXoxOyB6KyspIHtcbiAgICAgICAgZm9yIChsZXQgeCA9IGV4MDsgeCA8PSBleDE7IHgrKykge1xuICAgICAgICAgIGlmIChNYXRoLmh5cG90KGUueCAtICh4ICsgMC41KSwgZS56IC0gKHogKyAwLjUpKSA8PSByYWRpdXMpIGNlbGxzKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChjZWxscyA+IDApIHtcbiAgICAgICAgb3V0LnB1c2goeyBlbnRpdHlJZDogZS5pZCwga2luZDogZS5raW5kLCB4OiBlLngsIHo6IGUueiwgcmFkaXVzLCBjZWxscyB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgb3V0LnNvcnQoKGEsIGIpID0+IChhLmVudGl0eUlkIDwgYi5lbnRpdHlJZCA/IC0xIDogYS5lbnRpdHlJZCA+IGIuZW50aXR5SWQgPyAxIDogMCkpO1xuICByZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFyZWFTdGF0cyB7XG4gIHJlY3Q6IFJlY3Q7XG4gIGNvbHVtbnM6IG51bWJlcjtcbiAgbWluWTogbnVtYmVyO1xuICBtYXhZOiBudW1iZXI7XG4gIG1lYW5ZOiBudW1iZXI7XG4gIHJlbGllZjogbnVtYmVyO1xuICBtYXhTdGVwOiBudW1iZXI7XG4gIHdhdGVyQ29sdW1uczogbnVtYmVyO1xuICBzdG9uZUNvbHVtbnM6IG51bWJlcjtcbiAgbWF0ZXJpYWxzOiBSZWNvcmQ8bnVtYmVyLCBudW1iZXI+O1xuICBvYnN0cnVjdGlvbnM6IE9ic3RydWN0aW9uW107XG4gIG9ic3RydWN0ZWRDb2x1bW5zOiBudW1iZXI7XG4gIC8qKiBDdXQvZmlsbCByZWxhdGl2ZSB0byBmbG9vclkgd2hlbiBzdXBwbGllZCwgb3RoZXJ3aXNlIDAuICovXG4gIGZsb29yWTogbnVtYmVyIHwgbnVsbDtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdXBwb3J0U3VtbWFyeSB7XG4gIHRvdGFsOiBudW1iZXI7XG4gIGxldmVsOiBudW1iZXI7XG4gIGN1dDogbnVtYmVyO1xuICBmaWxsOiBudW1iZXI7XG4gIHdhdGVyOiBudW1iZXI7XG4gIC8qKiBGaWxsIGRlZXBlciB0aGFuIDggbTsgYSB2YWxpZGF0b3IgbWF5IHJlamVjdCB0aGVzZSBhcyB1bnN1cHBvcnRlZC4gKi9cbiAgZGVlcEZpbGw6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGb290cHJpbnRRdWVyeSB7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBzdGF0czogQXJlYVN0YXRzO1xuICBzdXBwb3J0OiBTdXBwb3J0U3VtbWFyeTtcbiAgb2JzdHJ1Y3Rpb25zOiBPYnN0cnVjdGlvbltdO1xuICAvKiogQ2VsbHMgaW4gdGhlIGJ1aWxkaW5nIHZvbHVtZSBhYm92ZSB0aGUgcHJlcGFyZWQgZmxvb3IgdGhhdCBhcmUgbm90IGFpci4gKi9cbiAgb3ZlcmhhbmdDZWxsczogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyOyBtYXRlcmlhbDogTWF0SWQgfT47XG59XG5cbi8qKlxuICogQ2FjaGVkIHF1ZXJ5IGNvbnRleHQuIENhY2hlcyBhcmUga2V5ZWQgb24gd29ybGQucmV2aXNpb246IGEgdm94ZWwgb3IgZW50aXR5XG4gKiBlZGl0IGludmFsaWRhdGVzIHRoZW0sIHdoaWxlIG1lc2gvbmF2IHJlYnVpbGRzIGRvIG5vdC4gVXNlIG9uZSBjb250ZXh0IGZvciBhXG4gKiBzaXRlIHNlYXJjaCBvciBhIGZvb3RwcmludCBldmFsdWF0aW9uLCB0aGVuIGRpc2NhcmQgaXQuXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXJyYWluUXVlcnkge1xuICBwcml2YXRlIGNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFRlcnJhaW5Db2x1bW4+KCk7XG4gIHByaXZhdGUgb2JzdHJ1Y3Rpb25DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBPYnN0cnVjdGlvbltdPigpO1xuICBwcml2YXRlIHJldmlzaW9uOiBudW1iZXI7XG5cbiAgY29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IHdvcmxkOiBXb3JsZCkge1xuICAgIHRoaXMucmV2aXNpb24gPSB3b3JsZC5yZXZpc2lvbjtcbiAgfVxuXG4gIHByaXZhdGUgc3luYygpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5yZXZpc2lvbiAhPT0gdGhpcy53b3JsZC5yZXZpc2lvbikge1xuICAgICAgdGhpcy5jYWNoZS5jbGVhcigpO1xuICAgICAgdGhpcy5vYnN0cnVjdGlvbkNhY2hlLmNsZWFyKCk7XG4gICAgICB0aGlzLnJldmlzaW9uID0gdGhpcy53b3JsZC5yZXZpc2lvbjtcbiAgICB9XG4gIH1cblxuICAvKiogQ2FjaGVkIGVudGl0eSBvYnN0cnVjdGlvbnMgZm9yIG9uZSBmb290cHJpbnQuICovXG4gIG9ic3RydWN0aW9uc0ZvcihyZWN0OiBSZWN0KTogT2JzdHJ1Y3Rpb25bXSB7XG4gICAgdGhpcy5zeW5jKCk7XG4gICAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gICAgY29uc3Qga2V5ID0gYCR7ci54MH0sJHtyLnowfSwke3IueDF9LCR7ci56MX1gO1xuICAgIGxldCBsaXN0ID0gdGhpcy5vYnN0cnVjdGlvbkNhY2hlLmdldChrZXkpO1xuICAgIGlmICghbGlzdCkge1xuICAgICAgbGlzdCA9IG9ic3RydWN0aW9uc0luKHRoaXMud29ybGQsIHIpO1xuICAgICAgdGhpcy5vYnN0cnVjdGlvbkNhY2hlLnNldChrZXksIGxpc3QpO1xuICAgIH1cbiAgICByZXR1cm4gbGlzdDtcbiAgfVxuXG4gIGNvbHVtbih4OiBudW1iZXIsIHo6IG51bWJlcik6IFRlcnJhaW5Db2x1bW4ge1xuICAgIHRoaXMuc3luYygpO1xuICAgIGNvbnN0IGN4ID0gTWF0aC5mbG9vcih4KSwgY3ogPSBNYXRoLmZsb29yKHopO1xuICAgIGNvbnN0IGtleSA9IGAke2N4fSwke2N6fWA7XG4gICAgbGV0IGNvbCA9IHRoaXMuY2FjaGUuZ2V0KGtleSk7XG4gICAgaWYgKCFjb2wpIHtcbiAgICAgIGNvbCA9IGNvbHVtbkF0KHRoaXMud29ybGQsIGN4LCBjeik7XG4gICAgICB0aGlzLmNhY2hlLnNldChrZXksIGNvbCk7XG4gICAgfVxuICAgIHJldHVybiBjb2w7XG4gIH1cblxuICBhcmVhKHJlY3Q6IFJlY3QsIGZsb29yWT86IG51bWJlcik6IEFyZWFTdGF0cyB7XG4gICAgdGhpcy5zeW5jKCk7XG4gICAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gICAgbGV0IG1pblkgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gICAgbGV0IG1heFkgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gICAgbGV0IHN1bSA9IDA7XG4gICAgbGV0IG1heFN0ZXAgPSAwO1xuICAgIGxldCB3YXRlckNvbHVtbnMgPSAwO1xuICAgIGxldCBzdG9uZUNvbHVtbnMgPSAwO1xuICAgIGxldCBjdXRWb2x1bWUgPSAwO1xuICAgIGxldCBmaWxsVm9sdW1lID0gMDtcbiAgICBsZXQgbWF4Q3V0ID0gMDtcbiAgICBsZXQgbWF4RmlsbCA9IDA7XG4gICAgY29uc3QgbWF0ZXJpYWxzOiBSZWNvcmQ8bnVtYmVyLCBudW1iZXI+ID0ge307XG5cbiAgICBmb3IgKGxldCB6ID0gci56MDsgeiA8PSByLnoxOyB6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByLngwOyB4IDw9IHIueDE7IHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSB0aGlzLmNvbHVtbih4LCB6KTtcbiAgICAgICAgbWluWSA9IE1hdGgubWluKG1pblksIGNvbC5zdXJmYWNlWSk7XG4gICAgICAgIG1heFkgPSBNYXRoLm1heChtYXhZLCBjb2wuc3VyZmFjZVkpO1xuICAgICAgICBzdW0gKz0gY29sLnN1cmZhY2VZO1xuICAgICAgICBtYXhTdGVwID0gTWF0aC5tYXgobWF4U3RlcCwgY29sLnNsb3BlKTtcbiAgICAgICAgaWYgKGNvbC53YXRlckRlcHRoID4gMCkgd2F0ZXJDb2x1bW5zKys7XG4gICAgICAgIGlmIChjb2wudG9wTWF0ZXJpYWwgPT09IE1BVC5TVE9ORSkgc3RvbmVDb2x1bW5zKys7XG4gICAgICAgIG1hdGVyaWFsc1tjb2wudG9wTWF0ZXJpYWxdID0gKG1hdGVyaWFsc1tjb2wudG9wTWF0ZXJpYWxdID8/IDApICsgMTtcbiAgICAgICAgaWYgKGZsb29yWSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgY29uc3QgZHkgPSBjb2wuc3VyZmFjZVkgLSBmbG9vclk7XG4gICAgICAgICAgaWYgKGR5ID4gMCkge1xuICAgICAgICAgICAgY3V0Vm9sdW1lICs9IGR5O1xuICAgICAgICAgICAgbWF4Q3V0ID0gTWF0aC5tYXgobWF4Q3V0LCBkeSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChkeSA8IDApIHtcbiAgICAgICAgICAgIGZpbGxWb2x1bWUgKz0gLWR5O1xuICAgICAgICAgICAgbWF4RmlsbCA9IE1hdGgubWF4KG1heEZpbGwsIC1keSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gdGhpcy5vYnN0cnVjdGlvbnNGb3Iocik7XG4gICAgY29uc3Qgb2JzdHJ1Y3RlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGZvciAoY29uc3QgbyBvZiBvYnN0cnVjdGlvbnMpIHtcbiAgICAgIGNvbnN0IHJhZGl1cyA9IG8ucmFkaXVzO1xuICAgICAgY29uc3QgZXgwID0gTWF0aC5tYXgoci54MCwgTWF0aC5mbG9vcihvLnggLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV4MSA9IE1hdGgubWluKHIueDEsIE1hdGguY2VpbChvLnggKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MCA9IE1hdGgubWF4KHIuejAsIE1hdGguZmxvb3Ioby56IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejEgPSBNYXRoLm1pbihyLnoxLCBNYXRoLmNlaWwoby56ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBmb3IgKGxldCB6ID0gZXowOyB6IDw9IGV6MTsgeisrKSB7XG4gICAgICAgIGZvciAobGV0IHggPSBleDA7IHggPD0gZXgxOyB4KyspIHtcbiAgICAgICAgICBpZiAoTWF0aC5oeXBvdChvLnggLSAoeCArIDAuNSksIG8ueiAtICh6ICsgMC41KSkgPD0gcmFkaXVzKSBvYnN0cnVjdGVkLmFkZChgJHt4fSwke3p9YCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBjb2x1bW5zID0gKHIueDEgLSByLngwICsgMSkgKiAoci56MSAtIHIuejAgKyAxKTtcbiAgICByZXR1cm4ge1xuICAgICAgcmVjdDogcixcbiAgICAgIGNvbHVtbnMsXG4gICAgICBtaW5ZLCBtYXhZLFxuICAgICAgbWVhblk6IE1hdGgucm91bmQoKHN1bSAvIGNvbHVtbnMpICogMTAwMCkgLyAxMDAwLFxuICAgICAgcmVsaWVmOiBtYXhZIC0gbWluWSxcbiAgICAgIG1heFN0ZXAsXG4gICAgICB3YXRlckNvbHVtbnMsXG4gICAgICBzdG9uZUNvbHVtbnMsXG4gICAgICBtYXRlcmlhbHMsXG4gICAgICBvYnN0cnVjdGlvbnMsXG4gICAgICBvYnN0cnVjdGVkQ29sdW1uczogb2JzdHJ1Y3RlZC5zaXplLFxuICAgICAgZmxvb3JZOiBmbG9vclkgPz8gbnVsbCxcbiAgICAgIGN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQsXG4gICAgICBtYXhGaWxsLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogRXZhbHVhdGUgYSBjb21wbGV0ZSBidWlsZGluZyBmb290cHJpbnQuIGBmbG9vcllgIGlzIHRoZSBwcmVwYXJlZCB3YWxraW5nXG4gICAqIGZsb29yOiB0ZXJyYWluIGFib3ZlIGl0IGlzIGN1dCwgdGVycmFpbiBiZWxvdyBpdCBpcyBmaWxsZWQuIFRoZSByZXN1bHQgaXNcbiAgICogcmF3IHNpdGUgZGF0YTsgY29uc3RydWN0aW9uIHJ1bGVzIGxpdmUgaW4gY29uc3RydWN0aW9uLnRzLlxuICAgKi9cbiAgZm9vdHByaW50KHJlY3Q6IFJlY3QsIGZsb29yWTogbnVtYmVyKTogRm9vdHByaW50UXVlcnkge1xuICAgIGNvbnN0IHN0YXRzID0gdGhpcy5hcmVhKHJlY3QsIGZsb29yWSk7XG4gICAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gICAgY29uc3Qgc3VwcG9ydDogU3VwcG9ydFN1bW1hcnkgPSB7XG4gICAgICB0b3RhbDogc3RhdHMuY29sdW1ucywgbGV2ZWw6IDAsIGN1dDogMCwgZmlsbDogMCwgd2F0ZXI6IDAsIGRlZXBGaWxsOiAwLFxuICAgICAgbWF4Q3V0OiAwLCBtYXhGaWxsOiAwLCBjdXRWb2x1bWU6IDAsIGZpbGxWb2x1bWU6IDAsXG4gICAgfTtcbiAgICBjb25zdCBvdmVyaGFuZ0NlbGxzOiBGb290cHJpbnRRdWVyeVsnb3ZlcmhhbmdDZWxscyddID0gW107XG5cbiAgICBmb3IgKGxldCB6ID0gci56MDsgeiA8PSByLnoxOyB6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByLngwOyB4IDw9IHIueDE7IHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSB0aGlzLmNvbHVtbih4LCB6KTtcbiAgICAgICAgY29uc3QgZHkgPSBjb2wuc3VyZmFjZVkgLSBmbG9vclk7XG4gICAgICAgIGlmIChkeSA+IDApIHtcbiAgICAgICAgICBzdXBwb3J0LmN1dCsrO1xuICAgICAgICAgIHN1cHBvcnQuY3V0Vm9sdW1lICs9IGR5O1xuICAgICAgICAgIHN1cHBvcnQubWF4Q3V0ID0gTWF0aC5tYXgoc3VwcG9ydC5tYXhDdXQsIGR5KTtcbiAgICAgICAgfSBlbHNlIGlmIChkeSA8IDApIHtcbiAgICAgICAgICBzdXBwb3J0LmZpbGwrKztcbiAgICAgICAgICBzdXBwb3J0LmZpbGxWb2x1bWUgKz0gLWR5O1xuICAgICAgICAgIHN1cHBvcnQubWF4RmlsbCA9IE1hdGgubWF4KHN1cHBvcnQubWF4RmlsbCwgLWR5KTtcbiAgICAgICAgICBpZiAoLWR5ID4gOCkgc3VwcG9ydC5kZWVwRmlsbCsrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN1cHBvcnQubGV2ZWwrKztcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29sLndhdGVyRGVwdGggPiAwKSBzdXBwb3J0LndhdGVyKys7XG5cbiAgICAgICAgLy8gQW4gb3ZlcmhhbmcgaXMgdGVycmFpbiBhYm92ZSB0aGUgZmxvb3IgdGhhdCBzdXJ2aXZlcyB0aGUgY3V0IHBsYW5lLlxuICAgICAgICAvLyBGb3IgYSBjb2x1bW4gYmVsb3cgdGhlIGZsb29yLCBpdHMgc29saWQgYm9keSBpcyBmaWxsLCBub3Qgb3ZlcmhhbmcuXG4gICAgICAgIGNvbnN0IHN0YXJ0ID0gTWF0aC5tYXgoZmxvb3JZLCBjb2wuc3VyZmFjZVkpO1xuICAgICAgICBmb3IgKGxldCB5ID0gc3RhcnQ7IHkgPCBzdGFydCArIDQ7IHkrKykge1xuICAgICAgICAgIGNvbnN0IG0gPSBnZXRWb3hlbCh0aGlzLndvcmxkLCB4LCB5LCB6KSBhcyBNYXRJZDtcbiAgICAgICAgICBpZiAobSAhPT0gTUFULkFJUikgb3ZlcmhhbmdDZWxscy5wdXNoKHsgeCwgeSwgeiwgbWF0ZXJpYWw6IG0gfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4geyByZWN0OiByLCBmbG9vclksIHN0YXRzLCBzdXBwb3J0LCBvYnN0cnVjdGlvbnM6IHN0YXRzLm9ic3RydWN0aW9ucywgb3ZlcmhhbmdDZWxscyB9O1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gbW92ZW1lbnQgY29udHJhY3QgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXYWxrUGFyYW1zIHtcbiAgbWF4U3RlcFVwOiBudW1iZXI7XG4gIG1heFN0ZXBEb3duOiBudW1iZXI7XG4gIG1heFdhdGVyRGVwdGg6IG51bWJlcjtcbiAgLyoqIE1heGltdW0gYWRqYWNlbnQgc3VyZmFjZSBzdGVwOyAxLjAgaXMgYSA0NSBkZWdyZWUgdm94ZWwgcmlzZXIuICovXG4gIG1heFNsb3BlOiBudW1iZXI7XG4gIGNsZWFyYW5jZTogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9XQUxLOiBXYWxrUGFyYW1zID0ge1xuICBtYXhTdGVwVXA6IDEuMCxcbiAgbWF4U3RlcERvd246IDEuNSxcbiAgbWF4V2F0ZXJEZXB0aDogMC40LFxuICBtYXhTbG9wZTogMS4wLFxuICBjbGVhcmFuY2U6IDIuMCxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2Fsa1Jlc3VsdCB7XG4gIG9rOiBib29sZWFuO1xuICByZWFzb246ICdvaycgfCAnbm90X2FkamFjZW50JyB8ICdzdGVwX3VwJyB8ICdmYWxsJyB8ICd3YXRlcicgfCAnc2xvcGUnIHwgJ2NsZWFyYW5jZSc7XG4gIHN0ZXA6IG51bWJlcjtcbiAgd2F0ZXJEZXB0aDogbnVtYmVyO1xufVxuXG4vKiogRXZhbHVhdGUgb25lIGdyaWQgc3RlcC4gUGF0aHMgYXJlIHZhbGlkYXRlZCB3aXRoIHRoZSBzYW1lIGNvbnRyYWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhbGtTdGVwKFxuICB3b3JsZDogV29ybGQsIGZyb21YOiBudW1iZXIsIGZyb21aOiBudW1iZXIsIHRvWDogbnVtYmVyLCB0b1o6IG51bWJlcixcbiAgcGFyYW1zOiBXYWxrUGFyYW1zID0gREVGQVVMVF9XQUxLLFxuKTogV2Fsa1Jlc3VsdCB7XG4gIGNvbnN0IGR4ID0gTWF0aC5hYnMoTWF0aC5mbG9vcih0b1gpIC0gTWF0aC5mbG9vcihmcm9tWCkpO1xuICBjb25zdCBkeiA9IE1hdGguYWJzKE1hdGguZmxvb3IodG9aKSAtIE1hdGguZmxvb3IoZnJvbVopKTtcbiAgaWYgKGR4ICsgZHogIT09IDEpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ25vdF9hZGphY2VudCcsIHN0ZXA6IDAsIHdhdGVyRGVwdGg6IDAgfTtcbiAgfVxuICBjb25zdCBmcm9tID0gY29sdW1uQXQod29ybGQsIGZyb21YLCBmcm9tWik7XG4gIGNvbnN0IHRvID0gY29sdW1uQXQod29ybGQsIHRvWCwgdG9aKTtcbiAgY29uc3Qgc3RlcCA9IHRvLnN1cmZhY2VZIC0gZnJvbS5zdXJmYWNlWTtcbiAgaWYgKHN0ZXAgPiBwYXJhbXMubWF4U3RlcFVwKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3N0ZXBfdXAnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICgtc3RlcCA+IHBhcmFtcy5tYXhTdGVwRG93bikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdmYWxsJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAodG8ud2F0ZXJEZXB0aCA+IHBhcmFtcy5tYXhXYXRlckRlcHRoKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3dhdGVyJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAodG8uc2xvcGUgPiBwYXJhbXMubWF4U2xvcGUpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc2xvcGUnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICghY2xlYXJhbmNlQXQod29ybGQsIHRvWCwgdG9aLCBwYXJhbXMuY2xlYXJhbmNlKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnY2xlYXJhbmNlJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICB9XG4gIHJldHVybiB7IG9rOiB0cnVlLCByZWFzb246ICdvaycsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbn1cblxuLyoqIEVmZmVjdGl2ZSBncmFkZSBvZiBhIHN0cmFpZ2h0IHBhdGggc2VnbWVudCwgdXNlZCBieSBwYXRoIHZhbGlkYXRpb24uICovXG5leHBvcnQgZnVuY3Rpb24gZWZmZWN0aXZlR3JhZGUod29ybGQ6IFdvcmxkLCB4MDogbnVtYmVyLCB6MDogbnVtYmVyLCB4MTogbnVtYmVyLCB6MTogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgYSA9IGNvbHVtbkF0KHdvcmxkLCB4MCwgejApO1xuICBjb25zdCBiID0gY29sdW1uQXQod29ybGQsIHgxLCB6MSk7XG4gIGNvbnN0IHJ1biA9IE1hdGguaHlwb3QoeDEgLSB4MCwgejEgLSB6MCk7XG4gIGlmIChydW4gPT09IDApIHJldHVybiBNYXRoLmFicyhiLnN1cmZhY2VZIC0gYS5zdXJmYWNlWSk7XG4gIHJldHVybiBNYXRoLmFicyhiLnN1cmZhY2VZIC0gYS5zdXJmYWNlWSkgLyBydW47XG59XG4iLCAiLy8gTTAwMiBzaXRlIHZhbGlkYXRpb24sIGNhbmRpZGF0ZSBzZWFyY2ggYW5kIHByZXZpZXcgXHUyMDE0IHB1cmUgc2ltdWxhdGlvbi5cbi8vXG4vLyBUaGlzIGlzIHRoZSBzaGFyZWQgZ2F0ZSBmb3IgdGhlIHBsYXllciBhbmQgdGhlIEFJIGFnZW50LiBOZWl0aGVyIG1heSBwbGFjZSBhXG4vLyBzdHJ1Y3R1cmUgYnkgYW55IG90aGVyIHBhdGg6IGJvdGggc3VibWl0IGEgU2l0ZVByb3Bvc2FsLCBib3RoIHJlY2VpdmUgdGhlXG4vLyBzYW1lIFNpdGVWYWxpZGF0aW9uLCBhbmQgYm90aCBtdXN0IHBhc3MgdGhlIEF1dGhvcml6ZXIgYmVmb3JlIGV4ZWN1dGlvbi5cbi8vXG4vLyBUaGUgdmFsaWRhdG9yIGRlc2NyaWJlcyB0aGUgc2l0ZSBhcyBpdCBpcy4gSXQgZG9lcyBub3QgZWRpdCB2b3hlbHMsIHJlbW92ZVxuLy8gZW50aXRpZXMgb3Igc3BlbmQgcmVzb3VyY2VzLiBQcmVwYXJhdGlvbiBpcyBhIHNlcGFyYXRlLCBhdXRob3JpemVkIHN0ZXAuXG5pbXBvcnQgeyBXb3JsZCwgSEFMRiwgWV9NSU4sIFlfTUFYLCBzdXJmYWNlQXQgfSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7XG4gIFJlY3QsIFZveGVsUmVnaW9uLCBGb290cHJpbnRRdWVyeSwgVGVycmFpblF1ZXJ5LCBBcmVhU3RhdHMsXG4gIG5vcm1hbGl6ZVJlY3QsIGV4cGFuZFJlY3QsIHJlY3RDb2x1bW5zLCBlZmZlY3RpdmVHcmFkZSwgd2Fsa1N0ZXAsIFdhbGtQYXJhbXMsXG4gIERFRkFVTFRfV0FMSywgY29sdW1uQXQsXG59IGZyb20gJy4vdGVycmFpbic7XG5cbmV4cG9ydCB0eXBlIFNpdGVTdGF0ZSA9ICd2YWxpZCcgfCAndmFsaWRfd2l0aF9wcmVwYXJhdGlvbicgfCAnaW52YWxpZCc7XG5cbmV4cG9ydCB0eXBlIFZhbGlkYXRpb25Db2RlID1cbiAgfCAnb3V0X29mX2JvdW5kcydcbiAgfCAnZm9vdHByaW50X21pc21hdGNoJ1xuICB8ICdzbG9wZV9leGNlZWRlZCdcbiAgfCAnc3RlcF9leGNlZWRlZCdcbiAgfCAnY3V0X2V4Y2VlZGVkJ1xuICB8ICdmaWxsX2V4Y2VlZGVkJ1xuICB8ICdjdXRfdm9sdW1lX2V4Y2VlZGVkJ1xuICB8ICdmaWxsX3ZvbHVtZV9leGNlZWRlZCdcbiAgfCAnZm9vdHByaW50X29ic3RydWN0ZWQnXG4gIHwgJ3dhdGVyJ1xuICB8ICdvdmVyaGFuZydcbiAgfCAnbmVlZHNfZ3JhZGluZydcbiAgfCAnbmVlZHNfY2xlYXJpbmcnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZhbGlkYXRpb25SZWFzb24ge1xuICBjb2RlOiBWYWxpZGF0aW9uQ29kZTtcbiAgc2V2ZXJpdHk6ICdlcnJvcicgfCAncHJlcGFyYXRpb24nO1xuICBtZXNzYWdlOiBzdHJpbmc7XG4gIHZhbHVlPzogbnVtYmVyO1xuICBsaW1pdD86IG51bWJlcjtcbn1cblxuZXhwb3J0IHR5cGUgRm91bmRhdGlvblR5cGUgPSAnZ3JhZGVkX3BhZCcgfCAnc3RlcHBlZF9wbGludGgnIHwgJ2RlY2snO1xuXG5leHBvcnQgaW50ZXJmYWNlIEJ1aWxkaW5nUnVsZXMge1xuICBpZDogc3RyaW5nO1xuICB3aWR0aDogbnVtYmVyO1xuICBkZXB0aDogbnVtYmVyO1xuICB3YWxsSGVpZ2h0OiBudW1iZXI7XG4gIGNsZWFyYW5jZTogbnVtYmVyO1xuICAvKiogUmVsaWVmIGF0IG9yIGJlbG93IHRoaXMgbmVlZHMgbm8gZ3JhZGluZyB0byBiZSBjYWxsZWQgdmFsaWQuICovXG4gIG1heFJlbGllZk5vUHJlcDogbnVtYmVyO1xuICAvKiogUmVsaWVmIGFib3ZlIHRoaXMgY2Fubm90IGJlIHByZXBhcmVkIGJ5IHRoaXMgYnVpbGRpbmcgdHlwZS4gKi9cbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IG51bWJlcjtcbiAgbWF4U3RlcDogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBtYXhDdXRWb2x1bWU6IG51bWJlcjtcbiAgbWF4RmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhPYnN0cnVjdGlvbnM6IG51bWJlcjtcbiAgcmVxdWlyZXNEcnk6IGJvb2xlYW47XG4gIGZvdW5kYXRpb246IEZvdW5kYXRpb25UeXBlO1xufVxuXG5leHBvcnQgY29uc3QgSE9VU0VfUlVMRVM6IEJ1aWxkaW5nUnVsZXMgPSB7XG4gIGlkOiAnaG91c2UtOHg2JyxcbiAgd2lkdGg6IDgsXG4gIGRlcHRoOiA2LFxuICB3YWxsSGVpZ2h0OiAzLFxuICBjbGVhcmFuY2U6IDMsXG4gIG1heFJlbGllZk5vUHJlcDogMS4yLFxuICBtYXhSZWxpZWZQcmVwYXJlZDogNC4wLFxuICBtYXhTdGVwOiAxLFxuICBtYXhDdXQ6IDIsXG4gIG1heEZpbGw6IDIsXG4gIG1heEN1dFZvbHVtZTogNDgsXG4gIG1heEZpbGxWb2x1bWU6IDQ4LFxuICBtYXhPYnN0cnVjdGlvbnM6IDAsXG4gIHJlcXVpcmVzRHJ5OiB0cnVlLFxuICBmb3VuZGF0aW9uOiAnZ3JhZGVkX3BhZCcsXG59O1xuXG5leHBvcnQgY29uc3QgRkFSTV9SVUxFUzogQnVpbGRpbmdSdWxlcyA9IHtcbiAgaWQ6ICdmYXJtLTEyeDgnLFxuICB3aWR0aDogMTIsXG4gIGRlcHRoOiA4LFxuICB3YWxsSGVpZ2h0OiAwLFxuICBjbGVhcmFuY2U6IDEsXG4gIG1heFJlbGllZk5vUHJlcDogMS4yLFxuICBtYXhSZWxpZWZQcmVwYXJlZDogNi4wLFxuICBtYXhTdGVwOiAxLFxuICBtYXhDdXQ6IDIsXG4gIG1heEZpbGw6IDIsXG4gIG1heEN1dFZvbHVtZTogOTYsXG4gIG1heEZpbGxWb2x1bWU6IDk2LFxuICBtYXhPYnN0cnVjdGlvbnM6IDQsXG4gIHJlcXVpcmVzRHJ5OiB0cnVlLFxuICBmb3VuZGF0aW9uOiAnc3RlcHBlZF9wbGludGgnLFxufTtcblxuZXhwb3J0IGNvbnN0IFBBVEhfUlVMRVM6IEJ1aWxkaW5nUnVsZXMgPSB7XG4gIGlkOiAncGF0aC05eDMnLFxuICB3aWR0aDogOSxcbiAgZGVwdGg6IDMsXG4gIHdhbGxIZWlnaHQ6IDAsXG4gIGNsZWFyYW5jZTogMSxcbiAgbWF4UmVsaWVmTm9QcmVwOiAyLjAsXG4gIG1heFJlbGllZlByZXBhcmVkOiA0LjAsXG4gIG1heFN0ZXA6IDEsXG4gIG1heEN1dDogMSxcbiAgbWF4RmlsbDogMSxcbiAgbWF4Q3V0Vm9sdW1lOiAzMixcbiAgbWF4RmlsbFZvbHVtZTogMzIsXG4gIG1heE9ic3RydWN0aW9uczogMixcbiAgcmVxdWlyZXNEcnk6IHRydWUsXG4gIGZvdW5kYXRpb246ICdkZWNrJyxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVByb3Bvc2FsIHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBydWxlczogQnVpbGRpbmdSdWxlcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvblN1bW1hcnkge1xuICBuZWVkc0dyYWRpbmc6IGJvb2xlYW47XG4gIG5lZWRzQ2xlYXJpbmc6IGJvb2xlYW47XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIG9ic3RydWN0aW9uSWRzOiBzdHJpbmdbXTtcbiAgZm91bmRhdGlvbjogRm91bmRhdGlvblR5cGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVZhbGlkYXRpb24ge1xuICBzaXRlSWQ6IHN0cmluZztcbiAgc3RhdGU6IFNpdGVTdGF0ZTtcbiAgcmVhc29uczogVmFsaWRhdGlvblJlYXNvbltdO1xuICBxdWVyeTogRm9vdHByaW50UXVlcnk7XG4gIHByZXBhcmF0aW9uOiBQcmVwYXJhdGlvblN1bW1hcnk7XG59XG5cbmZ1bmN0aW9uIGVycm9yKGNvZGU6IFZhbGlkYXRpb25Db2RlLCBtZXNzYWdlOiBzdHJpbmcsIHZhbHVlPzogbnVtYmVyLCBsaW1pdD86IG51bWJlcik6IFZhbGlkYXRpb25SZWFzb24ge1xuICByZXR1cm4geyBjb2RlLCBzZXZlcml0eTogJ2Vycm9yJywgbWVzc2FnZSwgdmFsdWUsIGxpbWl0IH07XG59XG5cbmZ1bmN0aW9uIHByZXAoY29kZTogVmFsaWRhdGlvbkNvZGUsIG1lc3NhZ2U6IHN0cmluZywgdmFsdWU/OiBudW1iZXIsIGxpbWl0PzogbnVtYmVyKTogVmFsaWRhdGlvblJlYXNvbiB7XG4gIHJldHVybiB7IGNvZGUsIHNldmVyaXR5OiAncHJlcGFyYXRpb24nLCBtZXNzYWdlLCB2YWx1ZSwgbGltaXQgfTtcbn1cblxuLyoqXG4gKiBWYWxpZGF0ZSBhIHByb3Bvc2VkIHNpdGUgYWdhaW5zdCBpdHMgYnVpbGRpbmcgcnVsZXMuIFB1cmU6IG5vIHZveGVscyxcbiAqIGVudGl0aWVzIG9yIHJlc291cmNlcyBjaGFuZ2UuIGBxdWVyeWAgbWF5IGJlIHN1cHBsaWVkIGJ5IGEgc2VhcmNoIHRvIHJldXNlXG4gKiB0aGUgY2FjaGVkIGNvbHVtbnMsIGFuZCBgZm9vdHByaW50YCBtYXkgYmUgc3VwcGxpZWQgd2hlbiB0aGUgY2FsbGVyIGFscmVhZHlcbiAqIGV2YWx1YXRlZCB0aGUgc2FtZSByZWN0L2Zsb29yIHBhaXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZVNpdGUoXG4gIHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCwgcXVlcnkgPSBuZXcgVGVycmFpblF1ZXJ5KHdvcmxkKSxcbiAgZm9vdHByaW50PzogRm9vdHByaW50UXVlcnksXG4pOiBTaXRlVmFsaWRhdGlvbiB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCBydWxlcyA9IHByb3Bvc2FsLnJ1bGVzO1xuICBjb25zdCByZWFzb25zOiBWYWxpZGF0aW9uUmVhc29uW10gPSBbXTtcbiAgY29uc3QgZnAgPSBmb290cHJpbnQgPz8gcXVlcnkuZm9vdHByaW50KHJlY3QsIHByb3Bvc2FsLmZsb29yWSk7XG4gIGNvbnN0IHN0YXRzID0gZnAuc3RhdHM7XG5cbiAgaWYgKHJlY3QueDAgPCAtSEFMRiB8fCByZWN0LnowIDwgLUhBTEYgfHwgcmVjdC54MSA+PSBIQUxGIHx8IHJlY3QuejEgPj0gSEFMRikge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcignb3V0X29mX2JvdW5kcycsIGBmb290cHJpbnQgJHtyZWN0LngwfSwke3JlY3QuejB9Li4ke3JlY3QueDF9LCR7cmVjdC56MX0gaXMgb3V0c2lkZSB0aGUgd29ybGRgKSk7XG4gIH1cbiAgaWYgKHJlY3QueDEgLSByZWN0LngwICsgMSAhPT0gcnVsZXMud2lkdGggfHwgcmVjdC56MSAtIHJlY3QuejAgKyAxICE9PSBydWxlcy5kZXB0aCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdmb290cHJpbnRfbWlzbWF0Y2gnLFxuICAgICAgYGZvb3RwcmludCBpcyAke3JlY3QueDEgLSByZWN0LngwICsgMX0geCAke3JlY3QuejEgLSByZWN0LnowICsgMX0gbSwgJHtydWxlcy53aWR0aH0geCAke3J1bGVzLmRlcHRofSBtIHJlcXVpcmVkYCxcbiAgICApKTtcbiAgfVxuXG4gIGlmIChzdGF0cy5yZWxpZWYgPiBydWxlcy5tYXhSZWxpZWZQcmVwYXJlZCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdzbG9wZV9leGNlZWRlZCcsXG4gICAgICBgcmVsaWVmICR7c3RhdHMucmVsaWVmfSBtIGV4Y2VlZHMgdGhlICR7cnVsZXMubWF4UmVsaWVmUHJlcGFyZWR9IG0gcHJlcGFyZWQgbGltaXRgLFxuICAgICAgc3RhdHMucmVsaWVmLCBydWxlcy5tYXhSZWxpZWZQcmVwYXJlZCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4U3RlcCA+IHJ1bGVzLm1heFN0ZXApIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnc3RlcF9leGNlZWRlZCcsXG4gICAgICBgc3VyZmFjZSBzdGVwICR7c3RhdHMubWF4U3RlcH0gbSBleGNlZWRzICR7cnVsZXMubWF4U3RlcH0gbWAsXG4gICAgICBzdGF0cy5tYXhTdGVwLCBydWxlcy5tYXhTdGVwLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5tYXhDdXQgPiBydWxlcy5tYXhDdXQpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnY3V0X2V4Y2VlZGVkJyxcbiAgICAgIGBjdXQgJHtzdGF0cy5tYXhDdXR9IG0gZXhjZWVkcyAke3J1bGVzLm1heEN1dH0gbWAsXG4gICAgICBzdGF0cy5tYXhDdXQsIHJ1bGVzLm1heEN1dCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4RmlsbCA+IHJ1bGVzLm1heEZpbGwpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnZmlsbF9leGNlZWRlZCcsXG4gICAgICBgZmlsbCAke3N0YXRzLm1heEZpbGx9IG0gZXhjZWVkcyAke3J1bGVzLm1heEZpbGx9IG1gLFxuICAgICAgc3RhdHMubWF4RmlsbCwgcnVsZXMubWF4RmlsbCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMuY3V0Vm9sdW1lID4gcnVsZXMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2N1dF92b2x1bWVfZXhjZWVkZWQnLFxuICAgICAgYGN1dCB2b2x1bWUgJHtzdGF0cy5jdXRWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEN1dFZvbHVtZX0gbVx1MDBCM2AsXG4gICAgICBzdGF0cy5jdXRWb2x1bWUsIHJ1bGVzLm1heEN1dFZvbHVtZSxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMuZmlsbFZvbHVtZSA+IHJ1bGVzLm1heEZpbGxWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnZmlsbF92b2x1bWVfZXhjZWVkZWQnLFxuICAgICAgYGZpbGwgdm9sdW1lICR7c3RhdHMuZmlsbFZvbHVtZX0gbVx1MDBCMyBleGNlZWRzICR7cnVsZXMubWF4RmlsbFZvbHVtZX0gbVx1MDBCM2AsXG4gICAgICBzdGF0cy5maWxsVm9sdW1lLCBydWxlcy5tYXhGaWxsVm9sdW1lLFxuICAgICkpO1xuICB9XG4gIGlmIChydWxlcy5yZXF1aXJlc0RyeSAmJiBzdGF0cy53YXRlckNvbHVtbnMgPiAwKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ3dhdGVyJyxcbiAgICAgIGAke3N0YXRzLndhdGVyQ29sdW1uc30gZm9vdHByaW50IGNvbHVtbnMgYXJlIHVuZGVyd2F0ZXJgLFxuICAgICAgc3RhdHMud2F0ZXJDb2x1bW5zLCAwLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoID4gcnVsZXMubWF4T2JzdHJ1Y3Rpb25zKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2Zvb3RwcmludF9vYnN0cnVjdGVkJyxcbiAgICAgIGAke3N0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGh9IG9ic3RydWN0aW9ucyBleGNlZWQgdGhlICR7cnVsZXMubWF4T2JzdHJ1Y3Rpb25zfSBhbGxvd2FuY2VgLFxuICAgICAgc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCwgcnVsZXMubWF4T2JzdHJ1Y3Rpb25zLFxuICAgICkpO1xuICB9XG4gIGlmIChmcC5vdmVyaGFuZ0NlbGxzLmxlbmd0aCA+IDApIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnb3ZlcmhhbmcnLFxuICAgICAgYCR7ZnAub3ZlcmhhbmdDZWxscy5sZW5ndGh9IGNlbGxzIGFib3ZlIHRoZSBmbG9vciBhcmUgYmxvY2tlZGAsXG4gICAgICBmcC5vdmVyaGFuZ0NlbGxzLmxlbmd0aCwgMCxcbiAgICApKTtcbiAgfVxuXG4gIGNvbnN0IG5lZWRzR3JhZGluZyA9IHN0YXRzLnJlbGllZiA+IHJ1bGVzLm1heFJlbGllZk5vUHJlcFxuICAgIHx8IHN0YXRzLmN1dFZvbHVtZSA+IDAgfHwgc3RhdHMuZmlsbFZvbHVtZSA+IDA7XG4gIGNvbnN0IG5lZWRzQ2xlYXJpbmcgPSBzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoID4gMFxuICAgICYmIHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGggPD0gcnVsZXMubWF4T2JzdHJ1Y3Rpb25zO1xuXG4gIGlmIChuZWVkc0dyYWRpbmcpIHtcbiAgICByZWFzb25zLnB1c2gocHJlcChcbiAgICAgICduZWVkc19ncmFkaW5nJyxcbiAgICAgIGBncmFkaW5nIHJlcXVpcmVkOiAke3N0YXRzLmN1dFZvbHVtZX0gbVx1MDBCMyBjdXQsICR7c3RhdHMuZmlsbFZvbHVtZX0gbVx1MDBCMyBmaWxsYCxcbiAgICAgIHN0YXRzLmN1dFZvbHVtZSArIHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgKSk7XG4gIH1cbiAgaWYgKG5lZWRzQ2xlYXJpbmcpIHtcbiAgICByZWFzb25zLnB1c2gocHJlcChcbiAgICAgICduZWVkc19jbGVhcmluZycsXG4gICAgICBgJHtzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RofSBvYnN0cnVjdGlvbnMgdG8gY2xlYXJgLFxuICAgICAgc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCwgcnVsZXMubWF4T2JzdHJ1Y3Rpb25zLFxuICAgICkpO1xuICB9XG5cbiAgY29uc3QgaGFzRXJyb3IgPSByZWFzb25zLnNvbWUoKHIpID0+IHIuc2V2ZXJpdHkgPT09ICdlcnJvcicpO1xuICBjb25zdCBoYXNQcmVwID0gcmVhc29ucy5zb21lKChyKSA9PiByLnNldmVyaXR5ID09PSAncHJlcGFyYXRpb24nKTtcbiAgY29uc3Qgc3RhdGU6IFNpdGVTdGF0ZSA9IGhhc0Vycm9yID8gJ2ludmFsaWQnIDogaGFzUHJlcCA/ICd2YWxpZF93aXRoX3ByZXBhcmF0aW9uJyA6ICd2YWxpZCc7XG5cbiAgcmV0dXJuIHtcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICBzdGF0ZSxcbiAgICByZWFzb25zLFxuICAgIHF1ZXJ5OiBmcCxcbiAgICBwcmVwYXJhdGlvbjoge1xuICAgICAgbmVlZHNHcmFkaW5nLFxuICAgICAgbmVlZHNDbGVhcmluZyxcbiAgICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogc3RhdHMubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogc3RhdHMubWF4RmlsbCxcbiAgICAgIG9ic3RydWN0aW9uSWRzOiBzdGF0cy5vYnN0cnVjdGlvbnMubWFwKChvKSA9PiBvLmVudGl0eUlkKSxcbiAgICAgIGZvdW5kYXRpb246IHJ1bGVzLmZvdW5kYXRpb24sXG4gICAgfSxcbiAgfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBjYW5kaWRhdGUgc2VhcmNoIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgU2VhcmNoT3B0aW9ucyB7XG4gIC8qKiBDYW5kaWRhdGUgZ3JpZCBzdGVwIGluIG1ldHJlcy4gRGVmYXVsdCAyLiAqL1xuICBzdGVwPzogbnVtYmVyO1xuICBtYXhSZXN1bHRzPzogbnVtYmVyO1xuICBhbmNob3I/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIG1heERpc3RhbmNlPzogbnVtYmVyO1xuICAvKiogSGFyZCBjb25zdHJhaW50OiBjYW5kaWRhdGUgY2VudHJlIG11c3QgbGllIHdpdGhpbiB0aGlzIHJhZGl1cyBvZiBhIHBvaW50LiAqL1xuICBuZWFyPzogeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgbWF4RGlzdGFuY2U6IG51bWJlciB9O1xuICAvKiogRG8gbm90IHJldHVybiB0d28gY2FuZGlkYXRlcyB3aG9zZSBmb290cHJpbnRzIG92ZXJsYXAuIERlZmF1bHQgdHJ1ZS4gKi9cbiAgZGlzdGluY3Q/OiBib29sZWFuO1xuICAvKiogV2FsbC1jbG9jayBidWRnZXQgZm9yIHRoZSBzY2FuLiBEZWZhdWx0IDEwMCBtcy4gKi9cbiAgYnVkZ2V0TXM/OiBudW1iZXI7XG4gIHdhbGs/OiBXYWxrUGFyYW1zO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVDYW5kaWRhdGUge1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHN0YXRlOiAndmFsaWQnIHwgJ3ZhbGlkX3dpdGhfcHJlcGFyYXRpb24nO1xuICB2YWxpZGF0aW9uOiBTaXRlVmFsaWRhdGlvbjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgb2JzdHJ1Y3Rpb25Db3VudDogbnVtYmVyO1xuICBkaXN0YW5jZTogbnVtYmVyO1xuICBzY29yZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVTZWFyY2hSZXN1bHQge1xuICBjYW5kaWRhdGVzOiBTaXRlQ2FuZGlkYXRlW107XG4gIGV2YWx1YXRlZDogbnVtYmVyO1xuICByZWplY3RlZDogbnVtYmVyO1xuICBlbGFwc2VkTXM6IG51bWJlcjtcbiAgYnVkZ2V0TXM6IG51bWJlcjtcbiAgLyoqIFRydWUgd2hlbiB0aGUgd2FsbC1jbG9jayBidWRnZXQgc3RvcHBlZCB0aGUgc2NhbiBiZWZvcmUgdGhlIGFyZWEgd2FzIGV4aGF1c3RlZC4gKi9cbiAgdHJ1bmNhdGVkOiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBmbG9vckNhbmRpZGF0ZXMoc3RhdHM6IEFyZWFTdGF0cyk6IG51bWJlcltdIHtcbiAgY29uc3QgbWVhbiA9IE1hdGgucm91bmQoc3RhdHMubWVhblkpO1xuICBjb25zdCBzZXQgPSBuZXcgU2V0PG51bWJlcj4oKTtcbiAgZm9yIChsZXQgZCA9IC0xOyBkIDw9IDE7IGQrKykgc2V0LmFkZChtZWFuICsgZCk7XG4gIHNldC5hZGQoc3RhdHMubWluWSk7XG4gIHNldC5hZGQoc3RhdHMubWF4WSk7XG4gIHJldHVybiBbLi4uc2V0XS5maWx0ZXIoKHkpID0+IHkgPj0gWV9NSU4gJiYgeSA8IFlfTUFYKS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG59XG5cbmZ1bmN0aW9uIG92ZXJsYXBzKGE6IFJlY3QsIGI6IFJlY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIGEueDAgPD0gYi54MSAmJiBhLngxID49IGIueDAgJiYgYS56MCA8PSBiLnoxICYmIGEuejEgPj0gYi56MDtcbn1cblxuZnVuY3Rpb24gY2FuZGlkYXRlU2NvcmUodjogU2l0ZVZhbGlkYXRpb24sIGRpc3RhbmNlOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBwcmVwUGVuYWx0eSA9IHYuc3RhdGUgPT09ICd2YWxpZCcgPyAwIDogMjU7XG4gIGNvbnN0IGdyYWRpbmcgPSB2LnByZXBhcmF0aW9uLmN1dFZvbHVtZSArIHYucHJlcGFyYXRpb24uZmlsbFZvbHVtZTtcbiAgY29uc3QgY2xlYXJpbmcgPSB2LnByZXBhcmF0aW9uLm9ic3RydWN0aW9uSWRzLmxlbmd0aCAqIDQ7XG4gIHJldHVybiBwcmVwUGVuYWx0eSArIGdyYWRpbmcgKyBjbGVhcmluZyArIGRpc3RhbmNlICogMC4yNTtcbn1cblxuLyoqXG4gKiBTZWFyY2ggYSBib3VuZGVkIGFyZWEgZm9yIHZpYWJsZSBmb290cHJpbnRzLiBUaGUgc2FtZSB2YWxpZGF0b3IgYW5kIHRoZSBzYW1lXG4gKiBmbG9vci1zZWxlY3Rpb24gcG9saWN5IGFyZSB1c2VkIGJ5IHRoZSBBSSBhZ2VudCBhbmQgdGhlIHBsYXllcidzIGJ1aWxkXG4gKiBwcmV2aWV3LiBTZWFyY2ggaXMgcmVhZC1vbmx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2VhcmNoU2l0ZXMoXG4gIHdvcmxkOiBXb3JsZCwgcnVsZXM6IEJ1aWxkaW5nUnVsZXMsIGFyZWE6IFJlY3QsIG9wdGlvbnM6IFNlYXJjaE9wdGlvbnMgPSB7fSxcbik6IFNpdGVTZWFyY2hSZXN1bHQge1xuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBzdGVwID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihvcHRpb25zLnN0ZXAgPz8gMikpO1xuICBjb25zdCBtYXhSZXN1bHRzID0gTWF0aC5tYXgoMSwgb3B0aW9ucy5tYXhSZXN1bHRzID8/IDgpO1xuICBjb25zdCBkaXN0aW5jdCA9IG9wdGlvbnMuZGlzdGluY3QgIT09IGZhbHNlO1xuICBjb25zdCBtYXhEaXN0YW5jZSA9IG9wdGlvbnMubWF4RGlzdGFuY2UgPz8gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuICBjb25zdCBidWRnZXRNcyA9IG9wdGlvbnMuYnVkZ2V0TXMgPz8gMTAwO1xuICBjb25zdCBhbmNob3IgPSBvcHRpb25zLmFuY2hvciA/PyB7IHg6IChhcmVhLngwICsgYXJlYS54MSkgLyAyLCB6OiAoYXJlYS56MCArIGFyZWEuejEpIC8gMiB9O1xuICBjb25zdCBxdWVyeSA9IG5ldyBUZXJyYWluUXVlcnkod29ybGQpO1xuICBjb25zdCBhbGw6IFNpdGVDYW5kaWRhdGVbXSA9IFtdO1xuICBsZXQgZXZhbHVhdGVkID0gMDtcbiAgbGV0IHJlamVjdGVkID0gMDtcbiAgbGV0IHRydW5jYXRlZCA9IGZhbHNlO1xuXG4gIGNvbnN0IHgxTWF4ID0gYXJlYS54MSAtIHJ1bGVzLndpZHRoICsgMTtcbiAgY29uc3QgejFNYXggPSBhcmVhLnoxIC0gcnVsZXMuZGVwdGggKyAxO1xuICBzY2FuOiBmb3IgKGxldCB6ID0gYXJlYS56MDsgeiA8PSB6MU1heDsgeiArPSBzdGVwKSB7XG4gICAgZm9yIChsZXQgeCA9IGFyZWEueDA7IHggPD0geDFNYXg7IHggKz0gc3RlcCkge1xuICAgICAgY29uc3QgcmVjdCA9IHsgeDA6IHgsIHowOiB6LCB4MTogeCArIHJ1bGVzLndpZHRoIC0gMSwgejE6IHogKyBydWxlcy5kZXB0aCAtIDEgfTtcbiAgICAgIGNvbnN0IGN4ID0gKHJlY3QueDAgKyByZWN0LngxKSAvIDI7XG4gICAgICBjb25zdCBjeiA9IChyZWN0LnowICsgcmVjdC56MSkgLyAyO1xuICAgICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLmh5cG90KGN4IC0gYW5jaG9yLngsIGN6IC0gYW5jaG9yLnopO1xuICAgICAgaWYgKGRpc3RhbmNlID4gbWF4RGlzdGFuY2UpIGNvbnRpbnVlO1xuICAgICAgaWYgKG9wdGlvbnMubmVhcikge1xuICAgICAgICBjb25zdCBuZWFyRGlzdGFuY2UgPSBNYXRoLmh5cG90KGN4IC0gb3B0aW9ucy5uZWFyLngsIGN6IC0gb3B0aW9ucy5uZWFyLnopO1xuICAgICAgICBpZiAobmVhckRpc3RhbmNlID4gb3B0aW9ucy5uZWFyLm1heERpc3RhbmNlKSBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc3RhdHMgPSBxdWVyeS5hcmVhKHJlY3QpO1xuICAgICAgbGV0IGJlc3Q6IFNpdGVDYW5kaWRhdGUgfCBudWxsID0gbnVsbDtcbiAgICAgIGZvciAoY29uc3QgZmxvb3JZIG9mIGZsb29yQ2FuZGlkYXRlcyhzdGF0cykpIHtcbiAgICAgICAgZXZhbHVhdGVkKys7XG4gICAgICAgIGNvbnN0IHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwgPSB7XG4gICAgICAgICAgc2l0ZUlkOiBgJHtydWxlcy5pZH06JHt4fSwke3p9LCR7Zmxvb3JZfWAsXG4gICAgICAgICAgcmVjdCwgZmxvb3JZLCBydWxlcyxcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgZm9vdHByaW50ID0gcXVlcnkuZm9vdHByaW50KHJlY3QsIGZsb29yWSk7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZVNpdGUod29ybGQsIHByb3Bvc2FsLCBxdWVyeSwgZm9vdHByaW50KTtcbiAgICAgICAgaWYgKHZhbGlkYXRpb24uc3RhdGUgPT09ICdpbnZhbGlkJykge1xuICAgICAgICAgIHJlamVjdGVkKys7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2NvcmUgPSBjYW5kaWRhdGVTY29yZSh2YWxpZGF0aW9uLCBkaXN0YW5jZSk7XG4gICAgICAgIGNvbnN0IGNhbmRpZGF0ZTogU2l0ZUNhbmRpZGF0ZSA9IHtcbiAgICAgICAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICAgICAgICByZWN0LFxuICAgICAgICAgIGZsb29yWSxcbiAgICAgICAgICBzdGF0ZTogdmFsaWRhdGlvbi5zdGF0ZSxcbiAgICAgICAgICB2YWxpZGF0aW9uLFxuICAgICAgICAgIGN1dFZvbHVtZTogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5jdXRWb2x1bWUsXG4gICAgICAgICAgZmlsbFZvbHVtZTogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5maWxsVm9sdW1lLFxuICAgICAgICAgIG9ic3RydWN0aW9uQ291bnQ6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24ub2JzdHJ1Y3Rpb25JZHMubGVuZ3RoLFxuICAgICAgICAgIGRpc3RhbmNlLFxuICAgICAgICAgIHNjb3JlLFxuICAgICAgICB9O1xuICAgICAgICBpZiAoIWJlc3RcbiAgICAgICAgICB8fCAoY2FuZGlkYXRlLnN0YXRlID09PSAndmFsaWQnICYmIGJlc3Quc3RhdGUgIT09ICd2YWxpZCcpXG4gICAgICAgICAgfHwgKGNhbmRpZGF0ZS5zdGF0ZSA9PT0gYmVzdC5zdGF0ZSAmJiBjYW5kaWRhdGUuc2NvcmUgPCBiZXN0LnNjb3JlKSkge1xuICAgICAgICAgIGJlc3QgPSBjYW5kaWRhdGU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChiZXN0KSBhbGwucHVzaChiZXN0KTtcbiAgICB9XG4gICAgaWYgKHBlcmZvcm1hbmNlLm5vdygpIC0gdDAgPiBidWRnZXRNcykge1xuICAgICAgdHJ1bmNhdGVkID0gdHJ1ZTtcbiAgICAgIGJyZWFrIHNjYW47XG4gICAgfVxuICB9XG5cbiAgYWxsLnNvcnQoKGEsIGIpID0+IGEuc2NvcmUgLSBiLnNjb3JlIHx8IGEuZGlzdGFuY2UgLSBiLmRpc3RhbmNlXG4gICAgfHwgYS5yZWN0LngwIC0gYi5yZWN0LngwIHx8IGEucmVjdC56MCAtIGIucmVjdC56MCk7XG4gIGNvbnN0IHNlbGVjdGVkOiBTaXRlQ2FuZGlkYXRlW10gPSBbXTtcbiAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgYWxsKSB7XG4gICAgaWYgKGRpc3RpbmN0ICYmIHNlbGVjdGVkLnNvbWUoKHMpID0+IG92ZXJsYXBzKHMucmVjdCwgY2FuZGlkYXRlLnJlY3QpKSkgY29udGludWU7XG4gICAgc2VsZWN0ZWQucHVzaChjYW5kaWRhdGUpO1xuICAgIGlmIChzZWxlY3RlZC5sZW5ndGggPj0gbWF4UmVzdWx0cykgYnJlYWs7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNhbmRpZGF0ZXM6IHNlbGVjdGVkLFxuICAgIGV2YWx1YXRlZCxcbiAgICByZWplY3RlZCxcbiAgICBlbGFwc2VkTXM6IE1hdGgucm91bmQoKHBlcmZvcm1hbmNlLm5vdygpIC0gdDApICogMTAwKSAvIDEwMCxcbiAgICBidWRnZXRNcyxcbiAgICB0cnVuY2F0ZWQsXG4gIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gcHJldmlldyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIEZvdW5kYXRpb25QcmV2aWV3IHtcbiAgdHlwZTogRm91bmRhdGlvblR5cGU7XG4gIC8qKiBTdG9uZSBmbG9vciBzbGFiIHBsdXMgZmlsbCB1bmRlciB0aGUgcHJlcGFyZWQgZmxvb3IuICovXG4gIHBsaW50aENlbGxzOiBudW1iZXI7XG4gIC8qKiBQZXJpbWV0ZXIgY2VsbHMgdGhhdCBuZWVkIGEgcmV0YWluaW5nIGZhY2UgYmVjYXVzZSBvZiBjdXQgb3IgZmlsbC4gKi9cbiAgcmV0YWluaW5nV2FsbENlbGxzOiBudW1iZXI7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQWNjZXNzUHJldmlldyB7XG4gIGRvb3I6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgYXBwcm9hY2g6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgZGlzdGFuY2U6IG51bWJlcjtcbiAgZ3JhZGU6IG51bWJlcjtcbiAgd2Fsa2FibGU6IGJvb2xlYW47XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVQcmV2aWV3IHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHN0YXRlOiBTaXRlU3RhdGU7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBydWxlczogQnVpbGRpbmdSdWxlcztcbiAgcmVhc29uczogVmFsaWRhdGlvblJlYXNvbltdO1xuICB0ZXJyYWluOiB7XG4gICAgbWluWTogbnVtYmVyO1xuICAgIG1heFk6IG51bWJlcjtcbiAgICBtZWFuWTogbnVtYmVyO1xuICAgIHJlbGllZjogbnVtYmVyO1xuICAgIG1heFN0ZXA6IG51bWJlcjtcbiAgICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gICAgbWF4Q3V0OiBudW1iZXI7XG4gICAgbWF4RmlsbDogbnVtYmVyO1xuICB9O1xuICBmb3VuZGF0aW9uOiBGb3VuZGF0aW9uUHJldmlldztcbiAgb2JzdHJ1Y3Rpb25zOiBBcnJheTx7XG4gICAgZW50aXR5SWQ6IHN0cmluZztcbiAgICBraW5kOiBzdHJpbmc7XG4gICAgeDogbnVtYmVyO1xuICAgIHo6IG51bWJlcjtcbiAgICBhY3Rpb246ICdjbGVhcicgfCAnYmxvY2tlZCc7XG4gIH0+O1xuICBhY2Nlc3M6IEFjY2Vzc1ByZXZpZXcgfCBudWxsO1xuICAvKiogQ29tcGxldGUgd29yayBlbnZlbG9wZSB0aGlzIHByZXZpZXcgd291bGQgYXV0aG9yaXplLiAqL1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmV2aWV3T3B0aW9ucyB7XG4gIGRvb3I/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGFwcHJvYWNoPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICB3YWxrPzogV2Fsa1BhcmFtcztcbn1cblxuLyoqXG4gKiBCdWlsZCB0aGUgdGhyZWUtc3RhdGUgcHJldmlldy4gSXQgaXMgZGVsaWJlcmF0ZWx5IGRhdGEtb25seTogdGhlIHJlbmRlcmVyXG4gKiBjYW4gZHJhdyBpdCwgYnV0IGl0IG5ldmVyIGVkaXRzIHRlcnJhaW4gb3Igc3BlbmRzIHJlc291cmNlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByZXZpZXdTaXRlKFxuICB3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwsIG9wdGlvbnM6IFByZXZpZXdPcHRpb25zID0ge30sXG4pOiBTaXRlUHJldmlldyB7XG4gIGNvbnN0IHF1ZXJ5ID0gbmV3IFRlcnJhaW5RdWVyeSh3b3JsZCk7XG4gIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZVNpdGUod29ybGQsIHByb3Bvc2FsLCBxdWVyeSk7XG4gIGNvbnN0IGZwID0gdmFsaWRhdGlvbi5xdWVyeTtcbiAgY29uc3Qgc3RhdHMgPSBmcC5zdGF0cztcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHJ1bGVzID0gcHJvcG9zYWwucnVsZXM7XG5cbiAgbGV0IHBlcmltZXRlciA9IDA7XG4gIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykge1xuICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykge1xuICAgICAgaWYgKHggIT09IHJlY3QueDAgJiYgeCAhPT0gcmVjdC54MSAmJiB6ICE9PSByZWN0LnowICYmIHogIT09IHJlY3QuejEpIGNvbnRpbnVlO1xuICAgICAgaWYgKGNvbHVtbkF0KHdvcmxkLCB4LCB6KS5zdXJmYWNlWSAhPT0gcHJvcG9zYWwuZmxvb3JZKSBwZXJpbWV0ZXIrKztcbiAgICB9XG4gIH1cbiAgY29uc3QgZm91bmRhdGlvbjogRm91bmRhdGlvblByZXZpZXcgPSB7XG4gICAgdHlwZTogcnVsZXMuZm91bmRhdGlvbixcbiAgICBwbGludGhDZWxsczogcmVjdENvbHVtbnMocmVjdCkgKyBzdGF0cy5maWxsVm9sdW1lLFxuICAgIHJldGFpbmluZ1dhbGxDZWxsczogcGVyaW1ldGVyLFxuICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgIGZpbGxWb2x1bWU6IHN0YXRzLmZpbGxWb2x1bWUsXG4gIH07XG5cbiAgbGV0IGFjY2VzczogQWNjZXNzUHJldmlldyB8IG51bGwgPSBudWxsO1xuICBpZiAob3B0aW9ucy5kb29yICYmIG9wdGlvbnMuYXBwcm9hY2gpIHtcbiAgICBjb25zdCBkb29yID0gb3B0aW9ucy5kb29yO1xuICAgIGNvbnN0IGFwcHJvYWNoID0gb3B0aW9ucy5hcHByb2FjaDtcbiAgICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGRpc3RhbmNlID0gTWF0aC5oeXBvdChkb29yLnggLSBhcHByb2FjaC54LCBkb29yLnogLSBhcHByb2FjaC56KTtcbiAgICBjb25zdCBzdGVwcyA9IE1hdGgubWF4KDEsIE1hdGguY2VpbChkaXN0YW5jZSkpO1xuICAgIGxldCBwcmV2WCA9IGFwcHJvYWNoLngsIHByZXZaID0gYXBwcm9hY2guejtcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBzdGVwczsgaSsrKSB7XG4gICAgICBjb25zdCB0ID0gaSAvIHN0ZXBzO1xuICAgICAgY29uc3QgeCA9IE1hdGgucm91bmQoYXBwcm9hY2gueCArIChkb29yLnggLSBhcHByb2FjaC54KSAqIHQpO1xuICAgICAgY29uc3QgeiA9IE1hdGgucm91bmQoYXBwcm9hY2gueiArIChkb29yLnogLSBhcHByb2FjaC56KSAqIHQpO1xuICAgICAgaWYgKHggPT09IHByZXZYICYmIHogPT09IHByZXZaKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHdhbGtTdGVwKHdvcmxkLCBwcmV2WCwgcHJldlosIHgsIHosIG9wdGlvbnMud2FsayA/PyBERUZBVUxUX1dBTEspO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHJlYXNvbnMucHVzaChgJHtyZXN1bHQucmVhc29ufSBhdCAke3h9LCR7en1gKTtcbiAgICAgIHByZXZYID0geDsgcHJldlogPSB6O1xuICAgIH1cbiAgICBhY2Nlc3MgPSB7XG4gICAgICBkb29yLCBhcHByb2FjaCwgZGlzdGFuY2UsXG4gICAgICBncmFkZTogZWZmZWN0aXZlR3JhZGUod29ybGQsIGFwcHJvYWNoLngsIGFwcHJvYWNoLnosIGRvb3IueCwgZG9vci56KSxcbiAgICAgIHdhbGthYmxlOiByZWFzb25zLmxlbmd0aCA9PT0gMCxcbiAgICAgIHJlYXNvbnMsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHkwID0gcHJvcG9zYWwuZmxvb3JZIC0gTWF0aC5tYXgoMSwgc3RhdHMubWF4Q3V0KSAtIDE7XG4gIGNvbnN0IHkxID0gcHJvcG9zYWwuZmxvb3JZICsgTWF0aC5tYXgocnVsZXMud2FsbEhlaWdodCwgMSkgKyAxO1xuICBjb25zdCBlbnZlbG9wZTogVm94ZWxSZWdpb25bXSA9IFtcbiAgICB7XG4gICAgICAuLi5leHBhbmRSZWN0KHJlY3QsIDIpLFxuICAgICAgeTA6IE1hdGgubWF4KFlfTUlOLCB5MCksXG4gICAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCB5MSksXG4gICAgfSxcbiAgXTtcbiAgaWYgKGFjY2Vzcykge1xuICAgIGNvbnN0IGF4MCA9IE1hdGgubWluKGFjY2Vzcy5kb29yLngsIGFjY2Vzcy5hcHByb2FjaC54KSAtIDE7XG4gICAgY29uc3QgYXgxID0gTWF0aC5tYXgoYWNjZXNzLmRvb3IueCwgYWNjZXNzLmFwcHJvYWNoLngpICsgMTtcbiAgICBjb25zdCBhejAgPSBNYXRoLm1pbihhY2Nlc3MuZG9vci56LCBhY2Nlc3MuYXBwcm9hY2gueikgLSAxO1xuICAgIGNvbnN0IGF6MSA9IE1hdGgubWF4KGFjY2Vzcy5kb29yLnosIGFjY2Vzcy5hcHByb2FjaC56KSArIDE7XG4gICAgY29uc3QgYU1pbiA9IE1hdGgubWluKHN1cmZhY2VBdCh3b3JsZCwgYXgwLCBhejApLCBzdXJmYWNlQXQod29ybGQsIGF4MSwgYXoxKSk7XG4gICAgY29uc3QgYU1heCA9IE1hdGgubWF4KHN1cmZhY2VBdCh3b3JsZCwgYXgwLCBhejApLCBzdXJmYWNlQXQod29ybGQsIGF4MSwgYXoxKSk7XG4gICAgZW52ZWxvcGUucHVzaCh7XG4gICAgICB4MDogYXgwLCB4MTogYXgxLCB6MDogYXowLCB6MTogYXoxLFxuICAgICAgeTA6IE1hdGgubWF4KFlfTUlOLCBhTWluIC0gMiksXG4gICAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCBhTWF4ICsgMiksXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHN0YXRlOiB2YWxpZGF0aW9uLnN0YXRlLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwcm9wb3NhbC5mbG9vclksXG4gICAgcnVsZXMsXG4gICAgcmVhc29uczogdmFsaWRhdGlvbi5yZWFzb25zLFxuICAgIHRlcnJhaW46IHtcbiAgICAgIG1pblk6IHN0YXRzLm1pblksXG4gICAgICBtYXhZOiBzdGF0cy5tYXhZLFxuICAgICAgbWVhblk6IHN0YXRzLm1lYW5ZLFxuICAgICAgcmVsaWVmOiBzdGF0cy5yZWxpZWYsXG4gICAgICBtYXhTdGVwOiBzdGF0cy5tYXhTdGVwLFxuICAgICAgY3V0Vm9sdW1lOiBzdGF0cy5jdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lOiBzdGF0cy5maWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0OiBzdGF0cy5tYXhDdXQsXG4gICAgICBtYXhGaWxsOiBzdGF0cy5tYXhGaWxsLFxuICAgIH0sXG4gICAgZm91bmRhdGlvbixcbiAgICBvYnN0cnVjdGlvbnM6IHN0YXRzLm9ic3RydWN0aW9ucy5tYXAoKG8pID0+ICh7XG4gICAgICBlbnRpdHlJZDogby5lbnRpdHlJZCxcbiAgICAgIGtpbmQ6IG8ua2luZCxcbiAgICAgIHg6IG8ueCxcbiAgICAgIHo6IG8ueixcbiAgICAgIGFjdGlvbjogdmFsaWRhdGlvbi5zdGF0ZSA9PT0gJ2ludmFsaWQnID8gJ2Jsb2NrZWQnIDogJ2NsZWFyJyxcbiAgICB9KSksXG4gICAgYWNjZXNzLFxuICAgIGVudmVsb3BlLFxuICB9O1xufVxuXG4iLCAiLy8gTTAwMiBzdGFnZSAzOiBib3VuZGVkLCBhdXRob3JpemVkIHRlcnJhaW4gcHJlcGFyYXRpb24uXG4vL1xuLy8gVGhlIHBpcGVsaW5lIGlzIGRlbGliZXJhdGVseSBvbmUtd2F5IGFuZCBzaGFyZWQgYnkgdGhlIHBsYXllciBhbmQgdGhlIEFJOlxuLy9cbi8vICAgcHJvcG9zYWwgLT4gdmFsaWRhdGVTaXRlIC0+IHBsYW5QcmVwYXJhdGlvbiAtPiBBdXRob3JpemVyIC0+IGV4ZWN1dGVcbi8vXG4vLyBgZXhlY3V0ZVByZXBhcmF0aW9uYCBpcyB0aGUgb25seSBmdW5jdGlvbiBpbiBNMDAyIHRoYXQgZWRpdHMgdGVycmFpbiBmb3Jcbi8vIGNvbnN0cnVjdGlvbi4gSXQgcmVmdXNlcyB0byBydW4gd2l0aG91dCBhbiBhdXRob3JpemF0aW9uIHRva2VuIHdob3NlIGRpZ2VzdFxuLy8gbWF0Y2hlcyB0aGUgcGxhbiwgd2hvc2UgZW52ZWxvcGUgY292ZXJzIGV2ZXJ5IHZveGVsIGl0IHdvdWxkIHRvdWNoLCBhbmQgd2hvc2Vcbi8vIGJhc2UgcmV2aXNpb24gc3RpbGwgbWF0Y2hlcyB0aGUgd29ybGQuIEFsbCBlZGl0cyBhcmUgY29tcHV0ZWQgYW5kIGNoZWNrZWRcbi8vIGJlZm9yZSB0aGUgZmlyc3QgYnl0ZSBpcyB3cml0dGVuLCBzbyBhIHJlamVjdGVkIHBsYW4gY2Fubm90IGxlYXZlIGEgcGFydGlhbFxuLy8gcGFkIGJlaGluZC5cbi8vXG4vLyBUaGUgYXV0aG9yaXplciBpbiB0aGlzIGZpbGUgaXMgYSBsb2NhbCBwb2xpY3kgc3R1Yi4gSXQgcHJvdmVzIHRoYXQgdGhlXG4vLyBwaXBlbGluZSBhbmQgdGhlIGVudmVsb3BlIGNoZWNrcyBleGlzdDsgaXQgaXMgTk9UIE1hZ2ljQmxvY2sgZW5mb3JjZW1lbnQuXG4vLyBObyBjaGFpbiBwcm9ncmFtLCBTREsgY2FsbCwgc2V0dGxlbWVudCBvciByb2xsYmFjayBndWFyYW50ZWUgaXMgcHJlc2VudC5cbmltcG9ydCB7XG4gIFdvcmxkLCBNQVQsIE1hdElkLCBZX01JTiwgWV9NQVgsIEhBTEYsIGlzU29saWQsXG4gIGdldFZveGVsLCBzZXRWb3hlbCwgcmVtb3ZlRW50aXR5LCBzdXJmYWNlQXQsXG4gIHdvcmxkVG9DaHVua1gsIHdvcmxkVG9DaHVua1osIGNodW5rS2V5LFxuICBFbnRpdHlLaW5kLCBSZXNvdXJjZVR5cGUsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHtcbiAgUmVjdCwgVm94ZWxSZWdpb24sIG5vcm1hbGl6ZVJlY3QsIHJlY3RDb2x1bW5zLCBleHBhbmRSZWN0LFxuICBlbnZlbG9wZUNvbnRhaW5zLCBvYnN0cnVjdGlvbnNJbixcbn0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7XG4gIFNpdGVQcm9wb3NhbCwgU2l0ZVZhbGlkYXRpb24sIEJ1aWxkaW5nUnVsZXMsIHZhbGlkYXRlU2l0ZSxcbn0gZnJvbSAnLi9jb25zdHJ1Y3Rpb24nO1xuaW1wb3J0IHtcbiAgaW52ZW50b3J5U25hcHNob3QsIG5vcm1hbGl6ZUVudmVsb3BlLFxufSBmcm9tICcuL2Nhbm9uaWNhbCc7XG5cbmV4cG9ydCBjb25zdCBMT0NBTF9BVVRIT1JJVFkgPSAnbG9jYWwtc3R1YicgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgTE9DQUxfRU5GT1JDRU1FTlQgPSAnbG9jYWwtc2ltdWxhdGlvbi1vbmx5JyBhcyBjb25zdDtcblxuZXhwb3J0IGludGVyZmFjZSBDb2x1bW5UYXJnZXQge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBsYW5FeHBlY3RhdGlvbiB7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIG9ic3RydWN0aW9uczogbnVtYmVyO1xuICBzdXJmYWNlRWRpdHM6IG51bWJlcjtcbiAgdG90YWxFZGl0czogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uUGxhbiB7XG4gIGlkOiBzdHJpbmc7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgcnVsZXM6IEJ1aWxkaW5nUnVsZXM7XG4gIC8qKiBFeGFjdGx5IG9uZSB0YXJnZXQgd2Fsa2luZyBoZWlnaHQgcGVyIGZvb3RwcmludCBjb2x1bW4sIHNvcnRlZCBieSB6LCB4LiAqL1xuICB0YXJnZXRzOiBDb2x1bW5UYXJnZXRbXTtcbiAgLyoqIEF1dGhvcml0YXRpdmUgZW50aXR5IGlkcyB0aGlzIHBsYW4gbWF5IHJlbW92ZS4gKi9cbiAgY2xlYXJFbnRpdHlJZHM6IHN0cmluZ1tdO1xuICAvKiogTWF0ZXJpYWwgZm9yIHRoZSB0b3Agc29saWQgdm94ZWwgYWZ0ZXIgZ3JhZGluZywgb3IgbnVsbCB0byBrZWVwIGl0LiAqL1xuICBzdXJmYWNlTWF0ZXJpYWw6IE1hdElkIHwgbnVsbDtcbiAgLyoqIFRpZ2h0IGVudmVsb3BlIGNvdmVyaW5nIGV2ZXJ5IHBsYW5uZWQgdm94ZWwgY2hhbmdlLiAqL1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgZXhwZWN0ZWQ6IFBsYW5FeHBlY3RhdGlvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvbk9wdGlvbnMge1xuICAvKiogUGVyLWNvbHVtbiB0YXJnZXRzIGZvciB0ZXJyYWNlcyBvciBzdGVwcGVkIHBhdGhzLiBEZWZhdWx0cyB0byBmbG9vclkuICovXG4gIHRhcmdldHM/OiBDb2x1bW5UYXJnZXRbXTtcbiAgLyoqIGBub25lYCBpcyBvbmx5IGxlZ2FsIHdoZW4gdGhlIHNpdGUgaGFzIG5vIG9ic3RydWN0aW9ucy4gKi9cbiAgY2xlYXI/OiAnb2JzdHJ1Y3Rpb25zJyB8ICdub25lJztcbiAgLyoqIFNldCB0aGUgdG9wIHNvbGlkIHZveGVsIG9mIGV2ZXJ5IHRhcmdldCBjb2x1bW4gKHBhdGhzLCBmaWVsZHMpLiAqL1xuICBzdXJmYWNlTWF0ZXJpYWw/OiBNYXRJZDtcbiAgLyoqIEV4cGxpY2l0IHdvcmsgZW52ZWxvcGUuIERlZmF1bHRzIHRvIGEgdGlnaHQgZW52ZWxvcGUgYXJvdW5kIHRoZSBlZGl0cy4gKi9cbiAgZW52ZWxvcGU/OiBWb3hlbFJlZ2lvbltdO1xufVxuXG4vLyAtLS0tLS0tLS0tIHN0YWJsZSBkaWdlc3QgLS0tLS0tLS0tLVxuZnVuY3Rpb24gZGlnZXN0KGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgYSA9IDB4ODExYzlkYzU7XG4gIGxldCBiID0gMHg5ZTM3NzliOTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBpbnB1dC5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGMgPSBpbnB1dC5jaGFyQ29kZUF0KGkpO1xuICAgIGEgPSBNYXRoLmltdWwoYSBeIGMsIDB4MDEwMDAxOTMpO1xuICAgIGIgPSBNYXRoLmltdWwoYiBeIChjICsgMHg5ZSksIDB4ODVlYmNhNmIpO1xuICAgIGIgXj0gYiA+Pj4gMTM7XG4gIH1cbiAgcmV0dXJuIChhID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKVxuICAgICsgKGIgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG4vKiogRGlnZXN0IG9mIGV2ZXJ5dGhpbmcgdGhhdCBjaGFuZ2VzIHRoZSBzZXQgb2YgZWRpdHMgb3IgcmVtb3ZhbHMuICovXG5leHBvcnQgZnVuY3Rpb24gcGxhbkRpZ2VzdChwbGFuOiBQcmVwYXJhdGlvblBsYW4pOiBzdHJpbmcge1xuICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXG4gICAgJ20wMDI6cHJlcC1wbGFuOnYxJyxcbiAgICBwbGFuLnNpdGVJZCxcbiAgICBgJHtwbGFuLnJlY3QueDB9LCR7cGxhbi5yZWN0LnowfSwke3BsYW4ucmVjdC54MX0sJHtwbGFuLnJlY3QuejF9YCxcbiAgICBTdHJpbmcocGxhbi5mbG9vclkpLFxuICAgIHBsYW4ucnVsZXMuaWQsXG4gICAgU3RyaW5nKHBsYW4udGFyZ2V0cy5sZW5ndGgpLFxuICAgIHBsYW4uc3VyZmFjZU1hdGVyaWFsID09PSBudWxsID8gJ3N1cmZhY2U6a2VlcCcgOiBgc3VyZmFjZToke3BsYW4uc3VyZmFjZU1hdGVyaWFsfWAsXG4gIF07XG4gIGZvciAoY29uc3QgdCBvZiBwbGFuLnRhcmdldHMpIGxpbmVzLnB1c2goYHQ6JHt0Lnh9LCR7dC56fSwke3QueX1gKTtcbiAgY29uc3QgY2xlYXJzID0gWy4uLnBsYW4uY2xlYXJFbnRpdHlJZHNdLnNvcnQoKTtcbiAgbGluZXMucHVzaChgYzoke2NsZWFycy5sZW5ndGh9YCk7XG4gIGZvciAoY29uc3QgaWQgb2YgY2xlYXJzKSBsaW5lcy5wdXNoKGBjOiR7aWR9YCk7XG4gIGZvciAoY29uc3QgZSBvZiBub3JtYWxpemVFbnZlbG9wZShwbGFuLmVudmVsb3BlKSkge1xuICAgIGxpbmVzLnB1c2goYGU6JHtlLngwfSwke2UuejB9LCR7ZS55MH0sJHtlLngxfSwke2UuejF9LCR7ZS55MX1gKTtcbiAgfVxuICBjb25zdCB4ID0gcGxhbi5leHBlY3RlZDtcbiAgbGluZXMucHVzaChgeDoke3guY3V0Vm9sdW1lfSwke3guZmlsbFZvbHVtZX0sJHt4Lm1heEN1dH0sJHt4Lm1heEZpbGx9LCR7eC5vYnN0cnVjdGlvbnN9LCR7eC5zdXJmYWNlRWRpdHN9LCR7eC50b3RhbEVkaXRzfWApO1xuICByZXR1cm4gZGlnZXN0KGxpbmVzLmpvaW4oJ1xcbicpKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwbGFubmluZyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFBsYW5TdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHBsYW46IFByZXBhcmF0aW9uUGxhbjtcbiAgdmFsaWRhdGlvbjogU2l0ZVZhbGlkYXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25GYWlsdXJlIHtcbiAgb2s6IGZhbHNlO1xuICBzdGFnZTogJ3BsYW4nIHwgJ2F1dGhvcml6ZScgfCAnZXhlY3V0ZSc7XG4gIGNvZGU6IHN0cmluZztcbiAgcmVhc29uczogc3RyaW5nW107XG4gIHZhbGlkYXRpb24/OiBTaXRlVmFsaWRhdGlvbjtcbn1cblxuZXhwb3J0IHR5cGUgUGxhblJlc3VsdCA9IFBsYW5TdWNjZXNzIHwgUHJlcGFyYXRpb25GYWlsdXJlO1xuXG5mdW5jdGlvbiBkZWZhdWx0VGFyZ2V0cyh3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QsIGZsb29yWTogbnVtYmVyKTogQ29sdW1uVGFyZ2V0W10ge1xuICBjb25zdCBvdXQ6IENvbHVtblRhcmdldFtdID0gW107XG4gIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykge1xuICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykgb3V0LnB1c2goeyB4LCB6LCB5OiBmbG9vclkgfSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gc29ydGVkVGFyZ2V0cyh0YXJnZXRzOiByZWFkb25seSBDb2x1bW5UYXJnZXRbXSk6IENvbHVtblRhcmdldFtdIHtcbiAgcmV0dXJuIFsuLi50YXJnZXRzXS5zb3J0KChhLCBiKSA9PiBhLnogLSBiLnogfHwgYS54IC0gYi54IHx8IGEueSAtIGIueSk7XG59XG5cbmludGVyZmFjZSBUYXJnZXRTdGF0cyB7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIHJlbGllZjogbnVtYmVyO1xufVxuXG4vKiogQ3V0L2ZpbGwgaW1wbGllZCBieSBleHBsaWNpdCB0YXJnZXRzLCBpbmRlcGVuZGVudCBvZiB0aGUgZmxhdCBmbG9vclkuICovXG5mdW5jdGlvbiB0YXJnZXRTdGF0cyh3b3JsZDogV29ybGQsIHRhcmdldHM6IHJlYWRvbmx5IENvbHVtblRhcmdldFtdKTogVGFyZ2V0U3RhdHMge1xuICBsZXQgY3V0Vm9sdW1lID0gMCwgZmlsbFZvbHVtZSA9IDAsIG1heEN1dCA9IDAsIG1heEZpbGwgPSAwO1xuICBsZXQgbWluWSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSwgbWF4WSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgZm9yIChjb25zdCB0IG9mIHRhcmdldHMpIHtcbiAgICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB0LngsIHQueik7XG4gICAgbWluWSA9IE1hdGgubWluKG1pblksIHN1cmZhY2UsIHQueSk7XG4gICAgbWF4WSA9IE1hdGgubWF4KG1heFksIHN1cmZhY2UsIHQueSk7XG4gICAgaWYgKHN1cmZhY2UgPiB0LnkpIHtcbiAgICAgIGNvbnN0IGQgPSBzdXJmYWNlIC0gdC55O1xuICAgICAgY3V0Vm9sdW1lICs9IGQ7XG4gICAgICBtYXhDdXQgPSBNYXRoLm1heChtYXhDdXQsIGQpO1xuICAgIH0gZWxzZSBpZiAoc3VyZmFjZSA8IHQueSkge1xuICAgICAgY29uc3QgZCA9IHQueSAtIHN1cmZhY2U7XG4gICAgICBmaWxsVm9sdW1lICs9IGQ7XG4gICAgICBtYXhGaWxsID0gTWF0aC5tYXgobWF4RmlsbCwgZCk7XG4gICAgfVxuICB9XG4gIHJldHVybiB7IGN1dFZvbHVtZSwgZmlsbFZvbHVtZSwgbWF4Q3V0LCBtYXhGaWxsLCByZWxpZWY6IG1heFkgLSBtaW5ZIH07XG59XG5cbmZ1bmN0aW9uIHRhcmdldFJ1bGVSZWFzb25zKHN0YXRzOiBUYXJnZXRTdGF0cywgcnVsZXM6IEJ1aWxkaW5nUnVsZXMpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gIGlmIChzdGF0cy5yZWxpZWYgPiBydWxlcy5tYXhSZWxpZWZQcmVwYXJlZCkge1xuICAgIHJlYXNvbnMucHVzaChgcmVsaWVmICR7c3RhdHMucmVsaWVmfSBtIGV4Y2VlZHMgdGhlICR7cnVsZXMubWF4UmVsaWVmUHJlcGFyZWR9IG0gcHJlcGFyZWQgbGltaXRgKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4Q3V0ID4gcnVsZXMubWF4Q3V0KSB7XG4gICAgcmVhc29ucy5wdXNoKGBjdXQgJHtzdGF0cy5tYXhDdXR9IG0gZXhjZWVkcyAke3J1bGVzLm1heEN1dH0gbWApO1xuICB9XG4gIGlmIChzdGF0cy5tYXhGaWxsID4gcnVsZXMubWF4RmlsbCkge1xuICAgIHJlYXNvbnMucHVzaChgZmlsbCAke3N0YXRzLm1heEZpbGx9IG0gZXhjZWVkcyAke3J1bGVzLm1heEZpbGx9IG1gKTtcbiAgfVxuICBpZiAoc3RhdHMuY3V0Vm9sdW1lID4gcnVsZXMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBjdXQgdm9sdW1lICR7c3RhdHMuY3V0Vm9sdW1lfSBtXHUwMEIzIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXRWb2x1bWV9IG1cdTAwQjNgKTtcbiAgfVxuICBpZiAoc3RhdHMuZmlsbFZvbHVtZSA+IHJ1bGVzLm1heEZpbGxWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goYGZpbGwgdm9sdW1lICR7c3RhdHMuZmlsbFZvbHVtZX0gbVx1MDBCMyBleGNlZWRzICR7cnVsZXMubWF4RmlsbFZvbHVtZX0gbVx1MDBCM2ApO1xuICB9XG4gIHJldHVybiByZWFzb25zO1xufVxuXG4vKipcbiAqIFR1cm4gYSBwcm9wb3NhbCBpbnRvIGFuIGV4cGxpY2l0LCBjaGVja2FibGUgcGxhbi4gUmVhZC1vbmx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGxhblByZXBhcmF0aW9uKFxuICB3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwsIG9wdGlvbnM6IFByZXBhcmF0aW9uT3B0aW9ucyA9IHt9LFxuKTogUGxhblJlc3VsdCB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVTaXRlKHdvcmxkLCBwcm9wb3NhbCk7XG5cbiAgaWYgKHZhbGlkYXRpb24uc3RhdGUgPT09ICdpbnZhbGlkJykge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBzdGFnZTogJ3BsYW4nLFxuICAgICAgY29kZTogJ3NpdGVfaW52YWxpZCcsXG4gICAgICByZWFzb25zOiB2YWxpZGF0aW9uLnJlYXNvbnMubWFwKChyKSA9PiBgJHtyLmNvZGV9OiAke3IubWVzc2FnZX1gKSxcbiAgICAgIHZhbGlkYXRpb24sXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHRhcmdldHMgPSBzb3J0ZWRUYXJnZXRzKG9wdGlvbnMudGFyZ2V0cyA/PyBkZWZhdWx0VGFyZ2V0cyh3b3JsZCwgcmVjdCwgcHJvcG9zYWwuZmxvb3JZKSk7XG4gIGNvbnN0IGNvbHVtbnMgPSByZWN0Q29sdW1ucyhyZWN0KTtcbiAgaWYgKHRhcmdldHMubGVuZ3RoICE9PSBjb2x1bW5zKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIHN0YWdlOiAncGxhbicsXG4gICAgICBjb2RlOiAndGFyZ2V0X2NvdW50JyxcbiAgICAgIHJlYXNvbnM6IFtgcGxhbiBoYXMgJHt0YXJnZXRzLmxlbmd0aH0gdGFyZ2V0cyBmb3IgJHtjb2x1bW5zfSBjb2x1bW5zYF0sXG4gICAgICB2YWxpZGF0aW9uLFxuICAgIH07XG4gIH1cblxuICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgdCBvZiB0YXJnZXRzKSB7XG4gICAgY29uc3Qga2V5ID0gYCR7dC54fSwke3Quen1gO1xuICAgIGlmIChzZWVuLmhhcyhrZXkpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsIHN0YWdlOiAncGxhbicsIGNvZGU6ICdkdXBsaWNhdGVfdGFyZ2V0JyxcbiAgICAgICAgcmVhc29uczogW2BkdXBsaWNhdGUgdGFyZ2V0IGF0ICR7a2V5fWBdLCB2YWxpZGF0aW9uLFxuICAgICAgfTtcbiAgICB9XG4gICAgc2Vlbi5hZGQoa2V5KTtcbiAgICBpZiAodC54IDwgcmVjdC54MCB8fCB0LnggPiByZWN0LngxIHx8IHQueiA8IHJlY3QuejAgfHwgdC56ID4gcmVjdC56MSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLCBzdGFnZTogJ3BsYW4nLCBjb2RlOiAndGFyZ2V0X291dHNpZGVfZm9vdHByaW50JyxcbiAgICAgICAgcmVhc29uczogW2B0YXJnZXQgJHtrZXl9IGlzIG91dHNpZGUgJHtyZWN0LngwfSwke3JlY3QuejB9Li4ke3JlY3QueDF9LCR7cmVjdC56MX1gXSxcbiAgICAgICAgdmFsaWRhdGlvbixcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcih0LnkpIHx8IHQueSA8IFlfTUlOIHx8IHQueSA+PSBZX01BWCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLCBzdGFnZTogJ3BsYW4nLCBjb2RlOiAndGFyZ2V0X2hlaWdodCcsXG4gICAgICAgIHJlYXNvbnM6IFtgdGFyZ2V0ICR7a2V5fSBoYXMgaW52YWxpZCBoZWlnaHQgJHt0Lnl9YF0sIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IHZhbGlkYXRpb24ucHJlcGFyYXRpb24ub2JzdHJ1Y3Rpb25JZHM7XG4gIGNvbnN0IGNsZWFyID0gb3B0aW9ucy5jbGVhciA/PyAnb2JzdHJ1Y3Rpb25zJztcbiAgaWYgKGNsZWFyID09PSAnbm9uZScgJiYgb2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgIGNvZGU6ICd1bmNsZWFyZWRfb2JzdHJ1Y3Rpb25zJyxcbiAgICAgIHJlYXNvbnM6IFtgJHtvYnN0cnVjdGlvbnMubGVuZ3RofSBvYnN0cnVjdGlvbnMgd291bGQgcmVtYWluYF0sXG4gICAgICB2YWxpZGF0aW9uLFxuICAgIH07XG4gIH1cbiAgY29uc3QgY2xlYXJFbnRpdHlJZHMgPSBjbGVhciA9PT0gJ25vbmUnID8gW10gOiBbLi4ubmV3IFNldChvYnN0cnVjdGlvbnMpXS5zb3J0KCk7XG4gIGNvbnN0IHN1cmZhY2VNYXRlcmlhbCA9IG9wdGlvbnMuc3VyZmFjZU1hdGVyaWFsID8/IG51bGw7XG5cbiAgY29uc3QgY3VzdG9tVGFyZ2V0cyA9IG9wdGlvbnMudGFyZ2V0cyAhPT0gdW5kZWZpbmVkO1xuICBjb25zdCBzdGF0cyA9IGN1c3RvbVRhcmdldHNcbiAgICA/IHRhcmdldFN0YXRzKHdvcmxkLCB0YXJnZXRzKVxuICAgIDoge1xuICAgICAgY3V0Vm9sdW1lOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLmN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5tYXhDdXQsXG4gICAgICBtYXhGaWxsOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm1heEZpbGwsXG4gICAgICByZWxpZWY6IHZhbGlkYXRpb24ucXVlcnkuc3RhdHMucmVsaWVmLFxuICAgIH07XG4gIGlmIChjdXN0b21UYXJnZXRzKSB7XG4gICAgY29uc3QgcmVhc29ucyA9IHRhcmdldFJ1bGVSZWFzb25zKHN0YXRzLCBwcm9wb3NhbC5ydWxlcyk7XG4gICAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICBzdGFnZTogJ3BsYW4nLFxuICAgICAgICBjb2RlOiAndGFyZ2V0X3J1bGVzJyxcbiAgICAgICAgcmVhc29ucyxcbiAgICAgICAgdmFsaWRhdGlvbixcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgbGV0IGxvID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuICBsZXQgaGkgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gIGZvciAoY29uc3QgdCBvZiB0YXJnZXRzKSB7XG4gICAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgdC54LCB0LnopO1xuICAgIGxvID0gTWF0aC5taW4obG8sIHN1cmZhY2UsIHQueSk7XG4gICAgaGkgPSBNYXRoLm1heChoaSwgc3VyZmFjZSAtIDEsIHQueSAtIDEpO1xuICB9XG4gIGNvbnN0IGJ1ZmZlcmVkID0gZXhwYW5kUmVjdChyZWN0LCAxKTtcbiAgY29uc3QgZGVyaXZlZDogVm94ZWxSZWdpb24gPSB7XG4gICAgeDA6IE1hdGgubWF4KC1IQUxGLCBidWZmZXJlZC54MCksXG4gICAgejA6IE1hdGgubWF4KC1IQUxGLCBidWZmZXJlZC56MCksXG4gICAgeDE6IE1hdGgubWluKEhBTEYgLSAxLCBidWZmZXJlZC54MSksXG4gICAgejE6IE1hdGgubWluKEhBTEYgLSAxLCBidWZmZXJlZC56MSksXG4gICAgeTA6IE1hdGgubWF4KFlfTUlOLCBsbyAtIDEpLFxuICAgIHkxOiBNYXRoLm1pbihZX01BWCAtIDEsIGhpICsgMSksXG4gIH07XG4gIC8vIEFuIGV4cGxpY2l0IGVudmVsb3BlIHJlcGxhY2VzIHRoZSBkZXJpdmVkIG9uZS4gQ2FsbGVycyB0aGF0IHBpbiBhbiBleGFjdFxuICAvLyB3b3JrIGVudmVsb3BlIChwYXRoIHByZXBhcmF0aW9uKSBtdXN0IG5vdCBzaWxlbnRseSB3aWRlbiBpdCB3aXRoIHRoZVxuICAvLyBkZWZhdWx0IDEgbSBidWZmZXIuXG4gIGNvbnN0IGVudmVsb3BlID0gbm9ybWFsaXplRW52ZWxvcGUob3B0aW9ucy5lbnZlbG9wZSA/PyBbZGVyaXZlZF0pO1xuICBjb25zdCBzdXJmYWNlRWRpdHMgPSBzdXJmYWNlTWF0ZXJpYWwgPT09IG51bGwgPyAwIDogdGFyZ2V0cy5sZW5ndGg7XG5cbiAgY29uc3QgcGxhbjogUHJlcGFyYXRpb25QbGFuID0ge1xuICAgIGlkOiAnJyxcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcHJvcG9zYWwuZmxvb3JZLFxuICAgIHJ1bGVzOiBwcm9wb3NhbC5ydWxlcyxcbiAgICB0YXJnZXRzLFxuICAgIGNsZWFyRW50aXR5SWRzLFxuICAgIHN1cmZhY2VNYXRlcmlhbCxcbiAgICBlbnZlbG9wZSxcbiAgICBleHBlY3RlZDoge1xuICAgICAgY3V0Vm9sdW1lOiBzdGF0cy5jdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lOiBzdGF0cy5maWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0OiBzdGF0cy5tYXhDdXQsXG4gICAgICBtYXhGaWxsOiBzdGF0cy5tYXhGaWxsLFxuICAgICAgb2JzdHJ1Y3Rpb25zOiBjbGVhckVudGl0eUlkcy5sZW5ndGgsXG4gICAgICBzdXJmYWNlRWRpdHMsXG4gICAgICB0b3RhbEVkaXRzOiBzdGF0cy5jdXRWb2x1bWUgKyBzdGF0cy5maWxsVm9sdW1lICsgc3VyZmFjZUVkaXRzLFxuICAgIH0sXG4gIH07XG4gIHBsYW4uaWQgPSBgcHJlcDoke3BsYW5EaWdlc3QocGxhbil9YDtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4sIHZhbGlkYXRpb24gfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBhdXRob3JpemF0aW9uIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aG9yaXphdGlvbkxpbWl0cyB7XG4gIG1heEN1dFZvbHVtZTogbnVtYmVyO1xuICBtYXhGaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heFZveGVsRWRpdHM6IG51bWJlcjtcbiAgbWF4RW50aXR5UmVtb3ZhbHM6IG51bWJlcjtcbiAgbWF4VGFyZ2V0czogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9MSU1JVFM6IEF1dGhvcml6YXRpb25MaW1pdHMgPSB7XG4gIG1heEN1dFZvbHVtZTogMjU2LFxuICBtYXhGaWxsVm9sdW1lOiAyNTYsXG4gIG1heFZveGVsRWRpdHM6IDEwMjQsXG4gIG1heEVudGl0eVJlbW92YWxzOiAxNixcbiAgbWF4VGFyZ2V0czogNTEyLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBXb3JrQXV0aG9yaXphdGlvbiB7XG4gIGlkOiBzdHJpbmc7XG4gIGF1dGhvcml0eTogdHlwZW9mIExPQ0FMX0FVVEhPUklUWTtcbiAgZW5mb3JjZW1lbnQ6IHR5cGVvZiBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgcGxhbkRpZ2VzdDogc3RyaW5nO1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgYmFzZVJldmlzaW9uOiBudW1iZXI7XG4gIGxpbWl0czogQXV0aG9yaXphdGlvbkxpbWl0cztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBdXRob3JpemF0aW9uRGVjaXNpb24ge1xuICBvazogYm9vbGVhbjtcbiAgYXV0aG9yaXphdGlvbjogV29ya0F1dGhvcml6YXRpb24gfCBudWxsO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBdXRob3JpemF0aW9uUG9saWN5IHtcbiAgLyoqIFRoZSBvbmx5IHJlZ2lvbnMgdGhpcyBnb3Zlcm5vciBwZXJtaXRzIGZvciB0aGUgZmlyc3Qgc2xpY2UuICovXG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICBsaW1pdHM/OiBQYXJ0aWFsPEF1dGhvcml6YXRpb25MaW1pdHM+O1xufVxuXG5mdW5jdGlvbiByZWdpb25Db250YWluZWQocmVnaW9uOiBWb3hlbFJlZ2lvbiwgcG9saWN5OiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogYm9vbGVhbiB7XG4gIHJldHVybiBwb2xpY3kuc29tZSgocCkgPT4gcmVnaW9uLngwID49IHAueDAgJiYgcmVnaW9uLngxIDw9IHAueDFcbiAgICAmJiByZWdpb24uejAgPj0gcC56MCAmJiByZWdpb24uejEgPD0gcC56MVxuICAgICYmIHJlZ2lvbi55MCA+PSBwLnkwICYmIHJlZ2lvbi55MSA8PSBwLnkxKTtcbn1cblxuLyoqXG4gKiBMb2NhbCBnb3Zlcm5vciBzdHViLiBJdCBlbmZvcmNlcyBhIGZpeGVkIGVudmVsb3BlIGFuZCBoYXJkIHZvbHVtZSBsaW1pdHMsXG4gKiBiaW5kcyBhIHRva2VuIHRvIHRoZSBleGFjdCBwbGFuIGRpZ2VzdCBhbmQgd29ybGQgcmV2aXNpb24sIGFuZCByZWZ1c2VzIHRvXG4gKiBwcmV0ZW5kIGl0IGlzIGFuIG9uLWNoYWluIGF1dGhvcml0eS5cbiAqL1xuZXhwb3J0IGNsYXNzIExvY2FsQXV0aG9yaXplciB7XG4gIHJlYWRvbmx5IGF1dGhvcml0eSA9IExPQ0FMX0FVVEhPUklUWTtcbiAgcmVhZG9ubHkgZW5mb3JjZW1lbnQgPSBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgcmVhZG9ubHkgbGltaXRzOiBBdXRob3JpemF0aW9uTGltaXRzO1xuXG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHBvbGljeTogQXV0aG9yaXphdGlvblBvbGljeSkge1xuICAgIHRoaXMubGltaXRzID0geyAuLi5ERUZBVUxUX0xJTUlUUywgLi4uKHBvbGljeS5saW1pdHMgPz8ge30pIH07XG4gIH1cblxuICBhdXRob3JpemUod29ybGQ6IFdvcmxkLCBwbGFuOiBQcmVwYXJhdGlvblBsYW4pOiBBdXRob3JpemF0aW9uRGVjaXNpb24ge1xuICAgIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocGxhbi5yZWN0KTtcblxuICAgIGlmIChwbGFuLnRhcmdldHMubGVuZ3RoICE9PSByZWN0Q29sdW1ucyhyZWN0KSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBwbGFuIGhhcyAke3BsYW4udGFyZ2V0cy5sZW5ndGh9IHRhcmdldHMgZm9yICR7cmVjdENvbHVtbnMocmVjdCl9IGNvbHVtbnNgKTtcbiAgICB9XG4gICAgaWYgKHBsYW4udGFyZ2V0cy5sZW5ndGggPiB0aGlzLmxpbWl0cy5tYXhUYXJnZXRzKSB7XG4gICAgICByZWFzb25zLnB1c2goYCR7cGxhbi50YXJnZXRzLmxlbmd0aH0gdGFyZ2V0cyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhUYXJnZXRzfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5leHBlY3RlZC5jdXRWb2x1bWUgPiB0aGlzLmxpbWl0cy5tYXhDdXRWb2x1bWUpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgY3V0ICR7cGxhbi5leHBlY3RlZC5jdXRWb2x1bWV9IGV4Y2VlZHMgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhDdXRWb2x1bWV9YCk7XG4gICAgfVxuICAgIGlmIChwbGFuLmV4cGVjdGVkLmZpbGxWb2x1bWUgPiB0aGlzLmxpbWl0cy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgICByZWFzb25zLnB1c2goYGZpbGwgJHtwbGFuLmV4cGVjdGVkLmZpbGxWb2x1bWV9IGV4Y2VlZHMgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhGaWxsVm9sdW1lfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5leHBlY3RlZC50b3RhbEVkaXRzID4gdGhpcy5saW1pdHMubWF4Vm94ZWxFZGl0cykge1xuICAgICAgcmVhc29ucy5wdXNoKGBwbGFubmVkIGVkaXRzIGV4Y2VlZCBsaW1pdCAke3RoaXMubGltaXRzLm1heFZveGVsRWRpdHN9YCk7XG4gICAgfVxuICAgIGlmIChwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aCA+IHRoaXMubGltaXRzLm1heEVudGl0eVJlbW92YWxzKSB7XG4gICAgICByZWFzb25zLnB1c2goYCR7cGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGh9IHJlbW92YWxzIGV4Y2VlZCBsaW1pdCAke3RoaXMubGltaXRzLm1heEVudGl0eVJlbW92YWxzfWApO1xuICAgIH1cbiAgICBpZiAobmV3IFNldChwbGFuLmNsZWFyRW50aXR5SWRzKS5zaXplICE9PSBwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aCkge1xuICAgICAgcmVhc29ucy5wdXNoKCdkdXBsaWNhdGUgZW50aXR5IHJlbW92YWwgaWRzJyk7XG4gICAgfVxuXG4gICAgaWYgKHBsYW4uZW52ZWxvcGUubGVuZ3RoID09PSAwKSB7XG4gICAgICByZWFzb25zLnB1c2goJ3BsYW4gaGFzIG5vIHdvcmsgZW52ZWxvcGUnKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCByZWdpb24gb2YgcGxhbi5lbnZlbG9wZSkge1xuICAgICAgaWYgKCFyZWdpb25Db250YWluZWQocmVnaW9uLCB0aGlzLnBvbGljeS5lbnZlbG9wZSkpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBlbnZlbG9wZSAke3JlZ2lvbi54MH0sJHtyZWdpb24uejB9LCR7cmVnaW9uLnkwfS4uJHtyZWdpb24ueDF9LCR7cmVnaW9uLnoxfSwke3JlZ2lvbi55MX0gaXMgb3V0c2lkZSB0aGUgbG9jYWwgcG9saWN5YCk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgdCBvZiBwbGFuLnRhcmdldHMpIHtcbiAgICAgIGlmICghZW52ZWxvcGVDb250YWlucyhwbGFuLmVudmVsb3BlLCB0LngsIHQueSwgdC56KVxuICAgICAgICB8fCAodC55ID4gWV9NSU4gJiYgIWVudmVsb3BlQ29udGFpbnMocGxhbi5lbnZlbG9wZSwgdC54LCB0LnkgLSAxLCB0LnopKSkge1xuICAgICAgICByZWFzb25zLnB1c2goYHRhcmdldCAke3QueH0sJHt0Lnp9LCR7dC55fSBpcyBub3QgY292ZXJlZCBieSB0aGUgd29yayBlbnZlbG9wZWApO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEV2ZXJ5IG9ic3RydWN0aW9uIGN1cnJlbnRseSBvbiB0aGUgZm9vdHByaW50IG11c3QgYmUgaW4gdGhlIHBsYW4sIGFuZFxuICAgIC8vIHRoZSBwbGFuIG1heSBub3QgcmVtb3ZlIGFueXRoaW5nIHRoYXQgaXMgbm90IGFuIG9ic3RydWN0aW9uIHRoZXJlLlxuICAgIGNvbnN0IGN1cnJlbnQgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCkubWFwKChvKSA9PiBvLmVudGl0eUlkKS5zb3J0KCk7XG4gICAgY29uc3QgcGxhbm5lZCA9IFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCk7XG4gICAgaWYgKGN1cnJlbnQubGVuZ3RoICE9PSBwbGFubmVkLmxlbmd0aCB8fCBjdXJyZW50LnNvbWUoKGlkLCBpKSA9PiBpZCAhPT0gcGxhbm5lZFtpXSkpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgcGxhbiByZW1vdmFscyBbJHtwbGFubmVkLmpvaW4oJywnKX1dIGRvIG5vdCBtYXRjaCBmb290cHJpbnQgb2JzdHJ1Y3Rpb25zIFske2N1cnJlbnQuam9pbignLCcpfV1gKTtcbiAgICB9XG5cbiAgICBpZiAocmVhc29ucy5sZW5ndGggPiAwKSByZXR1cm4geyBvazogZmFsc2UsIGF1dGhvcml6YXRpb246IG51bGwsIHJlYXNvbnMgfTtcblxuICAgIGNvbnN0IHRva2VuOiBXb3JrQXV0aG9yaXphdGlvbiA9IHtcbiAgICAgIGlkOiBgbG9jYWwtc3R1Yjoke3BsYW5EaWdlc3QocGxhbil9YCxcbiAgICAgIGF1dGhvcml0eTogTE9DQUxfQVVUSE9SSVRZLFxuICAgICAgZW5mb3JjZW1lbnQ6IExPQ0FMX0VORk9SQ0VNRU5ULFxuICAgICAgcGxhbkRpZ2VzdDogcGxhbkRpZ2VzdChwbGFuKSxcbiAgICAgIGVudmVsb3BlOiBub3JtYWxpemVFbnZlbG9wZShwbGFuLmVudmVsb3BlKSxcbiAgICAgIGJhc2VSZXZpc2lvbjogd29ybGQucmV2aXNpb24sXG4gICAgICBsaW1pdHM6IHsgLi4udGhpcy5saW1pdHMgfSxcbiAgICB9O1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCBhdXRob3JpemF0aW9uOiB0b2tlbiwgcmVhc29uczogW10gfTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIGV4ZWN1dGlvbiAtLS0tLS0tLS0tXG5pbnRlcmZhY2UgUGVuZGluZ0VkaXQge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICBiZWZvcmU6IE1hdElkO1xuICBhZnRlcjogTWF0SWQ7XG4gIC8qKiBUcnVlIGZvciBhIG1hdGVyaWFsLW9ubHkgdG9wLXN1cmZhY2UgY2hhbmdlLiAqL1xuICBzdXJmYWNlPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDaHVua0RlbHRhIHtcbiAgY2h1bms6IHN0cmluZztcbiAgY2hhbmdlZDogbnVtYmVyO1xuICBhZGRlZDogbnVtYmVyO1xuICByZW1vdmVkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2xlYXJlZEVudGl0eSB7XG4gIGVudGl0eUlkOiBzdHJpbmc7XG4gIGtpbmQ6IEVudGl0eUtpbmQ7XG4gIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsO1xuICBhbW91bnQ6IG51bWJlcjtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvbkxlZGdlciB7XG4gIGF1dGhvcml0eTogdHlwZW9mIExPQ0FMX0FVVEhPUklUWTtcbiAgZW5mb3JjZW1lbnQ6IHR5cGVvZiBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgYXV0aG9yaXphdGlvbklkOiBzdHJpbmc7XG4gIHBsYW5EaWdlc3Q6IHN0cmluZztcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBuZXRTcG9pbDogbnVtYmVyO1xuICBib3Jyb3dlZEZpbGw6IG51bWJlcjtcbiAgY3V0QnlNYXRlcmlhbDogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgZmlsbEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIHZveGVsRWRpdHM6IG51bWJlcjtcbiAgc3VyZmFjZUVkaXRzOiBudW1iZXI7XG4gIGVudGl0aWVzQ2xlYXJlZDogQ2xlYXJlZEVudGl0eVtdO1xuICByZXNvdXJjZXNHYWluZWQ6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIGludmVudG9yeUJlZm9yZTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgaW52ZW50b3J5QWZ0ZXI6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGNodW5rRGVsdGFzOiBDaHVua0RlbHRhW107XG4gIHJldmlzaW9uQmVmb3JlOiBudW1iZXI7XG4gIHJldmlzaW9uQWZ0ZXI6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvblN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcGxhbjogUHJlcGFyYXRpb25QbGFuO1xuICBhdXRob3JpemF0aW9uOiBXb3JrQXV0aG9yaXphdGlvbjtcbiAgbGVkZ2VyOiBQcmVwYXJhdGlvbkxlZGdlcjtcbn1cblxuZXhwb3J0IHR5cGUgUHJlcGFyYXRpb25PdXRjb21lID0gUHJlcGFyYXRpb25TdWNjZXNzIHwgUHJlcGFyYXRpb25GYWlsdXJlO1xuXG5jb25zdCBNQVRFUklBTF9OQU1FUzogUmVjb3JkPG51bWJlciwgc3RyaW5nPiA9IHtcbiAgW01BVC5HUkFTU106ICdncmFzcycsXG4gIFtNQVQuU09JTF06ICdzb2lsJyxcbiAgW01BVC5TQU5EXTogJ3NhbmQnLFxuICBbTUFULkdSQVZFTF06ICdncmF2ZWwnLFxuICBbTUFULlNUT05FXTogJ3N0b25lJyxcbiAgW01BVC5PUkVdOiAnb3JlJyxcbiAgW01BVC5XQVRFUl06ICd3YXRlcicsXG4gIFtNQVQuQkVEUk9DS106ICdiZWRyb2NrJyxcbiAgW01BVC5NT1NTXTogJ21vc3MnLFxufTtcblxuZnVuY3Rpb24gbWF0ZXJpYWxOYW1lKG06IE1hdElkKTogc3RyaW5nIHtcbiAgcmV0dXJuIE1BVEVSSUFMX05BTUVTW21dID8/IGBtYXRfJHttfWA7XG59XG5cbmZ1bmN0aW9uIGZpbGxNYXRlcmlhbCh5OiBudW1iZXIsIHRhcmdldDogbnVtYmVyKTogTWF0SWQge1xuICByZXR1cm4geSA9PT0gdGFyZ2V0IC0gMSA/IE1BVC5HUkFTUyA6IE1BVC5TT0lMO1xufVxuXG5mdW5jdGlvbiBmYWlsKHN0YWdlOiBQcmVwYXJhdGlvbkZhaWx1cmVbJ3N0YWdlJ10sIGNvZGU6IHN0cmluZywgcmVhc29uczogc3RyaW5nW10pOiBQcmVwYXJhdGlvbkZhaWx1cmUge1xuICByZXR1cm4geyBvazogZmFsc2UsIHN0YWdlLCBjb2RlLCByZWFzb25zIH07XG59XG5cbi8qKlxuICogQXBwbHkgYW4gYXV0aG9yaXplZCBwbGFuLiBObyB2b3hlbCBpcyB3cml0dGVuIHVudGlsIGV2ZXJ5IGVkaXQgYW5kIHJlbW92YWxcbiAqIGhhcyBiZWVuIGNoZWNrZWQgYWdhaW5zdCB0aGUgdG9rZW4sIHRoZSBwbGFuIGVudmVsb3BlIGFuZCB0aGUgaGFyZCBsaW1pdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBleGVjdXRlUHJlcGFyYXRpb24oXG4gIHdvcmxkOiBXb3JsZCwgcGxhbjogUHJlcGFyYXRpb25QbGFuLCBhdXRob3JpemF0aW9uOiBXb3JrQXV0aG9yaXphdGlvbixcbik6IFByZXBhcmF0aW9uT3V0Y29tZSB7XG4gIGlmIChhdXRob3JpemF0aW9uLmF1dGhvcml0eSAhPT0gTE9DQUxfQVVUSE9SSVRZXG4gICAgfHwgYXV0aG9yaXphdGlvbi5lbmZvcmNlbWVudCAhPT0gTE9DQUxfRU5GT1JDRU1FTlQpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICd1bnN1cHBvcnRlZF9hdXRob3JpdHknLCBbXG4gICAgICBgYXV0aG9yaXR5ICR7YXV0aG9yaXphdGlvbi5hdXRob3JpdHl9LyR7YXV0aG9yaXphdGlvbi5lbmZvcmNlbWVudH0gaXMgbm90IHRoZSBsb2NhbCBzdHViYCxcbiAgICBdKTtcbiAgfVxuICBpZiAoYXV0aG9yaXphdGlvbi5wbGFuRGlnZXN0ICE9PSBwbGFuRGlnZXN0KHBsYW4pKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnZGlnZXN0X21pc21hdGNoJywgWydhdXRob3JpemF0aW9uIGRvZXMgbm90IG1hdGNoIHRoaXMgcGxhbiddKTtcbiAgfVxuICBpZiAoYXV0aG9yaXphdGlvbi5iYXNlUmV2aXNpb24gIT09IHdvcmxkLnJldmlzaW9uKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnc3RhbGVfYXV0aG9yaXphdGlvbicsIFtcbiAgICAgIGBhdXRob3JpemF0aW9uIHdhcyBpc3N1ZWQgYXQgcmV2aXNpb24gJHthdXRob3JpemF0aW9uLmJhc2VSZXZpc2lvbn0sIHdvcmxkIGlzIGF0ICR7d29ybGQucmV2aXNpb259YCxcbiAgICBdKTtcbiAgfVxuICBpZiAocGxhbi5lbnZlbG9wZS5zb21lKChyKSA9PiAhcmVnaW9uQ29udGFpbmVkKHIsIGF1dGhvcml6YXRpb24uZW52ZWxvcGUpKSkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ2VudmVsb3BlX21pc21hdGNoJywgWydwbGFuIGVudmVsb3BlIGlzIHdpZGVyIHRoYW4gdGhlIGF1dGhvcml6YXRpb24nXSk7XG4gIH1cblxuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwbGFuLnJlY3QpO1xuICBjb25zdCBlZGl0czogUGVuZGluZ0VkaXRbXSA9IFtdO1xuICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50YXJnZXRzKSB7XG4gICAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgdC54LCB0LnopO1xuICAgIGlmICh0LnkgPCBzdXJmYWNlKSB7XG4gICAgICBmb3IgKGxldCB5ID0gdC55OyB5IDwgc3VyZmFjZTsgeSsrKSB7XG4gICAgICAgIGNvbnN0IGJlZm9yZSA9IGdldFZveGVsKHdvcmxkLCB0LngsIHksIHQueik7XG4gICAgICAgIGlmIChpc1NvbGlkKGJlZm9yZSkpIGVkaXRzLnB1c2goeyB4OiB0LngsIHksIHo6IHQueiwgYmVmb3JlLCBhZnRlcjogTUFULkFJUiB9KTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHQueSA+IHN1cmZhY2UpIHtcbiAgICAgIGZvciAobGV0IHkgPSBzdXJmYWNlOyB5IDwgdC55OyB5KyspIHtcbiAgICAgICAgY29uc3QgYmVmb3JlID0gZ2V0Vm94ZWwod29ybGQsIHQueCwgeSwgdC56KTtcbiAgICAgICAgaWYgKCFpc1NvbGlkKGJlZm9yZSkpIHtcbiAgICAgICAgICBjb25zdCBhZnRlciA9IHBsYW4uc3VyZmFjZU1hdGVyaWFsICE9PSBudWxsICYmIHkgPT09IHQueSAtIDFcbiAgICAgICAgICAgID8gcGxhbi5zdXJmYWNlTWF0ZXJpYWxcbiAgICAgICAgICAgIDogZmlsbE1hdGVyaWFsKHksIHQueSk7XG4gICAgICAgICAgZWRpdHMucHVzaCh7IHg6IHQueCwgeSwgejogdC56LCBiZWZvcmUsIGFmdGVyIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIE1hdGVyaWFsLW9ubHkgc3VyZmFjZSBjaGFuZ2UgZm9yIGN1dCBvciBhbHJlYWR5LWxldmVsIGNvbHVtbnMuIEZpbGxcbiAgICAvLyBjb2x1bW5zIGFscmVhZHkgcmVjZWl2ZSB0aGUgc3VyZmFjZSBtYXRlcmlhbCBpbiB0aGUgZmlsbCBsb29wIGFib3ZlLlxuICAgIGlmIChwbGFuLnN1cmZhY2VNYXRlcmlhbCAhPT0gbnVsbCkge1xuICAgICAgY29uc3QgdG9wWSA9IHQueSAtIDE7XG4gICAgICBjb25zdCBiZWZvcmUgPSBnZXRWb3hlbCh3b3JsZCwgdC54LCB0b3BZLCB0LnopO1xuICAgICAgaWYgKGlzU29saWQoYmVmb3JlKSAmJiBiZWZvcmUgIT09IHBsYW4uc3VyZmFjZU1hdGVyaWFsKSB7XG4gICAgICAgIGVkaXRzLnB1c2goe1xuICAgICAgICAgIHg6IHQueCwgeTogdG9wWSwgejogdC56LCBiZWZvcmUsIGFmdGVyOiBwbGFuLnN1cmZhY2VNYXRlcmlhbCwgc3VyZmFjZTogdHJ1ZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gQ2hlY2sgZXZlcnkgZWRpdCBiZWZvcmUgbXV0YXRpbmcgYW55dGhpbmcuXG4gIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgZSBvZiBlZGl0cykge1xuICAgIGlmIChlLnggPCByZWN0LngwIHx8IGUueCA+IHJlY3QueDEgfHwgZS56IDwgcmVjdC56MCB8fCBlLnogPiByZWN0LnoxKSB7XG4gICAgICByZWFzb25zLnB1c2goYGVkaXQgJHtlLnh9LCR7ZS55fSwke2Uuen0gaXMgb3V0c2lkZSB0aGUgZm9vdHByaW50YCk7XG4gICAgfVxuICAgIGlmICghZW52ZWxvcGVDb250YWlucyhhdXRob3JpemF0aW9uLmVudmVsb3BlLCBlLngsIGUueSwgZS56KSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBlZGl0ICR7ZS54fSwke2UueX0sJHtlLnp9IGlzIG91dHNpZGUgdGhlIGF1dGhvcml6ZWQgZW52ZWxvcGVgKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgY3V0Vm9sdW1lID0gZWRpdHMuZmlsdGVyKChlKSA9PiBlLmFmdGVyID09PSBNQVQuQUlSICYmIGlzU29saWQoZS5iZWZvcmUpKS5sZW5ndGg7XG4gIGNvbnN0IGZpbGxWb2x1bWUgPSBlZGl0cy5maWx0ZXIoKGUpID0+IGUuYWZ0ZXIgIT09IE1BVC5BSVIgJiYgIWlzU29saWQoZS5iZWZvcmUpKS5sZW5ndGg7XG4gIGlmIChjdXRWb2x1bWUgPiBhdXRob3JpemF0aW9uLmxpbWl0cy5tYXhDdXRWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goYGN1dCAke2N1dFZvbHVtZX0gZXhjZWVkcyBsaW1pdCAke2F1dGhvcml6YXRpb24ubGltaXRzLm1heEN1dFZvbHVtZX1gKTtcbiAgfVxuICBpZiAoZmlsbFZvbHVtZSA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heEZpbGxWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goYGZpbGwgJHtmaWxsVm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7YXV0aG9yaXphdGlvbi5saW1pdHMubWF4RmlsbFZvbHVtZX1gKTtcbiAgfVxuICBpZiAoZWRpdHMubGVuZ3RoID4gYXV0aG9yaXphdGlvbi5saW1pdHMubWF4Vm94ZWxFZGl0cykge1xuICAgIHJlYXNvbnMucHVzaChgJHtlZGl0cy5sZW5ndGh9IGVkaXRzIGV4Y2VlZCBsaW1pdCAke2F1dGhvcml6YXRpb24ubGltaXRzLm1heFZveGVsRWRpdHN9YCk7XG4gIH1cblxuICBjb25zdCBjdXJyZW50ID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpLm1hcCgobykgPT4gby5lbnRpdHlJZCkuc29ydCgpO1xuICBjb25zdCBwbGFubmVkID0gWy4uLnBsYW4uY2xlYXJFbnRpdHlJZHNdLnNvcnQoKTtcbiAgaWYgKGN1cnJlbnQubGVuZ3RoICE9PSBwbGFubmVkLmxlbmd0aCB8fCBjdXJyZW50LnNvbWUoKGlkLCBpKSA9PiBpZCAhPT0gcGxhbm5lZFtpXSkpIHtcbiAgICByZWFzb25zLnB1c2goJ2Zvb3RwcmludCBvYnN0cnVjdGlvbnMgY2hhbmdlZCBhZnRlciBhdXRob3JpemF0aW9uJyk7XG4gIH1cbiAgaWYgKHBsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RoID4gYXV0aG9yaXphdGlvbi5saW1pdHMubWF4RW50aXR5UmVtb3ZhbHMpIHtcbiAgICByZWFzb25zLnB1c2goYCR7cGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGh9IHJlbW92YWxzIGV4Y2VlZCBsaW1pdCAke2F1dGhvcml6YXRpb24ubGltaXRzLm1heEVudGl0eVJlbW92YWxzfWApO1xuICB9XG4gIGZvciAoY29uc3QgaWQgb2YgcGxhbi5jbGVhckVudGl0eUlkcykge1xuICAgIGlmICghd29ybGQuZW50aXRpZXMuaGFzKGlkKSkgcmVhc29ucy5wdXNoKGBlbnRpdHkgJHtpZH0gbm8gbG9uZ2VyIGV4aXN0c2ApO1xuICB9XG4gIGlmICh3b3JsZC5saWZlKSB7XG4gICAgbGV0IHJlY292ZXJlZCA9IDA7XG4gICAgZm9yIChjb25zdCBpZCBvZiBwbGFuLmNsZWFyRW50aXR5SWRzKSB7XG4gICAgICBjb25zdCBlbnRpdHkgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgICAgaWYgKGVudGl0eT8ucmVzb3VyY2UgJiYgZW50aXR5LnJlbWFpbmluZyA+IDApIHJlY292ZXJlZCArPSBlbnRpdHkucmVtYWluaW5nO1xuICAgIH1cbiAgICAvLyBDaGVjayBiZWZvcmUgYW55IHZveGVsIG9yIGVudGl0eSBjaGFuZ2VzLCBwcmVzZXJ2aW5nIGxlZ2FjeSB1bmJvdW5kZWRcbiAgICAvLyBjb25zdHJ1Y3Rpb24gYmVoYXZpb3IgYW5kIHNjaGVtYS0zIGNhcnJpZWQtY2FwYWNpdHkgY29uc2VydmF0aW9uLlxuICAgIGlmIChPYmplY3QudmFsdWVzKHdvcmxkLmludmVudG9yeSkucmVkdWNlKChzdW0sIGFtb3VudCkgPT4gc3VtICsgYW1vdW50LCAwKSArIHJlY292ZXJlZCA+IDEyMCkge1xuICAgICAgcmVhc29ucy5wdXNoKCdyZXNvdXJjZXMgcmVjb3ZlcmVkIGR1cmluZyBzaXRlIGNsZWFyaW5nIHdvdWxkIGV4Y2VlZCBjYXJyaWVkIGNhcGFjaXR5IDEyMCcpO1xuICAgIH1cbiAgfVxuICBpZiAocmVhc29ucy5sZW5ndGggPiAwKSByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICd1bmF1dGhvcml6ZWRfZWRpdHMnLCByZWFzb25zKTtcblxuICBjb25zdCBpbnZlbnRvcnlCZWZvcmUgPSBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCk7XG4gIGNvbnN0IHJldmlzaW9uQmVmb3JlID0gd29ybGQucmV2aXNpb247XG4gIGNvbnN0IGNodW5rRGVsdGFzID0gbmV3IE1hcDxzdHJpbmcsIENodW5rRGVsdGE+KCk7XG4gIGNvbnN0IGN1dEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgY29uc3QgZmlsbEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgbGV0IGFwcGxpZWQgPSAwO1xuICBsZXQgc3VyZmFjZUVkaXRzID0gMDtcblxuICBmb3IgKGNvbnN0IGUgb2YgZWRpdHMpIHtcbiAgICBpZiAoIXNldFZveGVsKHdvcmxkLCBlLngsIGUueSwgZS56LCBlLmFmdGVyKSkgY29udGludWU7XG4gICAgYXBwbGllZCsrO1xuICAgIGlmIChlLnN1cmZhY2UpIHN1cmZhY2VFZGl0cysrO1xuICAgIGNvbnN0IGtleSA9IGNodW5rS2V5KHdvcmxkVG9DaHVua1goZS54KSwgd29ybGRUb0NodW5rWihlLnopKTtcbiAgICBsZXQgZGVsdGEgPSBjaHVua0RlbHRhcy5nZXQoa2V5KTtcbiAgICBpZiAoIWRlbHRhKSB7XG4gICAgICBkZWx0YSA9IHsgY2h1bms6IGtleSwgY2hhbmdlZDogMCwgYWRkZWQ6IDAsIHJlbW92ZWQ6IDAgfTtcbiAgICAgIGNodW5rRGVsdGFzLnNldChrZXksIGRlbHRhKTtcbiAgICB9XG4gICAgZGVsdGEuY2hhbmdlZCsrO1xuICAgIGNvbnN0IHdhc1NvbGlkID0gaXNTb2xpZChlLmJlZm9yZSk7XG4gICAgY29uc3QgaXNOb3dTb2xpZCA9IGlzU29saWQoZS5hZnRlcik7XG4gICAgaWYgKCF3YXNTb2xpZCAmJiBpc05vd1NvbGlkKSBkZWx0YS5hZGRlZCsrO1xuICAgIGlmICh3YXNTb2xpZCAmJiAhaXNOb3dTb2xpZCkgZGVsdGEucmVtb3ZlZCsrO1xuICAgIGNvbnN0IG5hbWUgPSBtYXRlcmlhbE5hbWUoZS5iZWZvcmUpO1xuICAgIGlmICh3YXNTb2xpZCAmJiAhaXNOb3dTb2xpZCkgY3V0QnlNYXRlcmlhbFtuYW1lXSA9IChjdXRCeU1hdGVyaWFsW25hbWVdID8/IDApICsgMTtcbiAgICBpZiAoIXdhc1NvbGlkICYmIGlzTm93U29saWQpIGZpbGxCeU1hdGVyaWFsW21hdGVyaWFsTmFtZShlLmFmdGVyKV0gPSAoZmlsbEJ5TWF0ZXJpYWxbbWF0ZXJpYWxOYW1lKGUuYWZ0ZXIpXSA/PyAwKSArIDE7XG4gIH1cblxuICBjb25zdCBlbnRpdGllc0NsZWFyZWQ6IENsZWFyZWRFbnRpdHlbXSA9IFtdO1xuICBjb25zdCByZXNvdXJjZXNHYWluZWQ6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4gPSB7fTtcbiAgZm9yIChjb25zdCBpZCBvZiBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpKSB7XG4gICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgaWYgKCFlKSBjb250aW51ZTtcbiAgICBjb25zdCBhbW91bnQgPSBlLnJlc291cmNlICYmIGUucmVtYWluaW5nID4gMCA/IGUucmVtYWluaW5nIDogMDtcbiAgICBpZiAoZS5yZXNvdXJjZSAmJiBhbW91bnQgPiAwKSB7XG4gICAgICB3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPSAod29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICAgICAgcmVzb3VyY2VzR2FpbmVkW2UucmVzb3VyY2VdID0gKHJlc291cmNlc0dhaW5lZFtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgICB9XG4gICAgcmVtb3ZlRW50aXR5KHdvcmxkLCBpZCk7XG4gICAgZW50aXRpZXNDbGVhcmVkLnB1c2goe1xuICAgICAgZW50aXR5SWQ6IGlkLCBraW5kOiBlLmtpbmQsIHJlc291cmNlOiBlLnJlc291cmNlLCBhbW91bnQsIHg6IGUueCwgeTogZS55LCB6OiBlLnosXG4gICAgfSk7XG4gIH1cblxuICBjb25zdCBjdXQgPSBhcHBsaWVkID4gMCA/IE9iamVjdC52YWx1ZXMoY3V0QnlNYXRlcmlhbCkucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCkgOiAwO1xuICBjb25zdCBmaWxsID0gYXBwbGllZCA+IDAgPyBPYmplY3QudmFsdWVzKGZpbGxCeU1hdGVyaWFsKS5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKSA6IDA7XG4gIGNvbnN0IGxlZGdlcjogUHJlcGFyYXRpb25MZWRnZXIgPSB7XG4gICAgYXV0aG9yaXR5OiBMT0NBTF9BVVRIT1JJVFksXG4gICAgZW5mb3JjZW1lbnQ6IExPQ0FMX0VORk9SQ0VNRU5ULFxuICAgIGF1dGhvcml6YXRpb25JZDogYXV0aG9yaXphdGlvbi5pZCxcbiAgICBwbGFuRGlnZXN0OiBhdXRob3JpemF0aW9uLnBsYW5EaWdlc3QsXG4gICAgc2l0ZUlkOiBwbGFuLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcGxhbi5mbG9vclksXG4gICAgY3V0Vm9sdW1lOiBjdXQsXG4gICAgZmlsbFZvbHVtZTogZmlsbCxcbiAgICBuZXRTcG9pbDogY3V0IC0gZmlsbCxcbiAgICBib3Jyb3dlZEZpbGw6IE1hdGgubWF4KDAsIGZpbGwgLSBjdXQpLFxuICAgIGN1dEJ5TWF0ZXJpYWwsXG4gICAgZmlsbEJ5TWF0ZXJpYWwsXG4gICAgdm94ZWxFZGl0czogYXBwbGllZCxcbiAgICBzdXJmYWNlRWRpdHMsXG4gICAgZW50aXRpZXNDbGVhcmVkLFxuICAgIHJlc291cmNlc0dhaW5lZCxcbiAgICBpbnZlbnRvcnlCZWZvcmUsXG4gICAgaW52ZW50b3J5QWZ0ZXI6IGludmVudG9yeVNuYXBzaG90KHdvcmxkKSxcbiAgICBjaHVua0RlbHRhczogWy4uLmNodW5rRGVsdGFzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmNodW5rLmxvY2FsZUNvbXBhcmUoYi5jaHVuaykpLFxuICAgIHJldmlzaW9uQmVmb3JlLFxuICAgIHJldmlzaW9uQWZ0ZXI6IHdvcmxkLnJldmlzaW9uLFxuICB9O1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiwgYXV0aG9yaXphdGlvbiwgbGVkZ2VyIH07XG59XG5cbi8qKlxuICogVGhlIHNoYXJlZCBwbGF5ZXIvQUkgZW50cnkgcG9pbnQuIFRoZXJlIGlzIG5vIG90aGVyIGNvbnN0cnVjdGlvbiBwYXRoLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJlcGFyZVNpdGUoXG4gIHdvcmxkOiBXb3JsZCxcbiAgYXV0aG9yaXplcjogTG9jYWxBdXRob3JpemVyLFxuICBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLFxuICBvcHRpb25zOiBQcmVwYXJhdGlvbk9wdGlvbnMgPSB7fSxcbik6IFByZXBhcmF0aW9uT3V0Y29tZSB7XG4gIGNvbnN0IHBsYW5uZWQgPSBwbGFuUHJlcGFyYXRpb24od29ybGQsIHByb3Bvc2FsLCBvcHRpb25zKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm4gcGxhbm5lZDtcbiAgY29uc3QgZGVjaXNpb24gPSBhdXRob3JpemVyLmF1dGhvcml6ZSh3b3JsZCwgcGxhbm5lZC5wbGFuKTtcbiAgaWYgKCFkZWNpc2lvbi5vayB8fCAhZGVjaXNpb24uYXV0aG9yaXphdGlvbikge1xuICAgIHJldHVybiBmYWlsKCdhdXRob3JpemUnLCAnbm90X2F1dGhvcml6ZWQnLCBkZWNpc2lvbi5yZWFzb25zKTtcbiAgfVxuICByZXR1cm4gZXhlY3V0ZVByZXBhcmF0aW9uKHdvcmxkLCBwbGFubmVkLnBsYW4sIGRlY2lzaW9uLmF1dGhvcml6YXRpb24pO1xufVxuIiwgIi8vIE0wMDIgc3RhZ2UgNDogYXV0aG9yaXRhdGl2ZSBob3VzZSwgcGF0aCBhbmQgdGVycmFjZSBzdHJ1Y3R1cmVzLlxuLy9cbi8vIFN0cnVjdHVyZXMgYXJlIHNpbXVsYXRpb24gcmVjb3Jkcywgbm90IHJlbmRlcmVyLW9ubHkgbWVzaGVzLiBBIHN0cnVjdHVyZSBpc1xuLy8gcGxhbm5lZCBmcm9tIHRoZSBwcmVwYXJlZCB0ZXJyYWluLCBhdXRob3JpemVkIGFnYWluc3QgdGhlIHNhbWUgbG9jYWwgcG9saWN5XG4vLyBlbnZlbG9wZSBhcyB0ZXJyYWluIHByZXBhcmF0aW9uLCBwYWlkIGZvciBmcm9tIGludmVudG9yeSwgYW5kIHRoZW4gc3RvcmVkIGluXG4vLyBXb3JsZC5zdHJ1Y3R1cmVzLiBUaGUgcmVuZGVyZXIgcmVhZHMgdGhvc2UgcmVjb3JkczsgaXQgbmV2ZXIgaW52ZW50cyBhXG4vLyBidWlsZGluZyB0aGF0IHRoZSBzaW11bGF0aW9uIGRvZXMgbm90IG93bi5cbmltcG9ydCB7XG4gIFdvcmxkLCBSZXNvdXJjZVR5cGUsIE1BVCwgc3VyZmFjZUF0LCBnZXRWb3hlbCxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQge1xuICBSZWN0LCBWb3hlbFJlZ2lvbiwgbm9ybWFsaXplUmVjdCwgZXhwYW5kUmVjdCxcbiAgZW52ZWxvcGVDb250YWlucywgb2JzdHJ1Y3Rpb25zSW4sXG59IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQge1xuICBBdXRob3JpemF0aW9uUG9saWN5LCBMT0NBTF9BVVRIT1JJVFksIExPQ0FMX0VORk9SQ0VNRU5ULFxufSBmcm9tICcuL3ByZXBhcmF0aW9uJztcbmltcG9ydCB7IEZBUk1fUlVMRVMgfSBmcm9tICcuL2NvbnN0cnVjdGlvbic7XG5pbXBvcnQgeyBpbnZlbnRvcnlTbmFwc2hvdCB9IGZyb20gJy4vY2Fub25pY2FsJztcblxuZXhwb3J0IHR5cGUgU3RydWN0dXJlS2luZCA9ICdob3VzZScgfCAncGF0aCcgfCAndGVycmFjZSc7XG4vKiogTTAwMiBkZXNpZ24gMSBpcyBpbW11dGFibGUgcmVwbGF5IGNvbnRlbnQ7IGRlc2lnbiAyIGlzIHRoZSBmb3VuZGVyIGNhbmRpZGF0ZS4gKi9cbmV4cG9ydCBjb25zdCBGT1VOREVSX0RFU0lHTl9WRVJTSU9OID0gMiBhcyBjb25zdDtcbmV4cG9ydCB0eXBlIFN0cnVjdHVyZURlc2lnblZlcnNpb24gPSB0eXBlb2YgRk9VTkRFUl9ERVNJR05fVkVSU0lPTjtcblxuZXhwb3J0IHR5cGUgTW9kdWxlS2luZCA9XG4gIHwgJ2Zsb29yJ1xuICB8ICd3YWxsJ1xuICB8ICdwb3N0J1xuICB8ICdsaW50ZWwnXG4gIHwgJ3Jvb2YnXG4gIHwgJ3BhcmFwZXQnXG4gIHwgJ3dpbmRvdydcbiAgfCAnZG9vcidcbiAgfCAndGhyZXNob2xkJ1xuICB8ICdwYXRoJ1xuICB8ICdjdXJiJ1xuICB8ICdzb2lsX2JlZCdcbiAgfCAncmV0YWluaW5nX3dhbGwnXG4gIHwgJ2Nyb3Bfcm93JztcblxuZXhwb3J0IHR5cGUgTW9kdWxlVG9uZSA9XG4gIHwgJ3N0b25lJ1xuICB8ICdzdG9uZV9iJ1xuICB8ICdvY2hyZSdcbiAgfCAndGltYmVyJ1xuICB8ICdhY2NlbnQnXG4gIHwgJ3NvaWwnXG4gIHwgJ2Nyb3AnXG4gIHwgJ2dyYXZlbCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlTW9kdWxlIHtcbiAga2luZDogTW9kdWxlS2luZDtcbiAgLyoqIENlbnRyZSBpbiB3b3JsZCB4L3osIGJvdHRvbSBpbiB3b3JsZCB5LiAqL1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICB3OiBudW1iZXI7XG4gIGg6IG51bWJlcjtcbiAgZDogbnVtYmVyO1xuICByb3Q/OiBudW1iZXI7XG4gIHRvbmU/OiBNb2R1bGVUb25lO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6IFN0cnVjdHVyZUtpbmQ7XG4gIHNpdGVJZDogc3RyaW5nO1xuICAvKiogT3JpZ2luOiBjZW50cmUgb2YgdGhlIHByZXBhcmVkIGZvb3RwcmludCBhdCBmbG9vciBoZWlnaHQuICovXG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXTtcbiAgY29zdDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgYnVpbHRSZXZpc2lvbjogbnVtYmVyO1xuICAvKiogQWJzZW50IG1lYW5zIGxlZ2FjeSBNMDAyIGRlc2lnbiAxOyBuZXZlciBpbmZlciBpdCBmcm9tIHRoZSByZW5kZXJlci4gKi9cbiAgZGVzaWduVmVyc2lvbj86IFN0cnVjdHVyZURlc2lnblZlcnNpb247XG4gIHByb3Zpc2lvbmFsOiB0cnVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRlcnJhY2VCYW5kIHtcbiAgejA6IG51bWJlcjtcbiAgejE6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZVByb3Bvc2FsIHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIGtpbmQ6IFN0cnVjdHVyZUtpbmQ7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICAvKiogUmVxdWlyZWQgZm9yIGhvdXNlczogdm94ZWwgY29sdW1uIG9mIHRoZSBkb29yIG9uIHRoZSBlYXN0IHdhbGwuICovXG4gIGRvb3I/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIC8qKiBPcHRpb25hbCBwYXRoIG1ldGFkYXRhOyB0aGUgcGF0aCBpcyBsYWlkIGFsb25nIHRoZSByZWN0IGNlbnRyZWxpbmUuICovXG4gIGFwcHJvYWNoPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICB0ZXJyYWNlcz86IG51bWJlcjtcbiAgLyoqIERlbGliZXJhdGUgY29udGVudCBzZWxlY3Rpb24gY2FycmllZCBieSBzY2hlbWEtMiBjb21tYW5kcy4gKi9cbiAgZGVzaWduVmVyc2lvbj86IFN0cnVjdHVyZURlc2lnblZlcnNpb247XG59XG5cbi8qKlxuICogU2luZ2xlIHNvdXJjZSBvZiB0cnV0aCBmb3Igc3RydWN0dXJlIGNvc3RzLiBUaGUgcGxhbm5lcnMgYW5kIHRoZSBidWlsZCBVSVxuICogYm90aCByZWFkIHRoZXNlOyBhIGJ1aWxkaW5nIGNhbm5vdCBhZHZlcnRpc2Ugb25lIHByaWNlIGFuZCBjaGFyZ2UgYW5vdGhlci5cbiAqL1xuZXhwb3J0IGNvbnN0IEhPVVNFX0NPU1Q6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4gPSB7IHdvb2Q6IDEwLCBzdG9uZTogMTggfTtcbmV4cG9ydCBjb25zdCBURVJSQUNFX0NPU1Q6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4gPSB7IHdvb2Q6IDYsIHN0b25lOiAxMiB9O1xuXG4vKiogQSBwYXRoIHBheXMgb25lIHN0b25lIHBlciBtZXRyZSBvZiBjb3JyaWRvciB3aWR0aC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXRoQ29zdCh3aWR0aDogbnVtYmVyKTogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiB7XG4gIHJldHVybiB7IHN0b25lOiB3aWR0aCB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cmZhY2VTYW1wbGUge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZVBsYW4ge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBTdHJ1Y3R1cmVLaW5kO1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIG9yaWdpbjogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIHJvdDogbnVtYmVyO1xuICBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXTtcbiAgY29zdDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIC8qKiBFeHBlY3RlZCBwcmVwYXJlZCBzdXJmYWNlLCBjaGVja2VkIGFnYWluIGF0IGV4ZWN1dGlvbiB0aW1lLiAqL1xuICBzdXJmYWNlOiBTdXJmYWNlU2FtcGxlW107XG4gIGRlc2lnblZlcnNpb24/OiBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uO1xuICB0ZXJyYWNlcz86IFRlcnJhY2VCYW5kW107XG59XG5cbi8vIC0tLS0tLS0tLS0gc3RhYmxlIGRpZ2VzdCAtLS0tLS0tLS0tXG5mdW5jdGlvbiBkaWdlc3QoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBhID0gMHg4MTFjOWRjNTtcbiAgbGV0IGIgPSAweDllMzc3OWI5O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGlucHV0Lmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgYyA9IGlucHV0LmNoYXJDb2RlQXQoaSk7XG4gICAgYSA9IE1hdGguaW11bChhIF4gYywgMHgwMTAwMDE5Myk7XG4gICAgYiA9IE1hdGguaW11bChiIF4gKGMgKyAweDllKSwgMHg4NWViY2E2Yik7XG4gICAgYiBePSBiID4+PiAxMztcbiAgfVxuICByZXR1cm4gKGEgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpXG4gICAgKyAoYiA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdHJ1Y3R1cmVEaWdlc3QocGxhbjogU3RydWN0dXJlUGxhbik6IHN0cmluZyB7XG4gIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtcbiAgICAnbTAwMjpzdHJ1Y3R1cmUtcGxhbjp2MScsXG4gICAgcGxhbi5raW5kLFxuICAgIHBsYW4uc2l0ZUlkLFxuICAgIGAke3BsYW4ucmVjdC54MH0sJHtwbGFuLnJlY3QuejB9LCR7cGxhbi5yZWN0LngxfSwke3BsYW4ucmVjdC56MX1gLFxuICAgIFN0cmluZyhwbGFuLmZsb29yWSksXG4gICAgYCR7cGxhbi5vcmlnaW4ueH0sJHtwbGFuLm9yaWdpbi55fSwke3BsYW4ub3JpZ2luLnp9YCxcbiAgICBTdHJpbmcocGxhbi5yb3QpLFxuICAgIC4uLihwbGFuLmRlc2lnblZlcnNpb24gPT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gPyBbJ2Rlc2lnbjoyJ10gOiBbXSksXG4gICAgYG06JHtwbGFuLm1vZHVsZXMubGVuZ3RofWAsXG4gIF07XG4gIGZvciAoY29uc3QgbSBvZiBwbGFuLm1vZHVsZXMpIHtcbiAgICBsaW5lcy5wdXNoKGBtOiR7bS5raW5kfSwke20ueH0sJHttLnl9LCR7bS56fSwke20ud30sJHttLmh9LCR7bS5kfSwke20ucm90ID8/IDB9LCR7bS50b25lID8/ICcnfWApO1xuICB9XG4gIGNvbnN0IGNvc3RLZXlzID0gT2JqZWN0LmtleXMocGxhbi5jb3N0KS5zb3J0KCk7XG4gIGxpbmVzLnB1c2goYGNvc3Q6JHtjb3N0S2V5cy5sZW5ndGh9YCk7XG4gIGZvciAoY29uc3Qga2V5IG9mIGNvc3RLZXlzKSBsaW5lcy5wdXNoKGBjb3N0OiR7a2V5fSwke3BsYW4uY29zdFtrZXkgYXMgUmVzb3VyY2VUeXBlXSA/PyAwfWApO1xuICBmb3IgKGNvbnN0IHMgb2YgcGxhbi5zdXJmYWNlKSBsaW5lcy5wdXNoKGBzOiR7cy54fSwke3Muen0sJHtzLnl9YCk7XG4gIGZvciAoY29uc3QgdCBvZiBwbGFuLnRlcnJhY2VzID8/IFtdKSBsaW5lcy5wdXNoKGB0OiR7dC56MH0sJHt0LnoxfSwke3QueX1gKTtcbiAgcmV0dXJuIGRpZ2VzdChsaW5lcy5qb2luKCdcXG4nKSk7XG59XG5cbi8vIC0tLS0tLS0tLS0gcGxhbm5pbmcgaGVscGVycyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZUZhaWx1cmUge1xuICBvazogZmFsc2U7XG4gIHN0YWdlOiAncGxhbicgfCAnYXV0aG9yaXplJyB8ICdleGVjdXRlJztcbiAgY29kZTogc3RyaW5nO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVQbGFuU3VjY2VzcyB7XG4gIG9rOiB0cnVlO1xuICBwbGFuOiBTdHJ1Y3R1cmVQbGFuO1xufVxuXG5leHBvcnQgdHlwZSBTdHJ1Y3R1cmVQbGFuUmVzdWx0ID0gU3RydWN0dXJlUGxhblN1Y2Nlc3MgfCBTdHJ1Y3R1cmVGYWlsdXJlO1xuXG5mdW5jdGlvbiBmYWlsKHN0YWdlOiBTdHJ1Y3R1cmVGYWlsdXJlWydzdGFnZSddLCBjb2RlOiBzdHJpbmcsIHJlYXNvbnM6IHN0cmluZ1tdKTogU3RydWN0dXJlRmFpbHVyZSB7XG4gIHJldHVybiB7IG9rOiBmYWxzZSwgc3RhZ2UsIGNvZGUsIHJlYXNvbnMgfTtcbn1cblxuZnVuY3Rpb24gc3VyZmFjZU1pc21hdGNoZXMod29ybGQ6IFdvcmxkLCBzYW1wbGVzOiByZWFkb25seSBTdXJmYWNlU2FtcGxlW10pIHtcbiAgY29uc3Qgb3V0OiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyOyBleHBlY3RlZDogbnVtYmVyOyBhY3R1YWw6IG51bWJlciB9PiA9IFtdO1xuICBmb3IgKGNvbnN0IHMgb2Ygc2FtcGxlcykge1xuICAgIGNvbnN0IGFjdHVhbCA9IHN1cmZhY2VBdCh3b3JsZCwgcy54LCBzLnopO1xuICAgIGlmIChhY3R1YWwgIT09IHMueSkgb3V0LnB1c2goeyB4OiBzLngsIHo6IHMueiwgZXhwZWN0ZWQ6IHMueSwgYWN0dWFsIH0pO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGZvb3RwcmludFN1cmZhY2Uod29ybGQ6IFdvcmxkLCByZWN0OiBSZWN0LCB5OiBudW1iZXIpOiBTdXJmYWNlU2FtcGxlW10ge1xuICBjb25zdCBvdXQ6IFN1cmZhY2VTYW1wbGVbXSA9IFtdO1xuICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHtcbiAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIG91dC5wdXNoKHsgeCwgeiwgeSB9KTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBmb290cHJpbnRFbnZlbG9wZShyZWN0OiBSZWN0LCB5MDogbnVtYmVyLCB5MTogbnVtYmVyLCBtYXJnaW4gPSAxKTogVm94ZWxSZWdpb25bXSB7XG4gIGNvbnN0IHIgPSBleHBhbmRSZWN0KHJlY3QsIG1hcmdpbik7XG4gIHJldHVybiBbeyAuLi5yLCB5MCwgeTEgfV07XG59XG5cbmZ1bmN0aW9uIG1vZHVsZUJvdW5kcyhtOiBTdHJ1Y3R1cmVNb2R1bGUpOiB7IHgwOiBudW1iZXI7IHgxOiBudW1iZXI7IHkwOiBudW1iZXI7IHkxOiBudW1iZXI7IHowOiBudW1iZXI7IHoxOiBudW1iZXIgfSB7XG4gIGNvbnN0IHIgPSBNYXRoLmh5cG90KG0udywgbS5kKSAvIDI7XG4gIGNvbnN0IGhhbGZXID0gKG0ucm90ID8/IDApID09PSAwID8gbS53IC8gMiA6IHI7XG4gIGNvbnN0IGhhbGZEID0gKG0ucm90ID8/IDApID09PSAwID8gbS5kIC8gMiA6IHI7XG4gIHJldHVybiB7XG4gICAgeDA6IG0ueCAtIGhhbGZXLCB4MTogbS54ICsgaGFsZlcsXG4gICAgeTA6IG0ueSwgeTE6IG0ueSArIG0uaCxcbiAgICB6MDogbS56IC0gaGFsZkQsIHoxOiBtLnogKyBoYWxmRCxcbiAgfTtcbn1cblxuZnVuY3Rpb24gbW9kdWxlSW5zaWRlRW52ZWxvcGUobTogU3RydWN0dXJlTW9kdWxlLCBlbnZlbG9wZTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSk6IGJvb2xlYW4ge1xuICBjb25zdCBiID0gbW9kdWxlQm91bmRzKG0pO1xuICByZXR1cm4gZW52ZWxvcGUuc29tZSgoZSkgPT4gYi54MCA+PSBlLngwIC0gMWUtNiAmJiBiLngxIDw9IGUueDEgKyAxICsgMWUtNlxuICAgICYmIGIueTAgPj0gZS55MCAtIDFlLTYgJiYgYi55MSA8PSBlLnkxICsgMSArIDFlLTZcbiAgICAmJiBiLnowID49IGUuejAgLSAxZS02ICYmIGIuejEgPD0gZS56MSArIDEgKyAxZS02KTtcbn1cblxuZnVuY3Rpb24gY29zdFRvdGFsKGNvc3Q6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4pOiBudW1iZXIge1xuICByZXR1cm4gT2JqZWN0LnZhbHVlcyhjb3N0KS5yZWR1Y2UoKGEsIGIpID0+IGEgKyAoYiA/PyAwKSwgMCk7XG59XG5cbmZ1bmN0aW9uIG1lZGlhbih2YWx1ZXM6IG51bWJlcltdKTogbnVtYmVyIHtcbiAgY29uc3Qgc29ydGVkID0gWy4uLnZhbHVlc10uc29ydCgoYSwgYikgPT4gYSAtIGIpO1xuICByZXR1cm4gc29ydGVkW01hdGguZmxvb3Ioc29ydGVkLmxlbmd0aCAvIDIpXTtcbn1cblxuLy8gLS0tLS0tLS0tLSBob3VzZSAtLS0tLS0tLS0tXG5mdW5jdGlvbiBwbGFuSG91c2Uod29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHdpZHRoID0gcmVjdC54MSAtIHJlY3QueDAgKyAxO1xuICBjb25zdCBkZXB0aCA9IHJlY3QuejEgLSByZWN0LnowICsgMTtcbiAgaWYgKHdpZHRoICE9PSA4IHx8IGRlcHRoICE9PSA2KSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnZm9vdHByaW50X21pc21hdGNoJywgW2Bob3VzZSBuZWVkcyA4IHggNiBtLCBnb3QgJHt3aWR0aH0geCAke2RlcHRofSBtYF0pO1xuICB9XG4gIGlmICghcHJvcG9zYWwuZG9vcikge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ21pc3NpbmdfZG9vcicsIFsnaG91c2UgcGxhbiBuZWVkcyBhIGRvb3IgY29sdW1uJ10pO1xuICB9XG4gIGlmIChwcm9wb3NhbC5kb29yLnogPCByZWN0LnowIHx8IHByb3Bvc2FsLmRvb3IueiA+IHJlY3QuejEpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdkb29yX291dHNpZGUnLCBbYGRvb3IgeiAke3Byb3Bvc2FsLmRvb3Iuen0gaXMgb3V0c2lkZSAke3JlY3QuejB9Li4ke3JlY3QuejF9YF0pO1xuICB9XG5cbiAgY29uc3Qgc3VyZmFjZSA9IGZvb3RwcmludFN1cmZhY2Uod29ybGQsIHJlY3QsIHByb3Bvc2FsLmZsb29yWSk7XG4gIGNvbnN0IG1pc21hdGNoZXMgPSBzdXJmYWNlTWlzbWF0Y2hlcyh3b3JsZCwgc3VyZmFjZSk7XG4gIGlmIChtaXNtYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdzaXRlX25vdF9wcmVwYXJlZCcsIG1pc21hdGNoZXMuc2xpY2UoMCwgNCkubWFwKFxuICAgICAgKG0pID0+IGBjb2x1bW4gJHttLnh9LCR7bS56fSBpcyBhdCAke20uYWN0dWFsfSwgZXhwZWN0ZWQgJHttLmV4cGVjdGVkfWAsXG4gICAgKSk7XG4gIH1cbiAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpO1xuICBpZiAob2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdzaXRlX29ic3RydWN0ZWQnLCBvYnN0cnVjdGlvbnMubWFwKChvKSA9PiBvLmVudGl0eUlkKSk7XG4gIH1cblxuICBjb25zdCBmbG9vclkgPSBwcm9wb3NhbC5mbG9vclk7XG4gIGNvbnN0IHgwID0gcmVjdC54MCwgeDEgPSByZWN0LngxICsgMTtcbiAgY29uc3QgejAgPSByZWN0LnowLCB6MSA9IHJlY3QuejEgKyAxO1xuICBjb25zdCBjeCA9ICh4MCArIHgxKSAvIDI7XG4gIGNvbnN0IGN6ID0gKHowICsgejEpIC8gMjtcbiAgY29uc3QgZG9vclogPSBwcm9wb3NhbC5kb29yLnogKyAwLjU7XG4gIGNvbnN0IGRvb3JIYWxmID0gMC42O1xuICBjb25zdCB3YWxsSCA9IDMuMDtcbiAgY29uc3Qgd2FsbFQgPSAwLjU7XG4gIGNvbnN0IGRvb3JIID0gMi4yO1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuXG4gIC8vIEZsb29yIHNsYWIgYW5kIHJvb2YgcGxhdGUuXG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdmbG9vcicsIHg6IGN4LCB5OiBmbG9vclksIHo6IGN6LCB3OiA4LjAsIGg6IDAuMywgZDogNi4wLCB0b25lOiAnc3RvbmVfYicgfSk7XG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdyb29mJywgeDogY3gsIHk6IGZsb29yWSArIHdhbGxILCB6OiBjeiwgdzogOC40LCBoOiAwLjMsIGQ6IDYuNCwgdG9uZTogJ3N0b25lJyB9KTtcblxuICAvLyBOb3J0aCBhbmQgc291dGggd2FsbHMuXG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICd3YWxsJywgeDogY3gsIHk6IGZsb29yWSwgejogejAgKyB3YWxsVCAvIDIsIHc6IDguMCwgaDogd2FsbEgsIGQ6IHdhbGxULCB0b25lOiAnc3RvbmUnIH0pO1xuICBtb2R1bGVzLnB1c2goeyBraW5kOiAnd2FsbCcsIHg6IGN4LCB5OiBmbG9vclksIHo6IHoxIC0gd2FsbFQgLyAyLCB3OiA4LjAsIGg6IHdhbGxILCBkOiB3YWxsVCwgdG9uZTogJ3N0b25lJyB9KTtcblxuICAvLyBXZXN0IHdhbGwuXG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICd3YWxsJywgeDogeDAgKyB3YWxsVCAvIDIsIHk6IGZsb29yWSwgejogY3osIHc6IHdhbGxULCBoOiB3YWxsSCwgZDogNi4wLCB0b25lOiAnc3RvbmUnIH0pO1xuXG4gIC8vIEVhc3Qgd2FsbCB3aXRoIGEgcmVhbCBkb29yd2F5IGdhcC5cbiAgY29uc3QgZWFzdFggPSB4MSAtIHdhbGxUIC8gMjtcbiAgY29uc3QgZ2FwMCA9IGRvb3JaIC0gZG9vckhhbGY7XG4gIGNvbnN0IGdhcDEgPSBkb29yWiArIGRvb3JIYWxmO1xuICBjb25zdCBsZWZ0TGVuID0gZ2FwMCAtIHowO1xuICBjb25zdCByaWdodExlbiA9IHoxIC0gZ2FwMTtcbiAgaWYgKGxlZnRMZW4gPiAwLjA1KSB7XG4gICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgIGtpbmQ6ICd3YWxsJywgeDogZWFzdFgsIHk6IGZsb29yWSwgejogejAgKyBsZWZ0TGVuIC8gMixcbiAgICAgIHc6IHdhbGxULCBoOiB3YWxsSCwgZDogbGVmdExlbiwgdG9uZTogJ3N0b25lJyxcbiAgICB9KTtcbiAgfVxuICBpZiAocmlnaHRMZW4gPiAwLjA1KSB7XG4gICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgIGtpbmQ6ICd3YWxsJywgeDogZWFzdFgsIHk6IGZsb29yWSwgejogZ2FwMSArIHJpZ2h0TGVuIC8gMixcbiAgICAgIHc6IHdhbGxULCBoOiB3YWxsSCwgZDogcmlnaHRMZW4sIHRvbmU6ICdzdG9uZScsXG4gICAgfSk7XG4gIH1cbiAgbW9kdWxlcy5wdXNoKHtcbiAgICBraW5kOiAnbGludGVsJywgeDogZWFzdFgsIHk6IGZsb29yWSArIGRvb3JILCB6OiBkb29yWixcbiAgICB3OiB3YWxsVCwgaDogd2FsbEggLSBkb29ySCwgZDogZG9vckhhbGYgKiAyLCB0b25lOiAnc3RvbmVfYicsXG4gIH0pO1xuICBtb2R1bGVzLnB1c2goe1xuICAgIGtpbmQ6ICdkb29yJywgeDogZWFzdFgsIHk6IGZsb29yWSwgejogZ2FwMCxcbiAgICB3OiAwLjE4LCBoOiBkb29ySCwgZDogMC4xNiwgdG9uZTogJ3RpbWJlcicsXG4gIH0pO1xuICBtb2R1bGVzLnB1c2goe1xuICAgIGtpbmQ6ICdkb29yJywgeDogZWFzdFgsIHk6IGZsb29yWSwgejogZ2FwMSxcbiAgICB3OiAwLjE4LCBoOiBkb29ySCwgZDogMC4xNiwgdG9uZTogJ3RpbWJlcicsXG4gIH0pO1xuICBtb2R1bGVzLnB1c2goe1xuICAgIGtpbmQ6ICd0aHJlc2hvbGQnLCB4OiB4MSArIDAuMzUsIHk6IGZsb29yWSwgejogZG9vclosXG4gICAgdzogMC45LCBoOiAwLjE2LCBkOiAxLjMsIHRvbmU6ICdvY2hyZScsXG4gIH0pO1xuXG4gIC8vIFR3byB3aW5kb3dzIG9uIHRoZSBzb3V0aCB3YWxsLCBzbGlnaHRseSBwcm91ZCBvZiB0aGUgb3V0ZXIgZmFjZS5cbiAgZm9yIChjb25zdCB3eCBvZiBbY3ggLSAyLjIsIGN4ICsgMi4yXSkge1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiAnd2luZG93JywgeDogd3gsIHk6IGZsb29yWSArIDEuNDUsIHo6IHoxIC0gMC4wMixcbiAgICAgIHc6IDEuMCwgaDogMS4wLCBkOiAwLjA4LCB0b25lOiAnYWNjZW50JyxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFBhcmFwZXQgYXJvdW5kIHRoZSBmbGF0IE5veGVsIHJvb2YuXG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXJhcGV0JywgeDogY3gsIHk6IGZsb29yWSArIHdhbGxIICsgMC4zLCB6OiBjeiAtIDMuMDUsIHc6IDguNCwgaDogMC40LCBkOiAwLjMsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhcmFwZXQnLCB4OiBjeCwgeTogZmxvb3JZICsgd2FsbEggKyAwLjMsIHo6IGN6ICsgMy4wNSwgdzogOC40LCBoOiAwLjQsIGQ6IDAuMywgdG9uZTogJ3N0b25lX2InIH0pO1xuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGFyYXBldCcsIHg6IGN4IC0gNC4wNSwgeTogZmxvb3JZICsgd2FsbEggKyAwLjMsIHo6IGN6LCB3OiAwLjMsIGg6IDAuNCwgZDogNi40LCB0b25lOiAnc3RvbmVfYicgfSk7XG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXJhcGV0JywgeDogY3ggKyA0LjA1LCB5OiBmbG9vclkgKyB3YWxsSCArIDAuMywgejogY3osIHc6IDAuMywgaDogMC40LCBkOiA2LjQsIHRvbmU6ICdzdG9uZV9iJyB9KTtcblxuICBjb25zdCBwbGFuOiBTdHJ1Y3R1cmVQbGFuID0ge1xuICAgIGlkOiAnJyxcbiAgICBraW5kOiAnaG91c2UnLFxuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZLFxuICAgIG9yaWdpbjogeyB4OiBjeCwgeTogZmxvb3JZLCB6OiBjeiB9LFxuICAgIHJvdDogMCxcbiAgICBtb2R1bGVzLFxuICAgIGNvc3Q6IHsgLi4uSE9VU0VfQ09TVCB9LFxuICAgIGVudmVsb3BlOiBmb290cHJpbnRFbnZlbG9wZShyZWN0LCBmbG9vclksIGZsb29yWSArIDQsIDIpLFxuICAgIHN1cmZhY2UsXG4gIH07XG4gIHBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW4pfWA7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gcGF0aCAtLS0tLS0tLS0tXG5mdW5jdGlvbiBwbGFuUGF0aCh3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3Qgd2lkdGggPSByZWN0LngxIC0gcmVjdC54MCArIDE7XG4gIGNvbnN0IGRlcHRoID0gcmVjdC56MSAtIHJlY3QuejAgKyAxO1xuICBpZiAoZGVwdGggIT09IDMgfHwgd2lkdGggPCAzKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnZm9vdHByaW50X21pc21hdGNoJywgW2BwYXRoIG5lZWRzIGEgMyBtIHdpZGUgY29ycmlkb3IsIGdvdCAke3dpZHRofSB4ICR7ZGVwdGh9IG1gXSk7XG4gIH1cblxuICBjb25zdCBjZW50ZXJaID0gcmVjdC56MCArIDE7XG4gIGNvbnN0IHN1cmZhY2U6IFN1cmZhY2VTYW1wbGVbXSA9IFtdO1xuICBjb25zdCBoZWlnaHRzOiBudW1iZXJbXSA9IFtdO1xuICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHtcbiAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCBjZW50ZXJaKTtcbiAgICBoZWlnaHRzLnB1c2goeSk7XG4gICAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSBzdXJmYWNlLnB1c2goeyB4LCB6LCB5IH0pO1xuICB9XG4gIGNvbnN0IG1pc21hdGNoZXMgPSBzdXJmYWNlTWlzbWF0Y2hlcyh3b3JsZCwgc3VyZmFjZSk7XG4gIGlmIChtaXNtYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdwYXRoX25vdF9wcmVwYXJlZCcsIG1pc21hdGNoZXMuc2xpY2UoMCwgNCkubWFwKFxuICAgICAgKG0pID0+IGBjb2x1bW4gJHttLnh9LCR7bS56fSBpcyBhdCAke20uYWN0dWFsfSwgZXhwZWN0ZWQgJHttLmV4cGVjdGVkfWAsXG4gICAgKSk7XG4gIH1cbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBoZWlnaHRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgc3RlcCA9IGhlaWdodHNbaV0gLSBoZWlnaHRzW2kgLSAxXTtcbiAgICBpZiAoTWF0aC5hYnMoc3RlcCkgPiAxKSB7XG4gICAgICByZXR1cm4gZmFpbCgncGxhbicsICdwYXRoX3N0ZXAnLCBbYHN0ZXAgJHtzdGVwfSBtIGF0IHg9JHtyZWN0LngwICsgaX1gXSk7XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgcyBvZiBzdXJmYWNlKSB7XG4gICAgY29uc3QgdG9wID0gZ2V0Vm94ZWwod29ybGQsIHMueCwgcy55IC0gMSwgcy56KTtcbiAgICBpZiAodG9wID09PSBNQVQuV0FURVIpIHtcbiAgICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3BhdGhfd2V0JywgW2Bjb2x1bW4gJHtzLnh9LCR7cy56fSBpcyB3ZXRgXSk7XG4gICAgfVxuICAgIGlmICh0b3AgIT09IE1BVC5HUkFWRUwpIHtcbiAgICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3BhdGhfc3VyZmFjZScsIFtcbiAgICAgICAgYGNvbHVtbiAke3MueH0sJHtzLnp9IHRvcCBpcyAke3RvcH0sIGV4cGVjdGVkIGdyYXZlbGAsXG4gICAgICBdKTtcbiAgICB9XG4gIH1cbiAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpO1xuICBpZiAob2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdwYXRoX29ic3RydWN0ZWQnLCBvYnN0cnVjdGlvbnMubWFwKChvKSA9PiBvLmVudGl0eUlkKSk7XG4gIH1cblxuICBjb25zdCBjeiA9IGNlbnRlclogKyAwLjU7XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdID0gW107XG4gIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykge1xuICAgIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIGNlbnRlclopO1xuICAgIGNvbnN0IG14ID0geCArIDAuNTtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGF0aCcsIHg6IG14LCB5LCB6OiBjeiwgdzogMS4wLCBoOiAwLjEyLCBkOiAzLjAsIHRvbmU6ICdncmF2ZWwnIH0pO1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdjdXJiJywgeDogbXgsIHksIHo6IHJlY3QuejAgKyAwLjA3NSwgdzogMS4wLCBoOiAwLjIyLCBkOiAwLjE1LCB0b25lOiAnc3RvbmVfYicgfSk7XG4gICAgbW9kdWxlcy5wdXNoKHsga2luZDogJ2N1cmInLCB4OiBteCwgeSwgejogcmVjdC56MSArIDEgLSAwLjA3NSwgdzogMS4wLCBoOiAwLjIyLCBkOiAwLjE1LCB0b25lOiAnc3RvbmVfYicgfSk7XG4gIH1cblxuICBjb25zdCBtaW5ZID0gTWF0aC5taW4oLi4uaGVpZ2h0cyk7XG4gIGNvbnN0IG1heFkgPSBNYXRoLm1heCguLi5oZWlnaHRzKTtcbiAgY29uc3QgcGxhbjogU3RydWN0dXJlUGxhbiA9IHtcbiAgICBpZDogJycsXG4gICAga2luZDogJ3BhdGgnLFxuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwcm9wb3NhbC5mbG9vclksXG4gICAgb3JpZ2luOiB7IHg6IChyZWN0LngwICsgcmVjdC54MSArIDEpIC8gMiwgeTogbWluWSwgejogY3ogfSxcbiAgICByb3Q6IDAsXG4gICAgbW9kdWxlcyxcbiAgICBjb3N0OiBwYXRoQ29zdCh3aWR0aCksXG4gICAgZW52ZWxvcGU6IGZvb3RwcmludEVudmVsb3BlKHJlY3QsIG1pblkgLSAxLCBtYXhZICsgMiwgMCksXG4gICAgc3VyZmFjZSxcbiAgfTtcbiAgcGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbil9YDtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4gfTtcbn1cblxuLy8gLS0tLS0tLS0tLSB0ZXJyYWNlcyAtLS0tLS0tLS0tXG5mdW5jdGlvbiBwbGFuVGVycmFjZXMod29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHdpZHRoID0gcmVjdC54MSAtIHJlY3QueDAgKyAxO1xuICBjb25zdCBkZXB0aCA9IHJlY3QuejEgLSByZWN0LnowICsgMTtcbiAgY29uc3QgY291bnQgPSBwcm9wb3NhbC50ZXJyYWNlcyA/PyAzO1xuICBpZiAod2lkdGggIT09IDEyIHx8IGRlcHRoICE9PSA4KSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnZm9vdHByaW50X21pc21hdGNoJywgW2B0ZXJyYWNlcyBuZWVkIDEyIHggOCBtLCBnb3QgJHt3aWR0aH0geCAke2RlcHRofSBtYF0pO1xuICB9XG4gIGlmIChjb3VudCA8IDIgfHwgY291bnQgPiA0KSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAndGVycmFjZV9jb3VudCcsIFtgJHtjb3VudH0gdGVycmFjZXMgaXMgb3V0c2lkZSAyLi40YF0pO1xuICB9XG5cbiAgLy8gU3BsaXQgZGVwdGggaW50byBuZWFyLWVxdWFsIGJhbmRzLCBoaWdoIHNpZGUgZmlyc3QuXG4gIGNvbnN0IGJhc2UgPSBNYXRoLmZsb29yKGRlcHRoIC8gY291bnQpO1xuICBjb25zdCBleHRyYSA9IGRlcHRoICUgY291bnQ7XG4gIGNvbnN0IGJhbmRzOiBUZXJyYWNlQmFuZFtdID0gW107XG4gIGxldCB6ID0gcmVjdC56MDtcbiAgY29uc3QgbWVkaWFuczogbnVtYmVyW10gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgY29uc3Qgc2l6ZSA9IGJhc2UgKyAoaSA8IGV4dHJhID8gMSA6IDApO1xuICAgIGNvbnN0IHowID0geiwgejEgPSB6ICsgc2l6ZSAtIDE7XG4gICAgY29uc3QgdmFsdWVzOiBudW1iZXJbXSA9IFtdO1xuICAgIGZvciAobGV0IGJ6ID0gejA7IGJ6IDw9IHoxOyBieisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHZhbHVlcy5wdXNoKHN1cmZhY2VBdCh3b3JsZCwgeCwgYnopKTtcbiAgICB9XG4gICAgbWVkaWFucy5wdXNoKG1lZGlhbih2YWx1ZXMpKTtcbiAgICBiYW5kcy5wdXNoKHsgejAsIHoxLCB5OiAwIH0pO1xuICAgIHogPSB6MSArIDE7XG4gIH1cbiAgLy8gRWFjaCB0ZXJyYWNlIHNpdHMgZXhhY3RseSBvbmUgbWV0cmUgYmVsb3cgdGhlIHByZXZpb3VzIG9uZS5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBiYW5kcy5sZW5ndGg7IGkrKykge1xuICAgIGJhbmRzW2ldLnkgPSBpID09PSAwID8gbWVkaWFuc1swXSA6IE1hdGgubWluKG1lZGlhbnNbaV0sIGJhbmRzW2kgLSAxXS55IC0gMSk7XG4gIH1cblxuICBsZXQgbWF4Q3V0ID0gMCwgbWF4RmlsbCA9IDAsIGN1dFZvbHVtZSA9IDAsIGZpbGxWb2x1bWUgPSAwO1xuICBjb25zdCBzdXJmYWNlOiBTdXJmYWNlU2FtcGxlW10gPSBbXTtcbiAgZm9yIChjb25zdCBiIG9mIGJhbmRzKSB7XG4gICAgZm9yIChsZXQgYnogPSBiLnowOyBieiA8PSBiLnoxOyBieisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHtcbiAgICAgICAgY29uc3QgcyA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgYnopO1xuICAgICAgICBzdXJmYWNlLnB1c2goeyB4LCB6OiBieiwgeTogYi55IH0pO1xuICAgICAgICBjb25zdCBkID0gcyAtIGIueTtcbiAgICAgICAgaWYgKGQgPiAwKSB7IGN1dFZvbHVtZSArPSBkOyBtYXhDdXQgPSBNYXRoLm1heChtYXhDdXQsIGQpOyB9XG4gICAgICAgIGlmIChkIDwgMCkgeyBmaWxsVm9sdW1lICs9IC1kOyBtYXhGaWxsID0gTWF0aC5tYXgobWF4RmlsbCwgLWQpOyB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGlmIChtYXhDdXQgPiBGQVJNX1JVTEVTLm1heEN1dCB8fCBtYXhGaWxsID4gRkFSTV9SVUxFUy5tYXhGaWxsXG4gICAgfHwgY3V0Vm9sdW1lID4gRkFSTV9SVUxFUy5tYXhDdXRWb2x1bWUgfHwgZmlsbFZvbHVtZSA+IEZBUk1fUlVMRVMubWF4RmlsbFZvbHVtZSkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3RlcnJhY2VfZWFydGh3b3JrJywgW1xuICAgICAgYGN1dCAke2N1dFZvbHVtZX0gbVx1MDBCMyAvIGZpbGwgJHtmaWxsVm9sdW1lfSBtXHUwMEIzLCBtYXggJHttYXhDdXR9LyR7bWF4RmlsbH0gbWAsXG4gICAgXSk7XG4gIH1cbiAgY29uc3QgbWlzbWF0Y2hlcyA9IHN1cmZhY2VNaXNtYXRjaGVzKHdvcmxkLCBzdXJmYWNlKTtcbiAgaWYgKG1pc21hdGNoZXMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3NpdGVfbm90X3ByZXBhcmVkJywgbWlzbWF0Y2hlcy5zbGljZSgwLCA0KS5tYXAoXG4gICAgICAobSkgPT4gYGNvbHVtbiAke20ueH0sJHttLnp9IGlzIGF0ICR7bS5hY3R1YWx9LCBleHBlY3RlZCAke20uZXhwZWN0ZWR9YCxcbiAgICApKTtcbiAgfVxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCk7XG4gIGlmIChvYnN0cnVjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3NpdGVfb2JzdHJ1Y3RlZCcsIG9ic3RydWN0aW9ucy5tYXAoKG8pID0+IG8uZW50aXR5SWQpKTtcbiAgfVxuICBmb3IgKGNvbnN0IHMgb2Ygc3VyZmFjZSkge1xuICAgIGNvbnN0IHRvcCA9IGdldFZveGVsKHdvcmxkLCBzLngsIHMueSAtIDEsIHMueik7XG4gICAgaWYgKHRvcCAhPT0gTUFULlNPSUwpIHtcbiAgICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3RlcnJhY2Vfc3VyZmFjZScsIFtcbiAgICAgICAgYGNvbHVtbiAke3MueH0sJHtzLnp9IHRvcCBpcyAke3RvcH0sIGV4cGVjdGVkIHNvaWxgLFxuICAgICAgXSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgY3ggPSAocmVjdC54MCArIHJlY3QueDEgKyAxKSAvIDI7XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdID0gW107XG4gIGZvciAoY29uc3QgYiBvZiBiYW5kcykge1xuICAgIGNvbnN0IGJ6ID0gKGIuejAgKyBiLnoxICsgMSkgLyAyO1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiAnc29pbF9iZWQnLCB4OiBjeCwgeTogYi55LCB6OiBieixcbiAgICAgIHc6IHdpZHRoLCBoOiAwLjE4LCBkOiBiLnoxIC0gYi56MCArIDEsIHRvbmU6ICdzb2lsJyxcbiAgICB9KTtcbiAgICAvLyBUaHJlZSBjcm9wIHJvd3MgcGVyIHRlcnJhY2UsIGluc2V0IGZyb20gdGhlIHJldGFpbmluZyB3YWxscy5cbiAgICBjb25zdCByb3dEZXB0aCA9IGIuejEgLSBiLnowICsgMTtcbiAgICBmb3IgKGxldCByID0gMDsgciA8IDM7IHIrKykge1xuICAgICAgY29uc3QgdCA9IChyICsgMSkgLyA0O1xuICAgICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgICAga2luZDogJ2Nyb3Bfcm93JywgeDogY3gsIHk6IGIueSArIDAuMTgsIHo6IGIuejAgKyByb3dEZXB0aCAqIHQsXG4gICAgICAgIHc6IHdpZHRoIC0gMS4yLCBoOiAwLjI4LCBkOiAwLjM2LCB0b25lOiAnY3JvcCcsXG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBiYW5kcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHVwcGVyID0gYmFuZHNbaSAtIDFdO1xuICAgIGNvbnN0IGxvd2VyID0gYmFuZHNbaV07XG4gICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgIGtpbmQ6ICdyZXRhaW5pbmdfd2FsbCcsIHg6IGN4LCB5OiBsb3dlci55LCB6OiB1cHBlci56MSArIDAuNSxcbiAgICAgIHc6IHdpZHRoLCBoOiB1cHBlci55IC0gbG93ZXIueSwgZDogMC40LCB0b25lOiAnc3RvbmVfYicsXG4gICAgfSk7XG4gIH1cblxuICBjb25zdCBtaW5ZID0gTWF0aC5taW4oLi4uYmFuZHMubWFwKChiKSA9PiBiLnkpKTtcbiAgY29uc3QgbWF4WSA9IE1hdGgubWF4KC4uLmJhbmRzLm1hcCgoYikgPT4gYi55KSk7XG4gIGNvbnN0IHBsYW46IFN0cnVjdHVyZVBsYW4gPSB7XG4gICAgaWQ6ICcnLFxuICAgIGtpbmQ6ICd0ZXJyYWNlJyxcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcHJvcG9zYWwuZmxvb3JZLFxuICAgIG9yaWdpbjogeyB4OiBjeCwgeTogbWluWSwgejogKHJlY3QuejAgKyByZWN0LnoxICsgMSkgLyAyIH0sXG4gICAgcm90OiAwLFxuICAgIG1vZHVsZXMsXG4gICAgY29zdDogeyAuLi5URVJSQUNFX0NPU1QgfSxcbiAgICBlbnZlbG9wZTogZm9vdHByaW50RW52ZWxvcGUocmVjdCwgbWluWSAtIDEsIG1heFkgKyAyLCAxKSxcbiAgICBzdXJmYWNlLFxuICAgIHRlcnJhY2VzOiBiYW5kcyxcbiAgfTtcbiAgcGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbil9YDtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4gfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYW5TdHJ1Y3R1cmUod29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgaWYgKHByb3Bvc2FsLmRlc2lnblZlcnNpb24gPT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pIHJldHVybiBwbGFuRm91bmRlckRlc2lnbih3b3JsZCwgcHJvcG9zYWwpO1xuICBpZiAocHJvcG9zYWwuZGVzaWduVmVyc2lvbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAndW5zdXBwb3J0ZWRfZGVzaWduJywgW2B1bnN1cHBvcnRlZCBzdHJ1Y3R1cmUgZGVzaWduICR7U3RyaW5nKHByb3Bvc2FsLmRlc2lnblZlcnNpb24pfWBdKTtcbiAgfVxuICBpZiAocHJvcG9zYWwua2luZCA9PT0gJ2hvdXNlJykgcmV0dXJuIHBsYW5Ib3VzZSh3b3JsZCwgcHJvcG9zYWwpO1xuICBpZiAocHJvcG9zYWwua2luZCA9PT0gJ3BhdGgnKSByZXR1cm4gcGxhblBhdGgod29ybGQsIHByb3Bvc2FsKTtcbiAgcmV0dXJuIHBsYW5UZXJyYWNlcyh3b3JsZCwgcHJvcG9zYWwpO1xufVxuXG4vLyAtLS0tLS0tLS0tIGRlc2lnbiAyOiBib3VuZGVkIGZvdW5kZXIgY2FuZGlkYXRlIC0tLS0tLS0tLS1cbi8vIFRoaXMgZGVsaWJlcmF0ZWx5IGxlYXZlcyBldmVyeSBsZWdhY3kgcGxhbm5lciBhYm92ZSB1bnRvdWNoZWQuIFRoZSBleHRyYSB3YWxsXG4vLyBwcmltaXRpdmVzIHJlcHJlc2VudCB2b2lkcywgbm90IGRlY29yYXRpdmUgd2luZG93czsgdGhlaXIgYXNzZXQtbGV2ZWwgdm9sdW1lXG4vLyBpbnRlcnByZXRhdGlvbiByZW1haW5zIFJldmlldyBSZXF1aXJlZCAodGhlIGZvdW5kZXIgNFx1MjAxMzkgdm9sdW1lIHRhcmdldCkuXG5mdW5jdGlvbiBwbGFuRm91bmRlckRlc2lnbih3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBpZiAocHJvcG9zYWwua2luZCA9PT0gJ3BhdGgnKSByZXR1cm4gcGxhbkZvdW5kZXJQYXRoKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGNvbnN0IHBsYW5uZWQgPSBwcm9wb3NhbC5raW5kID09PSAnaG91c2UnID8gcGxhbkhvdXNlKHdvcmxkLCBwcm9wb3NhbCkgOiBwbGFuVGVycmFjZXMod29ybGQsIHByb3Bvc2FsKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm4gcGxhbm5lZDtcbiAgaWYgKHByb3Bvc2FsLmtpbmQgPT09ICd0ZXJyYWNlJykge1xuICAgIC8vIENyb3Agcm93cyBzdGF5IGNvbXBhY3QgYXV0aG9yaXRhdGl2ZSBhZ2dyZWdhdGVzLiBUaGVpciBmYWNldGVkIGZvbGlhZ2UgaXNcbiAgICAvLyBkZXJpdmVkIHByZXNlbnRhdGlvbiBvbmx5OyBubyBwbGFudC1sZXZlbCBleGlzdGVuY2Ugb3IgeWllbGQgaXMgaW52ZW50ZWQuXG4gICAgcGxhbm5lZC5wbGFuLmRlc2lnblZlcnNpb24gPSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OO1xuICAgIHBsYW5uZWQucGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbm5lZC5wbGFuKX1gO1xuICAgIHJldHVybiBwbGFubmVkO1xuICB9XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB4MCA9IHJlY3QueDAsIHgxID0gcmVjdC54MSArIDE7XG4gIGNvbnN0IHowID0gcmVjdC56MCwgejEgPSByZWN0LnoxICsgMTtcbiAgY29uc3QgeSA9IHByb3Bvc2FsLmZsb29yWSwgY3ggPSAoeDAgKyB4MSkgLyAyLCBjeiA9ICh6MCArIHoxKSAvIDI7XG4gIGNvbnN0IHQgPSAwLjYsIGggPSAzLjI7XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdID0gW107XG4gIC8vIE9uZSBzdHJ1Y3R1cmFsIHN0b25lIGZhbWlseTogbGlnaHRpbmcsIG5vdCBwYWludGVkIGZhY2UgdmFyaWF0aW9uLCBzaGFkZXMgaXQuXG4gIGNvbnN0IHdhbGwgPSAoeDogbnVtYmVyLCBib3R0b206IG51bWJlciwgejogbnVtYmVyLCB3OiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBkOiBudW1iZXIsIGtpbmQ6IFN0cnVjdHVyZU1vZHVsZVsna2luZCddID0gJ3dhbGwnKSA9PiB7XG4gICAgbW9kdWxlcy5wdXNoKHsga2luZCwgeCwgeTogYm90dG9tLCB6LCB3LCBoOiBoZWlnaHQsIGQsIHRvbmU6ICdzdG9uZScgfSk7XG4gIH07XG4gIHdhbGwoY3gsIHkgLSAwLjQsIGN6LCA4LCAwLjQsIDYsICdmbG9vcicpO1xuICB3YWxsKGN4LCB5LCB6MCArIHQgLyAyLCA4LCBoLCB0KTtcbiAgY29uc3QgaW5uZXJaMCA9IHowICsgdCwgaW5uZXJaMSA9IHoxIC0gdDtcbiAgd2FsbCh4MCArIHQgLyAyLCB5LCAoaW5uZXJaMCArIGlubmVyWjEpIC8gMiwgdCwgaCwgaW5uZXJaMSAtIGlubmVyWjApO1xuICBjb25zdCBkb29yWiA9IChwcm9wb3NhbC5kb29yPy56ID8/IHJlY3QuejApICsgMC41O1xuICBjb25zdCBkb29yMCA9IGRvb3JaIC0gMC42LCBkb29yMSA9IGRvb3JaICsgMC42O1xuICBjb25zdCBlYXN0WCA9IHgxIC0gdCAvIDI7XG4gIHdhbGwoZWFzdFgsIHksIChpbm5lclowICsgZG9vcjApIC8gMiwgdCwgaCwgZG9vcjAgLSBpbm5lclowKTtcbiAgd2FsbChlYXN0WCwgeSwgKGRvb3IxICsgaW5uZXJaMSkgLyAyLCB0LCBoLCBpbm5lcloxIC0gZG9vcjEpO1xuICB3YWxsKGVhc3RYLCB5ICsgMi4yLCBkb29yWiwgdCwgMC40LCAxLjIsICdsaW50ZWwnKTtcbiAgd2FsbChlYXN0WCwgeSArIDIuNiwgZG9vclosIHQsIDAuNiwgMS4yKTtcbiAgY29uc3Qgc291dGhaID0gejEgLSB0IC8gMjtcbiAgZm9yIChjb25zdCBbYSwgYl0gb2YgW1t4MCArIHQsIGN4IC0gMi42XSwgW2N4IC0gMS40LCBjeCArIDEuNF0sIFtjeCArIDIuNiwgeDEgLSB0XV0pIHtcbiAgICB3YWxsKChhICsgYikgLyAyLCB5LCBzb3V0aFosIGIgLSBhLCBoLCB0KTtcbiAgfVxuICBmb3IgKGNvbnN0IHd4IG9mIFtjeCAtIDIsIGN4ICsgMl0pIHtcbiAgICB3YWxsKHd4LCB5LCBzb3V0aFosIDEuMiwgMSwgdCk7XG4gICAgd2FsbCh3eCwgeSArIDIuNCwgc291dGhaLCAxLjIsIDAuOCwgdCwgJ2xpbnRlbCcpO1xuICB9XG4gIHdhbGwoY3gsIHkgKyBoLCBjeiwgOCwgMC40LCA2LCAncm9vZicpO1xuICB3YWxsKGN4LCB5ICsgaCArIDAuNCwgejAgKyAwLjE1LCA4LCAwLjMsIDAuMywgJ3BhcmFwZXQnKTtcbiAgd2FsbChjeCwgeSArIGggKyAwLjQsIHoxIC0gMC4xNSwgOCwgMC4zLCAwLjMsICdwYXJhcGV0Jyk7XG4gIHdhbGwoY3ggLSAzLjg1LCB5ICsgaCArIDAuNCwgY3osIDAuMywgMC4zLCA1LjQsICdwYXJhcGV0Jyk7XG4gIHdhbGwoY3ggKyAzLjg1LCB5ICsgaCArIDAuNCwgY3osIDAuMywgMC4zLCA1LjQsICdwYXJhcGV0Jyk7XG4gIHBsYW5uZWQucGxhbi5tb2R1bGVzID0gbW9kdWxlcztcbiAgcGxhbm5lZC5wbGFuLmRlc2lnblZlcnNpb24gPSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OO1xuICBwbGFubmVkLnBsYW4uZW52ZWxvcGUgPSBmb290cHJpbnRFbnZlbG9wZShyZWN0LCB5IC0gMSwgeSArIDQsIDIpO1xuICBwbGFubmVkLnBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW5uZWQucGxhbil9YDtcbiAgcmV0dXJuIHBsYW5uZWQ7XG59XG5cbmZ1bmN0aW9uIHBsYW5Gb3VuZGVyUGF0aCh3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBjb25zdCBwbGFubmVkID0gcGxhblBhdGgod29ybGQsIHByb3Bvc2FsKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm4gcGxhbm5lZDtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcbiAgY29uc3QgaGVpZ2h0cyA9IHBsYW5uZWQucGxhbi5tb2R1bGVzLmZpbHRlcigobSkgPT4gbS5raW5kID09PSAncGF0aCcpLm1hcCgobSkgPT4gbS55KTtcbiAgY29uc3QgejAgPSBwbGFubmVkLnBsYW4ucmVjdC56MCwgejEgPSBwbGFubmVkLnBsYW4ucmVjdC56MSArIDE7XG4gIGxldCBzdGFydCA9IDA7XG4gIGZvciAobGV0IGVuZCA9IDE7IGVuZCA8PSBoZWlnaHRzLmxlbmd0aDsgZW5kKyspIHtcbiAgICBpZiAoZW5kIDwgaGVpZ2h0cy5sZW5ndGggJiYgaGVpZ2h0c1tlbmRdID09PSBoZWlnaHRzW3N0YXJ0XSkgY29udGludWU7XG4gICAgY29uc3QgeCA9IHBsYW5uZWQucGxhbi5yZWN0LngwICsgc3RhcnQsIHdpZHRoID0gZW5kIC0gc3RhcnQ7XG4gICAgY29uc3QgY3ggPSB4ICsgd2lkdGggLyAyLCB5ID0gaGVpZ2h0c1tzdGFydF07XG4gICAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhdGgnLCB4OiBjeCwgeSwgejogKHowICsgejEpIC8gMiwgdzogd2lkdGgsIGg6IDAuMTIsIGQ6IDMsIHRvbmU6ICdncmF2ZWwnIH0pO1xuICAgIGZvciAoY29uc3QgeiBvZiBbejAgKyAwLjA3NSwgejEgLSAwLjA3NV0pIHtcbiAgICAgIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdjdXJiJywgeDogY3gsIHksIHosIHc6IHdpZHRoLCBoOiAwLjIyLCBkOiAwLjE1LCB0b25lOiAnc3RvbmUnIH0pO1xuICAgIH1cbiAgICBzdGFydCA9IGVuZDtcbiAgfVxuICBwbGFubmVkLnBsYW4ubW9kdWxlcyA9IG1vZHVsZXM7XG4gIHBsYW5uZWQucGxhbi5kZXNpZ25WZXJzaW9uID0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTjtcbiAgcGxhbm5lZC5wbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFubmVkLnBsYW4pfWA7XG4gIHJldHVybiBwbGFubmVkO1xufVxuXG5cbi8vIC0tLS0tLS0tLS0gYXV0aG9yaXphdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZUxpbWl0cyB7XG4gIG1heE1vZHVsZXM6IG51bWJlcjtcbiAgbWF4Q29zdDogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9TVFJVQ1RVUkVfTElNSVRTOiBTdHJ1Y3R1cmVMaW1pdHMgPSB7XG4gIG1heE1vZHVsZXM6IDY0LFxuICBtYXhDb3N0OiAxMjgsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZUF1dGhvcml6YXRpb24ge1xuICBpZDogc3RyaW5nO1xuICBhdXRob3JpdHk6IHR5cGVvZiBMT0NBTF9BVVRIT1JJVFk7XG4gIGVuZm9yY2VtZW50OiB0eXBlb2YgTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIHBsYW5EaWdlc3Q6IHN0cmluZztcbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIGJhc2VSZXZpc2lvbjogbnVtYmVyO1xuICBsaW1pdHM6IFN0cnVjdHVyZUxpbWl0cztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVEZWNpc2lvbiB7XG4gIG9rOiBib29sZWFuO1xuICBhdXRob3JpemF0aW9uOiBTdHJ1Y3R1cmVBdXRob3JpemF0aW9uIHwgbnVsbDtcbiAgcmVhc29uczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBjbGFzcyBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIge1xuICByZWFkb25seSBhdXRob3JpdHkgPSBMT0NBTF9BVVRIT1JJVFk7XG4gIHJlYWRvbmx5IGVuZm9yY2VtZW50ID0gTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIHJlYWRvbmx5IGxpbWl0czogU3RydWN0dXJlTGltaXRzO1xuXG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHBvbGljeTogQXV0aG9yaXphdGlvblBvbGljeSwgbGltaXRzOiBQYXJ0aWFsPFN0cnVjdHVyZUxpbWl0cz4gPSB7fSkge1xuICAgIHRoaXMubGltaXRzID0geyAuLi5ERUZBVUxUX1NUUlVDVFVSRV9MSU1JVFMsIC4uLmxpbWl0cyB9O1xuICB9XG5cbiAgYXV0aG9yaXplKHdvcmxkOiBXb3JsZCwgcGxhbjogU3RydWN0dXJlUGxhbik6IFN0cnVjdHVyZURlY2lzaW9uIHtcbiAgICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGlmIChwbGFuLm1vZHVsZXMubGVuZ3RoID09PSAwKSByZWFzb25zLnB1c2goJ3BsYW4gaGFzIG5vIG1vZHVsZXMnKTtcbiAgICBpZiAocGxhbi5tb2R1bGVzLmxlbmd0aCA+IHRoaXMubGltaXRzLm1heE1vZHVsZXMpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgJHtwbGFuLm1vZHVsZXMubGVuZ3RofSBtb2R1bGVzIGV4Y2VlZCBsaW1pdCAke3RoaXMubGltaXRzLm1heE1vZHVsZXN9YCk7XG4gICAgfVxuICAgIGlmIChjb3N0VG90YWwocGxhbi5jb3N0KSA+IHRoaXMubGltaXRzLm1heENvc3QpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgY29zdCAke2Nvc3RUb3RhbChwbGFuLmNvc3QpfSBleGNlZWRzIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4Q29zdH1gKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocGxhbi5jb3N0KSkge1xuICAgICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKGFtb3VudCkgfHwgKGFtb3VudCA/PyAwKSA8IDApIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBjb3N0ICR7cmVzb3VyY2V9PSR7YW1vdW50fSBpcyBub3QgYSBub24tbmVnYXRpdmUgaW50ZWdlcmApO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAocGxhbi5lbnZlbG9wZS5sZW5ndGggPT09IDApIHJlYXNvbnMucHVzaCgncGxhbiBoYXMgbm8gd29yayBlbnZlbG9wZScpO1xuICAgIGZvciAoY29uc3QgcmVnaW9uIG9mIHBsYW4uZW52ZWxvcGUpIHtcbiAgICAgIGlmICghdGhpcy5wb2xpY3kuZW52ZWxvcGUuc29tZSgocCkgPT4gcmVnaW9uLngwID49IHAueDAgJiYgcmVnaW9uLngxIDw9IHAueDFcbiAgICAgICAgJiYgcmVnaW9uLnowID49IHAuejAgJiYgcmVnaW9uLnoxIDw9IHAuejFcbiAgICAgICAgJiYgcmVnaW9uLnkwID49IHAueTAgJiYgcmVnaW9uLnkxIDw9IHAueTEpKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgZW52ZWxvcGUgJHtyZWdpb24ueDB9LCR7cmVnaW9uLnowfSwke3JlZ2lvbi55MH0uLiR7cmVnaW9uLngxfSwke3JlZ2lvbi56MX0sJHtyZWdpb24ueTF9IGlzIG91dHNpZGUgdGhlIGxvY2FsIHBvbGljeWApO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IG0gb2YgcGxhbi5tb2R1bGVzKSB7XG4gICAgICBpZiAoIW1vZHVsZUluc2lkZUVudmVsb3BlKG0sIHBsYW4uZW52ZWxvcGUpKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgbW9kdWxlICR7bS5raW5kfSBhdCAke20ueH0sJHttLnl9LCR7bS56fSBpcyBvdXRzaWRlIHRoZSBwbGFuIGVudmVsb3BlYCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChwbGFuLnN1cmZhY2UubGVuZ3RoID09PSAwKSByZWFzb25zLnB1c2goJ3BsYW4gaGFzIG5vIHN1cmZhY2Ugc2FtcGxlcycpO1xuICAgIGZvciAoY29uc3QgcyBvZiBwbGFuLnN1cmZhY2UpIHtcbiAgICAgIGlmICghZW52ZWxvcGVDb250YWlucyhwbGFuLmVudmVsb3BlLCBzLngsIHMueSwgcy56KSkge1xuICAgICAgICByZWFzb25zLnB1c2goYHN1cmZhY2UgJHtzLnh9LCR7cy56fSwke3MueX0gaXMgb3V0c2lkZSB0aGUgcGxhbiBlbnZlbG9wZWApO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAocmVhc29ucy5sZW5ndGggPiAwKSByZXR1cm4geyBvazogZmFsc2UsIGF1dGhvcml6YXRpb246IG51bGwsIHJlYXNvbnMgfTtcblxuICAgIGNvbnN0IHRva2VuOiBTdHJ1Y3R1cmVBdXRob3JpemF0aW9uID0ge1xuICAgICAgaWQ6IGBsb2NhbC1zdHViOnN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFuKX1gLFxuICAgICAgYXV0aG9yaXR5OiBMT0NBTF9BVVRIT1JJVFksXG4gICAgICBlbmZvcmNlbWVudDogTE9DQUxfRU5GT1JDRU1FTlQsXG4gICAgICBwbGFuRGlnZXN0OiBzdHJ1Y3R1cmVEaWdlc3QocGxhbiksXG4gICAgICBlbnZlbG9wZTogcGxhbi5lbnZlbG9wZS5tYXAoKGUpID0+ICh7IC4uLmUgfSkpLFxuICAgICAgYmFzZVJldmlzaW9uOiB3b3JsZC5yZXZpc2lvbixcbiAgICAgIGxpbWl0czogeyAuLi50aGlzLmxpbWl0cyB9LFxuICAgIH07XG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIGF1dGhvcml6YXRpb246IHRva2VuLCByZWFzb25zOiBbXSB9O1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gZXhlY3V0aW9uIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlTGVkZ2VyIHtcbiAgYXV0aG9yaXR5OiB0eXBlb2YgTE9DQUxfQVVUSE9SSVRZO1xuICBlbmZvcmNlbWVudDogdHlwZW9mIExPQ0FMX0VORk9SQ0VNRU5UO1xuICBhdXRob3JpemF0aW9uSWQ6IHN0cmluZztcbiAgcGxhbkRpZ2VzdDogc3RyaW5nO1xuICBzdHJ1Y3R1cmVJZDogc3RyaW5nO1xuICBzaXRlSWQ6IHN0cmluZztcbiAga2luZDogU3RydWN0dXJlS2luZDtcbiAgbW9kdWxlQ291bnQ6IG51bWJlcjtcbiAgY29zdFBhaWQ6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIGludmVudG9yeUJlZm9yZTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgaW52ZW50b3J5QWZ0ZXI6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIHJldmlzaW9uQmVmb3JlOiBudW1iZXI7XG4gIHJldmlzaW9uQWZ0ZXI6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVTdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHBsYW46IFN0cnVjdHVyZVBsYW47XG4gIGF1dGhvcml6YXRpb246IFN0cnVjdHVyZUF1dGhvcml6YXRpb247XG4gIGxlZGdlcjogU3RydWN0dXJlTGVkZ2VyO1xufVxuXG5leHBvcnQgdHlwZSBTdHJ1Y3R1cmVPdXRjb21lID0gU3RydWN0dXJlU3VjY2VzcyB8IFN0cnVjdHVyZUZhaWx1cmU7XG5cbmV4cG9ydCBmdW5jdGlvbiBleGVjdXRlU3RydWN0dXJlKFxuICB3b3JsZDogV29ybGQsIHBsYW46IFN0cnVjdHVyZVBsYW4sIGF1dGhvcml6YXRpb246IFN0cnVjdHVyZUF1dGhvcml6YXRpb24sXG4pOiBTdHJ1Y3R1cmVPdXRjb21lIHtcbiAgaWYgKGF1dGhvcml6YXRpb24uYXV0aG9yaXR5ICE9PSBMT0NBTF9BVVRIT1JJVFlcbiAgICB8fCBhdXRob3JpemF0aW9uLmVuZm9yY2VtZW50ICE9PSBMT0NBTF9FTkZPUkNFTUVOVCkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3Vuc3VwcG9ydGVkX2F1dGhvcml0eScsIFtcbiAgICAgIGBhdXRob3JpdHkgJHthdXRob3JpemF0aW9uLmF1dGhvcml0eX0vJHthdXRob3JpemF0aW9uLmVuZm9yY2VtZW50fSBpcyBub3QgdGhlIGxvY2FsIHN0dWJgLFxuICAgIF0pO1xuICB9XG4gIGlmIChhdXRob3JpemF0aW9uLnBsYW5EaWdlc3QgIT09IHN0cnVjdHVyZURpZ2VzdChwbGFuKSkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ2RpZ2VzdF9taXNtYXRjaCcsIFsnYXV0aG9yaXphdGlvbiBkb2VzIG5vdCBtYXRjaCB0aGlzIHN0cnVjdHVyZSBwbGFuJ10pO1xuICB9XG4gIGlmIChhdXRob3JpemF0aW9uLmJhc2VSZXZpc2lvbiAhPT0gd29ybGQucmV2aXNpb24pIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdzdGFsZV9hdXRob3JpemF0aW9uJywgW1xuICAgICAgYGF1dGhvcml6YXRpb24gd2FzIGlzc3VlZCBhdCByZXZpc2lvbiAke2F1dGhvcml6YXRpb24uYmFzZVJldmlzaW9ufSwgd29ybGQgaXMgYXQgJHt3b3JsZC5yZXZpc2lvbn1gLFxuICAgIF0pO1xuICB9XG4gIGlmIChwbGFuLmVudmVsb3BlLnNvbWUoKHIpID0+ICFhdXRob3JpemF0aW9uLmVudmVsb3BlLnNvbWUoKGEpID0+IHIueDAgPj0gYS54MFxuICAgICYmIHIueDEgPD0gYS54MSAmJiByLnowID49IGEuejAgJiYgci56MSA8PSBhLnoxICYmIHIueTAgPj0gYS55MCAmJiByLnkxIDw9IGEueTEpKSkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ2VudmVsb3BlX21pc21hdGNoJywgWydwbGFuIGVudmVsb3BlIGlzIHdpZGVyIHRoYW4gdGhlIGF1dGhvcml6YXRpb24nXSk7XG4gIH1cblxuICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IG0gb2YgcGxhbi5tb2R1bGVzKSB7XG4gICAgaWYgKCFtb2R1bGVJbnNpZGVFbnZlbG9wZShtLCBhdXRob3JpemF0aW9uLmVudmVsb3BlKSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBtb2R1bGUgJHttLmtpbmR9IGF0ICR7bS54fSwke20ueX0sJHttLnp9IGlzIG91dHNpZGUgdGhlIGF1dGhvcml6ZWQgZW52ZWxvcGVgKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgbWlzbWF0Y2hlcyA9IHN1cmZhY2VNaXNtYXRjaGVzKHdvcmxkLCBwbGFuLnN1cmZhY2UpO1xuICBpZiAobWlzbWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgcmVhc29ucy5wdXNoKC4uLm1pc21hdGNoZXMuc2xpY2UoMCwgNCkubWFwKFxuICAgICAgKG0pID0+IGBjb2x1bW4gJHttLnh9LCR7bS56fSBpcyBhdCAke20uYWN0dWFsfSwgZXhwZWN0ZWQgJHttLmV4cGVjdGVkfWAsXG4gICAgKSk7XG4gIH1cbiAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHBsYW4ucmVjdCk7XG4gIGlmIChvYnN0cnVjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIHJlYXNvbnMucHVzaChgZm9vdHByaW50IGhhcyAke29ic3RydWN0aW9ucy5sZW5ndGh9IG9ic3RydWN0aW9uc2ApO1xuICB9XG4gIGlmICh3b3JsZC5zdHJ1Y3R1cmVzLmhhcyhwbGFuLmlkKSkge1xuICAgIHJlYXNvbnMucHVzaChgc3RydWN0dXJlICR7cGxhbi5pZH0gYWxyZWFkeSBleGlzdHNgKTtcbiAgfVxuICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhwbGFuLmNvc3QpKSB7XG4gICAgY29uc3QgaGF2ZSA9IHdvcmxkLmludmVudG9yeVtyZXNvdXJjZV0gPz8gMDtcbiAgICBpZiAoaGF2ZSA8IChhbW91bnQgPz8gMCkpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgbmVlZCAke2Ftb3VudH0gJHtyZXNvdXJjZX0sIGhhdmUgJHtoYXZlfWApO1xuICAgIH1cbiAgfVxuICBpZiAocmVhc29ucy5sZW5ndGggPiAwKSByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICd1bmF1dGhvcml6ZWRfc3RydWN0dXJlJywgcmVhc29ucyk7XG5cbiAgY29uc3QgaW52ZW50b3J5QmVmb3JlID0gaW52ZW50b3J5U25hcHNob3Qod29ybGQpO1xuICBjb25zdCByZXZpc2lvbkJlZm9yZSA9IHdvcmxkLnJldmlzaW9uO1xuICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhwbGFuLmNvc3QpKSB7XG4gICAgY29uc3QgbGVmdCA9ICh3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDApIC0gKGFtb3VudCA/PyAwKTtcbiAgICBpZiAobGVmdCA+IDApIHdvcmxkLmludmVudG9yeVtyZXNvdXJjZV0gPSBsZWZ0O1xuICAgIGVsc2UgZGVsZXRlIHdvcmxkLmludmVudG9yeVtyZXNvdXJjZV07XG4gIH1cblxuICB3b3JsZC5yZXZpc2lvbisrO1xuICBjb25zdCBzdHJ1Y3R1cmU6IFN0cnVjdHVyZSA9IHtcbiAgICBpZDogcGxhbi5pZCxcbiAgICBraW5kOiBwbGFuLmtpbmQsXG4gICAgc2l0ZUlkOiBwbGFuLnNpdGVJZCxcbiAgICB4OiBwbGFuLm9yaWdpbi54LFxuICAgIHk6IHBsYW4ub3JpZ2luLnksXG4gICAgejogcGxhbi5vcmlnaW4ueixcbiAgICByb3Q6IHBsYW4ucm90LFxuICAgIG1vZHVsZXM6IHBsYW4ubW9kdWxlcy5tYXAoKG0pID0+ICh7IC4uLm0gfSkpLFxuICAgIGNvc3Q6IHsgLi4ucGxhbi5jb3N0IH0sXG4gICAgYnVpbHRSZXZpc2lvbjogd29ybGQucmV2aXNpb24sXG4gICAgLi4uKHBsYW4uZGVzaWduVmVyc2lvbiA9PT0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTiA/IHsgZGVzaWduVmVyc2lvbjogRk9VTkRFUl9ERVNJR05fVkVSU0lPTiB9IDoge30pLFxuICAgIHByb3Zpc2lvbmFsOiB0cnVlLFxuICB9O1xuICB3b3JsZC5zdHJ1Y3R1cmVzLnNldChzdHJ1Y3R1cmUuaWQsIHN0cnVjdHVyZSk7XG5cbiAgY29uc3QgbGVkZ2VyOiBTdHJ1Y3R1cmVMZWRnZXIgPSB7XG4gICAgYXV0aG9yaXR5OiBMT0NBTF9BVVRIT1JJVFksXG4gICAgZW5mb3JjZW1lbnQ6IExPQ0FMX0VORk9SQ0VNRU5ULFxuICAgIGF1dGhvcml6YXRpb25JZDogYXV0aG9yaXphdGlvbi5pZCxcbiAgICBwbGFuRGlnZXN0OiBhdXRob3JpemF0aW9uLnBsYW5EaWdlc3QsXG4gICAgc3RydWN0dXJlSWQ6IHN0cnVjdHVyZS5pZCxcbiAgICBzaXRlSWQ6IHBsYW4uc2l0ZUlkLFxuICAgIGtpbmQ6IHBsYW4ua2luZCxcbiAgICBtb2R1bGVDb3VudDogc3RydWN0dXJlLm1vZHVsZXMubGVuZ3RoLFxuICAgIGNvc3RQYWlkOiB7IC4uLnBsYW4uY29zdCB9LFxuICAgIGludmVudG9yeUJlZm9yZSxcbiAgICBpbnZlbnRvcnlBZnRlcjogaW52ZW50b3J5U25hcHNob3Qod29ybGQpLFxuICAgIHJldmlzaW9uQmVmb3JlLFxuICAgIHJldmlzaW9uQWZ0ZXI6IHdvcmxkLnJldmlzaW9uLFxuICB9O1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiwgYXV0aG9yaXphdGlvbiwgbGVkZ2VyIH07XG59XG5cbi8qKlxuICogVGhlIHNoYXJlZCBwbGF5ZXIvQUkgc3RydWN0dXJlIGVudHJ5IHBvaW50LiBUZXJyYWluIG11c3QgYWxyZWFkeSBiZSBwcmVwYXJlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkU3RydWN0dXJlKFxuICB3b3JsZDogV29ybGQsXG4gIGF1dGhvcml6ZXI6IExvY2FsU3RydWN0dXJlQXV0aG9yaXplcixcbiAgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsLFxuKTogU3RydWN0dXJlT3V0Y29tZSB7XG4gIGNvbnN0IHBsYW5uZWQgPSBwbGFuU3RydWN0dXJlKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuIHBsYW5uZWQ7XG4gIGNvbnN0IGRlY2lzaW9uID0gYXV0aG9yaXplci5hdXRob3JpemUod29ybGQsIHBsYW5uZWQucGxhbik7XG4gIGlmICghZGVjaXNpb24ub2sgfHwgIWRlY2lzaW9uLmF1dGhvcml6YXRpb24pIHtcbiAgICByZXR1cm4gZmFpbCgnYXV0aG9yaXplJywgJ25vdF9hdXRob3JpemVkJywgZGVjaXNpb24ucmVhc29ucyk7XG4gIH1cbiAgcmV0dXJuIGV4ZWN1dGVTdHJ1Y3R1cmUod29ybGQsIHBsYW5uZWQucGxhbiwgZGVjaXNpb24uYXV0aG9yaXphdGlvbik7XG59XG4iLCAiLy8gQ2Fub25pY2FsIHN0YXRlIGhhc2hpbmcgXHUyMDE0IHB1cmUgc2ltdWxhdGlvbiwgbm8gdGhyZWUuanMgaW1wb3J0cy5cbi8vXG4vLyBUaGUgbm8tZmxhdHRlbiBwcm9vZiBjb21wYXJlcyB0aGUgYXV0aG9yaXRhdGl2ZSB2b3hlbCB2b2x1bWUgb3V0c2lkZSB0aGVcbi8vIGNvbXBsZXRlIGF1dGhvcml6ZWQgd29yayBlbnZlbG9wZS4gSXQgZGVsaWJlcmF0ZWx5IGRvZXMgbm90IGhhc2ggY2h1bmtcbi8vIGhlaWdodHMvdG9wTWF0ZXJpYWxzIChkZXJpdmVkIGNhY2hlcyksIG1lc2ggZ2VvbWV0cnksIHN0cmVhbWluZyBzdGF0ZSBvclxuLy8gbmF2aWdhdGlvbiBkYXRhLiBUaG9zZSBhcmUgY2hlY2tlZCBzZXBhcmF0ZWx5IGFzIGRlcml2ZWQgc3RhdGUsIHNvIGEgY2FjaGVcbi8vIG9yIG1lc2ggcmVidWlsZCBjYW4gbmV2ZXIgYmUgbWlzdGFrZW4gZm9yIGEgdGVycmFpbiBtdXRhdGlvbi5cbmltcG9ydCB7XG4gIFdvcmxkLCBZX01JTiwgWV9NQVgsIEhBTEYsIENIVU5LX1NJWkUsIENIVU5LX0FSRUEsXG4gIGVuc3VyZUNodW5rLCB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCBjaHVua0tleSxcbiAgY2h1bmtPcmlnaW5YLCBjaHVua09yaWdpblosIGxvY2FsSW5kZXgsIHlUb0luZGV4LCBpc1NvbGlkLFxuICBFbnRpdHksXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgVm94ZWxSZWdpb24sIGVudmVsb3BlQ29udGFpbnMgfSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHsgRk9VTkRFUl9ERVNJR05fVkVSU0lPTiB9IGZyb20gJy4vc3RydWN0dXJlcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RhdGVIYXNoIHtcbiAgLyoqIDE2IGhleCBjaGFyYWN0ZXJzOiB0d28gaW5kZXBlbmRlbnQgMzItYml0IGxhbmVzLiAqL1xuICBoYXNoOiBzdHJpbmc7XG4gIGNlbGxzOiBudW1iZXI7XG4gIGV4Y2x1ZGVkQ2VsbHM6IG51bWJlcjtcbiAgY2h1bmtzOiBudW1iZXI7XG4gIHJlZ2lvbjogVm94ZWxSZWdpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2FjaGVNaXNtYXRjaCB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICBmaWVsZDogJ2hlaWdodCcgfCAnbWF0ZXJpYWwnO1xuICBleHBlY3RlZDogbnVtYmVyO1xuICBhY3R1YWw6IG51bWJlcjtcbn1cblxuY2xhc3MgSGFzaGVyIHtcbiAgcHJpdmF0ZSBhID0gMHg4MTFjOWRjNTtcbiAgcHJpdmF0ZSBiID0gMHg5ZTM3NzliOTtcblxuICBieXRlKHY6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IHggPSB2ICYgMHhmZjtcbiAgICB0aGlzLmEgPSBNYXRoLmltdWwodGhpcy5hIF4geCwgMHgwMTAwMDE5Myk7XG4gICAgdGhpcy5iID0gTWF0aC5pbXVsKHRoaXMuYiBeICh4ICsgMHg5ZSksIDB4ODVlYmNhNmIpO1xuICAgIHRoaXMuYiBePSB0aGlzLmIgPj4+IDEzO1xuICB9XG5cbiAgdTMyKHY6IG51bWJlcik6IHZvaWQge1xuICAgIGxldCBuID0gdiA+Pj4gMDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IDQ7IGkrKykge1xuICAgICAgdGhpcy5ieXRlKG4pO1xuICAgICAgbiA+Pj49IDg7XG4gICAgfVxuICB9XG5cbiAgc3RyaW5nKHM6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMudTMyKHMubGVuZ3RoKTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHMubGVuZ3RoOyBpKyspIHRoaXMuYnl0ZShzLmNoYXJDb2RlQXQoaSkpO1xuICB9XG5cbiAgaGV4KCk6IHN0cmluZyB7XG4gICAgcmV0dXJuICh0aGlzLmEgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpXG4gICAgICArICh0aGlzLmIgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGFtcFJlZ2lvbihyZWdpb246IFZveGVsUmVnaW9uKTogVm94ZWxSZWdpb24ge1xuICBjb25zdCByOiBWb3hlbFJlZ2lvbiA9IHtcbiAgICB4MDogTWF0aC5tYXgoLUhBTEYsIE1hdGguZmxvb3IocmVnaW9uLngwKSksXG4gICAgejA6IE1hdGgubWF4KC1IQUxGLCBNYXRoLmZsb29yKHJlZ2lvbi56MCkpLFxuICAgIHgxOiBNYXRoLm1pbihIQUxGIC0gMSwgTWF0aC5mbG9vcihyZWdpb24ueDEpKSxcbiAgICB6MTogTWF0aC5taW4oSEFMRiAtIDEsIE1hdGguZmxvb3IocmVnaW9uLnoxKSksXG4gICAgeTA6IE1hdGgubWF4KFlfTUlOLCBNYXRoLmZsb29yKHJlZ2lvbi55MCkpLFxuICAgIHkxOiBNYXRoLm1pbihZX01BWCAtIDEsIE1hdGguZmxvb3IocmVnaW9uLnkxKSksXG4gIH07XG4gIGlmIChyLngwID4gci54MSB8fCByLnowID4gci56MSB8fCByLnkwID4gci55MSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgZW1wdHkgdm94ZWwgcmVnaW9uICR7SlNPTi5zdHJpbmdpZnkocmVnaW9uKX1gKTtcbiAgfVxuICByZXR1cm4gcjtcbn1cblxuLyoqIFNvcnQgYW4gZW52ZWxvcGUgc28gaXRzIGhhc2ggaXMgaW5kZXBlbmRlbnQgb2YgcmVjdCBvcmRlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVFbnZlbG9wZShyZWN0czogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSk6IFZveGVsUmVnaW9uW10ge1xuICByZXR1cm4gcmVjdHNcbiAgICAubWFwKChyKSA9PiAoe1xuICAgICAgeDA6IE1hdGguZmxvb3Ioci54MCksIHowOiBNYXRoLmZsb29yKHIuejApLCB4MTogTWF0aC5mbG9vcihyLngxKSwgejE6IE1hdGguZmxvb3Ioci56MSksXG4gICAgICB5MDogTWF0aC5mbG9vcihyLnkwKSwgeTE6IE1hdGguZmxvb3Ioci55MSksXG4gICAgfSkpXG4gICAgLnNvcnQoKGEsIGIpID0+IGEueDAgLSBiLngwIHx8IGEuejAgLSBiLnowIHx8IGEueTAgLSBiLnkwXG4gICAgICB8fCBhLngxIC0gYi54MSB8fCBhLnoxIC0gYi56MSB8fCBhLnkxIC0gYi55MSk7XG59XG5cbi8qKiBNYXRlcmlhbGlzZSBldmVyeSBjaHVuayB0aGF0IG92ZXJsYXBzIHRoZSByZWdpb24gYW5kIHJldHVybiBzb3J0ZWQga2V5cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVSZWdpb25DaHVua3Mod29ybGQ6IFdvcmxkLCByZWdpb246IFZveGVsUmVnaW9uKTogc3RyaW5nW10ge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3Qga2V5czogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgY3gwID0gd29ybGRUb0NodW5rWChyLngwKSwgY3gxID0gd29ybGRUb0NodW5rWChyLngxKTtcbiAgY29uc3QgY3owID0gd29ybGRUb0NodW5rWihyLnowKSwgY3oxID0gd29ybGRUb0NodW5rWihyLnoxKTtcbiAgZm9yIChsZXQgY3ogPSBjejA7IGN6IDw9IGN6MTsgY3orKykge1xuICAgIGZvciAobGV0IGN4ID0gY3gwOyBjeCA8PSBjeDE7IGN4KyspIHtcbiAgICAgIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gICAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYGNodW5rICR7Y3h9LCR7Y3p9IGlzIG91dHNpZGUgdGhlIHdvcmxkYCk7XG4gICAgICBrZXlzLnB1c2goY2h1bmtLZXkoY3gsIGN6KSk7XG4gICAgfVxuICB9XG4gIGtleXMuc29ydCgpO1xuICByZXR1cm4ga2V5cztcbn1cblxuLyoqXG4gKiBIYXNoIHRoZSBhdXRob3JpdGF0aXZlIG1hdGVyaWFsIGJ5dGUgb2YgZXZlcnkgdm94ZWwgaW4gYHJlZ2lvbmAsIGV4Y2x1ZGluZ1xuICogZXZlcnkgdm94ZWwgaW5zaWRlIGBleGNsdWRlYC4gVHdvIGNhbGxzIHdpdGggdGhlIHNhbWUgcmVnaW9uIGFuZCBlbnZlbG9wZVxuICogYXJlIGRpcmVjdGx5IGNvbXBhcmFibGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxSZWdpb25IYXNoKFxuICB3b3JsZDogV29ybGQsXG4gIHJlZ2lvbjogVm94ZWxSZWdpb24sXG4gIGV4Y2x1ZGU6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10gPSBbXSxcbik6IFN0YXRlSGFzaCB7XG4gIGNvbnN0IHIgPSBjbGFtcFJlZ2lvbihyZWdpb24pO1xuICBjb25zdCBlbnZlbG9wZSA9IG5vcm1hbGl6ZUVudmVsb3BlKGV4Y2x1ZGUpO1xuICBjb25zdCBrZXlzID0gZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkLCByKTtcbiAgY29uc3QgaCA9IG5ldyBIYXNoZXIoKTtcbiAgaC5zdHJpbmcoJ20wMDI6dm94ZWwtc3RhdGU6djEnKTtcbiAgaC51MzIoci54MCk7IGgudTMyKHIuejApOyBoLnUzMihyLngxKTsgaC51MzIoci56MSk7IGgudTMyKHIueTApOyBoLnUzMihyLnkxKTtcbiAgaC51MzIoZW52ZWxvcGUubGVuZ3RoKTtcbiAgZm9yIChjb25zdCBlIG9mIGVudmVsb3BlKSB7XG4gICAgaC51MzIoZS54MCk7IGgudTMyKGUuejApOyBoLnUzMihlLngxKTsgaC51MzIoZS56MSk7IGgudTMyKGUueTApOyBoLnUzMihlLnkxKTtcbiAgfVxuXG4gIGxldCBjZWxscyA9IDA7XG4gIGxldCBleGNsdWRlZENlbGxzID0gMDtcbiAgY29uc3QgeWkwID0gci55MCAtIFlfTUlOO1xuICBjb25zdCB5aTEgPSByLnkxIC0gWV9NSU47XG5cbiAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgIGNvbnN0IGNodW5rID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmICghY2h1bmspIHRocm93IG5ldyBFcnJvcihgY2h1bmsgJHtrZXl9IHdhcyBub3QgZ2VuZXJhdGVkYCk7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3QgbHgwID0gTWF0aC5tYXgoMCwgci54MCAtIG94KSwgbHgxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIueDEgLSBveCk7XG4gICAgY29uc3QgbHowID0gTWF0aC5tYXgoMCwgci56MCAtIG96KSwgbHoxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIuejEgLSBveik7XG4gICAgaC5zdHJpbmcoJ2NodW5rJyk7XG4gICAgaC51MzIoY2h1bmsuY3gpOyBoLnUzMihjaHVuay5jeik7XG4gICAgZm9yIChsZXQgeWkgPSB5aTA7IHlpIDw9IHlpMTsgeWkrKykge1xuICAgICAgY29uc3QgeSA9IFlfTUlOICsgeWk7XG4gICAgICBmb3IgKGxldCBseiA9IGx6MDsgbHogPD0gbHoxOyBseisrKSB7XG4gICAgICAgIGNvbnN0IHogPSBveiArIGx6O1xuICAgICAgICBmb3IgKGxldCBseCA9IGx4MDsgbHggPD0gbHgxOyBseCsrKSB7XG4gICAgICAgICAgY29uc3QgeCA9IG94ICsgbHg7XG4gICAgICAgICAgaWYgKGVudmVsb3BlLmxlbmd0aCA+IDAgJiYgZW52ZWxvcGVDb250YWlucyhlbnZlbG9wZSwgeCwgeSwgeikpIHtcbiAgICAgICAgICAgIGV4Y2x1ZGVkQ2VsbHMrKztcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBoLmJ5dGUoY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5aSwgbHopXSk7XG4gICAgICAgICAgY2VsbHMrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGhhc2g6IGguaGV4KCksIGNlbGxzLCBleGNsdWRlZENlbGxzLCBjaHVua3M6IGtleXMubGVuZ3RoLCByZWdpb246IHIgfTtcbn1cblxuLyoqIENhbm9uaWNhbCBpbnZlbnRvcnkgaGFzaDsga2V5IG9yZGVyIGNhbm5vdCBhZmZlY3QgdGhlIHJlc3VsdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxJbnZlbnRvcnlIYXNoKHdvcmxkOiBXb3JsZCk6IHN0cmluZyB7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOmludmVudG9yeTp2MScpO1xuICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMod29ybGQuaW52ZW50b3J5KS5zb3J0KCk7XG4gIGgudTMyKGtleXMubGVuZ3RoKTtcbiAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgIGguc3RyaW5nKGtleSk7XG4gICAgaC51MzIod29ybGQuaW52ZW50b3J5W2tleV0pO1xuICB9XG4gIHJldHVybiBoLmhleCgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW52ZW50b3J5U25hcHNob3Qod29ybGQ6IFdvcmxkKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gIGNvbnN0IG91dDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyh3b3JsZC5pbnZlbnRvcnkpLnNvcnQoKSkgb3V0W2tleV0gPSB3b3JsZC5pbnZlbnRvcnlba2V5XTtcbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gaGFzaEVudGl0eShoOiBIYXNoZXIsIGU6IEVudGl0eSk6IHZvaWQge1xuICBoLnN0cmluZyhlLmlkKTtcbiAgaC5zdHJpbmcoZS5raW5kKTtcbiAgaC5zdHJpbmcoZS5jaHVuayk7XG4gIGgudTMyKE1hdGgucm91bmQoZS54ICogMTAwMCkpO1xuICBoLnUzMihNYXRoLnJvdW5kKGUueSAqIDEwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnogKiAxMDAwKSk7XG4gIGgudTMyKE1hdGgucm91bmQoZS5yb3QgKiAxMDAwMCkpO1xuICBoLnUzMihNYXRoLnJvdW5kKGUuc2NhbGUgKiAxMDAwKSk7XG4gIGgudTMyKGUudmFyaWFudCk7XG4gIGguc3RyaW5nKGUucmVzb3VyY2UgPz8gJycpO1xuICBoLnUzMihlLnJlbWFpbmluZyk7XG4gIGgudTMyKGUuaGFydmVzdGVkID8gMSA6IDApO1xuICBoLnUzMihlLmhhcnZlc3RlZE9uY2UgPyAxIDogMCk7XG59XG5cbi8qKiBIYXNoIGVudGl0eSBzdGF0ZTsgd2l0aCBhIHJlZ2lvbiwgb25seSBlbnRpdGllcyByb290ZWQgaW5zaWRlIGl0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbEVudGl0eUhhc2god29ybGQ6IFdvcmxkLCByZWdpb24/OiBWb3hlbFJlZ2lvbik6IHN0cmluZyB7XG4gIGxldCBlbnRpdGllczogRW50aXR5W107XG4gIGlmIChyZWdpb24pIHtcbiAgICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgICBlbnN1cmVSZWdpb25DaHVua3Mod29ybGQsIHIpO1xuICAgIGVudGl0aWVzID0gWy4uLndvcmxkLmVudGl0aWVzLnZhbHVlcygpXS5maWx0ZXIoXG4gICAgICAoZSkgPT4gZS54ID49IHIueDAgJiYgZS54IDwgci54MSArIDEgJiYgZS56ID49IHIuejAgJiYgZS56IDwgci56MSArIDEsXG4gICAgKTtcbiAgfSBlbHNlIHtcbiAgICBlbnRpdGllcyA9IFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV07XG4gIH1cbiAgZW50aXRpZXMuc29ydCgoYSwgYikgPT4gKGEuaWQgPCBiLmlkID8gLTEgOiBhLmlkID4gYi5pZCA/IDEgOiAwKSk7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOmVudGl0eS1zdGF0ZTp2MScpO1xuICBoLnUzMihlbnRpdGllcy5sZW5ndGgpO1xuICBmb3IgKGNvbnN0IGUgb2YgZW50aXRpZXMpIGhhc2hFbnRpdHkoaCwgZSk7XG4gIHJldHVybiBoLmhleCgpO1xufVxuXG4vKipcbiAqIENhbm9uaWNhbCBoYXNoIG9mIGJ1aWx0IHN0cnVjdHVyZXMuIExheW91dCBtb2R1bGVzIGFuZCBwYWlkIGNvc3RzIGFyZVxuICogYXV0aG9yaXRhdGl2ZSBzaW11bGF0aW9uIHN0YXRlOyByZW5kZXJlciBtZXNoZXMgYXJlIG5vdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbFN0cnVjdHVyZUhhc2god29ybGQ6IFdvcmxkKTogc3RyaW5nIHtcbiAgY29uc3Qgc3RydWN0dXJlcyA9IFsuLi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXVxuICAgIC5zb3J0KChhLCBiKSA9PiAoYS5pZCA8IGIuaWQgPyAtMSA6IGEuaWQgPiBiLmlkID8gMSA6IDApKTtcbiAgY29uc3QgaCA9IG5ldyBIYXNoZXIoKTtcbiAgaC5zdHJpbmcoJ20wMDI6c3RydWN0dXJlLXN0YXRlOnYxJyk7XG4gIGgudTMyKHN0cnVjdHVyZXMubGVuZ3RoKTtcbiAgZm9yIChjb25zdCBzIG9mIHN0cnVjdHVyZXMpIHtcbiAgICBoLnN0cmluZyhzLmlkKTtcbiAgICBoLnN0cmluZyhzLmtpbmQpO1xuICAgIGguc3RyaW5nKHMuc2l0ZUlkKTtcbiAgICBoLnUzMihNYXRoLnJvdW5kKHMueCAqIDEwMDApKTtcbiAgICBoLnUzMihNYXRoLnJvdW5kKHMueSAqIDEwMDApKTtcbiAgICBoLnUzMihNYXRoLnJvdW5kKHMueiAqIDEwMDApKTtcbiAgICBoLnUzMihNYXRoLnJvdW5kKHMucm90ICogMTAwMDApKTtcbiAgICAvLyBMZWdhY3kgaGFzaCBpbnB1dCBpcyBieXRlLWlkZW50aWNhbC4gRGVzaWduIDIgYWRkcyBhbiBleHBsaWNpdCB0YWcuXG4gICAgaWYgKHMuZGVzaWduVmVyc2lvbiA9PT0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTikgaC5zdHJpbmcoJ2Rlc2lnbjoyJyk7XG4gICAgaC51MzIocy5tb2R1bGVzLmxlbmd0aCk7XG4gICAgZm9yIChjb25zdCBtIG9mIHMubW9kdWxlcykge1xuICAgICAgaC5zdHJpbmcobS5raW5kKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS54ICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLnkgKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0ueiAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS53ICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLmggKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0uZCAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQoKG0ucm90ID8/IDApICogMTAwMDApKTtcbiAgICAgIGguc3RyaW5nKG0udG9uZSA/PyAnJyk7XG4gICAgfVxuICAgIGNvbnN0IGNvc3RLZXlzID0gT2JqZWN0LmtleXMocy5jb3N0KS5zb3J0KCk7XG4gICAgaC51MzIoY29zdEtleXMubGVuZ3RoKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBjb3N0S2V5cykge1xuICAgICAgaC5zdHJpbmcoa2V5KTtcbiAgICAgIGgudTMyKHMuY29zdFtrZXkgYXMga2V5b2YgdHlwZW9mIHMuY29zdF0gPz8gMCk7XG4gICAgfVxuICAgIGgudTMyKHMuYnVpbHRSZXZpc2lvbik7XG4gIH1cbiAgcmV0dXJuIGguaGV4KCk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2FjaGVIYXNoIHtcbiAgaGFzaDogc3RyaW5nO1xuICBjb2x1bW5zOiBudW1iZXI7XG4gIGNodW5rczogbnVtYmVyO1xufVxuXG4vKiogRGVyaXZlZCBjb2x1bW4tY2FjaGUgaGFzaC4gTm90IGF1dGhvcml0YXRpdmUgdGVycmFpbiBzdGF0ZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZXJpdmVkQ2FjaGVIYXNoKHdvcmxkOiBXb3JsZCwgcmVnaW9uOiBWb3hlbFJlZ2lvbik6IENhY2hlSGFzaCB7XG4gIGNvbnN0IHIgPSBjbGFtcFJlZ2lvbihyZWdpb24pO1xuICBjb25zdCBrZXlzID0gZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkLCByKTtcbiAgY29uc3QgaCA9IG5ldyBIYXNoZXIoKTtcbiAgaC5zdHJpbmcoJ20wMDI6ZGVyaXZlZC1jb2x1bW4tY2FjaGU6djEnKTtcbiAgaC51MzIoci54MCk7IGgudTMyKHIuejApOyBoLnUzMihyLngxKTsgaC51MzIoci56MSk7XG4gIGxldCBjb2x1bW5zID0gMDtcbiAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgIGNvbnN0IGNodW5rID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmICghY2h1bmspIHRocm93IG5ldyBFcnJvcihgY2h1bmsgJHtrZXl9IHdhcyBub3QgZ2VuZXJhdGVkYCk7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3QgbHgwID0gTWF0aC5tYXgoMCwgci54MCAtIG94KSwgbHgxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIueDEgLSBveCk7XG4gICAgY29uc3QgbHowID0gTWF0aC5tYXgoMCwgci56MCAtIG96KSwgbHoxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIuejEgLSBveik7XG4gICAgaC5zdHJpbmcoJ2NodW5rJyk7XG4gICAgaC51MzIoY2h1bmsuY3gpOyBoLnUzMihjaHVuay5jeik7XG4gICAgZm9yIChsZXQgbHogPSBsejA7IGx6IDw9IGx6MTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSBseDA7IGx4IDw9IGx4MTsgbHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgICAgaC51MzIoY2h1bmsuaGVpZ2h0c1tjb2xdKTtcbiAgICAgICAgaC51MzIoY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF0pO1xuICAgICAgICBjb2x1bW5zKys7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiB7IGhhc2g6IGguaGV4KCksIGNvbHVtbnMsIGNodW5rczoga2V5cy5sZW5ndGggfTtcbn1cblxuLyoqXG4gKiBSZWNvbXB1dGUgZXZlcnkgY29sdW1uIGNhY2hlIGZyb20gdGhlIGF1dGhvcml0YXRpdmUgdm94ZWwgZGF0YSBhbmQgcmVwb3J0XG4gKiBtaXNtYXRjaGVzLiBUaGlzIHByb3ZlcyBoZWlnaHRzL3RvcE1hdGVyaWFscyBhcmUgZGVyaXZlZCwgbm90IGEgc2Vjb25kXG4gKiB0ZXJyYWluIHJlcHJlc2VudGF0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2hlY2tEZXJpdmVkQ2FjaGVzKHdvcmxkOiBXb3JsZCwgcmVnaW9uOiBWb3hlbFJlZ2lvbiwgbGltaXQgPSA2NCk6IENhY2hlTWlzbWF0Y2hbXSB7XG4gIGNvbnN0IHIgPSBjbGFtcFJlZ2lvbihyZWdpb24pO1xuICBjb25zdCBrZXlzID0gZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkLCByKTtcbiAgY29uc3Qgb3V0OiBDYWNoZU1pc21hdGNoW10gPSBbXTtcbiAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgIGNvbnN0IGNodW5rID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmICghY2h1bmspIGNvbnRpbnVlO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGx4MCA9IE1hdGgubWF4KDAsIHIueDAgLSBveCksIGx4MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLngxIC0gb3gpO1xuICAgIGNvbnN0IGx6MCA9IE1hdGgubWF4KDAsIHIuejAgLSBveiksIGx6MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLnoxIC0gb3opO1xuICAgIGZvciAobGV0IGx6ID0gbHowOyBseiA8PSBsejE7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gbHgwOyBseCA8PSBseDE7IGx4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICAgIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICAgICAgICBsZXQgdG9wTWF0ID0gY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF07XG4gICAgICAgIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgICAgICAgIGNvbnN0IG0gPSBjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildO1xuICAgICAgICAgIGlmIChpc1NvbGlkKG0pKSB7IHRvcFNvbGlkID0geTsgdG9wTWF0ID0gbTsgYnJlYWs7IH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBleHBlY3RlZEhlaWdodCA9IHRvcFNvbGlkIC0gWV9NSU47XG4gICAgICAgIGlmIChjaHVuay5oZWlnaHRzW2NvbF0gIT09IGV4cGVjdGVkSGVpZ2h0KSB7XG4gICAgICAgICAgb3V0LnB1c2goeyB4OiBveCArIGx4LCB6OiBveiArIGx6LCBmaWVsZDogJ2hlaWdodCcsIGV4cGVjdGVkOiBleHBlY3RlZEhlaWdodCwgYWN0dWFsOiBjaHVuay5oZWlnaHRzW2NvbF0gfSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdICE9PSB0b3BNYXQpIHtcbiAgICAgICAgICBvdXQucHVzaCh7IHg6IG94ICsgbHgsIHo6IG96ICsgbHosIGZpZWxkOiAnbWF0ZXJpYWwnLCBleHBlY3RlZDogdG9wTWF0LCBhY3R1YWw6IGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvdXQubGVuZ3RoID49IGxpbWl0KSByZXR1cm4gb3V0O1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEVkaXRPdXRzaWRlIHtcbiAgY2h1bms6IHN0cmluZztcbiAgaW5kZXg6IG51bWJlcjtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgbWF0ZXJpYWw6IG51bWJlcjtcbn1cblxuLyoqIEV2ZXJ5IHJlY29yZGVkIHZveGVsIGVkaXQgb3V0c2lkZSB0aGUgYXV0aG9yaXplZCB3b3JrIGVudmVsb3BlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVkaXRzT3V0c2lkZUVudmVsb3BlKHdvcmxkOiBXb3JsZCwgZW52ZWxvcGU6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBFZGl0T3V0c2lkZVtdIHtcbiAgY29uc3Qgb3V0OiBFZGl0T3V0c2lkZVtdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgZWRpdHNdIG9mIHdvcmxkLmVkaXRzKSB7XG4gICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjeCksIG96ID0gY2h1bmtPcmlnaW5aKGN6KTtcbiAgICBmb3IgKGNvbnN0IFtpbmRleCwgbWF0ZXJpYWxdIG9mIGVkaXRzKSB7XG4gICAgICBjb25zdCBseCA9IGluZGV4ICUgQ0hVTktfU0laRTtcbiAgICAgIGNvbnN0IGx6ID0gTWF0aC5mbG9vcigoaW5kZXggJSBDSFVOS19BUkVBKSAvIENIVU5LX1NJWkUpO1xuICAgICAgY29uc3QgeWkgPSBNYXRoLmZsb29yKGluZGV4IC8gQ0hVTktfQVJFQSk7XG4gICAgICBjb25zdCB4ID0gb3ggKyBseCwgeiA9IG96ICsgbHosIHkgPSBZX01JTiArIHlpO1xuICAgICAgaWYgKCFlbnZlbG9wZUNvbnRhaW5zKGVudmVsb3BlLCB4LCB5LCB6KSkge1xuICAgICAgICBvdXQucHVzaCh7IGNodW5rOiBrZXksIGluZGV4LCB4LCB5LCB6LCBtYXRlcmlhbCB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgb3V0LnNvcnQoKGEsIGIpID0+IGEuY2h1bmsubG9jYWxlQ29tcGFyZShiLmNodW5rKSB8fCBhLmluZGV4IC0gYi5pbmRleCk7XG4gIHJldHVybiBvdXQ7XG59XG5cbi8qKiBOZXcgY2h1bmtzIGdlbmVyYXRlZCBzaW5jZSB0aGUgYmFzZWxpbmUgdGhhdCBkbyBub3Qgb3ZlcmxhcCB0aGUgZW52ZWxvcGUuICovXG5leHBvcnQgZnVuY3Rpb24gbmV3Q2h1bmtzT3V0c2lkZUVudmVsb3BlKFxuICB3b3JsZDogV29ybGQsIGJhc2VsaW5lS2V5czogSXRlcmFibGU8c3RyaW5nPiwgZW52ZWxvcGU6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10sXG4pOiBzdHJpbmdbXSB7XG4gIGNvbnN0IGJhc2VsaW5lID0gbmV3IFNldChiYXNlbGluZUtleXMpO1xuICBjb25zdCBvdXQ6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgY2h1bmtdIG9mIHdvcmxkLmNodW5rcykge1xuICAgIGlmIChiYXNlbGluZS5oYXMoa2V5KSkgY29udGludWU7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3Qgb3ZlcmxhcHMgPSBlbnZlbG9wZS5zb21lKFxuICAgICAgKHIpID0+IG94IDw9IHIueDEgJiYgb3ggKyBDSFVOS19TSVpFIC0gMSA+PSByLngwICYmIG96IDw9IHIuejEgJiYgb3ogKyBDSFVOS19TSVpFIC0gMSA+PSByLnowLFxuICAgICk7XG4gICAgaWYgKCFvdmVybGFwcykgb3V0LnB1c2goa2V5KTtcbiAgfVxuICByZXR1cm4gb3V0LnNvcnQoKTtcbn1cblxuLyoqIEFsbCBjaHVuayBrZXlzIGN1cnJlbnRseSBtYXRlcmlhbGlzZWQsIHNvcnRlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjaHVua0tleXMod29ybGQ6IFdvcmxkKTogc3RyaW5nW10ge1xuICByZXR1cm4gWy4uLndvcmxkLmNodW5rcy5rZXlzKCldLnNvcnQoKTtcbn1cblxuLyoqIEJvdW5kaW5nIHZveGVsIHJlZ2lvbiBjb3ZlcmluZyBldmVyeSBtYXRlcmlhbGlzZWQgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gd29ybGRDaHVua1JlZ2lvbih3b3JsZDogV29ybGQpOiBWb3hlbFJlZ2lvbiB7XG4gIGlmICh3b3JsZC5jaHVua3Muc2l6ZSA9PT0gMCkgdGhyb3cgbmV3IEVycm9yKCd3b3JsZCBoYXMgbm8gY2h1bmtzJyk7XG4gIGxldCBtaW5DeCA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSwgbWF4Q3ggPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gIGxldCBtaW5DeiA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSwgbWF4Q3ogPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gIGZvciAoY29uc3QgY2h1bmsgb2Ygd29ybGQuY2h1bmtzLnZhbHVlcygpKSB7XG4gICAgbWluQ3ggPSBNYXRoLm1pbihtaW5DeCwgY2h1bmsuY3gpOyBtYXhDeCA9IE1hdGgubWF4KG1heEN4LCBjaHVuay5jeCk7XG4gICAgbWluQ3ogPSBNYXRoLm1pbihtaW5DeiwgY2h1bmsuY3opOyBtYXhDeiA9IE1hdGgubWF4KG1heEN6LCBjaHVuay5jeik7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICB4MDogY2h1bmtPcmlnaW5YKG1pbkN4KSxcbiAgICB6MDogY2h1bmtPcmlnaW5aKG1pbkN6KSxcbiAgICB4MTogY2h1bmtPcmlnaW5YKG1heEN4KSArIENIVU5LX1NJWkUgLSAxLFxuICAgIHoxOiBjaHVua09yaWdpbloobWF4Q3opICsgQ0hVTktfU0laRSAtIDEsXG4gICAgeTA6IFlfTUlOLFxuICAgIHkxOiBZX01BWCAtIDEsXG4gIH07XG59XG4iLCAiLy8gTTAwMiBkZXRlcm1pbmlzdGljIGZpeHR1cmUgYW5kIGxpdmUtd29ybGQgbGF5b3V0LlxuLy9cbi8vIFRoZSBmaXh0dXJlIGlzIGEgYm91bmRlZCBzbGljZSBvZiB0aGUgcmVhbCAyMDQ4IG0gd29ybGQgKHNlZWQgMTMzNyksIG5vdCBhXG4vLyBzeW50aGV0aWMgaGVpZ2h0ZmllbGQuIEl0IGNvbnRhaW5zOlxuLy8gICAqIGEgcmVqZWN0ZWQgaG91c2Ugc2l0ZSBvbiBhIDcgbSByaXZlci1iYW5rIHNsb3BlO1xuLy8gICAqIGEgdmlhYmxlIGhvdXNlIHNoZWxmIDIwIG0gYXdheSB3aXRoIDIgbSByZWxpZWYgYW5kIG5vIGNsZWFyaW5nIG5lZWRlZDtcbi8vICAgKiBhIDMgbSBmYXJtIHNsb3BlIDI3IG0gZnJvbSB0aGUgaG91c2Ugd2l0aCBhIG5hdHVyYWwgYmxvc3NvbSB0cmVlIGFuZCBvcmUuXG4vL1xuLy8gVGhlIHNhbWUgY29vcmRpbmF0ZXMsIHF1ZXJpZXMgYW5kIHZhbGlkYXRvcnMgYXJlIHVzZWQgYnkgdGhlIGxpdmUtd29ybGRcbi8vIGFjY2VwdGFuY2UgdGVzdC4gVGhlIG9ubHkgZGlmZmVyZW5jZSBpcyBob3cgbWFueSBjaHVua3MgYXJlIG1hdGVyaWFsaXNlZC5cbmltcG9ydCB7XG4gIFdvcmxkLCBjcmVhdGVXb3JsZCwgZ2VuZXJhdGVXb3JsZCwgZ2VuZXJhdGVDaHVuaywgcGxhY2VBdXRob3JlZFNpdGVzLFxuICBZX01JTiwgWV9NQVgsIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7IFJlY3QsIFZveGVsUmVnaW9uIH0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7IGNodW5rS2V5cyB9IGZyb20gJy4vY2Fub25pY2FsJztcblxuZXhwb3J0IGNvbnN0IE0wMDJfU0VFRCA9IDEzMzc7XG5cbi8qKiBQaW5uZWQgcGF0aCBzaXRlIGlkIGZvciB0aGUgZG9vci10by1hcHByb2FjaCBjb3JyaWRvci4gKi9cbmV4cG9ydCBjb25zdCBNMDAyX1BBVEhfU0lURV9JRCA9ICdwYXRoLWhvdXNlLWZhcm0nO1xuXG4vKipcbiAqIFBpbm5lZCBzdGVwcGVkIHByb2ZpbGUgZm9yIHRoZSA5IG0gcGF0aCBmcm9tIHRoZSBob3VzZSBkb29yICh4ID0gLTUzKSB0byB0aGVcbiAqIGFwcHJvYWNoICh4ID0gLTQ1KS4gVGhlIHJpc2UgaXMgMiBtIG92ZXIgOCBtOyBldmVyeSBzdGVwIGlzIGF0IG1vc3QgMSBtLlxuICovXG5leHBvcnQgY29uc3QgTTAwMl9QQVRIX1BST0ZJTEUgPSBbMTEsIDExLCAxMSwgMTIsIDEyLCAxMiwgMTIsIDEzLCAxM10gYXMgY29uc3Q7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVycmFjZUJhbmRTcGVjIHtcbiAgejA6IG51bWJlcjtcbiAgejE6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG4vKiogUGlubmVkIGZhcm0gdGVycmFjZXMsIGhpZ2ggc2lkZSBmaXJzdC4gKi9cbmV4cG9ydCBjb25zdCBNMDAyX1RFUlJBQ0VfQkFORFM6IHJlYWRvbmx5IFRlcnJhY2VCYW5kU3BlY1tdID0gW1xuICB7IHowOiAtNDIsIHoxOiAtNDAsIHk6IDE2IH0sXG4gIHsgejA6IC0zOSwgejE6IC0zNywgeTogMTUgfSxcbiAgeyB6MDogLTM2LCB6MTogLTM1LCB5OiAxNCB9LFxuXTtcblxuZXhwb3J0IGludGVyZmFjZSBTaXRlU3BlYyB7XG4gIGlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBkb29yOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGFwcHJvYWNoOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRmFybVNwZWMge1xuICBpZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICB0ZXJyYWNlczogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE0wMDJMYXlvdXQge1xuICBzZWVkOiBudW1iZXI7XG4gIHJlamVjdGVkOiBTaXRlU3BlYztcbiAgaG91c2U6IFNpdGVTcGVjO1xuICBmYXJtOiBGYXJtU3BlYztcbiAgc2VhcmNoQXJlYTogUmVjdDtcbiAgd29ya1pvbmU6IFJlY3Q7XG4gIGZpeHR1cmVDaHVua3M6IHsgY3gwOiBudW1iZXI7IGN6MDogbnVtYmVyOyBjeDE6IG51bWJlcjsgY3oxOiBudW1iZXIgfTtcbiAgcHJvdGVjdGVkUmVnaW9uOiBWb3hlbFJlZ2lvbjtcbiAgLyoqIENvbXBsZXRlIGF1dGhvcml6ZWQgd29yayBlbnZlbG9wZSBmb3IgdGhlIGZpcnN0IHNsaWNlLiAqL1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbn1cblxuY29uc3QgRklYVFVSRV9DSFVOS1MgPSB7IGN4MDogMjgsIGN6MDogMjksIGN4MTogMzIsIGN6MTogMzIgfSBhcyBjb25zdDtcblxuZXhwb3J0IGNvbnN0IE0wMDJfTEFZT1VUOiBNMDAyTGF5b3V0ID0ge1xuICBzZWVkOiBNMDAyX1NFRUQsXG4gIHJlamVjdGVkOiB7XG4gICAgaWQ6ICdzaXRlLWEtcmVqZWN0ZWQnLFxuICAgIHJlY3Q6IHsgeDA6IC03NCwgejA6IC02NiwgeDE6IC02NywgejE6IC02MSB9LFxuICAgIC8vIEEgbmFpdmUgbG93LXNpZGUgZmxvb3I6IHRoZSB1cGhpbGwgY29ybmVyIHdvdWxkIG5lZWQgNSBtIG9mIGV4Y2F2YXRpb24uXG4gICAgZmxvb3JZOiAzLFxuICAgIGRvb3I6IHsgeDogLTY3LCB6OiAtNjMgfSxcbiAgICBhcHByb2FjaDogeyB4OiAtNjAsIHo6IC02MyB9LFxuICB9LFxuICBob3VzZToge1xuICAgIGlkOiAnc2l0ZS1iLWhvdXNlJyxcbiAgICByZWN0OiB7IHgwOiAtNjAsIHowOiAtNDYsIHgxOiAtNTMsIHoxOiAtNDEgfSxcbiAgICBmbG9vclk6IDExLFxuICAgIGRvb3I6IHsgeDogLTUzLCB6OiAtNDMgfSxcbiAgICBhcHByb2FjaDogeyB4OiAtNDUsIHo6IC00MyB9LFxuICB9LFxuICBmYXJtOiB7XG4gICAgaWQ6ICdmaWVsZC1jJyxcbiAgICByZWN0OiB7IHgwOiAtMzgsIHowOiAtNDIsIHgxOiAtMjcsIHoxOiAtMzUgfSxcbiAgICB0ZXJyYWNlczogMyxcbiAgfSxcbiAgc2VhcmNoQXJlYTogeyB4MDogLTc2LCB6MDogLTY4LCB4MTogLTQwLCB6MTogLTQwIH0sXG4gIHdvcmtab25lOiB7IHgwOiAtNzYsIHowOiAtNjgsIHgxOiAtMjMsIHoxOiAtMzEgfSxcbiAgZml4dHVyZUNodW5rczogRklYVFVSRV9DSFVOS1MsXG4gIHByb3RlY3RlZFJlZ2lvbjoge1xuICAgIHgwOiBjaHVua09yaWdpblgoRklYVFVSRV9DSFVOS1MuY3gwKSxcbiAgICB6MDogY2h1bmtPcmlnaW5aKEZJWFRVUkVfQ0hVTktTLmN6MCksXG4gICAgeDE6IGNodW5rT3JpZ2luWChGSVhUVVJFX0NIVU5LUy5jeDEpICsgMzEsXG4gICAgejE6IGNodW5rT3JpZ2luWihGSVhUVVJFX0NIVU5LUy5jejEpICsgMzEsXG4gICAgeTA6IFlfTUlOLFxuICAgIHkxOiBZX01BWCAtIDEsXG4gIH0sXG4gIGVudmVsb3BlOiBbXG4gICAgLy8gSG91c2UgZm9vdHByaW50IHBsdXMgYSAyIG0gcHJlcGFyYXRpb24gYnVmZmVyLlxuICAgIHsgeDA6IC02MiwgejA6IC00OCwgeDE6IC01MSwgejE6IC0zOSwgeTA6IDgsIHkxOiAxNiB9LFxuICAgIC8vIERvb3ItdG8tYXBwcm9hY2ggcGF0aCBjb3JyaWRvciBwbHVzIGEgMSBtIGJ1ZmZlci5cbiAgICB7IHgwOiAtNTQsIHowOiAtNDQsIHgxOiAtNDQsIHoxOiAtNDIsIHkwOiA5LCB5MTogMTUgfSxcbiAgICAvLyBGYXJtIGZvb3RwcmludCBwbHVzIGEgMiBtIHByZXBhcmF0aW9uIGJ1ZmZlci5cbiAgICB7IHgwOiAtNDAsIHowOiAtNDQsIHgxOiAtMjUsIHoxOiAtMzMsIHkwOiAxMCwgeTE6IDIwIH0sXG4gIF0sXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIE0wMDJXb3JsZCB7XG4gIHdvcmxkOiBXb3JsZDtcbiAgbGF5b3V0OiBNMDAyTGF5b3V0O1xuICAvKiogU29ydGVkIGNodW5rIGtleXMgbWF0ZXJpYWxpc2VkIGF0IGZpeHR1cmUgY3JlYXRpb24uICovXG4gIGNodW5rS2V5czogc3RyaW5nW107XG59XG5cbi8qKlxuICogU21hbGwgZGV0ZXJtaW5pc3RpYyBmaXh0dXJlOiB0aGUgMjAgY2h1bmtzIGNvdmVyaW5nIHRoZSB3b3JrIHpvbmUgYW5kIGl0c1xuICogcHJvdGVjdGVkIHN1cnJvdW5kaW5ncy4gRmFzdCBlbm91Z2ggZm9yIHRoZSBmdWxsIHRlc3Qgc3VpdGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNMDAyRml4dHVyZShzZWVkID0gTTAwMl9TRUVEKTogTTAwMldvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkKTtcbiAgY29uc3QgeyBjeDAsIGN6MCwgY3gxLCBjejEgfSA9IE0wMDJfTEFZT1VULmZpeHR1cmVDaHVua3M7XG4gIGZvciAobGV0IGN6ID0gY3owOyBjeiA8PSBjejE7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGN4MDsgY3ggPD0gY3gxOyBjeCsrKSBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICB9XG4gIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZCk7XG4gIHJldHVybiB7IHdvcmxkLCBsYXlvdXQ6IE0wMDJfTEFZT1VULCBjaHVua0tleXM6IGNodW5rS2V5cyh3b3JsZCkgfTtcbn1cblxuLyoqXG4gKiBMaXZlLXdvcmxkIGludGVncmF0aW9uIHRhcmdldDogdGhlIHNhbWUgc2VlZCBhbmQgc2l0ZXMgd2l0aCBhIDkgeCA5IGNodW5rXG4gKiBuZWlnaGJvdXJob29kICg4MSBjaHVua3MpIGFyb3VuZCB0aGUgZm91bmRlciB2YWxsZXkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNMDAyTGl2ZShzZWVkID0gTTAwMl9TRUVELCByYWRpdXMgPSA0KTogTTAwMldvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBnZW5lcmF0ZVdvcmxkKHNlZWQsIHJhZGl1cyk7XG4gIHJldHVybiB7IHdvcmxkLCBsYXlvdXQ6IE0wMDJfTEFZT1VULCBjaHVua0tleXM6IGNodW5rS2V5cyh3b3JsZCkgfTtcbn1cbiIsICIvLyBNMDAyIHN0YWdlIDcgc2NlbmFyaW8gd2lyaW5nOiB0aGUgcGlubmVkIGZpcnN0IHNsaWNlLCBydW4gdGhyb3VnaCB0aGUgc2FtZVxuLy8gcHVibGljIHNpbXVsYXRpb24gcGlwZWxpbmUgdXNlZCBieSB0aGUgcGxheWVyLCB0aGUgQUkgYW5kIHRoZSB0ZXN0cy5cbi8vXG4vLyBUaGUgc2NlbmFyaW8gaXMgZGVsaWJlcmF0ZWx5IHBsYWluIGRhdGEgaW4gLyBkYXRhIG91dC4gSXQgZG9lcyBub3QgdG91Y2ggdGhlXG4vLyByZW5kZXJlciwgYW5kIGV2ZXJ5IHRlcnJhaW4gZWRpdCBzdGlsbCBnb2VzIHRocm91Z2ggcHJlcGFyZVNpdGUgLT5cbi8vIExvY2FsQXV0aG9yaXplciAtPiBleGVjdXRlUHJlcGFyYXRpb24uIFN0cnVjdHVyZXMgc3RpbGwgZ28gdGhyb3VnaFxuLy8gYnVpbGRTdHJ1Y3R1cmUgLT4gTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyIC0+IGV4ZWN1dGVTdHJ1Y3R1cmUuXG5pbXBvcnQgeyBNQVQsIFJlc291cmNlVHlwZSB9IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHtcbiAgTTAwMldvcmxkLCBNMDAyX0xBWU9VVCwgTTAwMl9QQVRIX1BST0ZJTEUsIE0wMDJfUEFUSF9TSVRFX0lELFxuICBNMDAyX1RFUlJBQ0VfQkFORFMsXG59IGZyb20gJy4vbTAwMic7XG5pbXBvcnQgeyBSZWN0IH0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7IEhPVVNFX1JVTEVTLCBQQVRIX1JVTEVTLCBGQVJNX1JVTEVTIH0gZnJvbSAnLi9jb25zdHJ1Y3Rpb24nO1xuaW1wb3J0IHtcbiAgQ29sdW1uVGFyZ2V0LCBMb2NhbEF1dGhvcml6ZXIsIHByZXBhcmVTaXRlLCBQcmVwYXJhdGlvbkxlZGdlcixcbn0gZnJvbSAnLi9wcmVwYXJhdGlvbic7XG5pbXBvcnQge1xuICBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIsIGJ1aWxkU3RydWN0dXJlLCBTdHJ1Y3R1cmVMZWRnZXIsXG59IGZyb20gJy4vc3RydWN0dXJlcyc7XG5pbXBvcnQge1xuICBjYW5vbmljYWxFbnRpdHlIYXNoLCBjYW5vbmljYWxJbnZlbnRvcnlIYXNoLCBjYW5vbmljYWxSZWdpb25IYXNoLFxuICBjYW5vbmljYWxTdHJ1Y3R1cmVIYXNoLCBpbnZlbnRvcnlTbmFwc2hvdCxcbn0gZnJvbSAnLi9jYW5vbmljYWwnO1xuXG5leHBvcnQgY29uc3QgTTAwMl9TVEFSVEVSX0lOVkVOVE9SWTogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgbnVtYmVyPj4gPSB7XG4gIHdvb2Q6IDI0LFxuICBzdG9uZTogNDgsXG59O1xuXG4vKiogVGhlIDkgeCAzIG0gY29ycmlkb3IgZnJvbSB0aGUgaG91c2UgZG9vciB0byB0aGUgYXBwcm9hY2guICovXG5leHBvcnQgZnVuY3Rpb24gbTAwMlBhdGhSZWN0KCk6IFJlY3Qge1xuICBjb25zdCBkb29yID0gTTAwMl9MQVlPVVQuaG91c2UuZG9vcjtcbiAgY29uc3QgYXBwcm9hY2ggPSBNMDAyX0xBWU9VVC5ob3VzZS5hcHByb2FjaDtcbiAgcmV0dXJuIHtcbiAgICB4MDogZG9vci54LFxuICAgIHowOiBkb29yLnogLSAxLFxuICAgIHgxOiBhcHByb2FjaC54LFxuICAgIHoxOiBkb29yLnogKyAxLFxuICB9O1xufVxuXG4vKiogT25lIHRhcmdldCBwZXIgcGF0aCBjb2x1bW4sIHVzaW5nIHRoZSBwaW5uZWQgc3RlcHBlZCBwcm9maWxlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG0wMDJQYXRoVGFyZ2V0cygpOiBDb2x1bW5UYXJnZXRbXSB7XG4gIGNvbnN0IHJlY3QgPSBtMDAyUGF0aFJlY3QoKTtcbiAgY29uc3QgdGFyZ2V0czogQ29sdW1uVGFyZ2V0W10gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBNMDAyX1BBVEhfUFJPRklMRS5sZW5ndGg7IGkrKykge1xuICAgIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykge1xuICAgICAgdGFyZ2V0cy5wdXNoKHsgeDogcmVjdC54MCArIGksIHosIHk6IE0wMDJfUEFUSF9QUk9GSUxFW2ldIH0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGFyZ2V0cztcbn1cblxuLyoqIE9uZSB0YXJnZXQgcGVyIGZhcm0gY29sdW1uLCB1c2luZyB0aGUgcGlubmVkIHRlcnJhY2UgYmFuZHMuICovXG5leHBvcnQgZnVuY3Rpb24gbTAwMkZhcm1UYXJnZXRzKCk6IENvbHVtblRhcmdldFtdIHtcbiAgY29uc3QgcmVjdCA9IE0wMDJfTEFZT1VULmZhcm0ucmVjdDtcbiAgY29uc3QgdGFyZ2V0czogQ29sdW1uVGFyZ2V0W10gPSBbXTtcbiAgZm9yIChjb25zdCBiYW5kIG9mIE0wMDJfVEVSUkFDRV9CQU5EUykge1xuICAgIGZvciAobGV0IHogPSBiYW5kLnowOyB6IDw9IGJhbmQuejE7IHorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgICAgIHRhcmdldHMucHVzaCh7IHgsIHosIHk6IGJhbmQueSB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRhcmdldHM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMlNjZW5hcmlvT3B0aW9ucyB7XG4gIC8qKiBTdGFydGVyIHJlc291cmNlcyBiZWZvcmUgdGhlIHNsaWNlIHJ1bnMuIERlZmF1bHRzIHRvIHdvb2QgMjQgLyBzdG9uZSA0OC4gKi9cbiAgaW52ZW50b3J5PzogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+Pjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNMDAyU2NlbmFyaW9TaXRlIHtcbiAgcHJlcGFyYXRpb246IFByZXBhcmF0aW9uTGVkZ2VyIHwgbnVsbDtcbiAgc3RydWN0dXJlOiBTdHJ1Y3R1cmVMZWRnZXIgfCBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE0wMDJTY2VuYXJpb1Jlc3VsdCB7XG4gIG9rOiBib29sZWFuO1xuICBlcnJvcnM6IHN0cmluZ1tdO1xuICBob3VzZTogTTAwMlNjZW5hcmlvU2l0ZTtcbiAgcGF0aDogTTAwMlNjZW5hcmlvU2l0ZTtcbiAgZmFybTogTTAwMlNjZW5hcmlvU2l0ZTtcbiAgaW52ZW50b3J5QmVmb3JlOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBpbnZlbnRvcnlBZnRlcjogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgaGFzaGVzOiB7XG4gICAgdm94ZWxzOiBzdHJpbmc7XG4gICAgc3RydWN0dXJlczogc3RyaW5nO1xuICAgIGludmVudG9yeTogc3RyaW5nO1xuICAgIGVudGl0aWVzOiBzdHJpbmc7XG4gIH07XG59XG5cbmZ1bmN0aW9uIGVtcHR5U2l0ZSgpOiBNMDAyU2NlbmFyaW9TaXRlIHtcbiAgcmV0dXJuIHsgcHJlcGFyYXRpb246IG51bGwsIHN0cnVjdHVyZTogbnVsbCB9O1xufVxuXG5mdW5jdGlvbiBkZXNjcmliZUZhaWx1cmUocmVzdWx0OiB7IGNvZGU6IHN0cmluZzsgcmVhc29uczogc3RyaW5nW10gfSk6IHN0cmluZyB7XG4gIHJldHVybiBgJHtyZXN1bHQuY29kZX06ICR7cmVzdWx0LnJlYXNvbnMuam9pbignOyAnKX1gO1xufVxuXG4vKipcbiAqIFJ1biBob3VzZSwgcGF0aCBhbmQgdGVycmFjZWQgZmFybSBpbiB0aGVpciBwaW5uZWQgb3JkZXIuIEEgZmFpbGVkIHN0ZXAgaXNcbiAqIHJlY29yZGVkIGFuZCBsYXRlciBpbmRlcGVuZGVudCBzdGVwcyBzdGlsbCBydW47IGEgc3RydWN0dXJlIGlzIG5ldmVyIGJ1aWx0XG4gKiB1bmxlc3MgaXRzIG93biB0ZXJyYWluIHByZXBhcmF0aW9uIHN1Y2NlZWRlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJ1bk0wMDJTY2VuYXJpbyhcbiAgbTAwMjogTTAwMldvcmxkLCBvcHRpb25zOiBNMDAyU2NlbmFyaW9PcHRpb25zID0ge30sXG4pOiBNMDAyU2NlbmFyaW9SZXN1bHQge1xuICBjb25zdCB7IHdvcmxkLCBsYXlvdXQgfSA9IG0wMDI7XG4gIGNvbnN0IHN0YXJ0ZXIgPSBvcHRpb25zLmludmVudG9yeSA/PyBNMDAyX1NUQVJURVJfSU5WRU5UT1JZO1xuICB3b3JsZC5pbnZlbnRvcnkgPSB7fTtcbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMoc3RhcnRlcikpIHtcbiAgICBpZiAoKGFtb3VudCA/PyAwKSA+IDApIHdvcmxkLmludmVudG9yeVtyZXNvdXJjZV0gPSBhbW91bnQgYXMgbnVtYmVyO1xuICB9XG5cbiAgY29uc3QgcHJlcEF1dGhvcml6ZXIgPSBuZXcgTG9jYWxBdXRob3JpemVyKHsgZW52ZWxvcGU6IGxheW91dC5lbnZlbG9wZSB9KTtcbiAgY29uc3Qgc3RydWN0dXJlQXV0aG9yaXplciA9IG5ldyBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIoeyBlbnZlbG9wZTogbGF5b3V0LmVudmVsb3BlIH0pO1xuICBjb25zdCBpbnZlbnRvcnlCZWZvcmUgPSBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCk7XG4gIGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgaG91c2UgPSBlbXB0eVNpdGUoKTtcbiAgY29uc3QgcGF0aCA9IGVtcHR5U2l0ZSgpO1xuICBjb25zdCBmYXJtID0gZW1wdHlTaXRlKCk7XG5cbiAgY29uc3QgaG91c2VQcmVwID0gcHJlcGFyZVNpdGUod29ybGQsIHByZXBBdXRob3JpemVyLCB7XG4gICAgc2l0ZUlkOiBsYXlvdXQuaG91c2UuaWQsXG4gICAgcmVjdDogbGF5b3V0LmhvdXNlLnJlY3QsXG4gICAgZmxvb3JZOiBsYXlvdXQuaG91c2UuZmxvb3JZLFxuICAgIHJ1bGVzOiBIT1VTRV9SVUxFUyxcbiAgfSk7XG4gIGlmICghaG91c2VQcmVwLm9rKSB7XG4gICAgZXJyb3JzLnB1c2goYGhvdXNlIHByZXBhcmF0aW9uOiAke2Rlc2NyaWJlRmFpbHVyZShob3VzZVByZXApfWApO1xuICB9IGVsc2Uge1xuICAgIGhvdXNlLnByZXBhcmF0aW9uID0gaG91c2VQcmVwLmxlZGdlcjtcbiAgICBjb25zdCBob3VzZUJ1aWxkID0gYnVpbGRTdHJ1Y3R1cmUod29ybGQsIHN0cnVjdHVyZUF1dGhvcml6ZXIsIHtcbiAgICAgIHNpdGVJZDogbGF5b3V0LmhvdXNlLmlkLFxuICAgICAga2luZDogJ2hvdXNlJyxcbiAgICAgIHJlY3Q6IGxheW91dC5ob3VzZS5yZWN0LFxuICAgICAgZmxvb3JZOiBsYXlvdXQuaG91c2UuZmxvb3JZLFxuICAgICAgZG9vcjogbGF5b3V0LmhvdXNlLmRvb3IsXG4gICAgfSk7XG4gICAgaWYgKCFob3VzZUJ1aWxkLm9rKSB7XG4gICAgICBlcnJvcnMucHVzaChgaG91c2Ugc3RydWN0dXJlOiAke2Rlc2NyaWJlRmFpbHVyZShob3VzZUJ1aWxkKX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaG91c2Uuc3RydWN0dXJlID0gaG91c2VCdWlsZC5sZWRnZXI7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgcGF0aFJlY3QgPSBtMDAyUGF0aFJlY3QoKTtcbiAgY29uc3QgcGF0aFByZXAgPSBwcmVwYXJlU2l0ZSh3b3JsZCwgcHJlcEF1dGhvcml6ZXIsIHtcbiAgICBzaXRlSWQ6IE0wMDJfUEFUSF9TSVRFX0lELFxuICAgIHJlY3Q6IHBhdGhSZWN0LFxuICAgIGZsb29yWTogMTIsXG4gICAgcnVsZXM6IFBBVEhfUlVMRVMsXG4gIH0sIHtcbiAgICB0YXJnZXRzOiBtMDAyUGF0aFRhcmdldHMoKSxcbiAgICBzdXJmYWNlTWF0ZXJpYWw6IE1BVC5HUkFWRUwsXG4gICAgZW52ZWxvcGU6IFtsYXlvdXQuZW52ZWxvcGVbMV1dLFxuICB9KTtcbiAgaWYgKCFwYXRoUHJlcC5vaykge1xuICAgIGVycm9ycy5wdXNoKGBwYXRoIHByZXBhcmF0aW9uOiAke2Rlc2NyaWJlRmFpbHVyZShwYXRoUHJlcCl9YCk7XG4gIH0gZWxzZSB7XG4gICAgcGF0aC5wcmVwYXJhdGlvbiA9IHBhdGhQcmVwLmxlZGdlcjtcbiAgICBjb25zdCBwYXRoQnVpbGQgPSBidWlsZFN0cnVjdHVyZSh3b3JsZCwgc3RydWN0dXJlQXV0aG9yaXplciwge1xuICAgICAgc2l0ZUlkOiBNMDAyX1BBVEhfU0lURV9JRCxcbiAgICAgIGtpbmQ6ICdwYXRoJyxcbiAgICAgIHJlY3Q6IHBhdGhSZWN0LFxuICAgICAgZmxvb3JZOiAxMixcbiAgICB9KTtcbiAgICBpZiAoIXBhdGhCdWlsZC5vaykge1xuICAgICAgZXJyb3JzLnB1c2goYHBhdGggc3RydWN0dXJlOiAke2Rlc2NyaWJlRmFpbHVyZShwYXRoQnVpbGQpfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBwYXRoLnN0cnVjdHVyZSA9IHBhdGhCdWlsZC5sZWRnZXI7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZmFybVByZXAgPSBwcmVwYXJlU2l0ZSh3b3JsZCwgcHJlcEF1dGhvcml6ZXIsIHtcbiAgICBzaXRlSWQ6IGxheW91dC5mYXJtLmlkLFxuICAgIHJlY3Q6IGxheW91dC5mYXJtLnJlY3QsXG4gICAgZmxvb3JZOiAxNSxcbiAgICBydWxlczogRkFSTV9SVUxFUyxcbiAgfSwge1xuICAgIHRhcmdldHM6IG0wMDJGYXJtVGFyZ2V0cygpLFxuICAgIHN1cmZhY2VNYXRlcmlhbDogTUFULlNPSUwsXG4gICAgZW52ZWxvcGU6IFtsYXlvdXQuZW52ZWxvcGVbMl1dLFxuICB9KTtcbiAgaWYgKCFmYXJtUHJlcC5vaykge1xuICAgIGVycm9ycy5wdXNoKGBmYXJtIHByZXBhcmF0aW9uOiAke2Rlc2NyaWJlRmFpbHVyZShmYXJtUHJlcCl9YCk7XG4gIH0gZWxzZSB7XG4gICAgZmFybS5wcmVwYXJhdGlvbiA9IGZhcm1QcmVwLmxlZGdlcjtcbiAgICBjb25zdCBmYXJtQnVpbGQgPSBidWlsZFN0cnVjdHVyZSh3b3JsZCwgc3RydWN0dXJlQXV0aG9yaXplciwge1xuICAgICAgc2l0ZUlkOiBsYXlvdXQuZmFybS5pZCxcbiAgICAgIGtpbmQ6ICd0ZXJyYWNlJyxcbiAgICAgIHJlY3Q6IGxheW91dC5mYXJtLnJlY3QsXG4gICAgICBmbG9vclk6IDE1LFxuICAgICAgdGVycmFjZXM6IGxheW91dC5mYXJtLnRlcnJhY2VzLFxuICAgIH0pO1xuICAgIGlmICghZmFybUJ1aWxkLm9rKSB7XG4gICAgICBlcnJvcnMucHVzaChgZmFybSBzdHJ1Y3R1cmU6ICR7ZGVzY3JpYmVGYWlsdXJlKGZhcm1CdWlsZCl9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZhcm0uc3RydWN0dXJlID0gZmFybUJ1aWxkLmxlZGdlcjtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG9rOiBlcnJvcnMubGVuZ3RoID09PSAwLFxuICAgIGVycm9ycyxcbiAgICBob3VzZSxcbiAgICBwYXRoLFxuICAgIGZhcm0sXG4gICAgaW52ZW50b3J5QmVmb3JlLFxuICAgIGludmVudG9yeUFmdGVyOiBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCksXG4gICAgaGFzaGVzOiB7XG4gICAgICB2b3hlbHM6IGNhbm9uaWNhbFJlZ2lvbkhhc2god29ybGQsIGxheW91dC5wcm90ZWN0ZWRSZWdpb24pLmhhc2gsXG4gICAgICBzdHJ1Y3R1cmVzOiBjYW5vbmljYWxTdHJ1Y3R1cmVIYXNoKHdvcmxkKSxcbiAgICAgIGludmVudG9yeTogY2Fub25pY2FsSW52ZW50b3J5SGFzaCh3b3JsZCksXG4gICAgICBlbnRpdGllczogY2Fub25pY2FsRW50aXR5SGFzaCh3b3JsZCwgbGF5b3V0LnByb3RlY3RlZFJlZ2lvbiksXG4gICAgfSxcbiAgfTtcbn1cblxuLyoqIFRvdGFsIHJlc291cmNlcyBwYWlkIHRvIHN0cnVjdHVyZXMgaW4gYSBzY2VuYXJpbyByZXN1bHQuICovXG5leHBvcnQgZnVuY3Rpb24gbTAwMlN0cnVjdHVyZUNvc3RzKHJlc3VsdDogTTAwMlNjZW5hcmlvUmVzdWx0KTogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiB7XG4gIGNvbnN0IHRvdGFsOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+ID0ge307XG4gIGZvciAoY29uc3Qgc2l0ZSBvZiBbcmVzdWx0LmhvdXNlLCByZXN1bHQucGF0aCwgcmVzdWx0LmZhcm1dKSB7XG4gICAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMoc2l0ZS5zdHJ1Y3R1cmU/LmNvc3RQYWlkID8/IHt9KSkge1xuICAgICAgdG90YWxbcmVzb3VyY2UgYXMgUmVzb3VyY2VUeXBlXSA9ICh0b3RhbFtyZXNvdXJjZSBhcyBSZXNvdXJjZVR5cGVdID8/IDApICsgKGFtb3VudCA/PyAwKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRvdGFsO1xufVxuIiwgIi8vIFZlcnNpb25lZCwgSlNPTi1zYWZlIHNuYXBzaG90cyBvZiBjb21wbGV0ZSBhdXRob3JpdGF0aXZlIE0wMDIgc3RhdGUuXG4vLyBDaHVuayBieXRlcywgaGVpZ2h0L21hdGVyaWFsIGNhY2hlcywgcmVuZGVyZXIgZGF0YSBhbmQgdGltaW5nIGNvdW50ZXJzIGFyZVxuLy8gcmVnZW5lcmF0ZWQgZnJvbSB0aGUgbWFuaWZlc3QgYW5kIGR1cmFibGUgZWRpdHM7IHRoZXkgYXJlIG5vdCBhIHNlY29uZCBzYXZlLlxuaW1wb3J0IHtcbiAgQ0hVTktfU0laRSwgQ0hVTktfVk9MVU1FLCBDSFVOS1NfUEVSX1NJREUsIEVudGl0eSwgRW50aXR5S2luZCxcbiAgR0VORVJBVE9SX1ZFUlNJT04sIEhBTEYsIE1hdElkLCBSZXNvdXJjZVR5cGUsIFdvcmxkLCBXb3JsZE1hbmlmZXN0LFxuICBjcmVhdGVXb3JsZCwgcGxhY2VBdXRob3JlZFNpdGVzLCB3b3JsZE1hbmlmZXN0LCBlbnN1cmVDaHVuaywgaXNSZXRpcmVkU3RvbmVLaW5kLFxuICBtYXJrRWRpdHNDaGFuZ2VkLCBpc1N1cHBvcnRlZEdlbmVyYXRvciwgTUFYX01BVF9JRCxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBGT1VOREVSX0RFU0lHTl9WRVJTSU9OLCBTdHJ1Y3R1cmUgfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHtcbiAgZW5hYmxlU3RvbmVSZXBsYXksIGZpbmlzaFN0b25lUmVwbGF5LCBpc0hpc3RvcmljYWxTdG9uZUhhc2gsIGlzU3RvbmVSZXBsYXksXG59IGZyb20gJy4vc3RvbmUtY29tcGF0JztcbmltcG9ydCB7XG4gIENBUlJJRURfQ0FQQUNJVFksIENST1BfR1JPV1RIX1RJQ0tTLCBDUk9QX1BMT1RfSURTLCBGT1VOREVSX1NUT0NLUElMRSxcbiAgRk9VTkRFUl9TVE9DS1BJTEVfSUQsIExJRkVfUkVTT1VSQ0VTLCBNQVhfUFJPRFVDVElPTl9KT0JTLCBNQVhfVElDS1NfUEVSX0NPTU1BTkQsXG4gIFJFQ0lQRVMsIFNUT0NLUElMRV9DQVBBQ0lUWSwgY3JlYXRlTGlmZVN0YXRlLFxufSBmcm9tICcuL2Vjb25vbXknO1xuXG5leHBvcnQgY29uc3QgU05BUFNIT1RfU0NIRU1BID0gMSBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBERVNJR05fU05BUFNIT1RfU0NIRU1BID0gMiBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSA9IDMgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgTUFYX1NOQVBTSE9UX0pTT05fQllURVMgPSAyNV8wMDBfMDAwO1xuZXhwb3J0IGNvbnN0IE1BWF9TTkFQU0hPVF9FRElUUyA9IDFfMDAwXzAwMDtcbmV4cG9ydCBjb25zdCBNQVhfU05BUFNIT1RfRU5USVRJRVMgPSA1MDBfMDAwO1xuXG5pbnRlcmZhY2UgQmFzZVdvcmxkU25hcHNob3Qge1xuICBzY2hlbWE6IHR5cGVvZiBTTkFQU0hPVF9TQ0hFTUEgfCB0eXBlb2YgREVTSUdOX1NOQVBTSE9UX1NDSEVNQSB8IHR5cGVvZiBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQTtcbiAgbWFuaWZlc3Q6IFdvcmxkTWFuaWZlc3Q7XG4gIHJldmlzaW9uOiBudW1iZXI7XG4gIGVkaXRzOiBBcnJheTx7IGNodW5rOiBzdHJpbmc7IGNlbGxzOiBBcnJheTx7IGk6IG51bWJlcjsgbTogbnVtYmVyIH0+IH0+O1xuICBlbnRpdGllczogRW50aXR5W107XG4gIC8qKiBDaHVua3Mgd2l0aCBkdXJhYmxlIGdlbmVyYXRlZC1lbnRpdHkgY2hhbmdlczsgcHVyZSBxdWVyaWVzIGFyZSBleGNsdWRlZC4gKi9cbiAgZW50aXR5Q2h1bmtzOiBzdHJpbmdbXTtcbiAgZW50aXR5UmVtb3ZhbHM6IHN0cmluZ1tdO1xuICBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIHN0cnVjdHVyZXM6IFN0cnVjdHVyZVtdO1xuICBhdXRob3JlZFBsYWNlZDogYm9vbGVhbjtcbiAgLyoqIE5leHQgYWNjZXB0ZWQgam91cm5hbCBzZXF1ZW5jZSBhdCB0aGlzIHNuYXBzaG90IGJvdW5kYXJ5LiAqL1xuICBuZXh0U2VxdWVuY2U6IG51bWJlcjtcbn1cbmV4cG9ydCB0eXBlIFdvcmxkU25hcHNob3QgPSBCYXNlV29ybGRTbmFwc2hvdCAmICh7XG4gIHNjaGVtYTogdHlwZW9mIFNOQVBTSE9UX1NDSEVNQSB8IHR5cGVvZiBERVNJR05fU05BUFNIT1RfU0NIRU1BO1xufSB8IHtcbiAgc2NoZW1hOiB0eXBlb2YgQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUE7XG4gIHRpY2s6IG51bWJlcjtcbiAgc3RvY2twaWxlczogQXJyYXk8e1xuICAgIGlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7IHg6IG51bWJlcjsgejogbnVtYmVyO1xuICAgIGNhcGFjaXR5OiB0eXBlb2YgU1RPQ0tQSUxFX0NBUEFDSVRZOyBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIH0+O1xuICBqb2JzOiBBcnJheTx7XG4gICAgaWQ6IHN0cmluZzsgc3RvY2twaWxlSWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgICByZWNpcGU6ICdzZWVkJyB8ICdyYXRpb25zJzsgcmVtYWluaW5nVGlja3M6IG51bWJlcjtcbiAgfT47XG4gIGNyb3BzOiBBcnJheTx7IGlkOiBzdHJpbmc7IHBsYW50ZWRUaWNrOiBudW1iZXI7IGdyb3d0aFRpY2tzOiB0eXBlb2YgQ1JPUF9HUk9XVEhfVElDS1MgfT47XG59KTtcbnR5cGUgTGlmZVNuYXBzaG90ID0gRXh0cmFjdDxXb3JsZFNuYXBzaG90LCB7IHNjaGVtYTogdHlwZW9mIENVUlJFTlRfU05BUFNIT1RfU0NIRU1BIH0+O1xuXG5mdW5jdGlvbiBjbG9uZUVudGl0eShlOiBFbnRpdHkpOiBFbnRpdHkge1xuICByZXR1cm4ge1xuICAgIGlkOiBlLmlkLCBraW5kOiBlLmtpbmQsIGNodW5rOiBlLmNodW5rLCB4OiBlLngsIHk6IGUueSwgejogZS56LFxuICAgIHJvdDogZS5yb3QsIHNjYWxlOiBlLnNjYWxlLCB2YXJpYW50OiBlLnZhcmlhbnQsIHJlc291cmNlOiBlLnJlc291cmNlLFxuICAgIHJlbWFpbmluZzogZS5yZW1haW5pbmcsIHlpZWxkUGVySGFydmVzdDogZS55aWVsZFBlckhhcnZlc3QsIGhhcnZlc3RlZDogZS5oYXJ2ZXN0ZWQsXG4gICAgLi4uKGUuaGFydmVzdGVkT25jZSA9PT0gdW5kZWZpbmVkID8ge30gOiB7IGhhcnZlc3RlZE9uY2U6IGUuaGFydmVzdGVkT25jZSB9KSxcbiAgICBwcm92aXNpb25hbDogZS5wcm92aXNpb25hbCwgYXV0aG9yZWQ6IGUuYXV0aG9yZWQsXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNsb25lU3RydWN0dXJlKHM6IFN0cnVjdHVyZSk6IFN0cnVjdHVyZSB7XG4gIHJldHVybiB7XG4gICAgLi4ucyxcbiAgICBtb2R1bGVzOiBzLm1vZHVsZXMubWFwKChtKSA9PiAoeyAuLi5tIH0pKSxcbiAgICBjb3N0OiBPYmplY3QuZnJvbUVudHJpZXMoT2JqZWN0LmVudHJpZXMocy5jb3N0KS5maWx0ZXIoKFssIGFtb3VudF0pID0+IChhbW91bnQgPz8gMCkgPiAwKVxuICAgICAgLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpKSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVdvcmxkU25hcHNob3QoXG4gIHdvcmxkOiBXb3JsZCwgbmV4dFNlcXVlbmNlID0gMCxcbiAgc2NoZW1hOiBXb3JsZFNuYXBzaG90WydzY2hlbWEnXSA9IHdvcmxkLmxpZmUgPyBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQVxuICAgIDogWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldLnNvbWUoKHMpID0+IHMuZGVzaWduVmVyc2lvbiA9PT0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTilcbiAgICAgID8gREVTSUdOX1NOQVBTSE9UX1NDSEVNQSA6IFNOQVBTSE9UX1NDSEVNQSxcbik6IFdvcmxkU25hcHNob3Qge1xuICBpZiAoc2NoZW1hICE9PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSAmJiAod29ybGQubGlmZSB8fCBbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV0uc29tZShcbiAgICAocykgPT4gc2NoZW1hID09PSBTTkFQU0hPVF9TQ0hFTUEgJiYgcy5kZXNpZ25WZXJzaW9uICE9PSB1bmRlZmluZWQsXG4gICkpKSB0aHJvdyBuZXcgRXJyb3IoJ2xlZ2FjeSBzbmFwc2hvdHMgY2Fubm90IGNvbnRhaW4gbmV3ZXIgYXV0aG9yaXRhdGl2ZSBzdGF0ZScpO1xuICBjb25zdCBiYXNlOiBCYXNlV29ybGRTbmFwc2hvdCA9IHtcbiAgICBzY2hlbWEsXG4gICAgbWFuaWZlc3Q6IHdvcmxkTWFuaWZlc3Qod29ybGQpLFxuICAgIHJldmlzaW9uOiB3b3JsZC5yZXZpc2lvbixcbiAgICBlZGl0czogWy4uLndvcmxkLmVkaXRzLmVudHJpZXMoKV0uc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSkubWFwKFxuICAgICAgKFtjaHVuaywgY2VsbHNdKSA9PiAoe1xuICAgICAgICBjaHVuayxcbiAgICAgICAgY2VsbHM6IFsuLi5jZWxscy5lbnRyaWVzKCldLnNvcnQoKFthXSwgW2JdKSA9PiBhIC0gYikubWFwKChbaSwgbV0pID0+ICh7IGksIG0gfSkpLFxuICAgICAgfSksXG4gICAgKSxcbiAgICBlbnRpdGllczogWy4uLndvcmxkLmVudGl0aWVzLnZhbHVlcygpXS5maWx0ZXIoKGUpID0+IChpc0hpc3RvcmljYWxTdG9uZUhhc2god29ybGQpIHx8ICFpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSlcbiAgICAgICYmIChlLmF1dGhvcmVkIHx8IHdvcmxkLmVudGl0eUNoYW5nZXMuaGFzKGUuY2h1bmspKSlcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLm1hcChjbG9uZUVudGl0eSksXG4gICAgZW50aXR5Q2h1bmtzOiBbLi4ud29ybGQuZW50aXR5Q2hhbmdlc10uc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSxcbiAgICBlbnRpdHlSZW1vdmFsczogWy4uLndvcmxkLmVudGl0eVJlbW92YWxzXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpLFxuICAgIGludmVudG9yeTogT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5lbnRyaWVzKHdvcmxkLmludmVudG9yeSkuZmlsdGVyKChbLCBhbW91bnRdKSA9PiBhbW91bnQgPiAwKVxuICAgICAgLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpKSxcbiAgICBzdHJ1Y3R1cmVzOiBbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKS5tYXAoY2xvbmVTdHJ1Y3R1cmUpLFxuICAgIGF1dGhvcmVkUGxhY2VkOiB3b3JsZC5hdXRob3JlZFBsYWNlZCxcbiAgICBuZXh0U2VxdWVuY2UsXG4gIH07XG4gIGlmIChzY2hlbWEgIT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BKSByZXR1cm4geyAuLi5iYXNlLCBzY2hlbWEgfSBhcyBXb3JsZFNuYXBzaG90O1xuICBpZiAoIXdvcmxkLmxpZmUpIHRocm93IG5ldyBFcnJvcignc2NoZW1hLTMgc25hcHNob3QgcmVxdWlyZXMgbGlmZSBzdGF0ZScpO1xuICByZXR1cm4ge1xuICAgIC4uLmJhc2UsIHNjaGVtYSxcbiAgICB0aWNrOiB3b3JsZC5saWZlLnRpY2ssXG4gICAgc3RvY2twaWxlczogWy4uLndvcmxkLmxpZmUuc3RvY2twaWxlcy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKS5tYXAoKHMpID0+ICh7XG4gICAgICBpZDogcy5pZCwgeDogcy54LCB6OiBzLnosIGNhcGFjaXR5OiBzLmNhcGFjaXR5LFxuICAgICAgaW52ZW50b3J5OiBPYmplY3QuZnJvbUVudHJpZXMoT2JqZWN0LmVudHJpZXMocy5pbnZlbnRvcnkpLmZpbHRlcigoWywgYW1vdW50XSkgPT4gYW1vdW50ID4gMClcbiAgICAgICAgLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpKSxcbiAgICB9KSksXG4gICAgam9iczogWy4uLndvcmxkLmxpZmUuam9icy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKS5tYXAoKGopID0+ICh7IC4uLmogfSkpLFxuICAgIGNyb3BzOiBbLi4ud29ybGQubGlmZS5jcm9wcy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKS5tYXAoKGMpID0+ICh7IC4uLmMgfSkpLFxuICB9O1xufVxuXG4vKiogVHdvIGxhbmVzLCB3aXRoIGxlbmd0aCBpbmNsdWRlZDsgbm90IGEgY3J5cHRvZ3JhcGhpYyBpbnRlZ3JpdHkgc2lnbmF0dXJlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbEhhc2godGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGEgPSAweDgxMWM5ZGM1LCBiID0gMHg5ZTM3NzliOTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0ZXh0Lmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgYyA9IHRleHQuY2hhckNvZGVBdChpKTtcbiAgICBhID0gTWF0aC5pbXVsKGEgXiBjLCAweDAxMDAwMTkzKTtcbiAgICBiID0gTWF0aC5pbXVsKGIgXiAoYyArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICBiIF49IGIgPj4+IDEzO1xuICB9XG4gIHJldHVybiAoYSA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJykgKyAoYiA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxXb3JsZEhhc2goXG4gIHdvcmxkOiBXb3JsZCwgbmV4dFNlcXVlbmNlID0gMCwgc2NoZW1hOiBXb3JsZFNuYXBzaG90WydzY2hlbWEnXSA9IERFU0lHTl9TTkFQU0hPVF9TQ0hFTUEsXG4pOiBzdHJpbmcge1xuICByZXR1cm4gY2Fub25pY2FsSGFzaChKU09OLnN0cmluZ2lmeShjcmVhdGVXb3JsZFNuYXBzaG90KHdvcmxkLCBuZXh0U2VxdWVuY2UsIHNjaGVtYSkpKTtcbn1cblxuZnVuY3Rpb24gaXNPYmplY3QodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmICFBcnJheS5pc0FycmF5KHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gdWludCh2YWx1ZTogdW5rbm93biwgbWF4aW11bTogbnVtYmVyKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzU2FmZUludGVnZXIodmFsdWUpICYmIHZhbHVlID49IDAgJiYgdmFsdWUgPD0gbWF4aW11bTtcbn1cblxuZnVuY3Rpb24gZmluaXRlKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gdGV4dCh2YWx1ZTogdW5rbm93biwgbWF4aW11bSA9IDI1Nik6IHZhbHVlIGlzIHN0cmluZyB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIHZhbHVlLmxlbmd0aCA+IDAgJiYgdmFsdWUubGVuZ3RoIDw9IG1heGltdW07XG59XG5cbmZ1bmN0aW9uIHZhbGlkQ2h1bmsoa2V5OiB1bmtub3duKToga2V5IGlzIHN0cmluZyB7XG4gIGlmICh0eXBlb2Yga2V5ICE9PSAnc3RyaW5nJyB8fCAhL14tP1xcZCssLT9cXGQrJC8udGVzdChrZXkpKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gIHJldHVybiBOdW1iZXIuaXNJbnRlZ2VyKGN4KSAmJiBOdW1iZXIuaXNJbnRlZ2VyKGN6KVxuICAgICYmIGN4ID49IDAgJiYgY3ogPj0gMCAmJiBjeCA8IENIVU5LU19QRVJfU0lERSAmJiBjeiA8IENIVU5LU19QRVJfU0lERTtcbn1cblxuLyoqIEEgc3RyaWN0IGxlZ2FjeSBzbmFwc2hvdCBpcyBhbHJlYWR5IGNhbm9uaWNhbCBjcmVhdGVXb3JsZFNuYXBzaG90IG91dHB1dC5cbiAqIFZlcmlmeSBpdHMgcmVjb3JkZWQgYm91bmRhcnkgYmVmb3JlIGZpbHRlcmluZyB0aGUgdGhyZWUgcmV0aXJlZCBzdG9uZSBmb3Jtcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBsZWdhY3lTdG9uZUhhc2goc25hcHNob3Q6IFdvcmxkU25hcHNob3QpOiBzdHJpbmcge1xuICByZXR1cm4gY2Fub25pY2FsSGFzaChKU09OLnN0cmluZ2lmeShzbmFwc2hvdCkpO1xufVxuXG4vKiogTWlncmF0aW9uIG9ubHk6IG5vIGludmVudG9yeSwgc3RydWN0dXJlLCBsaWZlLCBlZGl0IG9yIGNvbW1hbmQgZGF0YSBjaGFuZ2VzLiAqL1xuLyoqIEBpbnRlcm5hbCBSZXRpcmUgb25seSBhZnRlciByZWNvbnN0cnVjdGluZyB0aGUgb2xkIHN0YXRlIGluIHJlcGxheSBtb2RlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1pZ3JhdGVTdG9uZVNuYXBzaG90KHNuYXBzaG90OiBXb3JsZFNuYXBzaG90KTogV29ybGRTbmFwc2hvdCB7XG4gIGNvbnN0IHJlbW92YWxzID0gbmV3IFNldChzbmFwc2hvdC5lbnRpdHlSZW1vdmFscyk7XG4gIGZvciAoY29uc3QgZW50aXR5IG9mIHNuYXBzaG90LmVudGl0aWVzKSB7XG4gICAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkgJiYgIWVudGl0eS5hdXRob3JlZCkgcmVtb3ZhbHMuYWRkKGVudGl0eS5pZCk7XG4gIH1cbiAgY29uc3QgZW50aXR5Q2h1bmtzID0gbmV3IFNldChzbmFwc2hvdC5lbnRpdHlDaHVua3MpO1xuICBmb3IgKGNvbnN0IGVudGl0eSBvZiBzbmFwc2hvdC5lbnRpdGllcykge1xuICAgIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSB7XG4gICAgICBlbnRpdHlDaHVua3MuYWRkKGVudGl0eS5jaHVuayk7XG4gICAgICBpZiAoIWVudGl0eS5hdXRob3JlZCkgcmVtb3ZhbHMuYWRkKGVudGl0eS5pZCk7XG4gICAgfVxuICB9XG4gIHJldHVybiB7XG4gICAgLi4uc25hcHNob3QsXG4gICAgZW50aXRpZXM6IHNuYXBzaG90LmVudGl0aWVzLmZpbHRlcigoZW50aXR5KSA9PiAhaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSksXG4gICAgZW50aXR5Q2h1bmtzOiBbLi4uZW50aXR5Q2h1bmtzXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpLFxuICAgIGVudGl0eVJlbW92YWxzOiBbLi4ucmVtb3ZhbHNdLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSksXG4gIH07XG59XG5jb25zdCBFTlRJVFlfS0lORFMgPSBuZXcgU2V0PEVudGl0eUtpbmQ+KFtcbiAgJ3N0eWxfdHJlZV9zcGlyZScsICdzdHlsX3RyZWVfdGFibGUnLCAnc3R5bF90cmVlX2NsdXN0ZXInLCAnc3R5bF90cmVlX2Jsb3Nzb20nLFxuICAnc3R5bF9zaHJ1YicsICdzdHlsX3JvY2tfc21hbGwnLCAnc3R5bF9yb2NrX21lZGl1bScsICdzdHlsX3JvY2tfbGFyZ2UnLFxuICAnc3R5bF9vcmUnLCAnc3R5bF9jYWlybicsICd3YXlzdG9uZScsICdtYXJrZXInLFxuXSk7XG5jb25zdCBSRVNPVVJDRVMgPSBuZXcgU2V0PFJlc291cmNlVHlwZT4oWyd3b29kJywgJ3N0b25lJywgJ29yZScsICdmaWJlciddKTtcbmNvbnN0IFJFQ09SRF9SRVNPVVJDRVMgPSBuZXcgU2V0PHN0cmluZz4oTElGRV9SRVNPVVJDRVMpO1xuY29uc3QgU1RSVUNUVVJFX0tJTkRTID0gbmV3IFNldChbJ2hvdXNlJywgJ3BhdGgnLCAndGVycmFjZSddKTtcbmNvbnN0IE1PRFVMRV9LSU5EUyA9IG5ldyBTZXQoW1xuICAnZmxvb3InLCAnd2FsbCcsICdwb3N0JywgJ2xpbnRlbCcsICdyb29mJywgJ3BhcmFwZXQnLCAnd2luZG93JywgJ2Rvb3InLFxuICAndGhyZXNob2xkJywgJ3BhdGgnLCAnY3VyYicsICdzb2lsX2JlZCcsICdyZXRhaW5pbmdfd2FsbCcsICdjcm9wX3JvdycsXG5dKTtcbmNvbnN0IE1PRFVMRV9UT05FUyA9IG5ldyBTZXQoWydzdG9uZScsICdzdG9uZV9iJywgJ29jaHJlJywgJ3RpbWJlcicsICdhY2NlbnQnLCAnc29pbCcsICdjcm9wJywgJ2dyYXZlbCddKTtcblxuZnVuY3Rpb24gdmFsaWRhdGVFbnRpdHkodmFsdWU6IHVua25vd24sIGlkczogU2V0PHN0cmluZz4pOiBFbnRpdHkge1xuICBpZiAoIWlzT2JqZWN0KHZhbHVlKSB8fCAhdGV4dCh2YWx1ZS5pZCkgfHwgaWRzLmhhcyh2YWx1ZS5pZClcbiAgICB8fCAhdGV4dCh2YWx1ZS5raW5kKSB8fCAhRU5USVRZX0tJTkRTLmhhcyh2YWx1ZS5raW5kIGFzIEVudGl0eUtpbmQpXG4gICAgfHwgIXZhbGlkQ2h1bmsodmFsdWUuY2h1bmspXG4gICAgfHwgIWZpbml0ZSh2YWx1ZS54KSB8fCAhZmluaXRlKHZhbHVlLnkpIHx8ICFmaW5pdGUodmFsdWUueilcbiAgICB8fCB2YWx1ZS54IDwgLUhBTEYgfHwgdmFsdWUueCA+PSBIQUxGIHx8IHZhbHVlLnogPCAtSEFMRiB8fCB2YWx1ZS56ID49IEhBTEZcbiAgICB8fCAhZmluaXRlKHZhbHVlLnJvdCkgfHwgIWZpbml0ZSh2YWx1ZS5zY2FsZSkgfHwgIXVpbnQodmFsdWUudmFyaWFudCwgMTAwMClcbiAgICB8fCB2YWx1ZS5yZXNvdXJjZSAhPT0gbnVsbCAmJiAhKHR5cGVvZiB2YWx1ZS5yZXNvdXJjZSA9PT0gJ3N0cmluZycgJiYgUkVTT1VSQ0VTLmhhcyh2YWx1ZS5yZXNvdXJjZSBhcyBSZXNvdXJjZVR5cGUpKVxuICAgIHx8ICF1aW50KHZhbHVlLnJlbWFpbmluZywgMV8wMDBfMDAwKSB8fCAhdWludCh2YWx1ZS55aWVsZFBlckhhcnZlc3QsIDFfMDAwXzAwMClcbiAgICB8fCB0eXBlb2YgdmFsdWUuaGFydmVzdGVkICE9PSAnYm9vbGVhbicgfHwgdHlwZW9mIHZhbHVlLnByb3Zpc2lvbmFsICE9PSAnYm9vbGVhbidcbiAgICB8fCB0eXBlb2YgdmFsdWUuYXV0aG9yZWQgIT09ICdib29sZWFuJ1xuICAgIHx8IHZhbHVlLmhhcnZlc3RlZE9uY2UgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgdmFsdWUuaGFydmVzdGVkT25jZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBjb250YWlucyBhbiBpbnZhbGlkIG9yIGR1cGxpY2F0ZSBlbnRpdHknKTtcbiAgfVxuICBpZHMuYWRkKHZhbHVlLmlkKTtcbiAgcmV0dXJuIHtcbiAgICBpZDogdmFsdWUuaWQsIGtpbmQ6IHZhbHVlLmtpbmQgYXMgRW50aXR5S2luZCwgY2h1bms6IHZhbHVlLmNodW5rLFxuICAgIHg6IHZhbHVlLngsIHk6IHZhbHVlLnksIHo6IHZhbHVlLnosIHJvdDogdmFsdWUucm90LCBzY2FsZTogdmFsdWUuc2NhbGUsXG4gICAgdmFyaWFudDogdmFsdWUudmFyaWFudCwgcmVzb3VyY2U6IHZhbHVlLnJlc291cmNlIGFzIFJlc291cmNlVHlwZSB8IG51bGwsXG4gICAgcmVtYWluaW5nOiB2YWx1ZS5yZW1haW5pbmcsIHlpZWxkUGVySGFydmVzdDogdmFsdWUueWllbGRQZXJIYXJ2ZXN0LFxuICAgIGhhcnZlc3RlZDogdmFsdWUuaGFydmVzdGVkLFxuICAgIC4uLih2YWx1ZS5oYXJ2ZXN0ZWRPbmNlID09PSB1bmRlZmluZWQgPyB7fSA6IHsgaGFydmVzdGVkT25jZTogdmFsdWUuaGFydmVzdGVkT25jZSB9KSxcbiAgICBwcm92aXNpb25hbDogdmFsdWUucHJvdmlzaW9uYWwsIGF1dGhvcmVkOiB2YWx1ZS5hdXRob3JlZCxcbiAgfTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVJbnZlbnRvcnkodmFsdWU6IHVua25vd24pOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgaWYgKCFpc09iamVjdCh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaW52ZW50b3J5IGlzIGludmFsaWQnKTtcbiAgY29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHZhbHVlKS5zb3J0KCkpIHtcbiAgICBpZiAoIVJFQ09SRF9SRVNPVVJDRVMuaGFzKGtleSkgfHwgIXVpbnQodmFsdWVba2V5XSwgMV8wMDBfMDAwXzAwMCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgc25hcHNob3QgaGFzIGludmFsaWQgaW52ZW50b3J5IHJlc291cmNlICR7a2V5fWApO1xuICAgIH1cbiAgICBpZiAodmFsdWVba2V5XSA+IDApIG91dFtrZXldID0gdmFsdWVba2V5XTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBzdG9ja1RvdGFsKHZhbHVlOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KTogbnVtYmVyIHtcbiAgcmV0dXJuIE9iamVjdC52YWx1ZXModmFsdWUpLnJlZHVjZSgoc3VtLCBhbW91bnQpID0+IHN1bSArIGFtb3VudCwgMCk7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlTGlmZUZpZWxkcyh2YWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBQaWNrPExpZmVTbmFwc2hvdCwgJ3RpY2snIHwgJ3N0b2NrcGlsZXMnIHwgJ2pvYnMnIHwgJ2Nyb3BzJz4ge1xuICBpZiAoIXVpbnQodmFsdWUudGljaywgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuc3RvY2twaWxlcykgfHwgdmFsdWUuc3RvY2twaWxlcy5sZW5ndGggIT09IDFcbiAgICB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5qb2JzKSB8fCB2YWx1ZS5qb2JzLmxlbmd0aCA+IE1BWF9QUk9EVUNUSU9OX0pPQlNcbiAgICB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5jcm9wcykgfHwgdmFsdWUuY3JvcHMubGVuZ3RoID4gQ1JPUF9QTE9UX0lEUy5sZW5ndGgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhcyBpbnZhbGlkIGxpZmUtbG9vcCBmaWVsZHMnKTtcbiAgfVxuICBjb25zdCBzdG9ja3BpbGVzOiBOb25OdWxsYWJsZTxMaWZlU25hcHNob3RbJ3N0b2NrcGlsZXMnXT4gPSBbXTtcbiAgZm9yIChjb25zdCByYXcgb2YgdmFsdWUuc3RvY2twaWxlcykge1xuICAgIGlmICghaXNPYmplY3QocmF3KSB8fCByYXcuaWQgIT09IEZPVU5ERVJfU1RPQ0tQSUxFX0lEIHx8IHJhdy54ICE9PSBGT1VOREVSX1NUT0NLUElMRS54XG4gICAgICB8fCByYXcueiAhPT0gRk9VTkRFUl9TVE9DS1BJTEUueiB8fCByYXcuY2FwYWNpdHkgIT09IEZPVU5ERVJfU1RPQ0tQSUxFLmNhcGFjaXR5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhcyBhbiB1bnN1cHBvcnRlZCBzdG9ja3BpbGUnKTtcbiAgICB9XG4gICAgY29uc3QgaW52ZW50b3J5ID0gdmFsaWRhdGVJbnZlbnRvcnkocmF3LmludmVudG9yeSk7XG4gICAgaWYgKHN0b2NrVG90YWwoaW52ZW50b3J5KSA+IFNUT0NLUElMRV9DQVBBQ0lUWSkgdGhyb3cgbmV3IEVycm9yKCdzdG9ja3BpbGUgZXhjZWVkcyBjYXBhY2l0eScpO1xuICAgIHN0b2NrcGlsZXMucHVzaCh7IGlkOiBGT1VOREVSX1NUT0NLUElMRV9JRCwgeDogcmF3LngsIHo6IHJhdy56LFxuICAgICAgY2FwYWNpdHk6IFNUT0NLUElMRV9DQVBBQ0lUWSwgaW52ZW50b3J5IH0pO1xuICB9XG4gIGxldCByZXNlcnZlZCA9IHN0b2NrVG90YWwoc3RvY2twaWxlc1swXS5pbnZlbnRvcnkpO1xuICBjb25zdCBpZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3Qgam9iczogTm9uTnVsbGFibGU8TGlmZVNuYXBzaG90Wydqb2JzJ10+ID0gW107XG4gIGZvciAoY29uc3QgcmF3IG9mIHZhbHVlLmpvYnMpIHtcbiAgICBpZiAoIWlzT2JqZWN0KHJhdykgfHwgIXRleHQocmF3LmlkLCAxMjgpIHx8ICEvXltBLVphLXowLTldW0EtWmEtejAtOS5fOiUtXSokLy50ZXN0KHJhdy5pZClcbiAgICAgIHx8IGlkcy5oYXMocmF3LmlkKSB8fCByYXcuc3RvY2twaWxlSWQgIT09IEZPVU5ERVJfU1RPQ0tQSUxFX0lEXG4gICAgICB8fCByYXcucmVjaXBlICE9PSAnc2VlZCcgJiYgcmF3LnJlY2lwZSAhPT0gJ3JhdGlvbnMnXG4gICAgICB8fCAhdWludChyYXcucmVtYWluaW5nVGlja3MsIE1BWF9USUNLU19QRVJfQ09NTUFORCkgfHwgcmF3LnJlbWFpbmluZ1RpY2tzIDwgMVxuICAgICAgfHwgcmF3LnJlbWFpbmluZ1RpY2tzID4gUkVDSVBFU1tyYXcucmVjaXBlXS50aWNrcykgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgYW4gaW52YWxpZCBwcm9kdWN0aW9uIGpvYicpO1xuICAgIHJlc2VydmVkICs9IHN0b2NrVG90YWwoUkVDSVBFU1tyYXcucmVjaXBlXS5vdXRwdXQgYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPik7XG4gICAgaWRzLmFkZChyYXcuaWQpO1xuICAgIGpvYnMucHVzaCh7IGlkOiByYXcuaWQsIHN0b2NrcGlsZUlkOiBGT1VOREVSX1NUT0NLUElMRV9JRCwgcmVjaXBlOiByYXcucmVjaXBlLCByZW1haW5pbmdUaWNrczogcmF3LnJlbWFpbmluZ1RpY2tzIH0pO1xuICB9XG4gIGlmIChyZXNlcnZlZCA+IFNUT0NLUElMRV9DQVBBQ0lUWSkgdGhyb3cgbmV3IEVycm9yKCdzdG9ja3BpbGUgcmVzZXJ2ZWQgb3V0cHV0IGV4Y2VlZHMgY2FwYWNpdHknKTtcbiAgaWRzLmNsZWFyKCk7XG4gIGNvbnN0IGNyb3BzOiBOb25OdWxsYWJsZTxMaWZlU25hcHNob3RbJ2Nyb3BzJ10+ID0gW107XG4gIGZvciAoY29uc3QgcmF3IG9mIHZhbHVlLmNyb3BzKSB7XG4gICAgaWYgKCFpc09iamVjdChyYXcpIHx8ICFDUk9QX1BMT1RfSURTLmluY2x1ZGVzKFN0cmluZyhyYXcuaWQpKSB8fCBpZHMuaGFzKFN0cmluZyhyYXcuaWQpKVxuICAgICAgfHwgIXVpbnQocmF3LnBsYW50ZWRUaWNrLCB2YWx1ZS50aWNrKSB8fCByYXcuZ3Jvd3RoVGlja3MgIT09IENST1BfR1JPV1RIX1RJQ0tTKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhcyBhbiBpbnZhbGlkIGNyb3AgcGxvdCcpO1xuICAgIH1cbiAgICBjb25zdCBwbG90SWQgPSBTdHJpbmcocmF3LmlkKTtcbiAgICBpZHMuYWRkKHBsb3RJZCk7XG4gICAgY3JvcHMucHVzaCh7IGlkOiBwbG90SWQsIHBsYW50ZWRUaWNrOiByYXcucGxhbnRlZFRpY2ssIGdyb3d0aFRpY2tzOiBDUk9QX0dST1dUSF9USUNLUyB9KTtcbiAgfVxuICBzdG9ja3BpbGVzLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG4gIGpvYnMuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKTtcbiAgY3JvcHMuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKTtcbiAgcmV0dXJuIHsgdGljazogdmFsdWUudGljaywgc3RvY2twaWxlcywgam9icywgY3JvcHMgfTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVDb3N0KHZhbHVlOiB1bmtub3duKTogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiB7XG4gIGNvbnN0IG91dCA9IHZhbGlkYXRlSW52ZW50b3J5KHZhbHVlKTtcbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVTdHJ1Y3R1cmUoXG4gIHZhbHVlOiB1bmtub3duLCBpZHM6IFNldDxzdHJpbmc+LCBzY2hlbWE6IFdvcmxkU25hcHNob3RbJ3NjaGVtYSddLFxuKTogU3RydWN0dXJlIHtcbiAgaWYgKCFpc09iamVjdCh2YWx1ZSkgfHwgIXRleHQodmFsdWUuaWQpIHx8IGlkcy5oYXModmFsdWUuaWQpXG4gICAgfHwgIXRleHQodmFsdWUua2luZCkgfHwgIVNUUlVDVFVSRV9LSU5EUy5oYXModmFsdWUua2luZClcbiAgICB8fCAhdGV4dCh2YWx1ZS5zaXRlSWQpXG4gICAgfHwgIWZpbml0ZSh2YWx1ZS54KSB8fCAhZmluaXRlKHZhbHVlLnkpIHx8ICFmaW5pdGUodmFsdWUueikgfHwgIWZpbml0ZSh2YWx1ZS5yb3QpXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUubW9kdWxlcykgfHwgdmFsdWUubW9kdWxlcy5sZW5ndGggPiA2NFxuICAgIHx8ICF1aW50KHZhbHVlLmJ1aWx0UmV2aXNpb24sIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSB8fCB2YWx1ZS5wcm92aXNpb25hbCAhPT0gdHJ1ZVxuICAgIHx8IHNjaGVtYSA9PT0gU05BUFNIT1RfU0NIRU1BICYmIHZhbHVlLmRlc2lnblZlcnNpb24gIT09IHVuZGVmaW5lZFxuICAgIHx8IHNjaGVtYSAhPT0gU05BUFNIT1RfU0NIRU1BICYmIHZhbHVlLmRlc2lnblZlcnNpb24gIT09IHVuZGVmaW5lZFxuICAgICAgJiYgdmFsdWUuZGVzaWduVmVyc2lvbiAhPT0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTikge1xuICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgY29udGFpbnMgYW4gaW52YWxpZCBvciBkdXBsaWNhdGUgc3RydWN0dXJlJyk7XG4gIH1cbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlWydtb2R1bGVzJ10gPSBbXTtcbiAgY29uc3QgbW9kdWxlSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgcmF3IG9mIHZhbHVlLm1vZHVsZXMpIHtcbiAgICBpZiAoIWlzT2JqZWN0KHJhdykgfHwgIXRleHQocmF3LmtpbmQpIHx8ICFNT0RVTEVfS0lORFMuaGFzKHJhdy5raW5kKVxuICAgICAgfHwgIWZpbml0ZShyYXcueCkgfHwgIWZpbml0ZShyYXcueSkgfHwgIWZpbml0ZShyYXcueilcbiAgICAgIHx8ICFmaW5pdGUocmF3LncpIHx8IHJhdy53IDw9IDAgfHwgIWZpbml0ZShyYXcuaCkgfHwgcmF3LmggPD0gMCB8fCAhZmluaXRlKHJhdy5kKSB8fCByYXcuZCA8PSAwXG4gICAgICB8fCByYXcucm90ICE9PSB1bmRlZmluZWQgJiYgIWZpbml0ZShyYXcucm90KVxuICAgICAgfHwgcmF3LnRvbmUgIT09IHVuZGVmaW5lZCAmJiAodHlwZW9mIHJhdy50b25lICE9PSAnc3RyaW5nJyB8fCAhTU9EVUxFX1RPTkVTLmhhcyhyYXcudG9uZSkpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYHN0cnVjdHVyZSAke3ZhbHVlLmlkfSBjb250YWlucyBhbiBpbnZhbGlkIG1vZHVsZWApO1xuICAgIH1cbiAgICBjb25zdCBzaWduYXR1cmUgPSBKU09OLnN0cmluZ2lmeShyYXcpO1xuICAgIGlmIChtb2R1bGVJZHMuaGFzKHNpZ25hdHVyZSkpIHRocm93IG5ldyBFcnJvcihgc3RydWN0dXJlICR7dmFsdWUuaWR9IGNvbnRhaW5zIGR1cGxpY2F0ZSBtb2R1bGVzYCk7XG4gICAgbW9kdWxlSWRzLmFkZChzaWduYXR1cmUpO1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiByYXcua2luZCBhcyBTdHJ1Y3R1cmVbJ21vZHVsZXMnXVtudW1iZXJdWydraW5kJ10sXG4gICAgICB4OiByYXcueCwgeTogcmF3LnksIHo6IHJhdy56LCB3OiByYXcudywgaDogcmF3LmgsIGQ6IHJhdy5kLFxuICAgICAgLi4uKHJhdy5yb3QgPT09IHVuZGVmaW5lZCA/IHt9IDogeyByb3Q6IHJhdy5yb3QgfSksXG4gICAgICAuLi4ocmF3LnRvbmUgPT09IHVuZGVmaW5lZCA/IHt9IDogeyB0b25lOiByYXcudG9uZSBhcyBTdHJ1Y3R1cmVbJ21vZHVsZXMnXVtudW1iZXJdWyd0b25lJ10gfSksXG4gICAgfSk7XG4gIH1cbiAgaWRzLmFkZCh2YWx1ZS5pZCk7XG4gIHJldHVybiB7XG4gICAgaWQ6IHZhbHVlLmlkLCBraW5kOiB2YWx1ZS5raW5kIGFzIFN0cnVjdHVyZVsna2luZCddLCBzaXRlSWQ6IHZhbHVlLnNpdGVJZCxcbiAgICB4OiB2YWx1ZS54LCB5OiB2YWx1ZS55LCB6OiB2YWx1ZS56LCByb3Q6IHZhbHVlLnJvdCxcbiAgICBtb2R1bGVzLCBjb3N0OiB2YWxpZGF0ZUNvc3QodmFsdWUuY29zdCksIGJ1aWx0UmV2aXNpb246IHZhbHVlLmJ1aWx0UmV2aXNpb24sXG4gICAgLi4uKHZhbHVlLmRlc2lnblZlcnNpb24gPT09IHVuZGVmaW5lZCA/IHt9IDogeyBkZXNpZ25WZXJzaW9uOiBGT1VOREVSX0RFU0lHTl9WRVJTSU9OIH0pLFxuICAgIHByb3Zpc2lvbmFsOiB0cnVlLFxuICB9O1xufVxuXG4vKiogU3RyaWN0IHJ1bnRpbWUgdmFsaWRhdGlvbjsgSlNPTidzIFR5cGVTY3JpcHQgY2FzdHMgYXJlIG5ldmVyIHRydXN0ZWQuICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVXb3JsZFNuYXBzaG90KHZhbHVlOiB1bmtub3duKTogV29ybGRTbmFwc2hvdCB7XG4gIGlmICghaXNPYmplY3QodmFsdWUpXG4gICAgfHwgdmFsdWUuc2NoZW1hICE9PSBTTkFQU0hPVF9TQ0hFTUEgJiYgdmFsdWUuc2NoZW1hICE9PSBERVNJR05fU05BUFNIT1RfU0NIRU1BXG4gICAgJiYgdmFsdWUuc2NoZW1hICE9PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQVxuICAgIHx8ICFpc09iamVjdCh2YWx1ZS5tYW5pZmVzdCkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Vuc3VwcG9ydGVkIG9yIG1hbGZvcm1lZCB3b3JsZCBzbmFwc2hvdCcpO1xuICB9XG4gIGNvbnN0IHNjaGVtYSA9IHZhbHVlLnNjaGVtYTtcbiAgY29uc3QgbSA9IHZhbHVlLm1hbmlmZXN0O1xuICAvLyBFdmVyeSBzdXBwb3J0ZWQgZ2VuZXJhdG9yIHJlc3RvcmVzIHdpdGggaXRzIG93biB2ZXJzaW9uOyB2MSBzYXZlcyBrZWVwXG4gIC8vIEdFTkVSQVRPUl9WRVJTSU9OIGV4YWN0bHksIHNvIHRoZWlyIG1hbmlmZXN0cyBhbmQgaGFzaGVzIGFyZSB1bmNoYW5nZWQuXG4gIGNvbnN0IHBhcmFtcyA9IHtcbiAgICBzaXplOiAyMDQ4LCBjaHVua1NpemU6IENIVU5LX1NJWkUsIHlNaW46IC0xNiwgeU1heDogMTEyLFxuICAgIHNlYUxldmVsOiAwLCBnZW5lcmF0b3JWZXJzaW9uOiBpc1N1cHBvcnRlZEdlbmVyYXRvcihtLmdlbmVyYXRvclZlcnNpb24pID8gbS5nZW5lcmF0b3JWZXJzaW9uIDogR0VORVJBVE9SX1ZFUlNJT04sXG4gIH07XG4gIGlmIChtLnNjaGVtYSAhPT0gMSB8fCAhdWludChtLnNlZWQsIDB4ZmZmZmZmZmYpXG4gICAgfHwgIWlzU3VwcG9ydGVkR2VuZXJhdG9yKG0uZ2VuZXJhdG9yVmVyc2lvbilcbiAgICB8fCBtLnNpemUgIT09IHBhcmFtcy5zaXplIHx8IG0uY2h1bmtTaXplICE9PSBwYXJhbXMuY2h1bmtTaXplXG4gICAgfHwgbS55TWluICE9PSBwYXJhbXMueU1pbiB8fCBtLnlNYXggIT09IHBhcmFtcy55TWF4IHx8IG0uc2VhTGV2ZWwgIT09IHBhcmFtcy5zZWFMZXZlbFxuICAgIHx8ICEvXlswLTlhLWZdezh9JC8udGVzdChTdHJpbmcobS5wYXJhbXNIYXNoKSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGdlbmVyYXRvciBjb25maWd1cmF0aW9uIGlzIHVuc3VwcG9ydGVkIG9yIGluY29tcGF0aWJsZScpO1xuICB9XG4gIGlmICghdWludCh2YWx1ZS5yZXZpc2lvbiwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpXG4gICAgfHwgIXVpbnQodmFsdWUubmV4dFNlcXVlbmNlLCAxMF8wMDBfMDAwKVxuICAgIHx8IHR5cGVvZiB2YWx1ZS5hdXRob3JlZFBsYWNlZCAhPT0gJ2Jvb2xlYW4nXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuZWRpdHMpIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVudGl0aWVzKVxuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVudGl0eVJlbW92YWxzKVxuICAgIHx8IHZhbHVlLmVudGl0aWVzLmxlbmd0aCA+IE1BWF9TTkFQU0hPVF9FTlRJVElFU1xuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVudGl0eUNodW5rcykgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuc3RydWN0dXJlcykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhcyBpbnZhbGlkIGF1dGhvcml0YXRpdmUtc3RhdGUgZmllbGRzJyk7XG4gIH1cbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChtLnNlZWQsIHBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uKTtcbiAgLy8gVGhlIG1hbmlmZXN0IGhhc2ggaXMgY2hlY2tlZCBhZ2FpbnN0IHRoZSBhY3R1YWwgcmVzdG9yZWQgY29uZmlndXJhdGlvbi5cbiAgaWYgKHdvcmxkTWFuaWZlc3Qod29ybGQpLnBhcmFtc0hhc2ggIT09IG0ucGFyYW1zSGFzaCkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBtYW5pZmVzdCBoYXNoIG1pc21hdGNoJyk7XG5cbiAgY29uc3QgZWRpdHM6IFdvcmxkU25hcHNob3RbJ2VkaXRzJ10gPSBbXTtcbiAgbGV0IGVkaXRDb3VudCA9IDA7XG4gIGNvbnN0IGNodW5rSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgcmF3IG9mIHZhbHVlLmVkaXRzKSB7XG4gICAgaWYgKCFpc09iamVjdChyYXcpIHx8ICF2YWxpZENodW5rKHJhdy5jaHVuaykgfHwgY2h1bmtJZHMuaGFzKHJhdy5jaHVuaylcbiAgICAgIHx8ICFBcnJheS5pc0FycmF5KHJhdy5jZWxscykgfHwgcmF3LmNlbGxzLmxlbmd0aCA+IENIVU5LX1ZPTFVNRSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBjb250YWlucyBpbnZhbGlkIGNodW5rIGVkaXRzJyk7XG4gICAgfVxuICAgIGNvbnN0IGNlbGxJZHMgPSBuZXcgU2V0PG51bWJlcj4oKTtcbiAgICBjb25zdCBjZWxsczogQXJyYXk8eyBpOiBudW1iZXI7IG06IG51bWJlciB9PiA9IFtdO1xuICAgIGZvciAoY29uc3QgY2VsbCBvZiByYXcuY2VsbHMpIHtcbiAgICAgIGlmICghaXNPYmplY3QoY2VsbCkgfHwgIXVpbnQoY2VsbC5pLCBDSFVOS19WT0xVTUUgLSAxKSB8fCBjZWxsSWRzLmhhcyhjZWxsLmkpXG4gICAgICAgIHx8ICF1aW50KGNlbGwubSwgTUFYX01BVF9JRCkpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgY29udGFpbnMgYW4gaW52YWxpZCB2b3hlbCBlZGl0Jyk7XG4gICAgICBjZWxsSWRzLmFkZChjZWxsLmkpO1xuICAgICAgY2VsbHMucHVzaCh7IGk6IGNlbGwuaSwgbTogY2VsbC5tIH0pO1xuICAgIH1cbiAgICBjZWxsSWRzLmNsZWFyKCk7XG4gICAgY2VsbHMuc29ydCgoYSwgYikgPT4gYS5pIC0gYi5pKTtcbiAgICBlZGl0Q291bnQgKz0gY2VsbHMubGVuZ3RoO1xuICAgIGlmIChlZGl0Q291bnQgPiBNQVhfU05BUFNIT1RfRURJVFMpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgZXhjZWVkcyB0aGUgYm91bmRlZCBlZGl0IGxpbWl0Jyk7XG4gICAgY2h1bmtJZHMuYWRkKHJhdy5jaHVuayk7XG4gICAgZWRpdHMucHVzaCh7IGNodW5rOiByYXcuY2h1bmssIGNlbGxzIH0pO1xuICB9XG4gIGVkaXRzLnNvcnQoKGEsIGIpID0+IGEuY2h1bmsubG9jYWxlQ29tcGFyZShiLmNodW5rKSk7XG5cbiAgY29uc3QgZW50aXR5SWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IGVudGl0aWVzID0gdmFsdWUuZW50aXRpZXMubWFwKChlKSA9PiB2YWxpZGF0ZUVudGl0eShlLCBlbnRpdHlJZHMpKTtcbiAgY29uc3QgZW50aXR5Q2h1bmtzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBnZW5lcmF0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCBrZXkgb2YgdmFsdWUuZW50aXR5Q2h1bmtzKSB7XG4gICAgaWYgKCF2YWxpZENodW5rKGtleSkgfHwgZ2VuZXJhdGVkLmhhcyhrZXkpKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGdlbmVyYXRlZC1jaHVuayBpbmRleCBpcyBpbnZhbGlkJyk7XG4gICAgZ2VuZXJhdGVkLmFkZChrZXkpO1xuICAgIGVudGl0eUNodW5rcy5wdXNoKGtleSk7XG4gIH1cbiAgZm9yIChjb25zdCBlbnRpdHkgb2YgZW50aXRpZXMpIHtcbiAgICBpZiAoIWVudGl0eS5hdXRob3JlZCAmJiAhZ2VuZXJhdGVkLmhhcyhlbnRpdHkuY2h1bmspKSB0aHJvdyBuZXcgRXJyb3IoYGVudGl0eSAke2VudGl0eS5pZH0gYmVsb25ncyB0byBhbiB1bm1hcmtlZCBjaHVua2ApO1xuICB9XG4gIGVudGl0eUNodW5rcy5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuICBjb25zdCByZW1vdmFscyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IGlkIG9mIHZhbHVlLmVudGl0eVJlbW92YWxzKSB7XG4gICAgaWYgKCF0ZXh0KGlkKSB8fCByZW1vdmFscy5oYXMoaWQpIHx8IGVudGl0eUlkcy5oYXMoaWQpIHx8ICEvXmU6XFxkKyxcXGQrOlxcZCskLy50ZXN0KGlkKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBlbnRpdHkgdG9tYnN0b25lIGlzIGludmFsaWQnKTtcbiAgICB9XG4gICAgcmVtb3ZhbHMuYWRkKGlkKTtcbiAgfVxuICBjb25zdCBlbnRpdHlSZW1vdmFscyA9IFsuLi5yZW1vdmFsc10uc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKTtcblxuICBjb25zdCBzdHJ1Y3R1cmVJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3Qgc3RydWN0dXJlcyA9IHZhbHVlLnN0cnVjdHVyZXMubWFwKChzKSA9PiB2YWxpZGF0ZVN0cnVjdHVyZShzLCBzdHJ1Y3R1cmVJZHMsIHNjaGVtYSkpXG4gICAgLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG4gIGNvbnN0IGNhcnJpZWQgPSB2YWxpZGF0ZUludmVudG9yeSh2YWx1ZS5pbnZlbnRvcnkpO1xuICBpZiAoc2NoZW1hID09PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSAmJiBzdG9ja1RvdGFsKGNhcnJpZWQpID4gQ0FSUklFRF9DQVBBQ0lUWSkgdGhyb3cgbmV3IEVycm9yKCdjYXJyaWVkIGludmVudG9yeSBleGNlZWRzIGNhcGFjaXR5Jyk7XG4gIGNvbnN0IHNuYXBzaG90OiBCYXNlV29ybGRTbmFwc2hvdCA9IHtcbiAgICBzY2hlbWEsXG4gICAgbWFuaWZlc3Q6IHtcbiAgICAgIHNjaGVtYTogMSwgc2VlZDogbS5zZWVkLCBnZW5lcmF0b3JWZXJzaW9uOiBwYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICAgIHNpemU6IHBhcmFtcy5zaXplLCBjaHVua1NpemU6IHBhcmFtcy5jaHVua1NpemUsIHlNaW46IHBhcmFtcy55TWluLFxuICAgICAgeU1heDogcGFyYW1zLnlNYXgsIHNlYUxldmVsOiBwYXJhbXMuc2VhTGV2ZWwsIHBhcmFtc0hhc2g6IG0ucGFyYW1zSGFzaCxcbiAgICB9LFxuICAgIHJldmlzaW9uOiB2YWx1ZS5yZXZpc2lvbixcbiAgICBlZGl0cyxcbiAgICBlbnRpdGllcyxcbiAgICBlbnRpdHlDaHVua3MsXG4gICAgZW50aXR5UmVtb3ZhbHMsXG4gICAgaW52ZW50b3J5OiBjYXJyaWVkLFxuICAgIHN0cnVjdHVyZXMsXG4gICAgYXV0aG9yZWRQbGFjZWQ6IHZhbHVlLmF1dGhvcmVkUGxhY2VkLFxuICAgIG5leHRTZXF1ZW5jZTogdmFsdWUubmV4dFNlcXVlbmNlLFxuICB9O1xuICBjb25zdCByZXN1bHQ6IFdvcmxkU25hcHNob3QgPSBzY2hlbWEgPT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BXG4gICAgPyB7IC4uLnNuYXBzaG90LCBzY2hlbWE6IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BLCAuLi52YWxpZGF0ZUxpZmVGaWVsZHModmFsdWUpIH1cbiAgICA6IHsgLi4uc25hcHNob3QsIHNjaGVtYTogc2NoZW1hIGFzIHR5cGVvZiBTTkFQU0hPVF9TQ0hFTUEgfCB0eXBlb2YgREVTSUdOX1NOQVBTSE9UX1NDSEVNQSB9O1xuICBpZiAoSlNPTi5zdHJpbmdpZnkocmVzdWx0KSAhPT0gSlNPTi5zdHJpbmdpZnkodmFsdWUpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBjb250YWlucyB1bmtub3duLCBub24tY2Fub25pY2FsIG9yIGFtYmlndW91cyBmaWVsZHMnKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlV29ybGRTbmFwc2hvdChqc29uOiBzdHJpbmcpOiBXb3JsZFNuYXBzaG90IHtcbiAgaWYgKGpzb24ubGVuZ3RoID4gTUFYX1NOQVBTSE9UX0pTT05fQllURVMpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgZXhjZWVkcyB0aGUgSlNPTiBzaXplIGxpbWl0Jyk7XG4gIHJldHVybiB2YWxpZGF0ZVdvcmxkU25hcHNob3QoSlNPTi5wYXJzZShqc29uKSk7XG59XG5cbi8qKiBSZXN0b3JlIGluIHBsYWNlIHNvIGNvbnRyb2xsZXJzIHJldGFpbiB0aGUgc2FtZSBXb3JsZCByZWZlcmVuY2UuIEFsbFxuICogdmFsaWRhdGlvbiBoYXBwZW5zIGJlZm9yZSBtdXRhdGlvbiwgc28gYSByZWplY3RlZCBzYXZlIGNhbm5vdCBlcmFzZSB3b3JrLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc3RvcmVXb3JsZFNuYXBzaG90KHdvcmxkOiBXb3JsZCwgaW5wdXQ6IFdvcmxkU25hcHNob3QpOiB2b2lkIHtcbiAgLy8gT3JkaW5hcnkgc25hcHNob3RzIGFuZCB0cmFuc2FjdGlvbmFsIHJvbGxiYWNrcyByZXN0b3JlIHRoZWlyIGV4YWN0IHJlY29yZGVkXG4gIC8vIHN0YXRlLiBSZXRpcmVkIGhpc3RvcmljYWwgZW50aXRpZXMgYXJlIHJlbW92ZWQgb25seSBhZnRlciBHYW1lU2Vzc2lvbiBoYXNcbiAgLy8gYXV0aGVudGljYXRlZCB0aGUgb3JpZ2luYWwgam91cm5hbCBhbmQgZXhwbGljaXRseSBtaWdyYXRlZCB0aGF0IHNhdmUuXG4gIGZpbmlzaFN0b25lUmVwbGF5KHdvcmxkKTtcbiAgcmVzdG9yZVdvcmxkU25hcHNob3RFeGFjdCh3b3JsZCwgaW5wdXQpO1xufVxuXG4vKiogQGludGVybmFsIEhpc3RvcmljYWwgcmVjb25zdHJ1Y3Rpb24gb3IgZXhhY3QgbmV3LXNuYXBzaG90IHJlc3RvcmF0aW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc3RvcmVXb3JsZFNuYXBzaG90RXhhY3Qod29ybGQ6IFdvcmxkLCBpbnB1dDogV29ybGRTbmFwc2hvdCk6IHZvaWQge1xuICBjb25zdCBzbmFwc2hvdCA9IHZhbGlkYXRlV29ybGRTbmFwc2hvdChpbnB1dCk7XG4gIGlmIChzbmFwc2hvdC5tYW5pZmVzdC5zZWVkICE9PSB3b3JsZC5zZWVkKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IHNlZWQgZG9lcyBub3QgbWF0Y2ggdGhlIHdvcmxkJyk7XG4gIHdvcmxkLnBhcmFtcyA9IHtcbiAgICBzaXplOiBzbmFwc2hvdC5tYW5pZmVzdC5zaXplLFxuICAgIGNodW5rU2l6ZTogc25hcHNob3QubWFuaWZlc3QuY2h1bmtTaXplLFxuICAgIHlNaW46IHNuYXBzaG90Lm1hbmlmZXN0LnlNaW4sXG4gICAgeU1heDogc25hcHNob3QubWFuaWZlc3QueU1heCxcbiAgICBzZWFMZXZlbDogc25hcHNob3QubWFuaWZlc3Quc2VhTGV2ZWwsXG4gICAgZ2VuZXJhdG9yVmVyc2lvbjogc25hcHNob3QubWFuaWZlc3QuZ2VuZXJhdG9yVmVyc2lvbixcbiAgfTtcbiAgd29ybGQuY2h1bmtzLmNsZWFyKCk7XG4gIHdvcmxkLmVudGl0aWVzLmNsZWFyKCk7XG4gIHdvcmxkLmVudGl0eUNodW5rcy5jbGVhcigpO1xuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmNsZWFyKCk7XG4gIHdvcmxkLmVudGl0eVJlbW92YWxzLmNsZWFyKCk7XG4gIHdvcmxkLnN0cnVjdHVyZXMuY2xlYXIoKTtcbiAgd29ybGQuZWRpdHMuY2xlYXIoKTtcbiAgd29ybGQuaW52ZW50b3J5ID0geyAuLi5zbmFwc2hvdC5pbnZlbnRvcnkgfTtcbiAgd29ybGQubGlmZSA9IHNuYXBzaG90LnNjaGVtYSA9PT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEgPyBjcmVhdGVMaWZlU3RhdGUoKSA6IHVuZGVmaW5lZDtcbiAgaWYgKHdvcmxkLmxpZmUgJiYgc25hcHNob3Quc2NoZW1hID09PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSkge1xuICAgIHdvcmxkLmxpZmUudGljayA9IHNuYXBzaG90LnRpY2s7XG4gICAgZm9yIChjb25zdCBzIG9mIHNuYXBzaG90LnN0b2NrcGlsZXMpIHdvcmxkLmxpZmUuc3RvY2twaWxlcy5zZXQocy5pZCwgeyAuLi5zLCBpbnZlbnRvcnk6IHsgLi4ucy5pbnZlbnRvcnkgfSB9KTtcbiAgICBmb3IgKGNvbnN0IGogb2Ygc25hcHNob3Quam9icykgd29ybGQubGlmZS5qb2JzLnNldChqLmlkLCB7IC4uLmogfSk7XG4gICAgZm9yIChjb25zdCBjIG9mIHNuYXBzaG90LmNyb3BzKSB3b3JsZC5saWZlLmNyb3BzLnNldChjLmlkLCB7IC4uLmMgfSk7XG4gIH1cbiAgd29ybGQuZGlydHkuY2xlYXIoKTtcbiAgd29ybGQuc2l0ZXMgPSBbXTtcbiAgd29ybGQuc3RhdHMgPSB7XG4gICAgY2h1bmtzR2VuZXJhdGVkOiAwLCBjaHVua3NFdmljdGVkOiAwLCB2b3hlbHNGaWxsZWQ6IDAsIGdlbmVyYXRpb25NczogMCxcbiAgICBlbnRpdGllczogc25hcHNob3QuZW50aXRpZXMubGVuZ3RoLCB0cmVlczogMCwgcGlua1RyZWVzOiAwLCBwaW5rT3ZlcmZsb3c6IDAsXG4gIH07XG4gIHdvcmxkLnJldmlzaW9uID0gc25hcHNob3QucmV2aXNpb247XG4gIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gc25hcHNob3QuYXV0aG9yZWRQbGFjZWQ7XG4gIGZvciAoY29uc3Qga2V5IG9mIHNuYXBzaG90LmVudGl0eUNodW5rcykgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoa2V5KTtcbiAgLy8gQXBwbHkgZHVyYWJsZSB2b3hlbCBlZGl0cyBiZWZvcmUgYW55IGF1dGhvcmVkLXNpdGUgcXVlcnkgY2FuIGdlbmVyYXRlIGFcbiAgLy8gY2h1bmsuIE90aGVyd2lzZSB0aG9zZSBjaHVua3MgY2FjaGUgdGhlIHVuZWRpdGVkIGJhc2UgdGVycmFpbiBwZXJtYW5lbnRseS5cbiAgZm9yIChjb25zdCBkZWx0YSBvZiBzbmFwc2hvdC5lZGl0cykge1xuICAgIHdvcmxkLmVkaXRzLnNldChkZWx0YS5jaHVuaywgbmV3IE1hcChkZWx0YS5jZWxscy5tYXAoKGUpID0+IFtlLmksIGUubSBhcyBNYXRJZF0pKSk7XG4gIH1cbiAgbWFya0VkaXRzQ2hhbmdlZCh3b3JsZCk7XG4gIC8vIFJlY3JlYXRlIGF1dGhvcmVkIHNpdGUgcmVjb3Jkcy4gU3VwcHJlc3MgdGhlaXIgZW50aXR5IHBsYWNlbWVudCBzbyB0aGVcbiAgLy8gZXhhY3Qgc2F2ZWQgZW50aXR5IHJlY29yZHMgYmVsb3cgY2Fubm90IGJlIGFmZmVjdGVkIGJ5IGEgbW9kaWZpZWQgY2h1bmsuXG4gIGlmICh3b3JsZC5hdXRob3JlZFBsYWNlZCkge1xuICAgIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gZmFsc2U7XG4gICAgcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkKTtcbiAgICB3b3JsZC5hdXRob3JlZFBsYWNlZCA9IHRydWU7XG4gIH1cbiAgLy8gQXV0aG9yZWQgcGxhY2VtZW50IGRlcml2ZXMgc2l0ZS9lbnRpdHkgc2NhZmZvbGRpbmcgYW5kIG1heSBhZHZhbmNlIHRoZVxuICAvLyByZXZpc2lvbi4gVGhlIHNhdmVkIHJldmlzaW9uIGlzIHJlc3RvcmVkIG9ubHkgYWZ0ZXIgdGhhdCBkZXJpdmVkIHdvcmsuXG4gIHdvcmxkLnJldmlzaW9uID0gc25hcHNob3QucmV2aXNpb247XG4gIC8vIFRvbWJzdG9uZXMgbXVzdCBleGlzdCBiZWZvcmUgYW55IGNoYW5nZWQgY2h1bmsgcmVnZW5lcmF0ZXMgaXRzIGVudGl0aWVzLlxuICBmb3IgKGNvbnN0IGlkIG9mIHNuYXBzaG90LmVudGl0eVJlbW92YWxzKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoaWQpO1xuICAvLyBSZXBsYWNlIGdlbmVyYXRlZCBlbnRpdGllcyB3aXRoIHRoZSBleGFjdCBzYXZlZCByZWNvcmRzLCBpbmNsdWRpbmdcbiAgLy8gaGFydmVzdGVkL3JlbW92ZWQgb25lcy5cbiAgd29ybGQuZW50aXRpZXMuY2xlYXIoKTtcbiAgd29ybGQuZW50aXR5Q2h1bmtzLmNsZWFyKCk7XG4gIC8vIEluc3RhbGwgcGVyc2lzdGVkIGVudGl0eSBkZWx0YXMgZGlyZWN0bHkuIFRoaXMgaXMgcmVjb25zdHJ1Y3Rpb24sIG5vdCBhXG4gIC8vIGNvbW1hbmQ6IHJlbW92ZUVudGl0eSB3b3VsZCBjcmVhdGUgZnJlc2ggdG9tYnN0b25lcyBhbmQgYWR2YW5jZSByZXZpc2lvbi5cbiAgZm9yIChjb25zdCBrZXkgb2Ygc25hcHNob3QuZW50aXR5Q2h1bmtzKSB7XG4gICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgIGlmICghY2h1bmspIHRocm93IG5ldyBFcnJvcihgc25hcHNob3QgcmVmZXJlbmNlcyB1bmF2YWlsYWJsZSBjaHVuayAke2tleX1gKTtcbiAgICBjb25zdCBzYXZlZCA9IG5ldyBTZXQoc25hcHNob3QuZW50aXRpZXMuZmlsdGVyKChlKSA9PiBlLmNodW5rID09PSBrZXkpLm1hcCgoZSkgPT4gZS5pZCkpO1xuICAgIC8vIEF1dGhvcmVkIGVudGl0aWVzIGZvciB0aGUgc2FtZSBjaHVuayBzdXJ2aXZlIGFsb25nc2lkZSBuYXR1cmFsIGRlbHRhcy5cbiAgICBjb25zdCBpZHMgPSAod29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpID8/IFtdKS5maWx0ZXIoKGlkKSA9PiB7XG4gICAgICBjb25zdCBlbnRpdHkgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgICAgcmV0dXJuICFpZC5zdGFydHNXaXRoKCdlOicpICYmICEhZW50aXR5XG4gICAgICAgICYmICghaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSB8fCBpc1N0b25lUmVwbGF5KHdvcmxkKSk7XG4gICAgfSk7XG4gICAgZm9yIChjb25zdCBpZCBvZiBbLi4ud29ybGQuZW50aXRpZXMua2V5cygpXSkge1xuICAgICAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICAgIGlmIChlbnRpdHk/LmNodW5rID09PSBrZXkgJiYgIWVudGl0eS5hdXRob3JlZCAmJiAhc2F2ZWQuaGFzKGlkKSkgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBpZCBvZiBzYXZlZCkgaWYgKCFpZHMuaW5jbHVkZXMoaWQpKSBpZHMucHVzaChpZCk7XG4gICAgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGlkcyk7XG4gIH1cbiAgZm9yIChjb25zdCBlIG9mIHNuYXBzaG90LmVudGl0aWVzKSB7XG4gICAgd29ybGQuZW50aXRpZXMuc2V0KGUuaWQsIGNsb25lRW50aXR5KGUpKTtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBvZiBzbmFwc2hvdC5lbnRpdHlDaHVua3MpIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGtleSk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgZm9yIChjb25zdCBlIG9mIHdvcmxkLmVudGl0aWVzLnZhbHVlcygpKSB7XG4gICAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgfVxuICBmb3IgKGNvbnN0IHMgb2Ygc25hcHNob3Quc3RydWN0dXJlcykgd29ybGQuc3RydWN0dXJlcy5zZXQocy5pZCwgY2xvbmVTdHJ1Y3R1cmUocykpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd29ybGRGcm9tU25hcHNob3Qoc25hcHNob3Q6IFdvcmxkU25hcHNob3QpOiBXb3JsZCB7XG4gIGNvbnN0IHZhbGlkID0gdmFsaWRhdGVXb3JsZFNuYXBzaG90KHNuYXBzaG90KTtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZCh2YWxpZC5tYW5pZmVzdC5zZWVkLCB2YWxpZC5tYW5pZmVzdC5nZW5lcmF0b3JWZXJzaW9uKTtcbiAgcmVzdG9yZVdvcmxkU25hcHNob3Qod29ybGQsIHZhbGlkKTtcbiAgcmV0dXJuIHdvcmxkO1xufVxuXG4vKiogUmF3IG9sZCBzdGF0ZSBpcyB1c2VkIG9ubHkgd2hpbGUgdmFsaWRhdGluZyBhIHJlY29yZGVkIGFjY2VwdGVkIGpvdXJuYWwuICovXG5leHBvcnQgZnVuY3Rpb24gaGlzdG9yaWNhbFdvcmxkRnJvbVNuYXBzaG90KHNuYXBzaG90OiBXb3JsZFNuYXBzaG90KTogV29ybGQge1xuICBjb25zdCB2YWxpZCA9IHZhbGlkYXRlV29ybGRTbmFwc2hvdChzbmFwc2hvdCk7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQodmFsaWQubWFuaWZlc3Quc2VlZCk7XG4gIGVuYWJsZVN0b25lUmVwbGF5KHdvcmxkKTtcbiAgcmVzdG9yZVdvcmxkU25hcHNob3RFeGFjdCh3b3JsZCwgdmFsaWQpO1xuICByZXR1cm4gd29ybGQ7XG59XG4iLCAiLy8gTTAwMiBwbGF5YWJsZSBmaXJzdCBzbGljZSBcdTIwMTQgdGhlIHRocmVlIGF1dGhvcmVkIHByb2plY3RzIGFzIHBsYWluIGRhdGEuXG4vL1xuLy8gVGhpcyBtb2R1bGUgaXMgZGVsaWJlcmF0ZWx5IERPTS1mcmVlLiBUaGUgYnVpbGQgc2lkZWJhciwgdGhlIGdob3N0IHByZXZpZXdcbi8vIGFuZCB0aGUgdGVzdHMgYWxsIHJlYWQgdGhlIHNhbWUgZGVmaW5pdGlvbnMgYW5kIGNhbGwgdGhlIHNhbWUgc2ltdWxhdGlvblxuLy8gZW50cnkgcG9pbnRzOyBhIHByb2plY3QgY2Fubm90IGFkdmVydGlzZSBvbmUgZm9vdHByaW50LCBwcmljZSBvciBwcmVwYXJhdGlvblxuLy8gc3RlcCBhbmQgdGhlbiBleGVjdXRlIGFub3RoZXIuXG5pbXBvcnQgeyBNQVQsIFdvcmxkLCBSZXNvdXJjZVR5cGUgfSBmcm9tICcuLi9zaW0vd29ybGQnO1xuaW1wb3J0IHsgUmVjdCB9IGZyb20gJy4uL3NpbS90ZXJyYWluJztcbmltcG9ydCB7XG4gIEJ1aWxkaW5nUnVsZXMsIEhPVVNFX1JVTEVTLCBQQVRIX1JVTEVTLCBGQVJNX1JVTEVTLFxuICBTaXRlUHJvcG9zYWwsIFNpdGVQcmV2aWV3LCBTaXRlU3RhdGUsIFZhbGlkYXRpb25SZWFzb24sIHByZXZpZXdTaXRlLFxufSBmcm9tICcuLi9zaW0vY29uc3RydWN0aW9uJztcbmltcG9ydCB7XG4gIE0wMDJfTEFZT1VULCBNMDAyX1BBVEhfU0lURV9JRCwgTTAwMl9URVJSQUNFX0JBTkRTLFxufSBmcm9tICcuLi9zaW0vbTAwMic7XG5pbXBvcnQge1xuICBtMDAyRmFybVRhcmdldHMsIG0wMDJQYXRoUmVjdCwgbTAwMlBhdGhUYXJnZXRzLFxufSBmcm9tICcuLi9zaW0vc2NlbmFyaW8nO1xuaW1wb3J0IHtcbiAgQ29sdW1uVGFyZ2V0LCBMb2NhbEF1dGhvcml6ZXIsIFByZXBhcmF0aW9uTGVkZ2VyLCBQcmVwYXJhdGlvbk9wdGlvbnMsXG4gIFBsYW5SZXN1bHQsIHBsYW5QcmVwYXJhdGlvbiwgcHJlcGFyZVNpdGUsXG59IGZyb20gJy4uL3NpbS9wcmVwYXJhdGlvbic7XG5pbXBvcnQgeyBjcmVhdGVXb3JsZFNuYXBzaG90LCByZXN0b3JlV29ybGRTbmFwc2hvdCB9IGZyb20gJy4uL3NpbS9zbmFwc2hvdCc7XG5cbmltcG9ydCB7XG4gIEhPVVNFX0NPU1QsIFRFUlJBQ0VfQ09TVCwgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyLCBTdHJ1Y3R1cmUsXG4gIFN0cnVjdHVyZUtpbmQsIFN0cnVjdHVyZUxlZGdlciwgU3RydWN0dXJlUHJvcG9zYWwsIFN0cnVjdHVyZURlc2lnblZlcnNpb24sXG4gIGJ1aWxkU3RydWN0dXJlLCBwYXRoQ29zdCxcbn0gZnJvbSAnLi4vc2ltL3N0cnVjdHVyZXMnO1xuXG5leHBvcnQgdHlwZSBNMlByb2plY3RJZCA9ICdob3VzZScgfCAncGF0aCcgfCAnZmFybSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTJHaG9zdEJhbmQge1xuICB6MDogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTJQcm9qZWN0IHtcbiAgaWQ6IE0yUHJvamVjdElkO1xuICBuYW1lOiBzdHJpbmc7XG4gIHN1YnRpdGxlOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBraW5kOiBTdHJ1Y3R1cmVLaW5kO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgcnVsZXM6IEJ1aWxkaW5nUnVsZXM7XG4gIGNvc3Q6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIGRvb3I/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGFwcHJvYWNoPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICB0ZXJyYWNlcz86IG51bWJlcjtcbiAgcHJlcDogUHJlcGFyYXRpb25PcHRpb25zO1xuICBnaG9zdEJhbmRzPzogcmVhZG9ubHkgTTJHaG9zdEJhbmRbXTtcbn1cblxuY29uc3QgcGF0aFJlY3QgPSBtMDAyUGF0aFJlY3QoKTtcbmNvbnN0IHBhdGhUYXJnZXRzOiBDb2x1bW5UYXJnZXRbXSA9IG0wMDJQYXRoVGFyZ2V0cygpO1xuY29uc3QgZmFybVRhcmdldHM6IENvbHVtblRhcmdldFtdID0gbTAwMkZhcm1UYXJnZXRzKCk7XG5cbi8qKlxuICogVGhlIGZpcnN0IHBsYXlhYmxlIHNsaWNlIGluIHRoZSBwaW5uZWQgb3JkZXI6IGEgaG91c2Ugb24gdGhlIHByZXBhcmVkIHNoZWxmLFxuICogYSBzdGVwcGVkIHBhdGggZnJvbSBpdHMgZG9vciwgYW5kIGEgdGVycmFjZWQgZmllbGQgb24gdGhlIHNsb3BlIGJlbG93LlxuICovXG5leHBvcnQgY29uc3QgTTJfUFJPSkVDVFM6IHJlYWRvbmx5IE0yUHJvamVjdFtdID0gW1xuICB7XG4gICAgaWQ6ICdob3VzZScsXG4gICAgbmFtZTogXCJGb3VuZGVyJ3MgaG91c2VcIixcbiAgICBzdWJ0aXRsZTogJzggeCA2IG0gXHUwMEI3IGZsYXQgc3RvbmUgc2hlbGYnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSAxOS1tb2R1bGUgZm91bmRlciBjYW5kaWRhdGUgdXNlcyBhIGZsYXQgc3RvbmUgZm91bmRhdGlvbiwgYSAzLjIgbSBzdG9yZXksIGEgcmVhbCBlYXN0IGRvb3J3YXkgJ1xuICAgICAgKyAnYW5kIHR3byBvcGVuIHNvdXRoIHdpbmRvd3MuIFN0cnVjdHVyYWwgd2FsbCB2b2lkcyByZXF1aXJlIG1vcmUgcHJpbWl0aXZlcyB0aGFuIHRoZSBwcm92aXNpb25hbCAnXG4gICAgICArICdhc3NldC12b2x1bWUgdGFyZ2V0OyB0aGlzIGRlc2lnbiByZW1haW5zIHN1YmplY3QgdG8gYXJ0IHJldmlldy4nLFxuICAgIHNpdGVJZDogTTAwMl9MQVlPVVQuaG91c2UuaWQsXG4gICAga2luZDogJ2hvdXNlJyxcbiAgICByZWN0OiBNMDAyX0xBWU9VVC5ob3VzZS5yZWN0LFxuICAgIGZsb29yWTogTTAwMl9MQVlPVVQuaG91c2UuZmxvb3JZLFxuICAgIHJ1bGVzOiBIT1VTRV9SVUxFUyxcbiAgICBjb3N0OiB7IC4uLkhPVVNFX0NPU1QgfSxcbiAgICBkb29yOiBNMDAyX0xBWU9VVC5ob3VzZS5kb29yLFxuICAgIGFwcHJvYWNoOiBNMDAyX0xBWU9VVC5ob3VzZS5hcHByb2FjaCxcbiAgICBwcmVwOiB7fSxcbiAgfSxcbiAge1xuICAgIGlkOiAncGF0aCcsXG4gICAgbmFtZTogJ0Rvb3IgcGF0aCcsXG4gICAgc3VidGl0bGU6ICc5IHggMyBtIFx1MDBCNyBzdGVwcGVkIGdyYXZlbCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnQSBuaW5lLW1ldHJlIGNvcnJpZG9yIGZyb20gdGhlIGhvdXNlIGRvb3IgdG8gdGhlIGFwcHJvYWNoLiAnXG4gICAgICArICdFYWNoIGNvbHVtbiBpcyBjdXQgdG8gYSBwaW5uZWQgcHJvZmlsZSBzbyB0aGUgcmlzZSBzdGF5cyB3YWxrYWJsZS4nLFxuICAgIHNpdGVJZDogTTAwMl9QQVRIX1NJVEVfSUQsXG4gICAga2luZDogJ3BhdGgnLFxuICAgIHJlY3Q6IHBhdGhSZWN0LFxuICAgIGZsb29yWTogMTIsXG4gICAgcnVsZXM6IFBBVEhfUlVMRVMsXG4gICAgY29zdDogcGF0aENvc3QocGF0aFJlY3QueDEgLSBwYXRoUmVjdC54MCArIDEpLFxuICAgIHByZXA6IHtcbiAgICAgIHRhcmdldHM6IHBhdGhUYXJnZXRzLFxuICAgICAgc3VyZmFjZU1hdGVyaWFsOiBNQVQuR1JBVkVMLFxuICAgICAgZW52ZWxvcGU6IFtNMDAyX0xBWU9VVC5lbnZlbG9wZVsxXV0sXG4gICAgfSxcbiAgfSxcbiAge1xuICAgIGlkOiAnZmFybScsXG4gICAgbmFtZTogJ1RlcnJhY2VkIGZpZWxkJyxcbiAgICBzdWJ0aXRsZTogJzEyIHggOCBtIFx1MDBCNyB0aHJlZSBiYW5kcycsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhyZWUgc29pbCB0ZXJyYWNlcyBzdGVwcGluZyBkb3duIHRoZSBzbG9wZSwgaGVsZCBieSBzdG9uZSByZXRhaW5pbmcgd2FsbHMuICdcbiAgICAgICsgJ1RoZSBibG9zc29tIHRyZWUgb24gdGhlIGZpZWxkIGlzIGNsZWFyZWQgZHVyaW5nIHByZXBhcmF0aW9uLicsXG4gICAgc2l0ZUlkOiBNMDAyX0xBWU9VVC5mYXJtLmlkLFxuICAgIGtpbmQ6ICd0ZXJyYWNlJyxcbiAgICByZWN0OiBNMDAyX0xBWU9VVC5mYXJtLnJlY3QsXG4gICAgZmxvb3JZOiAxNSxcbiAgICBydWxlczogRkFSTV9SVUxFUyxcbiAgICBjb3N0OiB7IC4uLlRFUlJBQ0VfQ09TVCB9LFxuICAgIHRlcnJhY2VzOiBNMDAyX0xBWU9VVC5mYXJtLnRlcnJhY2VzLFxuICAgIHByZXA6IHtcbiAgICAgIHRhcmdldHM6IGZhcm1UYXJnZXRzLFxuICAgICAgc3VyZmFjZU1hdGVyaWFsOiBNQVQuU09JTCxcbiAgICAgIGVudmVsb3BlOiBbTTAwMl9MQVlPVVQuZW52ZWxvcGVbMl1dLFxuICAgIH0sXG4gICAgZ2hvc3RCYW5kczogTTAwMl9URVJSQUNFX0JBTkRTLFxuICB9LFxuXTtcblxuZXhwb3J0IGZ1bmN0aW9uIHByb2plY3RCeUlkKGlkOiBNMlByb2plY3RJZCk6IE0yUHJvamVjdCB7XG4gIGNvbnN0IHByb2plY3QgPSBNMl9QUk9KRUNUUy5maW5kKChwKSA9PiBwLmlkID09PSBpZCk7XG4gIGlmICghcHJvamVjdCkgdGhyb3cgbmV3IEVycm9yKGB1bmtub3duIE0wMDIgcHJvamVjdDogJHtpZH1gKTtcbiAgcmV0dXJuIHByb2plY3Q7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm9qZWN0U2l0ZVByb3Bvc2FsKHByb2plY3Q6IE0yUHJvamVjdCk6IFNpdGVQcm9wb3NhbCB7XG4gIHJldHVybiB7XG4gICAgc2l0ZUlkOiBwcm9qZWN0LnNpdGVJZCxcbiAgICByZWN0OiBwcm9qZWN0LnJlY3QsXG4gICAgZmxvb3JZOiBwcm9qZWN0LmZsb29yWSxcbiAgICBydWxlczogcHJvamVjdC5ydWxlcyxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb2plY3RTdHJ1Y3R1cmVQcm9wb3NhbChcbiAgcHJvamVjdDogTTJQcm9qZWN0LCBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbixcbik6IFN0cnVjdHVyZVByb3Bvc2FsIHtcbiAgcmV0dXJuIHtcbiAgICBzaXRlSWQ6IHByb2plY3Quc2l0ZUlkLFxuICAgIGtpbmQ6IHByb2plY3Qua2luZCxcbiAgICByZWN0OiBwcm9qZWN0LnJlY3QsXG4gICAgZmxvb3JZOiBwcm9qZWN0LmZsb29yWSxcbiAgICBkb29yOiBwcm9qZWN0LmRvb3IsXG4gICAgYXBwcm9hY2g6IHByb2plY3QuYXBwcm9hY2gsXG4gICAgdGVycmFjZXM6IHByb2plY3QudGVycmFjZXMsXG4gICAgLi4uKGRlc2lnblZlcnNpb24gPT09IHVuZGVmaW5lZCA/IHt9IDogeyBkZXNpZ25WZXJzaW9uIH0pLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNQcm9qZWN0QnVpbHQod29ybGQ6IFdvcmxkLCBwcm9qZWN0OiBNMlByb2plY3QpOiBib29sZWFuIHtcbiAgZm9yIChjb25zdCBzdHJ1Y3R1cmUgb2Ygd29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKSkge1xuICAgIGlmIChzdHJ1Y3R1cmUuc2l0ZUlkID09PSBwcm9qZWN0LnNpdGVJZCAmJiBzdHJ1Y3R1cmUua2luZCA9PT0gcHJvamVjdC5raW5kKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2luZ1Jlc291cmNlIHtcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZTtcbiAgbmVlZDogbnVtYmVyO1xuICBoYXZlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtaXNzaW5nUmVzb3VyY2VzKHdvcmxkOiBXb3JsZCwgcHJvamVjdDogTTJQcm9qZWN0KTogTWlzc2luZ1Jlc291cmNlW10ge1xuICBjb25zdCBtaXNzaW5nOiBNaXNzaW5nUmVzb3VyY2VbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhwcm9qZWN0LmNvc3QpKSB7XG4gICAgY29uc3QgbmVlZCA9IGFtb3VudCA/PyAwO1xuICAgIGNvbnN0IGhhdmUgPSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDA7XG4gICAgaWYgKGhhdmUgPCBuZWVkKSBtaXNzaW5nLnB1c2goeyByZXNvdXJjZTogcmVzb3VyY2UgYXMgUmVzb3VyY2VUeXBlLCBuZWVkLCBoYXZlIH0pO1xuICB9XG4gIHJldHVybiBtaXNzaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb2plY3RJbnNwZWN0aW9uIHtcbiAgcHJvamVjdElkOiBNMlByb2plY3RJZDtcbiAgYnVpbHQ6IGJvb2xlYW47XG4gIGFmZm9yZGFibGU6IGJvb2xlYW47XG4gIG1pc3Npbmc6IE1pc3NpbmdSZXNvdXJjZVtdO1xuICBzdGF0ZTogU2l0ZVN0YXRlO1xuICByZWFzb25zOiBWYWxpZGF0aW9uUmVhc29uW107XG4gIHByZXZpZXc6IFNpdGVQcmV2aWV3O1xuICBwbGFuOiBQbGFuUmVzdWx0O1xuICBjYW5CdWlsZDogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBSZWFkLW9ubHkgaW5zcGVjdGlvbiBmb3IgdGhlIGdob3N0IGFuZCBzaWRlYmFyLiBJdCBydW5zIHRoZSBzYW1lIHZhbGlkYXRvclxuICogYW5kIHRoZSBzYW1lIHByZXBhcmF0aW9uIHBsYW5uZXIgdGhlIGJ1aWxkIGJ1dHRvbiB3aWxsIHJ1bi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluc3BlY3RQcm9qZWN0KHdvcmxkOiBXb3JsZCwgcHJvamVjdDogTTJQcm9qZWN0KTogUHJvamVjdEluc3BlY3Rpb24ge1xuICBjb25zdCBwcm9wb3NhbCA9IHByb2plY3RTaXRlUHJvcG9zYWwocHJvamVjdCk7XG4gIGNvbnN0IHByZXZpZXcgPSBwcmV2aWV3U2l0ZSh3b3JsZCwgcHJvcG9zYWwsIHtcbiAgICBkb29yOiBwcm9qZWN0LmRvb3IsXG4gICAgYXBwcm9hY2g6IHByb2plY3QuYXBwcm9hY2gsXG4gIH0pO1xuICBjb25zdCBwbGFuID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBwcm9wb3NhbCwgcHJvamVjdC5wcmVwKTtcbiAgY29uc3QgYnVpbHQgPSBpc1Byb2plY3RCdWlsdCh3b3JsZCwgcHJvamVjdCk7XG4gIGNvbnN0IG1pc3NpbmcgPSBtaXNzaW5nUmVzb3VyY2VzKHdvcmxkLCBwcm9qZWN0KTtcbiAgY29uc3Qgc3RhdGUgPSBwbGFuLm9rID8gcGxhbi52YWxpZGF0aW9uLnN0YXRlIDogcHJldmlldy5zdGF0ZTtcbiAgY29uc3QgcmVhc29ucyA9IHBsYW4ub2sgPyBwbGFuLnZhbGlkYXRpb24ucmVhc29ucyA6IHByZXZpZXcucmVhc29ucztcblxuICByZXR1cm4ge1xuICAgIHByb2plY3RJZDogcHJvamVjdC5pZCxcbiAgICBidWlsdCxcbiAgICBhZmZvcmRhYmxlOiBtaXNzaW5nLmxlbmd0aCA9PT0gMCxcbiAgICBtaXNzaW5nLFxuICAgIHN0YXRlLFxuICAgIHJlYXNvbnMsXG4gICAgcHJldmlldyxcbiAgICBwbGFuLFxuICAgIGNhbkJ1aWxkOiAhYnVpbHQgJiYgbWlzc2luZy5sZW5ndGggPT09IDAgJiYgcGxhbi5vayAmJiBzdGF0ZSAhPT0gJ2ludmFsaWQnLFxuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb2plY3RCdWlsZFN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcHJvamVjdDogTTJQcm9qZWN0O1xuICBwcmVwYXJhdGlvbjogUHJlcGFyYXRpb25MZWRnZXI7XG4gIHN0cnVjdHVyZTogU3RydWN0dXJlTGVkZ2VyO1xuICByZWNvcmQ6IFN0cnVjdHVyZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9qZWN0QnVpbGRGYWlsdXJlIHtcbiAgb2s6IGZhbHNlO1xuICBwcm9qZWN0OiBNMlByb2plY3Q7XG4gIHN0YWdlOiAncHJlY2hlY2snIHwgJ3ByZXBhcmUnIHwgJ3N0cnVjdHVyZSc7XG4gIGNvZGU6IHN0cmluZztcbiAgcmVhc29uczogc3RyaW5nW107XG4gIHByZXBhcmF0aW9uPzogUHJlcGFyYXRpb25MZWRnZXI7XG4gIC8qKiBGYWlsZWQgYnVpbGRzIHJvbGwgYmFjayB0aGUgZW50aXJlIGF1dGhvcml0YXRpdmUgcHJlLWJ1aWxkIHNuYXBzaG90LiAqL1xuICBzdHJ1Y3R1cmVGYWlsdXJlUmV0YWluZWQ6IGZhbHNlO1xuICByZXRyeWFibGU6IHRydWU7XG59XG5cbmV4cG9ydCB0eXBlIFByb2plY3RCdWlsZFJlc3VsdCA9IFByb2plY3RCdWlsZFN1Y2Nlc3MgfCBQcm9qZWN0QnVpbGRGYWlsdXJlO1xuXG4vKipcbiAqIFByZXBhcmUgdGhlIHNpdGUgYW5kIGNvbnN0cnVjdCB0aGUgcHJvamVjdCB0aHJvdWdoIHRoZSBhdXRob3JpemVkIHBpcGVsaW5lLlxuICogVGhlIHJlc291cmNlIGNoZWNrIGhhcHBlbnMgYmVmb3JlIGFueSB0ZXJyYWluIGVkaXQsIHNvIGFuIHVuYWZmb3JkYWJsZSBidWlsZFxuICogY2Fubm90IGxlYXZlIGEgZ3JhZGVkIHBhZCBiZWhpbmQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFByb2plY3QoXG4gIHdvcmxkOiBXb3JsZCxcbiAgcHJlcEF1dGhvcml6ZXI6IExvY2FsQXV0aG9yaXplcixcbiAgc3RydWN0dXJlQXV0aG9yaXplcjogTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyLFxuICBwcm9qZWN0OiBNMlByb2plY3QsXG4gIGRlc2lnblZlcnNpb24/OiBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uLFxuKTogUHJvamVjdEJ1aWxkUmVzdWx0IHtcbiAgaWYgKGlzUHJvamVjdEJ1aWx0KHdvcmxkLCBwcm9qZWN0KSkge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsIHByb2plY3QsIHN0YWdlOiAncHJlY2hlY2snLCBjb2RlOiAnYWxyZWFkeV9idWlsdCcsXG4gICAgICByZWFzb25zOiBbYCR7cHJvamVjdC5uYW1lfSBpcyBhbHJlYWR5IGJ1aWx0YF0sXG4gICAgICBzdHJ1Y3R1cmVGYWlsdXJlUmV0YWluZWQ6IGZhbHNlLCByZXRyeWFibGU6IHRydWUsXG4gICAgfTtcbiAgfVxuICBjb25zdCBtaXNzaW5nID0gbWlzc2luZ1Jlc291cmNlcyh3b3JsZCwgcHJvamVjdCk7XG4gIGlmIChtaXNzaW5nLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLCBwcm9qZWN0LCBzdGFnZTogJ3ByZWNoZWNrJywgY29kZTogJ2luc3VmZmljaWVudF9yZXNvdXJjZXMnLFxuICAgICAgcmVhc29uczogbWlzc2luZy5tYXAoKG0pID0+IGBuZWVkICR7bS5uZWVkfSAke20ucmVzb3VyY2V9LCBoYXZlICR7bS5oYXZlfWApLFxuICAgICAgc3RydWN0dXJlRmFpbHVyZVJldGFpbmVkOiBmYWxzZSwgcmV0cnlhYmxlOiB0cnVlLFxuICAgIH07XG4gIH1cblxuICBjb25zdCBiZWZvcmUgPSBjcmVhdGVXb3JsZFNuYXBzaG90KHdvcmxkLCAwKTtcbiAgY29uc3QgcHJlcGFyZWQgPSBwcmVwYXJlU2l0ZSh3b3JsZCwgcHJlcEF1dGhvcml6ZXIsIHByb2plY3RTaXRlUHJvcG9zYWwocHJvamVjdCksIHByb2plY3QucHJlcCk7XG4gIGlmICghcHJlcGFyZWQub2spIHtcbiAgICByZXN0b3JlV29ybGRTbmFwc2hvdCh3b3JsZCwgYmVmb3JlKTtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLCBwcm9qZWN0LCBzdGFnZTogJ3ByZXBhcmUnLCBjb2RlOiBwcmVwYXJlZC5jb2RlLFxuICAgICAgcmVhc29uczogWy4uLnByZXBhcmVkLnJlYXNvbnMsICdObyBwcmVwYXJhdGlvbiwgcmVzb3VyY2Ugb3IgZW50aXR5IGNoYW5nZXMgd2VyZSByZXRhaW5lZC4nXSxcbiAgICAgIHN0cnVjdHVyZUZhaWx1cmVSZXRhaW5lZDogZmFsc2UsIHJldHJ5YWJsZTogdHJ1ZSxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgYnVpbHQgPSBidWlsZFN0cnVjdHVyZSh3b3JsZCwgc3RydWN0dXJlQXV0aG9yaXplciwgcHJvamVjdFN0cnVjdHVyZVByb3Bvc2FsKHByb2plY3QsIGRlc2lnblZlcnNpb24pKTtcbiAgaWYgKCFidWlsdC5vaykge1xuICAgIHJlc3RvcmVXb3JsZFNuYXBzaG90KHdvcmxkLCBiZWZvcmUpO1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsIHByb2plY3QsIHN0YWdlOiAnc3RydWN0dXJlJywgY29kZTogYnVpbHQuY29kZSxcbiAgICAgIHJlYXNvbnM6IFsuLi5idWlsdC5yZWFzb25zLFxuICAgICAgICAnQWxsIHByZXBhcmF0aW9uLCByZXNvdXJjZSBhbmQgZW50aXR5IGNoYW5nZXMgd2VyZSByb2xsZWQgYmFjazsgdGhlIGJ1aWxkIGNhbiBiZSByZXRyaWVkLiddLFxuICAgICAgc3RydWN0dXJlRmFpbHVyZVJldGFpbmVkOiBmYWxzZSwgcmV0cnlhYmxlOiB0cnVlLFxuICAgIH07XG4gIH1cblxuICBjb25zdCByZWNvcmQgPSB3b3JsZC5zdHJ1Y3R1cmVzLmdldChidWlsdC5sZWRnZXIuc3RydWN0dXJlSWQpO1xuICBpZiAoIXJlY29yZCkge1xuICAgIHJlc3RvcmVXb3JsZFNuYXBzaG90KHdvcmxkLCBiZWZvcmUpO1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsIHByb2plY3QsIHN0YWdlOiAnc3RydWN0dXJlJywgY29kZTogJ21pc3NpbmdfcmVjb3JkJyxcbiAgICAgIHJlYXNvbnM6IFsnc3RydWN0dXJlIGxlZGdlciB3YXMgd3JpdHRlbiBidXQgdGhlIHdvcmxkIGhhcyBubyByZWNvcmQnLFxuICAgICAgICAnQWxsIHByZXBhcmF0aW9uLCByZXNvdXJjZSBhbmQgZW50aXR5IGNoYW5nZXMgd2VyZSByb2xsZWQgYmFjazsgdGhlIGJ1aWxkIGNhbiBiZSByZXRyaWVkLiddLFxuICAgICAgc3RydWN0dXJlRmFpbHVyZVJldGFpbmVkOiBmYWxzZSwgcmV0cnlhYmxlOiB0cnVlLFxuICAgIH07XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG9rOiB0cnVlLFxuICAgIHByb2plY3QsXG4gICAgcHJlcGFyYXRpb246IHByZXBhcmVkLmxlZGdlcixcbiAgICBzdHJ1Y3R1cmU6IGJ1aWx0LmxlZGdlcixcbiAgICByZWNvcmQsXG4gIH07XG59XG4iLCAiLy8gVGhlIHNvbGUgd3JpdGUgYm91bmRhcnkgZm9yIHRoZSBwbGF5YWJsZSBNMDAyIHNsaWNlLiBBY2NlcHRlZCBjb21tYW5kcyBhcmVcbi8vIGR1cmFibGUgaW5wdXQ7IHJlamVjdGVkIGF0dGVtcHRzLCByZW5kZXJlciB3b3JrIGFuZCB0ZXJyYWluIHF1ZXJpZXMgYXJlIG5vdC5cbmltcG9ydCB7XG4gIFJlc291cmNlVHlwZSwgV29ybGQsIGNyZWF0ZVdvcmxkLCBnZW5lcmF0ZVdvcmxkLCBoYXJ2ZXN0RW50aXR5LCBwbGFjZUF1dGhvcmVkU2l0ZXMsXG4gIHJldGlyZVN0b25lRW50aXRpZXMsIGlzUmV0aXJlZFN0b25lS2luZCwgR0VORVJBVE9SX1ZFUlNJT04sIEdFTkVSQVRPUl9WMixcbn0gZnJvbSAnLi4vc2ltL3dvcmxkJztcbmltcG9ydCB7IE0wMDJfTEFZT1VUIH0gZnJvbSAnLi4vc2ltL20wMDInO1xuaW1wb3J0IHsgTG9jYWxBdXRob3JpemVyIH0gZnJvbSAnLi4vc2ltL3ByZXBhcmF0aW9uJztcbmltcG9ydCB7IExvY2FsU3RydWN0dXJlQXV0aG9yaXplciwgRk9VTkRFUl9ERVNJR05fVkVSU0lPTiB9IGZyb20gJy4uL3NpbS9zdHJ1Y3R1cmVzJztcbmltcG9ydCB7IE0wMDJfU1RBUlRFUl9JTlZFTlRPUlkgfSBmcm9tICcuLi9zaW0vc2NlbmFyaW8nO1xuaW1wb3J0IHtcbiAgV29ybGRTbmFwc2hvdCwgY2Fub25pY2FsV29ybGRIYXNoLCBjcmVhdGVXb3JsZFNuYXBzaG90LFxuICBsZWdhY3lTdG9uZUhhc2gsIG1pZ3JhdGVTdG9uZVNuYXBzaG90LCByZXN0b3JlV29ybGRTbmFwc2hvdEV4YWN0LCB2YWxpZGF0ZVdvcmxkU25hcHNob3QsIHdvcmxkRnJvbVNuYXBzaG90LFxufSBmcm9tICcuLi9zaW0vc25hcHNob3QnO1xuaW1wb3J0IHsgZW5hYmxlU3RvbmVSZXBsYXksIGZpbmlzaFN0b25lUmVwbGF5IH0gZnJvbSAnLi4vc2ltL3N0b25lLWNvbXBhdCc7XG5pbXBvcnQgeyBNMlByb2plY3RJZCwgYnVpbGRQcm9qZWN0LCBwcm9qZWN0QnlJZCB9IGZyb20gJy4vcHJvamVjdHMnO1xuaW1wb3J0IHtcbiAgQ1JPUF9HUk9XVEhfVElDS1MsIENST1BfWUlFTEQsIEZPVU5ERVJfU1RPQ0tQSUxFX0lELCBMSUZFX1JFU09VUkNFUywgTUFYX1RJQ0tTX1BFUl9DT01NQU5ELCBMaWZlUmVzb3VyY2UsIExpZmVSZXNvdXJjZUJhZywgUkVDSVBFUywgUmVjaXBlSWQsXG4gIGFkdmFuY2VUaWNrcywgY3JlYXRlTGlmZVN0YXRlLCBoYXJ2ZXN0Q3JvcCwgcGxhbnRDcm9wLCBzdGFydFByb2R1Y3Rpb24sIHRyYW5zZmVyLFxufSBmcm9tICcuLi9zaW0vZWNvbm9teSc7XG5cbmV4cG9ydCBjb25zdCBKT1VSTkFMX1NDSEVNQSA9IDEgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgREVTSUdOX0pPVVJOQUxfU0NIRU1BID0gMiBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BID0gMyBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBNQVhfSk9VUk5BTF9FTlRSSUVTID0gMTAwXzAwMDtcbmV4cG9ydCB0eXBlIENvbW1hbmQgPSBMZWdhY3lCdWlsZENvbW1hbmQgfCBCdWlsZENvbW1hbmQgfCBIYXJ2ZXN0Q29tbWFuZFxuICB8IFRyYW5zZmVyQ29tbWFuZCB8IFByb2R1Y2VDb21tYW5kIHwgVGlja0NvbW1hbmQgfCBQbGFudENvbW1hbmQgfCBIYXJ2ZXN0Q3JvcENvbW1hbmQ7XG5pbnRlcmZhY2UgQ29tbWFuZEVudmVsb3BlIHtcbiAgc2NoZW1hOiB0eXBlb2YgQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQTtcbiAgaWQ6IHN0cmluZztcbiAgZXhwZWN0ZWRSZXZpc2lvbjogbnVtYmVyO1xufVxuZXhwb3J0IGludGVyZmFjZSBUcmFuc2ZlckNvbW1hbmQgZXh0ZW5kcyBDb21tYW5kRW52ZWxvcGUge1xuICB0eXBlOiAnZGVwb3NpdCcgfCAnd2l0aGRyYXcnO1xuICBzdG9ja3BpbGVJZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEO1xuICByZXNvdXJjZXM6IExpZmVSZXNvdXJjZUJhZztcbn1cbmV4cG9ydCBpbnRlcmZhY2UgUHJvZHVjZUNvbW1hbmQgZXh0ZW5kcyBDb21tYW5kRW52ZWxvcGUge1xuICB0eXBlOiAncHJvZHVjZSc7IHN0b2NrcGlsZUlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7IHJlY2lwZToga2V5b2YgdHlwZW9mIFJFQ0lQRVM7XG59XG5leHBvcnQgaW50ZXJmYWNlIFRpY2tDb21tYW5kIGV4dGVuZHMgQ29tbWFuZEVudmVsb3BlIHsgdHlwZTogJ3RpY2snOyB0aWNrczogbnVtYmVyOyB9XG5leHBvcnQgaW50ZXJmYWNlIFBsYW50Q29tbWFuZCBleHRlbmRzIENvbW1hbmRFbnZlbG9wZSB7IHR5cGU6ICdwbGFudCc7IHBsb3RJZDogc3RyaW5nOyB9XG5leHBvcnQgaW50ZXJmYWNlIEhhcnZlc3RDcm9wQ29tbWFuZCBleHRlbmRzIENvbW1hbmRFbnZlbG9wZSB7IHR5cGU6ICdoYXJ2ZXN0X2Nyb3AnOyBwbG90SWQ6IHN0cmluZzsgfVxuZXhwb3J0IGludGVyZmFjZSBMZWdhY3lCdWlsZENvbW1hbmQge1xuICBzY2hlbWE6IHR5cGVvZiBKT1VSTkFMX1NDSEVNQTtcbiAgaWQ6IHN0cmluZztcbiAgdHlwZTogJ2J1aWxkJztcbiAgcHJvamVjdElkOiBNMlByb2plY3RJZDtcbiAgZXhwZWN0ZWRSZXZpc2lvbjogbnVtYmVyO1xufVxuZXhwb3J0IGludGVyZmFjZSBCdWlsZENvbW1hbmQge1xuICBzY2hlbWE6IHR5cGVvZiBERVNJR05fSk9VUk5BTF9TQ0hFTUEgfCB0eXBlb2YgQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQTtcbiAgaWQ6IHN0cmluZztcbiAgdHlwZTogJ2J1aWxkJztcbiAgcHJvamVjdElkOiBNMlByb2plY3RJZDtcbiAgZXhwZWN0ZWRSZXZpc2lvbjogbnVtYmVyO1xuICBkZXNpZ25WZXJzaW9uOiB0eXBlb2YgRk9VTkRFUl9ERVNJR05fVkVSU0lPTjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgSGFydmVzdENvbW1hbmQge1xuICBzY2hlbWE6IHR5cGVvZiBKT1VSTkFMX1NDSEVNQSB8IHR5cGVvZiBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BO1xuICBpZDogc3RyaW5nO1xuICB0eXBlOiAnaGFydmVzdCc7XG4gIGVudGl0eUlkOiBzdHJpbmc7XG4gIGV4cGVjdGVkUmV2aXNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IHR5cGUgQ29tbWFuZE91dGNvbWUgPSBCdWlsZE91dGNvbWUgfCBIYXJ2ZXN0T3V0Y29tZSB8IFRyYW5zZmVyT3V0Y29tZSB8IFByb2R1Y2VPdXRjb21lIHwgVGlja091dGNvbWUgfCBQbGFudE91dGNvbWUgfCBDcm9wT3V0Y29tZTtcbmV4cG9ydCBpbnRlcmZhY2UgVHJhbnNmZXJPdXRjb21lIHtcbiAgdHlwZTogJ2RlcG9zaXQnIHwgJ3dpdGhkcmF3Jzsgc3RvY2twaWxlSWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgcmVzb3VyY2VzOiBQYXJ0aWFsPFJlY29yZDxMaWZlUmVzb3VyY2UsIG51bWJlcj4+O1xufVxuZXhwb3J0IGludGVyZmFjZSBQcm9kdWNlT3V0Y29tZSB7XG4gIHR5cGU6ICdwcm9kdWNlJzsgam9iSWQ6IHN0cmluZzsgc3RvY2twaWxlSWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgcmVjaXBlOiBrZXlvZiB0eXBlb2YgUkVDSVBFUzsgcmVtYWluaW5nVGlja3M6IG51bWJlcjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgVGlja091dGNvbWUge1xuICB0eXBlOiAndGljayc7IGZyb21UaWNrOiBudW1iZXI7IHRvVGljazogbnVtYmVyO1xuICBjb21wbGV0ZWRKb2JzOiBBcnJheTx7IGlkOiBzdHJpbmc7IHJlY2lwZToga2V5b2YgdHlwZW9mIFJFQ0lQRVM7IG91dHB1dDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB9PjtcbiAgcmVhZHlDcm9wczogc3RyaW5nW107XG59XG5leHBvcnQgaW50ZXJmYWNlIFBsYW50T3V0Y29tZSB7XG4gIHR5cGU6ICdwbGFudCc7IHBsb3RJZDogc3RyaW5nOyBwbGFudGVkVGljazogbnVtYmVyOyBncm93dGhUaWNrczogbnVtYmVyO1xufVxuZXhwb3J0IGludGVyZmFjZSBDcm9wT3V0Y29tZSB7XG4gIHR5cGU6ICdoYXJ2ZXN0X2Nyb3AnOyBwbG90SWQ6IHN0cmluZzsgcmVzb3VyY2VzOiB7IGZvb2Q6IG51bWJlcjsgZmliZXI6IG51bWJlciB9O1xufVxuZXhwb3J0IGludGVyZmFjZSBCdWlsZE91dGNvbWUge1xuICB0eXBlOiAnYnVpbGQnO1xuICBzdHJ1Y3R1cmVJZDogc3RyaW5nO1xuICBjb3N0UGFpZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgcmVzb3VyY2VzR2FpbmVkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xufVxuZXhwb3J0IGludGVyZmFjZSBIYXJ2ZXN0T3V0Y29tZSB7XG4gIHR5cGU6ICdoYXJ2ZXN0JztcbiAgZW50aXR5SWQ6IHN0cmluZztcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZTtcbiAgYW1vdW50OiBudW1iZXI7XG59XG5leHBvcnQgaW50ZXJmYWNlIEpvdXJuYWxFbnRyeSB7XG4gIGNvbW1hbmQ6IENvbW1hbmQ7XG4gIHNlcXVlbmNlOiBudW1iZXI7XG4gIHJldmlzaW9uOiBudW1iZXI7XG4gIGhhc2g6IHN0cmluZztcbiAgb3V0Y29tZTogQ29tbWFuZE91dGNvbWU7XG59XG5leHBvcnQgaW50ZXJmYWNlIENvbW1hbmRKb3VybmFsIHtcbiAgc2NoZW1hOiB0eXBlb2YgSk9VUk5BTF9TQ0hFTUEgfCB0eXBlb2YgREVTSUdOX0pPVVJOQUxfU0NIRU1BIHwgdHlwZW9mIENVUlJFTlRfSk9VUk5BTF9TQ0hFTUE7XG4gIHNlZWQ6IG51bWJlcjtcbiAgLyoqXG4gICAqIFRlcnJhaW4gZ2VuZXJhdG9yIG9mIHRoZSB3b3JsZCB0aGlzIGpvdXJuYWwgcmVwbGF5cyBvbi4gQWJzZW50IG1lYW5zIHYxOlxuICAgKiBldmVyeSBzYXZlIHdyaXR0ZW4gYmVmb3JlIGdlbmVyYXRvciB2MiBvbWl0cyB0aGUgZmllbGQsIHNvIGl0cyBjYW5vbmljYWxcbiAgICogYnl0ZXMgKGFuZCBoYXNoZXMpIGFyZSB1bmNoYW5nZWQuXG4gICAqL1xuICBnZW5lcmF0b3JWZXJzaW9uPzogdHlwZW9mIEdFTkVSQVRPUl9WMjtcbiAgc3RhcnRlckludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgZW50cmllczogSm91cm5hbEVudHJ5W107XG59XG5leHBvcnQgaW50ZXJmYWNlIENvbW1hbmRSZWNlaXB0IHtcbiAgb2s6IHRydWU7XG4gIGR1cGxpY2F0ZTogYm9vbGVhbjtcbiAgaWQ6IHN0cmluZztcbiAgc2VxdWVuY2U6IG51bWJlcjtcbiAgcmV2aXNpb246IG51bWJlcjtcbiAgaGFzaDogc3RyaW5nO1xuICBvdXRjb21lOiBDb21tYW5kT3V0Y29tZTtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgQ29tbWFuZFJlamVjdGlvbiB7XG4gIG9rOiBmYWxzZTtcbiAgZHVwbGljYXRlOiBmYWxzZTtcbiAgaWQ6IHN0cmluZztcbiAgY29kZTogc3RyaW5nO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZnVuY3Rpb24gb2JqZWN0KHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZSk7XG59XG5mdW5jdGlvbiB1aW50KHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzU2FmZUludGVnZXIodmFsdWUpICYmIHZhbHVlID49IDA7XG59XG5mdW5jdGlvbiBpZCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIHN0cmluZyB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIC9eW0EtWmEtejAtOV1bQS1aYS16MC05Ll86JS1dezAsMTI3fSQvLnRlc3QodmFsdWUpO1xufVxuZnVuY3Rpb24gZW50aXR5SWQodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBzdHJpbmcge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiB2YWx1ZS5sZW5ndGggPD0gMTI4XG4gICAgJiYgKC9eZTpcXGQrLFxcZCs6XFxkKyQvLnRlc3QodmFsdWUpXG4gICAgICB8fCAvXmhlcm86c3R5bF9bYS16X10rOi0/XFxkKzotP1xcZCskLy50ZXN0KHZhbHVlKSk7XG59XG5mdW5jdGlvbiBzYW1lRmllbGRzKGE6IHVua25vd24sIGI6IHVua25vd24pOiBib29sZWFuIHtcbiAgaWYgKG9iamVjdChhKSAmJiBvYmplY3QoYikpIHtcbiAgICBjb25zdCBhS2V5cyA9IE9iamVjdC5rZXlzKGEpLnNvcnQoKSwgYktleXMgPSBPYmplY3Qua2V5cyhiKS5zb3J0KCk7XG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGFLZXlzKSA9PT0gSlNPTi5zdHJpbmdpZnkoYktleXMpXG4gICAgICAmJiBhS2V5cy5ldmVyeSgoa2V5KSA9PiBzYW1lRmllbGRzKGFba2V5XSwgYltrZXldKSk7XG4gIH1cbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGEpID09PSBKU09OLnN0cmluZ2lmeShiKTtcbn1cblxuZnVuY3Rpb24gaW52ZW50b3J5KHZhbHVlOiB1bmtub3duKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gIGlmICghb2JqZWN0KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHJlc291cmNlIHJlY29yZCcpO1xuICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXModmFsdWUpLnNvcnQoKSkge1xuICAgIGlmICghTElGRV9SRVNPVVJDRVMuaW5jbHVkZXMoa2V5IGFzIExpZmVSZXNvdXJjZSlcbiAgICAgIHx8ICF1aW50KHZhbHVlW2tleV0pIHx8IHZhbHVlW2tleV0gPD0gMCB8fCB2YWx1ZVtrZXldID4gMV8wMDBfMDAwXzAwMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHJlc291cmNlIHJlY29yZCcpO1xuICAgIH1cbiAgICByZXN1bHRba2V5XSA9IHZhbHVlW2tleV07XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqIENhbm9uaWNhbGl6ZSBhbmQgcmVqZWN0IHVua25vd24sIGFtYmlndW91cyBvciBtYWxmb3JtZWQgY29tbWFuZCBmaWVsZHMuICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVDb21tYW5kKHZhbHVlOiB1bmtub3duKTogQ29tbWFuZCB7XG4gIGlmICghb2JqZWN0KHZhbHVlKSB8fCAodmFsdWUuc2NoZW1hICE9PSBKT1VSTkFMX1NDSEVNQSAmJiB2YWx1ZS5zY2hlbWEgIT09IERFU0lHTl9KT1VSTkFMX1NDSEVNQSAmJiB2YWx1ZS5zY2hlbWEgIT09IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEpXG4gICAgfHwgIWlkKHZhbHVlLmlkKSB8fCAhdWludCh2YWx1ZS5leHBlY3RlZFJldmlzaW9uKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGNvbW1hbmQgZW52ZWxvcGUnKTtcbiAgaWYgKHZhbHVlLnR5cGUgPT09ICdidWlsZCcgJiYgWydob3VzZScsICdwYXRoJywgJ2Zhcm0nXS5pbmNsdWRlcyhTdHJpbmcodmFsdWUucHJvamVjdElkKSkpIHtcbiAgICBjb25zdCBjb21tYW5kOiBDb21tYW5kID0gdmFsdWUuc2NoZW1hICE9PSBKT1VSTkFMX1NDSEVNQSA/IHtcbiAgICAgIHNjaGVtYTogdmFsdWUuc2NoZW1hLCBpZDogdmFsdWUuaWQsIHR5cGU6ICdidWlsZCcsXG4gICAgICBwcm9qZWN0SWQ6IHZhbHVlLnByb2plY3RJZCBhcyBNMlByb2plY3RJZCwgZXhwZWN0ZWRSZXZpc2lvbjogdmFsdWUuZXhwZWN0ZWRSZXZpc2lvbixcbiAgICAgIGRlc2lnblZlcnNpb246IHZhbHVlLmRlc2lnblZlcnNpb24gYXMgdHlwZW9mIEZPVU5ERVJfREVTSUdOX1ZFUlNJT04sXG4gICAgfSA6IHtcbiAgICAgIHNjaGVtYTogSk9VUk5BTF9TQ0hFTUEsIGlkOiB2YWx1ZS5pZCwgdHlwZTogJ2J1aWxkJyxcbiAgICAgIHByb2plY3RJZDogdmFsdWUucHJvamVjdElkIGFzIE0yUHJvamVjdElkLCBleHBlY3RlZFJldmlzaW9uOiB2YWx1ZS5leHBlY3RlZFJldmlzaW9uLFxuICAgIH07XG4gICAgaWYgKGNvbW1hbmQuc2NoZW1hICE9PSBKT1VSTkFMX1NDSEVNQSAmJiBjb21tYW5kLmRlc2lnblZlcnNpb24gIT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQgc3RydWN0dXJlIGRlc2lnbicpO1xuICAgIH1cbiAgICBpZiAoIXNhbWVGaWVsZHMoY29tbWFuZCwgdmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ25vbi1jYW5vbmljYWwgYnVpbGQgY29tbWFuZCcpO1xuICAgIHJldHVybiBjb21tYW5kO1xuICB9XG4gIGlmICh2YWx1ZS50eXBlID09PSAnaGFydmVzdCcgJiYgdmFsdWUuc2NoZW1hID09PSBKT1VSTkFMX1NDSEVNQSAmJiBlbnRpdHlJZCh2YWx1ZS5lbnRpdHlJZCkpIHtcbiAgICBjb25zdCBjb21tYW5kOiBDb21tYW5kID0ge1xuICAgICAgc2NoZW1hOiB2YWx1ZS5zY2hlbWEsIGlkOiB2YWx1ZS5pZCwgdHlwZTogJ2hhcnZlc3QnLFxuICAgICAgZW50aXR5SWQ6IHZhbHVlLmVudGl0eUlkLCBleHBlY3RlZFJldmlzaW9uOiB2YWx1ZS5leHBlY3RlZFJldmlzaW9uLFxuICAgIH07XG4gICAgaWYgKCFzYW1lRmllbGRzKGNvbW1hbmQsIHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGhhcnZlc3QgY29tbWFuZCcpO1xuICAgIHJldHVybiBjb21tYW5kO1xuICB9XG4gIGlmICh2YWx1ZS5zY2hlbWEgPT09IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEpIHtcbiAgICBjb25zdCBiYXNlID0geyBzY2hlbWE6IHZhbHVlLnNjaGVtYSwgaWQ6IHZhbHVlLmlkLCBleHBlY3RlZFJldmlzaW9uOiB2YWx1ZS5leHBlY3RlZFJldmlzaW9uIH07XG4gICAgbGV0IGNvbW1hbmQ6IENvbW1hbmQgfCBudWxsID0gbnVsbDtcbiAgICBpZiAodmFsdWUudHlwZSA9PT0gJ2hhcnZlc3QnICYmIGVudGl0eUlkKHZhbHVlLmVudGl0eUlkKSkge1xuICAgICAgY29tbWFuZCA9IHsgc2NoZW1hOiB2YWx1ZS5zY2hlbWEsIGlkOiB2YWx1ZS5pZCwgdHlwZTogdmFsdWUudHlwZSxcbiAgICAgICAgZW50aXR5SWQ6IHZhbHVlLmVudGl0eUlkLCBleHBlY3RlZFJldmlzaW9uOiB2YWx1ZS5leHBlY3RlZFJldmlzaW9uIH07XG4gICAgfSBlbHNlIGlmICgodmFsdWUudHlwZSA9PT0gJ2RlcG9zaXQnIHx8IHZhbHVlLnR5cGUgPT09ICd3aXRoZHJhdycpICYmIHZhbHVlLnN0b2NrcGlsZUlkID09PSBGT1VOREVSX1NUT0NLUElMRV9JRCkge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogdmFsdWUudHlwZSwgc3RvY2twaWxlSWQ6IHZhbHVlLnN0b2NrcGlsZUlkLCByZXNvdXJjZXM6IGludmVudG9yeSh2YWx1ZS5yZXNvdXJjZXMpIH07XG4gICAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAncHJvZHVjZScgJiYgdmFsdWUuc3RvY2twaWxlSWQgPT09IEZPVU5ERVJfU1RPQ0tQSUxFX0lEXG4gICAgICAmJiAodmFsdWUucmVjaXBlID09PSAnc2VlZCcgfHwgdmFsdWUucmVjaXBlID09PSAncmF0aW9ucycpKSB7XG4gICAgICBjb21tYW5kID0geyAuLi5iYXNlLCB0eXBlOiB2YWx1ZS50eXBlLCBzdG9ja3BpbGVJZDogdmFsdWUuc3RvY2twaWxlSWQsIHJlY2lwZTogdmFsdWUucmVjaXBlIH07XG4gICAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAndGljaycgJiYgdWludCh2YWx1ZS50aWNrcykgJiYgdmFsdWUudGlja3MgPiAwICYmIHZhbHVlLnRpY2tzIDw9IE1BWF9USUNLU19QRVJfQ09NTUFORCkge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogdmFsdWUudHlwZSwgdGlja3M6IHZhbHVlLnRpY2tzIH07XG4gICAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAncGxhbnQnICYmIHR5cGVvZiB2YWx1ZS5wbG90SWQgPT09ICdzdHJpbmcnICYmIC9eY3JvcDpbMC04XSQvLnRlc3QodmFsdWUucGxvdElkKSkge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogdmFsdWUudHlwZSwgcGxvdElkOiB2YWx1ZS5wbG90SWQgfTtcbiAgICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICdoYXJ2ZXN0X2Nyb3AnICYmIHR5cGVvZiB2YWx1ZS5wbG90SWQgPT09ICdzdHJpbmcnICYmIC9eY3JvcDpbMC04XSQvLnRlc3QodmFsdWUucGxvdElkKSkge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogdmFsdWUudHlwZSwgcGxvdElkOiB2YWx1ZS5wbG90SWQgfTtcbiAgICB9XG4gICAgaWYgKGNvbW1hbmQpIHtcbiAgICAgIGlmICghc2FtZUZpZWxkcyhjb21tYW5kLCB2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBsaWZlLWxvb3AgY29tbWFuZCcpO1xuICAgICAgcmV0dXJuIGNvbW1hbmQ7XG4gICAgfVxuICB9XG4gIHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQgY29tbWFuZCcpO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZU91dGNvbWUodmFsdWU6IHVua25vd24pOiBDb21tYW5kT3V0Y29tZSB7XG4gIGlmICghb2JqZWN0KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGNvbW1hbmQgb3V0Y29tZScpO1xuICBpZiAodmFsdWUudHlwZSA9PT0gJ2J1aWxkJyAmJiBpZCh2YWx1ZS5zdHJ1Y3R1cmVJZCkpIHtcbiAgICBjb25zdCBvdXRjb21lOiBDb21tYW5kT3V0Y29tZSA9IHtcbiAgICAgIHR5cGU6ICdidWlsZCcsIHN0cnVjdHVyZUlkOiB2YWx1ZS5zdHJ1Y3R1cmVJZCxcbiAgICAgIGNvc3RQYWlkOiBpbnZlbnRvcnkodmFsdWUuY29zdFBhaWQpLCByZXNvdXJjZXNHYWluZWQ6IGludmVudG9yeSh2YWx1ZS5yZXNvdXJjZXNHYWluZWQpLFxuICAgIH07XG4gICAgaWYgKEpTT04uc3RyaW5naWZ5KG91dGNvbWUpICE9PSBKU09OLnN0cmluZ2lmeSh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBidWlsZCBvdXRjb21lJyk7XG4gICAgcmV0dXJuIG91dGNvbWU7XG4gIH1cbiAgaWYgKHZhbHVlLnR5cGUgPT09ICdoYXJ2ZXN0JyAmJiBlbnRpdHlJZCh2YWx1ZS5lbnRpdHlJZClcbiAgICAmJiBbJ3dvb2QnLCAnc3RvbmUnLCAnb3JlJywgJ2ZpYmVyJ10uaW5jbHVkZXMoU3RyaW5nKHZhbHVlLnJlc291cmNlKSlcbiAgICAmJiB1aW50KHZhbHVlLmFtb3VudCkgJiYgdmFsdWUuYW1vdW50ID4gMCAmJiB2YWx1ZS5hbW91bnQgPD0gMV8wMDBfMDAwKSB7XG4gICAgY29uc3Qgb3V0Y29tZTogQ29tbWFuZE91dGNvbWUgPSB7XG4gICAgICB0eXBlOiAnaGFydmVzdCcsIGVudGl0eUlkOiB2YWx1ZS5lbnRpdHlJZCxcbiAgICAgIHJlc291cmNlOiB2YWx1ZS5yZXNvdXJjZSBhcyBSZXNvdXJjZVR5cGUsIGFtb3VudDogdmFsdWUuYW1vdW50LFxuICAgIH07XG4gICAgaWYgKEpTT04uc3RyaW5naWZ5KG91dGNvbWUpICE9PSBKU09OLnN0cmluZ2lmeSh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBoYXJ2ZXN0IG91dGNvbWUnKTtcbiAgICByZXR1cm4gb3V0Y29tZTtcbiAgfVxuICBsZXQgb3V0Y29tZTogQ29tbWFuZE91dGNvbWUgfCBudWxsID0gbnVsbDtcbiAgaWYgKCh2YWx1ZS50eXBlID09PSAnZGVwb3NpdCcgfHwgdmFsdWUudHlwZSA9PT0gJ3dpdGhkcmF3JykgJiYgdmFsdWUuc3RvY2twaWxlSWQgPT09IEZPVU5ERVJfU1RPQ0tQSUxFX0lEKSB7XG4gICAgb3V0Y29tZSA9IHsgdHlwZTogdmFsdWUudHlwZSwgc3RvY2twaWxlSWQ6IHZhbHVlLnN0b2NrcGlsZUlkLCByZXNvdXJjZXM6IGludmVudG9yeSh2YWx1ZS5yZXNvdXJjZXMpIH07XG4gIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ3Byb2R1Y2UnICYmIGlkKHZhbHVlLmpvYklkKSAmJiB2YWx1ZS5zdG9ja3BpbGVJZCA9PT0gRk9VTkRFUl9TVE9DS1BJTEVfSURcbiAgICAmJiAodmFsdWUucmVjaXBlID09PSAnc2VlZCcgfHwgdmFsdWUucmVjaXBlID09PSAncmF0aW9ucycpICYmIHVpbnQodmFsdWUucmVtYWluaW5nVGlja3MpICYmIHZhbHVlLnJlbWFpbmluZ1RpY2tzID4gMCkge1xuICAgIG91dGNvbWUgPSB7IHR5cGU6IHZhbHVlLnR5cGUsIGpvYklkOiB2YWx1ZS5qb2JJZCwgc3RvY2twaWxlSWQ6IHZhbHVlLnN0b2NrcGlsZUlkLFxuICAgICAgcmVjaXBlOiB2YWx1ZS5yZWNpcGUsIHJlbWFpbmluZ1RpY2tzOiB2YWx1ZS5yZW1haW5pbmdUaWNrcyB9O1xuICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICdwbGFudCcgJiYgdHlwZW9mIHZhbHVlLnBsb3RJZCA9PT0gJ3N0cmluZycgJiYgL15jcm9wOlswLThdJC8udGVzdCh2YWx1ZS5wbG90SWQpXG4gICAgJiYgdWludCh2YWx1ZS5wbGFudGVkVGljaykgJiYgdmFsdWUuZ3Jvd3RoVGlja3MgPT09IENST1BfR1JPV1RIX1RJQ0tTKSB7XG4gICAgb3V0Y29tZSA9IHsgdHlwZTogdmFsdWUudHlwZSwgcGxvdElkOiB2YWx1ZS5wbG90SWQsIHBsYW50ZWRUaWNrOiB2YWx1ZS5wbGFudGVkVGljaywgZ3Jvd3RoVGlja3M6IHZhbHVlLmdyb3d0aFRpY2tzIH07XG4gIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ2hhcnZlc3RfY3JvcCcgJiYgdHlwZW9mIHZhbHVlLnBsb3RJZCA9PT0gJ3N0cmluZycgJiYgL15jcm9wOlswLThdJC8udGVzdCh2YWx1ZS5wbG90SWQpXG4gICAgJiYgaXNSZXNvdXJjZXModmFsdWUucmVzb3VyY2VzKSAmJiB2YWx1ZS5yZXNvdXJjZXMuZm9vZCA9PT0gQ1JPUF9ZSUVMRC5mb29kICYmIHZhbHVlLnJlc291cmNlcy5maWJlciA9PT0gQ1JPUF9ZSUVMRC5maWJlcikge1xuICAgIG91dGNvbWUgPSB7IHR5cGU6IHZhbHVlLnR5cGUsIHBsb3RJZDogdmFsdWUucGxvdElkLFxuICAgICAgcmVzb3VyY2VzOiB7IGZvb2Q6IENST1BfWUlFTEQuZm9vZCwgZmliZXI6IENST1BfWUlFTEQuZmliZXIgfSB9O1xuICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICd0aWNrJyAmJiB1aW50KHZhbHVlLmZyb21UaWNrKSAmJiB1aW50KHZhbHVlLnRvVGljaylcbiAgICAmJiB2YWx1ZS50b1RpY2sgPiB2YWx1ZS5mcm9tVGljayAmJiB2YWx1ZS50b1RpY2sgLSB2YWx1ZS5mcm9tVGljayA8PSBNQVhfVElDS1NfUEVSX0NPTU1BTkRcbiAgICAmJiBBcnJheS5pc0FycmF5KHZhbHVlLmNvbXBsZXRlZEpvYnMpICYmIEFycmF5LmlzQXJyYXkodmFsdWUucmVhZHlDcm9wcykpIHtcbiAgICBjb25zdCBjb21wbGV0ZWRKb2JzOiBBcnJheTx7IGlkOiBzdHJpbmc7IHJlY2lwZTogUmVjaXBlSWQ7IG91dHB1dDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB9PiA9IHZhbHVlLmNvbXBsZXRlZEpvYnMubWFwKChyYXc6IHVua25vd24pID0+IHtcbiAgICAgIGlmICghb2JqZWN0KHJhdykgfHwgIWlkKHJhdy5pZCkgfHwgKHJhdy5yZWNpcGUgIT09ICdzZWVkJyAmJiByYXcucmVjaXBlICE9PSAncmF0aW9ucycpKSB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgY29tcGxldGVkIGpvYicpO1xuICAgICAgcmV0dXJuIHsgaWQ6IHJhdy5pZCwgcmVjaXBlOiByYXcucmVjaXBlLCBvdXRwdXQ6IGludmVudG9yeShyYXcub3V0cHV0KSB9O1xuICAgIH0pO1xuICAgIGlmICghdmFsdWUucmVhZHlDcm9wcy5ldmVyeSgocGxvdCkgPT4gdHlwZW9mIHBsb3QgPT09ICdzdHJpbmcnICYmIC9eY3JvcDpbMC04XSQvLnRlc3QocGxvdCkpKSB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgcmVhZHkgY3JvcHMnKTtcbiAgICBvdXRjb21lID0geyB0eXBlOiB2YWx1ZS50eXBlLCBmcm9tVGljazogdmFsdWUuZnJvbVRpY2ssIHRvVGljazogdmFsdWUudG9UaWNrLFxuICAgICAgY29tcGxldGVkSm9icywgcmVhZHlDcm9wczogWy4uLnZhbHVlLnJlYWR5Q3JvcHNdIH07XG4gIH1cbiAgaWYgKG91dGNvbWUpIHtcbiAgICBpZiAoSlNPTi5zdHJpbmdpZnkob3V0Y29tZSkgIT09IEpTT04uc3RyaW5naWZ5KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGxpZmUtbG9vcCBvdXRjb21lJyk7XG4gICAgcmV0dXJuIG91dGNvbWU7XG4gIH1cbiAgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGNvbW1hbmQgb3V0Y29tZScpO1xufVxuXG5mdW5jdGlvbiBpc1Jlc291cmNlcyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICByZXR1cm4gb2JqZWN0KHZhbHVlKSAmJiBPYmplY3QudmFsdWVzKHZhbHVlKS5ldmVyeSgoYW1vdW50KSA9PiB1aW50KGFtb3VudCkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSm91cm5hbChcbiAgc2VlZCA9IDEzMzcsIHNjaGVtYTogQ29tbWFuZEpvdXJuYWxbJ3NjaGVtYSddID0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSwgZ2VuZXJhdG9yVmVyc2lvbiA9IEdFTkVSQVRPUl9WRVJTSU9OLFxuKTogQ29tbWFuZEpvdXJuYWwge1xuICBpZiAoZ2VuZXJhdG9yVmVyc2lvbiAhPT0gR0VORVJBVE9SX1ZFUlNJT04gJiYgc2NoZW1hICE9PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdsZWdhY3kgam91cm5hbCBzY2hlbWFzIG9ubHkgZXhpc3QgZm9yIGdlbmVyYXRvciB2MScpO1xuICB9XG4gIHJldHVybiB7XG4gICAgc2NoZW1hLCBzZWVkLFxuICAgIC4uLihnZW5lcmF0b3JWZXJzaW9uID09PSBHRU5FUkFUT1JfVjIgPyB7IGdlbmVyYXRvclZlcnNpb246IEdFTkVSQVRPUl9WMiB9IDoge30pLFxuICAgIHN0YXJ0ZXJJbnZlbnRvcnk6IGludmVudG9yeShNMDAyX1NUQVJURVJfSU5WRU5UT1JZKSwgZW50cmllczogW10sXG4gIH07XG59XG5cbi8qKiBHZW5lcmF0b3IgdmVyc2lvbiBhIGpvdXJuYWwgcmVwbGF5cyBvbiAoYWJzZW50IGZpZWxkID0gdjEpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGpvdXJuYWxHZW5lcmF0b3Ioam91cm5hbDogUGljazxDb21tYW5kSm91cm5hbCwgJ2dlbmVyYXRvclZlcnNpb24nPik6IG51bWJlciB7XG4gIHJldHVybiBqb3VybmFsLmdlbmVyYXRvclZlcnNpb24gPz8gR0VORVJBVE9SX1ZFUlNJT047XG59XG5cbi8qKiBWYWxpZGF0ZSBhbiBlbnRpcmUgam91cm5hbCB3aXRob3V0IGNoYW5naW5nIGEgbGl2ZSBzZXNzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlSm91cm5hbCh2YWx1ZTogdW5rbm93bik6IENvbW1hbmRKb3VybmFsIHtcbiAgaWYgKCFvYmplY3QodmFsdWUpIHx8ICh2YWx1ZS5zY2hlbWEgIT09IEpPVVJOQUxfU0NIRU1BICYmIHZhbHVlLnNjaGVtYSAhPT0gREVTSUdOX0pPVVJOQUxfU0NIRU1BICYmIHZhbHVlLnNjaGVtYSAhPT0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSlcbiAgICB8fCAhdWludCh2YWx1ZS5zZWVkKSB8fCB2YWx1ZS5zZWVkID4gMHhmZmZmZmZmZlxuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVudHJpZXMpIHx8IHZhbHVlLmVudHJpZXMubGVuZ3RoID4gTUFYX0pPVVJOQUxfRU5UUklFU1xuICAgIHx8ICdnZW5lcmF0b3JWZXJzaW9uJyBpbiB2YWx1ZSAmJiAodmFsdWUuZ2VuZXJhdG9yVmVyc2lvbiAhPT0gR0VORVJBVE9SX1YyIHx8IHZhbHVlLnNjaGVtYSAhPT0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgY29tbWFuZCBqb3VybmFsJyk7XG4gIH1cbiAgY29uc3Qgam91cm5hbDogQ29tbWFuZEpvdXJuYWwgPSB7XG4gICAgc2NoZW1hOiB2YWx1ZS5zY2hlbWEsIHNlZWQ6IHZhbHVlLnNlZWQsXG4gICAgLi4uKCdnZW5lcmF0b3JWZXJzaW9uJyBpbiB2YWx1ZSA/IHsgZ2VuZXJhdG9yVmVyc2lvbjogR0VORVJBVE9SX1YyIH0gOiB7fSksXG4gICAgc3RhcnRlckludmVudG9yeTogaW52ZW50b3J5KHZhbHVlLnN0YXJ0ZXJJbnZlbnRvcnkpLCBlbnRyaWVzOiBbXSxcbiAgfTtcbiAgY29uc3QgaWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdmFsdWUuZW50cmllcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHJhdyA9IHZhbHVlLmVudHJpZXNbaV07XG4gICAgaWYgKCFvYmplY3QocmF3KSB8fCByYXcuc2VxdWVuY2UgIT09IGkgfHwgIXVpbnQocmF3LnJldmlzaW9uKVxuICAgICAgfHwgdHlwZW9mIHJhdy5oYXNoICE9PSAnc3RyaW5nJyB8fCAhL15bMC05YS1mXXsxNn0kLy50ZXN0KHJhdy5oYXNoKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY29udGlndW91cyBvciBpbnZhbGlkIGpvdXJuYWwgZW50cnknKTtcbiAgICBjb25zdCBlbnRyeTogSm91cm5hbEVudHJ5ID0ge1xuICAgICAgY29tbWFuZDogdmFsaWRhdGVDb21tYW5kKHJhdy5jb21tYW5kKSwgc2VxdWVuY2U6IGksXG4gICAgICByZXZpc2lvbjogcmF3LnJldmlzaW9uLCBoYXNoOiByYXcuaGFzaCwgb3V0Y29tZTogdmFsaWRhdGVPdXRjb21lKHJhdy5vdXRjb21lKSxcbiAgICB9O1xuICAgIGlmICgoZW50cnkuY29tbWFuZC50eXBlID09PSAnYnVpbGQnIHx8IGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3QnKVxuICAgICAgJiYgZW50cnkuY29tbWFuZC5zY2hlbWEgIT09IHZhbHVlLnNjaGVtYSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdqb3VybmFsIHNjaGVtYSBhbmQgYnVpbGQgY29tbWFuZCBzY2hlbWEgZGlmZmVyJyk7XG4gICAgfVxuICAgIGlmIChKU09OLnN0cmluZ2lmeShlbnRyeSkgIT09IEpTT04uc3RyaW5naWZ5KHJhdykpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBqb3VybmFsIGVudHJ5Jyk7XG4gICAgaWYgKGlkcy5oYXMoZW50cnkuY29tbWFuZC5pZCkpIHRocm93IG5ldyBFcnJvcignZHVwbGljYXRlIGpvdXJuYWwgY29tbWFuZCBpZCcpO1xuICAgIGlmIChlbnRyeS5jb21tYW5kLnR5cGUgIT09IGVudHJ5Lm91dGNvbWUudHlwZVxuICAgICAgfHwgZW50cnkuY29tbWFuZC50eXBlID09PSAnaGFydmVzdCcgJiYgZW50cnkub3V0Y29tZS50eXBlID09PSAnaGFydmVzdCdcbiAgICAgICYmIGVudHJ5LmNvbW1hbmQuZW50aXR5SWQgIT09IGVudHJ5Lm91dGNvbWUuZW50aXR5SWRcbiAgICAgIHx8IChlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdwbGFudCcgfHwgZW50cnkuY29tbWFuZC50eXBlID09PSAnaGFydmVzdF9jcm9wJylcbiAgICAgICYmIGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gZW50cnkub3V0Y29tZS50eXBlICYmIGVudHJ5LmNvbW1hbmQucGxvdElkICE9PSBlbnRyeS5vdXRjb21lLnBsb3RJZFxuICAgICAgfHwgKGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2RlcG9zaXQnIHx8IGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ3dpdGhkcmF3JylcbiAgICAgICYmIGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gZW50cnkub3V0Y29tZS50eXBlXG4gICAgICAmJiAoZW50cnkuY29tbWFuZC5zdG9ja3BpbGVJZCAhPT0gZW50cnkub3V0Y29tZS5zdG9ja3BpbGVJZFxuICAgICAgICB8fCBKU09OLnN0cmluZ2lmeShlbnRyeS5jb21tYW5kLnJlc291cmNlcykgIT09IEpTT04uc3RyaW5naWZ5KGVudHJ5Lm91dGNvbWUucmVzb3VyY2VzKSlcbiAgICAgIHx8IGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ3Byb2R1Y2UnICYmIGVudHJ5Lm91dGNvbWUudHlwZSA9PT0gJ3Byb2R1Y2UnXG4gICAgICAmJiAoZW50cnkuY29tbWFuZC5zdG9ja3BpbGVJZCAhPT0gZW50cnkub3V0Y29tZS5zdG9ja3BpbGVJZCB8fCBlbnRyeS5jb21tYW5kLnJlY2lwZSAhPT0gZW50cnkub3V0Y29tZS5yZWNpcGUpXG4gICAgICB8fCBlbnRyeS5jb21tYW5kLnR5cGUgPT09ICd0aWNrJyAmJiBlbnRyeS5vdXRjb21lLnR5cGUgPT09ICd0aWNrJ1xuICAgICAgJiYgZW50cnkub3V0Y29tZS50b1RpY2sgLSBlbnRyeS5vdXRjb21lLmZyb21UaWNrICE9PSBlbnRyeS5jb21tYW5kLnRpY2tzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2pvdXJuYWwgY29tbWFuZCBhbmQgb3V0Y29tZSBkaXNhZ3JlZScpO1xuICAgIH1cbiAgICBpZHMuYWRkKGVudHJ5LmNvbW1hbmQuaWQpO1xuICAgIGpvdXJuYWwuZW50cmllcy5wdXNoKGVudHJ5KTtcbiAgfVxuICBpZiAoSlNPTi5zdHJpbmdpZnkoam91cm5hbCkgIT09IEpTT04uc3RyaW5naWZ5KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGNvbW1hbmQgam91cm5hbCcpO1xuICAvLyBUaGlzIHNsaWNlIGhhcyBvbmUgZGV0ZXJtaW5pc3RpYyBnZW5lc2lzIGNvbmZpZ3VyYXRpb24uIEEgY2hhbmdlZCBzdGFydGVyXG4gIC8vIGdyYW50IG11c3Qgbm90IHBhc3MgdW5ub3RpY2VkIHdoZW4gcmVwbGF5IGJlZ2lucyBmcm9tIGEgbGF0ZXIgc25hcHNob3QuXG4gIGlmIChKU09OLnN0cmluZ2lmeShqb3VybmFsLnN0YXJ0ZXJJbnZlbnRvcnkpICE9PSBKU09OLnN0cmluZ2lmeShjcmVhdGVKb3VybmFsKHZhbHVlLnNlZWQsIHZhbHVlLnNjaGVtYSwgam91cm5hbEdlbmVyYXRvcihqb3VybmFsKSkuc3RhcnRlckludmVudG9yeSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2pvdXJuYWwgc3RhcnRlciBpbnZlbnRvcnkgaXMgaW5jb21wYXRpYmxlIHdpdGggdGhpcyB2ZXJzaW9uJyk7XG4gIH1cbiAgcmV0dXJuIGpvdXJuYWw7XG59XG5cbmZ1bmN0aW9uIHJlZmVyZW5jZXNSZXRpcmVkU3RvbmUoZW50cnk6IEpvdXJuYWxFbnRyeSk6IGJvb2xlYW4ge1xuICByZXR1cm4gL15oZXJvOnN0eWxfcm9ja18oPzpzbWFsbHxtZWRpdW18bGFyZ2UpOi8udGVzdChcbiAgICBlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdoYXJ2ZXN0JyA/IGVudHJ5LmNvbW1hbmQuZW50aXR5SWQgOiBlbnRyeS5vdXRjb21lLnR5cGUgPT09ICdoYXJ2ZXN0JyA/IGVudHJ5Lm91dGNvbWUuZW50aXR5SWQgOiAnJyxcbiAgKTtcbn1cblxuZXhwb3J0IGNsYXNzIEdhbWVTZXNzaW9uIHtcbiAgcmVhZG9ubHkgam91cm5hbDogQ29tbWFuZEpvdXJuYWw7XG4gIHByaXZhdGUgcmVhZG9ubHkgcHJlcEF1dGhvcml6ZXI6IExvY2FsQXV0aG9yaXplcjtcbiAgcHJpdmF0ZSByZWFkb25seSBzdHJ1Y3R1cmVBdXRob3JpemVyOiBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXI7XG4gIHByaXZhdGUgcmVhZG9ubHkgaWRzID0gbmV3IE1hcDxzdHJpbmcsIEpvdXJuYWxFbnRyeT4oKTtcblxuICBwcml2YXRlIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHdvcmxkOiBXb3JsZCwgam91cm5hbDogQ29tbWFuZEpvdXJuYWwpIHtcbiAgICB0aGlzLmpvdXJuYWwgPSBqb3VybmFsO1xuICAgIGZvciAoY29uc3QgZW50cnkgb2Ygam91cm5hbC5lbnRyaWVzKSB0aGlzLmlkcy5zZXQoZW50cnkuY29tbWFuZC5pZCwgZW50cnkpO1xuICAgIHRoaXMucHJlcEF1dGhvcml6ZXIgPSBuZXcgTG9jYWxBdXRob3JpemVyKHsgZW52ZWxvcGU6IE0wMDJfTEFZT1VULmVudmVsb3BlIH0pO1xuICAgIHRoaXMuc3RydWN0dXJlQXV0aG9yaXplciA9IG5ldyBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIoeyBlbnZlbG9wZTogTTAwMl9MQVlPVVQuZW52ZWxvcGUgfSk7XG4gIH1cblxuICAvKiogQSBuZXcgY3VycmVudC1zY2hlbWEgd29ybGQuIGBnZW5lcmF0b3JWZXJzaW9uYCBkZWZhdWx0cyB0byB2MSBmb3IgQVBJIGNvbXBhdGliaWxpdHkuICovXG4gIHN0YXRpYyBnZW5lc2lzKHNlZWQgPSAxMzM3LCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04pOiBHYW1lU2Vzc2lvbiB7XG4gICAgcmV0dXJuIG5ldyBHYW1lU2Vzc2lvbihcbiAgICAgIGdlbmVzaXNXb3JsZChzZWVkLCBpbnZlbnRvcnkoTTAwMl9TVEFSVEVSX0lOVkVOVE9SWSksIENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEsIGdlbmVyYXRvclZlcnNpb24pLFxuICAgICAgY3JlYXRlSm91cm5hbChzZWVkLCBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BLCBnZW5lcmF0b3JWZXJzaW9uKSxcbiAgICApO1xuICB9XG5cbiAgLyoqIENvbXBhdGliaWxpdHkgZW50cnkgcG9pbnQgZm9yIHJlY29yZGVkIE0wMDIgZml4dHVyZXMgYW5kIHNhdmVkIHdvcmxkcy4gKi9cbiAgc3RhdGljIGxlZ2FjeUdlbmVzaXMoc2VlZCA9IDEzMzcsIHNjaGVtYTogdHlwZW9mIEpPVVJOQUxfU0NIRU1BIHwgdHlwZW9mIERFU0lHTl9KT1VSTkFMX1NDSEVNQSA9IEpPVVJOQUxfU0NIRU1BKTogR2FtZVNlc3Npb24ge1xuICAgIHJldHVybiBuZXcgR2FtZVNlc3Npb24oZ2VuZXNpc1dvcmxkKHNlZWQsIGludmVudG9yeShNMDAyX1NUQVJURVJfSU5WRU5UT1JZKSwgc2NoZW1hKSwgY3JlYXRlSm91cm5hbChzZWVkLCBzY2hlbWEpKTtcbiAgfVxuXG4gIC8qKiBSZXBsYXkgYWNjZXB0ZWQgY29tbWFuZHMgaW4gdGhlaXIgYXV0aG9yaXRhdGl2ZSBvcmRlciBmcm9tIGFuIGVtcHR5IHdvcmxkLlxuICAgKiBBIG5vcm1hbCByZXBsYXkgaXMgYXR0ZW1wdGVkIGZpcnN0OiBzdG9uZSBmcm9tIHJldGFpbmVkIGNhaXJucyBhbmQgYnVpbGRpbmdcbiAgICogcHJlcGFyYXRpb24gbXVzdCBub3QgZm9yY2UgaGlzdG9yaWNhbCBtb2RlLiBSYXcgb2xkIGpvdXJuYWxzIGVudGVyIHByaXZhdGVcbiAgICogcmVjb25zdHJ1Y3Rpb24gb25seSB3aGVuIHRoZWlyIG9yaWdpbmFsIHN0b25lIG9ic3RydWN0aW9ucyByZXF1aXJlZCBpdC4gKi9cbiAgc3RhdGljIHJlcGxheShpbnB1dDogdW5rbm93bik6IEdhbWVTZXNzaW9uIHtcbiAgICBjb25zdCBqb3VybmFsID0gdmFsaWRhdGVKb3VybmFsKGlucHV0KTtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIEdhbWVTZXNzaW9uLnJlcGxheUN1cnJlbnQoam91cm5hbCk7XG4gICAgfSBjYXRjaCAoY3VycmVudEVycm9yKSB7XG4gICAgICBpZiAoIWpvdXJuYWwuZW50cmllcy5zb21lKGNvbnRhaW5zUmV0aXJlZFN0b25lKSkgdGhyb3cgY3VycmVudEVycm9yO1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIEdhbWVTZXNzaW9uLnJlY29uc3RydWN0SGlzdG9yaWNhbChqb3VybmFsKS5zZXNzaW9uO1xuICAgICAgfSBjYXRjaCAoaGlzdG9yaWNhbEVycm9yKSB7XG4gICAgICAgIC8vIEFuIGFscmVhZHktbWlncmF0ZWQgam91cm5hbCBoYXMgcmV3cml0dGVuIGhhc2hlczsgdmVyaWZ5IGl0cyByZXRhaW5lZFxuICAgICAgICAvLyBzdG9uZSBjb21tYW5kcyBub3JtYWxseSBpbnN0ZWFkIG9mIGFjY2VwdGluZyB0aGUgZmFpbGVkIG9sZCByZXBsYXkuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEdhbWVTZXNzaW9uLnJlcGxheUN1cnJlbnQoam91cm5hbCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIHRocm93IGhpc3RvcmljYWxFcnJvcjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKiBSZXN0b3JlIGEgdmFsaWRhdGVkIHNuYXBzaG90LCB0aGVuIHJlcGxheSBvbmx5IGl0cyBhY2NlcHRlZC1jb21tYW5kIHRhaWwuICovXG4gIHN0YXRpYyByZXN0b3JlKHNuYXBzaG90SW5wdXQ6IFdvcmxkU25hcHNob3QsIGpvdXJuYWxJbnB1dDogdW5rbm93bik6IEdhbWVTZXNzaW9uIHtcbiAgICBjb25zdCBqb3VybmFsID0gdmFsaWRhdGVKb3VybmFsKGpvdXJuYWxJbnB1dCk7XG4gICAgY29uc3Qgc25hcHNob3QgPSB2YWxpZGF0ZVdvcmxkU25hcHNob3Qoc25hcHNob3RJbnB1dCk7XG4gICAgaWYgKHNuYXBzaG90LnNjaGVtYSAhPT0gam91cm5hbC5zY2hlbWEpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgYW5kIGpvdXJuYWwgc2NoZW1hcyBkaWZmZXInKTtcbiAgICBjb25zdCBuZXh0ID0gc25hcHNob3QubmV4dFNlcXVlbmNlO1xuICAgIGlmIChuZXh0ID4gam91cm5hbC5lbnRyaWVzLmxlbmd0aCkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBpcyBhaGVhZCBvZiB0aGUgam91cm5hbCcpO1xuICAgIC8vIEN1cnJlbnQgc2F2ZXMgKGluY2x1ZGluZyBldmVyeSBtaWdyYXRlZCBib3VuZGFyeSkga2VlcCB0aGVpciBleGFjdCBoYXNoLlxuICAgIC8vIFRyeSB0aGVtIGJlZm9yZSByZWNvbnN0cnVjdGluZyBhIGNvbXBhdGlibGUgb2xkIGpvdXJuYWwuIERlcG9zaXQtb25seVxuICAgIC8vIG1pZ3JhdGVkIHNhdmVzIG5vIGxvbmdlciBjYXJyeSBhbiBleHBsaWNpdCBzdG9uZSBjb21tYW5kIHRvIGNsYXNzaWZ5IHRoZW0uXG4gICAgaWYgKCFzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpKSB7XG4gICAgICB0cnkgeyByZXR1cm4gR2FtZVNlc3Npb24ucmVzdG9yZUN1cnJlbnQoc25hcHNob3QsIGpvdXJuYWwsIG5leHQpOyB9IGNhdGNoIHsgLyogYXV0aGVudGljYXRlZCBtaWdyYXRpb24gYmVsb3cgKi8gfVxuICAgIH1cbiAgICBpZiAobmV4dCA+IDAgfHwgc25hcHNob3QuZW50aXRpZXMuc29tZSgoZW50aXR5KSA9PiBpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSkge1xuICAgICAgLy8gQSBib3VuZGFyeSBhdXRoZW50aWNhdGVkIGR1cmluZyBtaWdyYXRpb24gaXMgY29tcGFyZWQgd2l0aCB0aGUgbWlncmF0ZWRcbiAgICAgIC8vIHN0YXRlOyBhIHJhdyBvbGQgYm91bmRhcnkgaXMgY29tcGFyZWQgd2l0aCB0aGUgb3JpZ2luYWwgaGlzdG9yaWNhbCBvbmUuXG4gICAgICAvLyBCb3RoIHBhdGhzIGF1dGhlbnRpY2F0ZSB0aGUgY29tcGxldGUgb3JpZ2luYWwgYWNjZXB0ZWQgam91cm5hbCBmaXJzdC5cbiAgICAgIGNvbnN0IGhpc3RvcmljYWwgPSBqb3VybmFsLmVudHJpZXMuc29tZShyZWZlcmVuY2VzUmV0aXJlZFN0b25lKVxuICAgICAgICB8fCBzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpO1xuICAgICAgLy8gQSBtaWdyYXRlZCBzYXZlIG5vIGxvbmdlciBjb250YWlucyByZXRpcmVkIGVudGl0aWVzLiBJdHMgcmV3cml0dGVuXG4gICAgICAvLyBib3VuZGFyeSBoYXNoZXMgZGVzY3JpYmUgdGhlIGZpbHRlcmVkIHN0YXRlLCBzbyBvcmRpbmFyeSByZXN0b3JhdGlvblxuICAgICAgLy8gbXVzdCBzdWNjZWVkIGJlZm9yZSB0cnlpbmcgdG8gaW50ZXJwcmV0IGl0IGFzIHJhdyBvbGQtc2F2ZSBieXRlcy5cbiAgICAgIC8vIEEgcmVmZXJlbmNlZCBhdXRob3JlZCBzdG9uZSBhbG9uZSBkb2VzICpub3QqIGltcGx5IGEgcmF3IG9sZCBib3VuZGFyeTpcbiAgICAgIC8vIGxlZ2l0aW1hdGUgc2F2ZXMgY2FuIGNvbnRhaW4gdW50b3VjaGVkIG5hdHVyYWwgcmV0aXJlZCBkZXBvc2l0cyBvbmx5LlxuICAgICAgaWYgKCFzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpKSB7XG4gICAgICAgIHRyeSB7IHJldHVybiBHYW1lU2Vzc2lvbi5yZXN0b3JlQ3VycmVudChzbmFwc2hvdCwgam91cm5hbCwgbmV4dCk7IH0gY2F0Y2ggeyAvKiB0cnkgb3JpZ2luYWwgcmVjb25zdHJ1Y3Rpb24gKi8gfVxuICAgICAgfVxuICAgICAgaWYgKGhpc3RvcmljYWwpIHtcbiAgICAgICAgY29uc3QgcmVjb25zdHJ1Y3RlZCA9IEdhbWVTZXNzaW9uLnJlY29uc3RydWN0SGlzdG9yaWNhbChqb3VybmFsKTtcbiAgICAgICAgY29uc3QgZXhwZWN0ZWQgPSByZWNvbnN0cnVjdGVkLnNuYXBzaG90cy5nZXQobmV4dCk7XG4gICAgICAgIGNvbnN0IG1pZ3JhdGVkID0gZXhwZWN0ZWQgPyBtaWdyYXRlU3RvbmVTbmFwc2hvdChleHBlY3RlZCkgOiB1bmRlZmluZWQ7XG4gICAgICAgIGlmIChtaWdyYXRlZCAmJiBsZWdhY3lTdG9uZUhhc2goc25hcHNob3QpID09PSBsZWdhY3lTdG9uZUhhc2gobWlncmF0ZWQpKVxuICAgICAgICAgIHJldHVybiByZWNvbnN0cnVjdGVkLnNlc3Npb247XG4gICAgICAgIGlmIChzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpXG4gICAgICAgICAgJiYgZXhwZWN0ZWQgJiYgbGVnYWN5U3RvbmVIYXNoKHNuYXBzaG90KSA9PT0gbGVnYWN5U3RvbmVIYXNoKGV4cGVjdGVkKSlcbiAgICAgICAgICByZXR1cm4gcmVjb25zdHJ1Y3RlZC5zZXNzaW9uO1xuICAgICAgICBpZiAoc25hcHNob3QuZW50aXRpZXMuc29tZSgoZW50aXR5KSA9PiBpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignaGlzdG9yaWNhbCBzbmFwc2hvdCBkb2VzIG5vdCBtYXRjaCBpdHMgb3JpZ2luYWwgam91cm5hbCBib3VuZGFyeScpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChuZXh0ID4gMCkgcmV0dXJuIEdhbWVTZXNzaW9uLnJlc3RvcmVDdXJyZW50KHNuYXBzaG90LCBqb3VybmFsLCBuZXh0KTtcbiAgICBjb25zdCBoaXN0b3JpY2FsID0gam91cm5hbC5lbnRyaWVzLnNvbWUoY29udGFpbnNSZXRpcmVkU3RvbmUpO1xuICAgIGlmIChoaXN0b3JpY2FsKSB7XG4gICAgICB0cnkgeyByZXR1cm4gR2FtZVNlc3Npb24ucmVzdG9yZUN1cnJlbnQoc25hcHNob3QsIGpvdXJuYWwsIG5leHQpOyB9IGNhdGNoIHsgLyogcmF3IG9yIG1pZ3JhdGVkIGdlbmVzaXMgKi8gfVxuICAgICAgY29uc3QgcmVjb25zdHJ1Y3RlZCA9IEdhbWVTZXNzaW9uLnJlY29uc3RydWN0SGlzdG9yaWNhbChqb3VybmFsKTtcbiAgICAgIGNvbnN0IHJhd0dlbmVzaXMgPSByZWNvbnN0cnVjdGVkLnNuYXBzaG90cy5nZXQoMCkhO1xuICAgICAgaWYgKGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdCkgPT09IGxlZ2FjeVN0b25lSGFzaChyYXdHZW5lc2lzKSkgcmV0dXJuIHJlY29uc3RydWN0ZWQuc2Vzc2lvbjtcbiAgICB9XG4gICAgcmV0dXJuIEdhbWVTZXNzaW9uLnJlc3RvcmVDdXJyZW50KHNuYXBzaG90LCBqb3VybmFsLCBuZXh0KTtcbiAgfVxuXG4gIC8qKiBSZXBsYXkgYWxyZWFkeS1hdXRoZW50aWNhdGVkIGN1cnJlbnQtc3RhdGUgY29tbWFuZHMuICovXG4gIHByaXZhdGUgc3RhdGljIHJlcGxheUN1cnJlbnQoam91cm5hbDogQ29tbWFuZEpvdXJuYWwpOiBHYW1lU2Vzc2lvbiB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IG5ldyBHYW1lU2Vzc2lvbihcbiAgICAgIGdlbmVzaXNXb3JsZChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc3RhcnRlckludmVudG9yeSwgam91cm5hbC5zY2hlbWEsIGpvdXJuYWxHZW5lcmF0b3Ioam91cm5hbCkpLFxuICAgICAgY3JlYXRlSm91cm5hbChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc2NoZW1hLCBqb3VybmFsR2VuZXJhdG9yKGpvdXJuYWwpKSxcbiAgICApO1xuICAgIGZvciAoY29uc3QgZW50cnkgb2Ygam91cm5hbC5lbnRyaWVzKSBzZXNzaW9uLnJlcGxheUVudHJ5KGVudHJ5KTtcbiAgICByZXR1cm4gc2Vzc2lvbjtcbiAgfVxuXG4gIHByaXZhdGUgc3RhdGljIHJlc3RvcmVDdXJyZW50KHNuYXBzaG90OiBXb3JsZFNuYXBzaG90LCBqb3VybmFsOiBDb21tYW5kSm91cm5hbCwgbmV4dDogbnVtYmVyKTogR2FtZVNlc3Npb24ge1xuICAgIGNvbnN0IHdvcmxkID0gd29ybGRGcm9tU25hcHNob3Qoc25hcHNob3QpO1xuICAgIGlmICh3b3JsZC5zZWVkICE9PSBqb3VybmFsLnNlZWQpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgYW5kIGpvdXJuYWwgc2VlZHMgZGlmZmVyJyk7XG4gICAgaWYgKHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uICE9PSBqb3VybmFsR2VuZXJhdG9yKGpvdXJuYWwpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGFuZCBqb3VybmFsIHRlcnJhaW4gZ2VuZXJhdG9ycyBkaWZmZXInKTtcbiAgICB9XG4gICAgY29uc3QgZ2VuZXNpcyA9IGdlbmVzaXNXb3JsZChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc3RhcnRlckludmVudG9yeSwgam91cm5hbC5zY2hlbWEsIGpvdXJuYWxHZW5lcmF0b3Ioam91cm5hbCkpO1xuICAgIGlmIChuZXh0ID09PSAwICYmIGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdCkgIT09IGNhbm9uaWNhbFdvcmxkSGFzaChnZW5lc2lzLCAwLCBqb3VybmFsLnNjaGVtYSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignZ2VuZXNpcyBzbmFwc2hvdCBkb2VzIG5vdCBtYXRjaCBqb3VybmFsIGNvbmZpZ3VyYXRpb24nKTtcbiAgICB9XG4gICAgaWYgKG5leHQgPiAwICYmIGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdCkgIT09IGpvdXJuYWwuZW50cmllc1tuZXh0IC0gMV0uaGFzaCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXNoIGRvZXMgbm90IG1hdGNoIGl0cyBqb3VybmFsIGJvdW5kYXJ5Jyk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb24gPSBHYW1lU2Vzc2lvbi5mcm9tVmFsaWRhdGVkQm91bmRhcnkod29ybGQsIHtcbiAgICAgIHNjaGVtYTogam91cm5hbC5zY2hlbWEsIHNlZWQ6IGpvdXJuYWwuc2VlZCxcbiAgICAgIC4uLihqb3VybmFsLmdlbmVyYXRvclZlcnNpb24gPyB7IGdlbmVyYXRvclZlcnNpb246IGpvdXJuYWwuZ2VuZXJhdG9yVmVyc2lvbiB9IDoge30pLFxuICAgICAgc3RhcnRlckludmVudG9yeTogeyAuLi5qb3VybmFsLnN0YXJ0ZXJJbnZlbnRvcnkgfSwgZW50cmllczogam91cm5hbC5lbnRyaWVzLnNsaWNlKDAsIG5leHQpLFxuICAgIH0pO1xuICAgIGZvciAoY29uc3QgZW50cnkgb2Ygam91cm5hbC5lbnRyaWVzLnNsaWNlKG5leHQpKSBzZXNzaW9uLnJlcGxheUVudHJ5KGVudHJ5KTtcbiAgICByZXR1cm4gc2Vzc2lvbjtcbiAgfVxuXG4gIC8qKiBAaW50ZXJuYWwgQXNzZW1ibGUgYW4gYXV0aGVudGljYXRlZCBzYXZlIGJvdW5kYXJ5OyBnYW1lcGxheSB1c2VzIGRpc3BhdGNoLiAqL1xuICBwcml2YXRlIHN0YXRpYyBmcm9tVmFsaWRhdGVkQm91bmRhcnkod29ybGQ6IFdvcmxkLCBqb3VybmFsOiBDb21tYW5kSm91cm5hbCk6IEdhbWVTZXNzaW9uIHtcbiAgICByZXR1cm4gbmV3IEdhbWVTZXNzaW9uKHdvcmxkLCBqb3VybmFsKTtcbiAgfVxuXG4gIC8qKiBAaW50ZXJuYWwgU291cmNlIGZvciBkZXRlcm1pbmlzdGljIG9sZC1zYXZlIGZpeHR1cmVzOyBub3QgYSBsaXZlIHNlc3Npb24uICovXG4gIHN0YXRpYyBoaXN0b3JpY2FsSm91cm5hbCh3b3JsZDogV29ybGQpOiBHYW1lU2Vzc2lvbiB7XG4gICAgcmV0dXJuIG5ldyBHYW1lU2Vzc2lvbih3b3JsZCwgY3JlYXRlSm91cm5hbCh3b3JsZC5zZWVkLCB3b3JsZC5saWZlID8gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQVxuICAgICAgOiB3b3JsZC5zdHJ1Y3R1cmVzLnNpemUgPiAwID8gREVTSUdOX0pPVVJOQUxfU0NIRU1BIDogSk9VUk5BTF9TQ0hFTUEpKTtcbiAgfVxuXG4gIC8qKiBAaW50ZXJuYWwgU291cmNlIGZvciBkZXRlcm1pbmlzdGljIG9sZC1zYXZlIGZpeHR1cmVzOyBub3QgYSBsaXZlIHNlc3Npb24uICovXG4gIHN0YXRpYyBoaXN0b3JpY2FsR2VuZXNpc1dvcmxkKHNlZWQgPSAxMzM3LCBzY2hlbWE6IENvbW1hbmRKb3VybmFsWydzY2hlbWEnXSA9IEpPVVJOQUxfU0NIRU1BKTogV29ybGQge1xuICAgIHJldHVybiBoaXN0b3JpY2FsR2VuZXNpc1dvcmxkKHNlZWQsIGludmVudG9yeShNMDAyX1NUQVJURVJfSU5WRU5UT1JZKSwgc2NoZW1hKTtcbiAgfVxuXG4gIHByaXZhdGUgc3RhdGljIHJlY29uc3RydWN0SGlzdG9yaWNhbChqb3VybmFsOiBDb21tYW5kSm91cm5hbCk6IHtcbiAgICBzZXNzaW9uOiBHYW1lU2Vzc2lvbjsgc25hcHNob3RzOiBNYXA8bnVtYmVyLCBXb3JsZFNuYXBzaG90PjtcbiAgfSB7XG4gICAgY29uc3QgZXhwZWN0ZWRHZW5lc2lzID0gaGlzdG9yaWNhbEdlbmVzaXNXb3JsZChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc3RhcnRlckludmVudG9yeSwgam91cm5hbC5zY2hlbWEpO1xuICAgIGNvbnN0IHNuYXBzaG90cyA9IG5ldyBNYXA8bnVtYmVyLCBXb3JsZFNuYXBzaG90PigpO1xuICAgIHNuYXBzaG90cy5zZXQoMCwgY3JlYXRlV29ybGRTbmFwc2hvdChleHBlY3RlZEdlbmVzaXMsIDAsIGpvdXJuYWwuc2NoZW1hKSk7XG4gICAgY29uc3QgcmVwbGF5ID0gbmV3IEdhbWVTZXNzaW9uKGV4cGVjdGVkR2VuZXNpcywgY3JlYXRlSm91cm5hbChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc2NoZW1hKSk7XG4gICAgY29uc3QgbWlncmF0ZWRKb3VybmFsID0gY3JlYXRlSm91cm5hbChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc2NoZW1hKTtcbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGpvdXJuYWwuZW50cmllcykge1xuICAgICAgcmVwbGF5LnJlcGxheUVudHJ5KGVudHJ5KTtcbiAgICAgIGNvbnN0IHNuYXBzaG90ID0gY3JlYXRlV29ybGRTbmFwc2hvdChyZXBsYXkud29ybGQsIHJlcGxheS5uZXh0U2VxdWVuY2UsIGpvdXJuYWwuc2NoZW1hKTtcbiAgICAgIHNuYXBzaG90cy5zZXQocmVwbGF5Lm5leHRTZXF1ZW5jZSwgc25hcHNob3QpO1xuICAgICAgLy8gS2VlcCB0aGUgcmV3cml0dGVuIGF1dGhlbnRpY2F0ZWQgYm91bmRhcnkgaW4gdGhlIHJldHVybmVkIGpvdXJuYWwuIEFcbiAgICAgIC8vIHJlcGxheS1vbmx5IGpvdXJuYWwgcmVidWlsZCB3b3VsZCBzaWxlbnRseSBwdXQgdGhlIHJhdyBoYXNoIGJhY2suXG4gICAgICBlbnRyeS5oYXNoID0gbGVnYWN5U3RvbmVIYXNoKG1pZ3JhdGVTdG9uZVNuYXBzaG90KHNuYXBzaG90KSk7XG4gICAgICBtaWdyYXRlZEpvdXJuYWwuZW50cmllcy5wdXNoKGVudHJ5KTtcbiAgICB9XG4gICAgY29uc3Qgc2Vzc2lvbiA9IEdhbWVTZXNzaW9uLmZyb21WYWxpZGF0ZWRCb3VuZGFyeShyZXBsYXkud29ybGQsIG1pZ3JhdGVkSm91cm5hbCk7XG4gICAgcmV0dXJuIHsgc2Vzc2lvbjogc2Vzc2lvbi5taWdyYXRlUmV0aXJlZFN0b25lcygpLCBzbmFwc2hvdHMgfTtcbiAgfVxuXG4gIHByaXZhdGUgc25hcHNob3RTY2hlbWEoKTogV29ybGRTbmFwc2hvdFsnc2NoZW1hJ10geyByZXR1cm4gdGhpcy5qb3VybmFsLnNjaGVtYTsgfVxuXG4gIGdldCBuZXh0U2VxdWVuY2UoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuam91cm5hbC5lbnRyaWVzLmxlbmd0aDsgfVxuICBnZXQgc25hcHNob3QoKTogV29ybGRTbmFwc2hvdCB7XG4gICAgcmV0dXJuIGNyZWF0ZVdvcmxkU25hcHNob3QodGhpcy53b3JsZCwgdGhpcy5uZXh0U2VxdWVuY2UsIHRoaXMuc25hcHNob3RTY2hlbWEoKSk7XG4gIH1cbiAgZ2V0IHN0YXRlSGFzaCgpOiBzdHJpbmcge1xuICAgIHJldHVybiBjYW5vbmljYWxXb3JsZEhhc2godGhpcy53b3JsZCwgdGhpcy5uZXh0U2VxdWVuY2UsIHRoaXMuc25hcHNob3RTY2hlbWEoKSk7XG4gIH1cblxuICBjb21tYW5kSWQoa2luZDogQ29tbWFuZFsndHlwZSddLCB0YXJnZXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgLy8gRW50aXR5IElEcyBjb250YWluIGNodW5rIGNvb3JkaW5hdGVzOyBlbmNvZGUgY29tbWFzIGFuZCBvdGhlciBzZXBhcmF0b3JzXG4gICAgLy8gc28gZ2VuZXJhdGVkIGNvbW1hbmRzIHNhdGlzZnkgdGhlIHNhbWUgZW52ZWxvcGUgdmFsaWRhdGlvbiBhcyBpbnB1dC5cbiAgICByZXR1cm4gYCR7a2luZH06JHt0aGlzLm5leHRTZXF1ZW5jZX06JHtlbmNvZGVVUklDb21wb25lbnQodGFyZ2V0KX1gO1xuICB9XG5cbiAgZW50cnkoc2VxdWVuY2U6IG51bWJlcik6IEpvdXJuYWxFbnRyeSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLmpvdXJuYWwuZW50cmllc1tzZXF1ZW5jZV07IH1cblxuICBkaXNwYXRjaChpbnB1dDogdW5rbm93bik6IENvbW1hbmRSZWNlaXB0IHwgQ29tbWFuZFJlamVjdGlvbiB7XG4gICAgbGV0IGNvbW1hbmQ6IENvbW1hbmQ7XG4gICAgdHJ5IHsgY29tbWFuZCA9IHZhbGlkYXRlQ29tbWFuZChpbnB1dCk7IH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWplY3Qob2JqZWN0KGlucHV0KSAmJiB0eXBlb2YgaW5wdXQuaWQgPT09ICdzdHJpbmcnID8gaW5wdXQuaWQgOiAnJyxcbiAgICAgICAgJ2ludmFsaWRfY29tbWFuZCcsIFsoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2VdKTtcbiAgICB9XG4gICAgaWYgKChjb21tYW5kLnR5cGUgPT09ICdidWlsZCcgfHwgY29tbWFuZC50eXBlID09PSAnaGFydmVzdCcpXG4gICAgICAmJiBjb21tYW5kLnNjaGVtYSAhPT0gdGhpcy5qb3VybmFsLnNjaGVtYVxuICAgICAgfHwgY29tbWFuZC50eXBlICE9PSAnYnVpbGQnICYmIGNvbW1hbmQudHlwZSAhPT0gJ2hhcnZlc3QnXG4gICAgICAgICYmIHRoaXMuam91cm5hbC5zY2hlbWEgIT09IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEpIHtcbiAgICAgIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCAnc2NoZW1hX21pc21hdGNoJywgWydjb21tYW5kIHNjaGVtYSBkb2VzIG5vdCBtYXRjaCB0aGlzIHdvcmxkIGpvdXJuYWwnXSk7XG4gICAgfVxuICAgIGNvbnN0IHByaW9yID0gdGhpcy5pZHMuZ2V0KGNvbW1hbmQuaWQpO1xuICAgIGlmIChwcmlvcikge1xuICAgICAgaWYgKCFzYW1lRmllbGRzKHByaW9yLmNvbW1hbmQsIGNvbW1hbmQpKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCAnZHVwbGljYXRlX2NvbW1hbmRfaWQnLCBbJ2NvbW1hbmQgaWQgYWxyZWFkeSBoYXMgZGlmZmVyZW50IGFjY2VwdGVkIGlucHV0J10pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMucmVjZWlwdChwcmlvciwgdHJ1ZSk7XG4gICAgfVxuICAgIGlmIChjb21tYW5kLmV4cGVjdGVkUmV2aXNpb24gIT09IHRoaXMud29ybGQucmV2aXNpb24pIHtcbiAgICAgIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCAnc3RhbGVfcmV2aXNpb24nLCBbXG4gICAgICAgIGBjb21tYW5kIGV4cGVjdHMgcmV2aXNpb24gJHtjb21tYW5kLmV4cGVjdGVkUmV2aXNpb259OyB3b3JsZCBpcyBhdCAke3RoaXMud29ybGQucmV2aXNpb259YCxcbiAgICAgIF0pO1xuICAgIH1cbiAgICBjb25zdCBiZWZvcmUgPSB0aGlzLnN0YXRlSGFzaDtcbiAgICBsZXQgb3V0Y29tZTogQ29tbWFuZE91dGNvbWU7XG4gICAgaWYgKGNvbW1hbmQudHlwZSA9PT0gJ2J1aWxkJykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYnVpbGRQcm9qZWN0KHRoaXMud29ybGQsIHRoaXMucHJlcEF1dGhvcml6ZXIsIHRoaXMuc3RydWN0dXJlQXV0aG9yaXplcixcbiAgICAgICAgcHJvamVjdEJ5SWQoY29tbWFuZC5wcm9qZWN0SWQpLFxuICAgICAgICAnZGVzaWduVmVyc2lvbicgaW4gY29tbWFuZCA/IGNvbW1hbmQuZGVzaWduVmVyc2lvbiA6IHVuZGVmaW5lZCk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykge1xuICAgICAgICBpZiAodGhpcy5zdGF0ZUhhc2ggIT09IGJlZm9yZSkgdGhyb3cgbmV3IEVycm9yKCdyZWplY3RlZCBidWlsZCBjaGFuZ2VkIGF1dGhvcml0YXRpdmUgc3RhdGUnKTtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsIHJlc3VsdC5jb2RlLCByZXN1bHQucmVhc29ucyk7XG4gICAgICB9XG4gICAgICBvdXRjb21lID0ge1xuICAgICAgICB0eXBlOiAnYnVpbGQnLCBzdHJ1Y3R1cmVJZDogcmVzdWx0LnJlY29yZC5pZCxcbiAgICAgICAgY29zdFBhaWQ6IGludmVudG9yeShyZXN1bHQuc3RydWN0dXJlLmNvc3RQYWlkKSxcbiAgICAgICAgcmVzb3VyY2VzR2FpbmVkOiBpbnZlbnRvcnkocmVzdWx0LnByZXBhcmF0aW9uLnJlc291cmNlc0dhaW5lZCksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSAnaGFydmVzdCcpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGhhcnZlc3RFbnRpdHkodGhpcy53b3JsZCwgY29tbWFuZC5lbnRpdHlJZCk7XG4gICAgICBpZiAoIXJlc3VsdCkgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsICdub3RfaGFydmVzdGFibGUnLCBbJ2VudGl0eSBpcyBhYnNlbnQsIGRlcGxldGVkIG9yIGhhcyBubyByZXNvdXJjZSddKTtcbiAgICAgIG91dGNvbWUgPSB7XG4gICAgICAgIHR5cGU6ICdoYXJ2ZXN0JywgZW50aXR5SWQ6IHJlc3VsdC5lbnRpdHkuaWQsXG4gICAgICAgIHJlc291cmNlOiByZXN1bHQucmVzb3VyY2UsIGFtb3VudDogcmVzdWx0LmFtb3VudCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09ICdkZXBvc2l0JyB8fCBjb21tYW5kLnR5cGUgPT09ICd3aXRoZHJhdycpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHRyYW5zZmVyKHRoaXMud29ybGQsIGNvbW1hbmQudHlwZSwgY29tbWFuZC5yZXNvdXJjZXMpO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHtcbiAgICAgICAgaWYgKHRoaXMuc3RhdGVIYXNoICE9PSBiZWZvcmUpIHRocm93IG5ldyBFcnJvcigncmVqZWN0ZWQgdHJhbnNmZXIgY2hhbmdlZCBhdXRob3JpdGF0aXZlIHN0YXRlJyk7XG4gICAgICAgIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCByZXN1bHQuY29kZSwgcmVzdWx0LnJlYXNvbnMpO1xuICAgICAgfVxuICAgICAgb3V0Y29tZSA9IHsgdHlwZTogY29tbWFuZC50eXBlLCBzdG9ja3BpbGVJZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHJlc291cmNlczogcmVzdWx0LnZhbHVlIH07XG4gICAgfSBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09ICdwcm9kdWNlJykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gc3RhcnRQcm9kdWN0aW9uKHRoaXMud29ybGQsIGNvbW1hbmQucmVjaXBlLCBjb21tYW5kLmlkKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgcmVzdWx0LmNvZGUsIHJlc3VsdC5yZWFzb25zKTtcbiAgICAgIG91dGNvbWUgPSB7IHR5cGU6ICdwcm9kdWNlJywgam9iSWQ6IHJlc3VsdC52YWx1ZS5pZCwgc3RvY2twaWxlSWQ6IHJlc3VsdC52YWx1ZS5zdG9ja3BpbGVJZCxcbiAgICAgICAgcmVjaXBlOiByZXN1bHQudmFsdWUucmVjaXBlLCByZW1haW5pbmdUaWNrczogcmVzdWx0LnZhbHVlLnJlbWFpbmluZ1RpY2tzIH07XG4gICAgfSBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09ICd0aWNrJykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYWR2YW5jZVRpY2tzKHRoaXMud29ybGQsIGNvbW1hbmQudGlja3MpO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCByZXN1bHQuY29kZSwgcmVzdWx0LnJlYXNvbnMpO1xuICAgICAgb3V0Y29tZSA9IHsgdHlwZTogJ3RpY2snLCAuLi5yZXN1bHQudmFsdWUgfTtcbiAgICB9IGVsc2UgaWYgKGNvbW1hbmQudHlwZSA9PT0gJ3BsYW50Jykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gcGxhbnRDcm9wKHRoaXMud29ybGQsIGNvbW1hbmQucGxvdElkKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgcmVzdWx0LmNvZGUsIHJlc3VsdC5yZWFzb25zKTtcbiAgICAgIG91dGNvbWUgPSB7IHR5cGU6ICdwbGFudCcsIHBsb3RJZDogY29tbWFuZC5wbG90SWQsXG4gICAgICAgIHBsYW50ZWRUaWNrOiByZXN1bHQudmFsdWUucGxhbnRlZFRpY2ssIGdyb3d0aFRpY2tzOiByZXN1bHQudmFsdWUuZ3Jvd3RoVGlja3MgfTtcbiAgICB9IGVsc2UgaWYgKGNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3RfY3JvcCcpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGhhcnZlc3RDcm9wKHRoaXMud29ybGQsIGNvbW1hbmQucGxvdElkKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgcmVzdWx0LmNvZGUsIHJlc3VsdC5yZWFzb25zKTtcbiAgICAgIG91dGNvbWUgPSB7IHR5cGU6ICdoYXJ2ZXN0X2Nyb3AnLCBwbG90SWQ6IGNvbW1hbmQucGxvdElkLCByZXNvdXJjZXM6IHJlc3VsdC52YWx1ZSB9O1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3VuaGFuZGxlZCBjb21tYW5kIHR5cGUnKTtcbiAgICB9XG4gICAgY29uc3QgZW50cnk6IEpvdXJuYWxFbnRyeSA9IHtcbiAgICAgIGNvbW1hbmQsIHNlcXVlbmNlOiB0aGlzLm5leHRTZXF1ZW5jZSwgcmV2aXNpb246IHRoaXMud29ybGQucmV2aXNpb24sXG4gICAgICAvLyBUaGUgc2VxdWVuY2UgaXMgcGFydCBvZiB0aGUgc3RhdGUgaGFzaCBhdCB0aGlzIGFjY2VwdGVkIGJvdW5kYXJ5LlxuICAgICAgaGFzaDogY2Fub25pY2FsV29ybGRIYXNoKHRoaXMud29ybGQsIHRoaXMubmV4dFNlcXVlbmNlICsgMSwgdGhpcy5zbmFwc2hvdFNjaGVtYSgpKSwgb3V0Y29tZSxcbiAgICB9O1xuICAgIHRoaXMuam91cm5hbC5lbnRyaWVzLnB1c2goZW50cnkpO1xuICAgIHRoaXMuaWRzLnNldChjb21tYW5kLmlkLCBlbnRyeSk7XG4gICAgcmV0dXJuIHRoaXMucmVjZWlwdChlbnRyeSwgZmFsc2UpO1xuICB9XG5cbiAgcHJpdmF0ZSByZXBsYXlFbnRyeShlbnRyeTogSm91cm5hbEVudHJ5KTogdm9pZCB7XG4gICAgaWYgKGVudHJ5LnNlcXVlbmNlICE9PSB0aGlzLm5leHRTZXF1ZW5jZSkgdGhyb3cgbmV3IEVycm9yKCdqb3VybmFsIHNlcXVlbmNlIGdhcCcpO1xuICAgIGNvbnN0IHJlY2VpcHQgPSB0aGlzLmRpc3BhdGNoKGVudHJ5LmNvbW1hbmQpO1xuICAgIGlmICghcmVjZWlwdC5vayB8fCByZWNlaXB0LmR1cGxpY2F0ZSB8fCByZWNlaXB0Lmhhc2ggIT09IGVudHJ5Lmhhc2hcbiAgICAgIHx8IHJlY2VpcHQucmV2aXNpb24gIT09IGVudHJ5LnJldmlzaW9uXG4gICAgICB8fCBKU09OLnN0cmluZ2lmeShyZWNlaXB0Lm91dGNvbWUpICE9PSBKU09OLnN0cmluZ2lmeShlbnRyeS5vdXRjb21lKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBqb3VybmFsIHJlcGxheSBkaXZlcmdlZCBhdCBzZXF1ZW5jZSAke2VudHJ5LnNlcXVlbmNlfWApO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBIaXN0b3JpY2FsIGVudHJpZXMgaGF2ZSBwYXNzZWQgdGhlaXIgb3JpZ2luYWwgb3V0Y29tZS9oYXNoIGNoZWNrcy4gVGhlaXJcbiAgICogYWNjZXB0ZWQgY29tbWFuZHMgYW5kIHN0b25lIHlpZWxkcyByZW1haW47IG9ubHkgZW50aXR5IGV4aXN0ZW5jZSBhbmQgdGhlXG4gICAqIHJlc3VsdGluZyBjYW5vbmljYWwgYm91bmRhcnkgaGFzaGVzIGNoYW5nZS4gKi9cbiAgcHJpdmF0ZSBtaWdyYXRlUmV0aXJlZFN0b25lcygpOiBHYW1lU2Vzc2lvbiB7XG4gICAgcmV0aXJlU3RvbmVFbnRpdGllcyh0aGlzLndvcmxkKTtcbiAgICBmaW5pc2hTdG9uZVJlcGxheSh0aGlzLndvcmxkKTtcbiAgICBjb25zdCBtaWdyYXRlZCA9IGNyZWF0ZVdvcmxkU25hcHNob3QodGhpcy53b3JsZCwgdGhpcy5uZXh0U2VxdWVuY2UsIHRoaXMuc25hcHNob3RTY2hlbWEoKSk7XG4gICAgcmVzdG9yZVdvcmxkU25hcHNob3RFeGFjdCh0aGlzLndvcmxkLCBtaWdyYXRlZCk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBwcml2YXRlIHJlY2VpcHQoZW50cnk6IEpvdXJuYWxFbnRyeSwgZHVwbGljYXRlOiBib29sZWFuKTogQ29tbWFuZFJlY2VpcHQge1xuICAgIHJldHVybiB7XG4gICAgICBvazogdHJ1ZSwgZHVwbGljYXRlLCBpZDogZW50cnkuY29tbWFuZC5pZCwgc2VxdWVuY2U6IGVudHJ5LnNlcXVlbmNlLFxuICAgICAgcmV2aXNpb246IGVudHJ5LnJldmlzaW9uLCBoYXNoOiBlbnRyeS5oYXNoLCBvdXRjb21lOiBlbnRyeS5vdXRjb21lLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIHJlamVjdChpZDogc3RyaW5nLCBjb2RlOiBzdHJpbmcsIHJlYXNvbnM6IHN0cmluZ1tdKTogQ29tbWFuZFJlamVjdGlvbiB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBkdXBsaWNhdGU6IGZhbHNlLCBpZCwgY29kZSwgcmVhc29ucyB9O1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lc2lzV29ybGQoc2VlZDogbnVtYmVyLCBzdGFydGVyID0gaW52ZW50b3J5KE0wMDJfU1RBUlRFUl9JTlZFTlRPUlkpLFxuICBzY2hlbWE6IENvbW1hbmRKb3VybmFsWydzY2hlbWEnXSA9IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBnZW5lcmF0ZVdvcmxkKHNlZWQsIDAsIGdlbmVyYXRvclZlcnNpb24pO1xuICB3b3JsZC5pbnZlbnRvcnkgPSB7IC4uLnN0YXJ0ZXIgfTtcbiAgaWYgKHNjaGVtYSA9PT0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSkgd29ybGQubGlmZSA9IGNyZWF0ZUxpZmVTdGF0ZSgpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbmZ1bmN0aW9uIGhpc3RvcmljYWxHZW5lc2lzV29ybGQoc2VlZDogbnVtYmVyLCBzdGFydGVyOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+LFxuICBzY2hlbWE6IENvbW1hbmRKb3VybmFsWydzY2hlbWEnXSk6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkKTtcbiAgZW5hYmxlU3RvbmVSZXBsYXkod29ybGQpO1xuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICB3b3JsZC5pbnZlbnRvcnkgPSB7IC4uLnN0YXJ0ZXIgfTtcbiAgaWYgKHNjaGVtYSA9PT0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSkgd29ybGQubGlmZSA9IGNyZWF0ZUxpZmVTdGF0ZSgpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbmZ1bmN0aW9uIGNvbnRhaW5zUmV0aXJlZFN0b25lKGVudHJ5OiBKb3VybmFsRW50cnkpOiBib29sZWFuIHtcbiAgaWYgKGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3QnKSB7XG4gICAgcmV0dXJuIGVudHJ5Lm91dGNvbWUudHlwZSA9PT0gJ2hhcnZlc3QnXG4gICAgICAmJiAoZW50cnkub3V0Y29tZS5yZXNvdXJjZSA9PT0gJ3N0b25lJ1xuICAgICAgICB8fCAvXmhlcm86c3R5bF9yb2NrXyg/OnNtYWxsfG1lZGl1bXxsYXJnZSk6Ly50ZXN0KGVudHJ5LmNvbW1hbmQuZW50aXR5SWQpKTtcbiAgfVxuICByZXR1cm4gZW50cnkub3V0Y29tZS50eXBlID09PSAnYnVpbGQnICYmIChlbnRyeS5vdXRjb21lLnJlc291cmNlc0dhaW5lZC5zdG9uZSA/PyAwKSA+IDA7XG59XG4iLCAiLy8gQnJvd3NlciBwZXJzaXN0ZW5jZSBpcyBhIHRyYW5zcG9ydCBjb25jZXJuOyBHYW1lU2Vzc2lvbiByZW1haW5zIERPTS1mcmVlLlxuLy8gQSBzaW5nbGUgV2ViIFN0b3JhZ2Uga2V5IGdpdmVzIGJyb3dzZXJzIGFuIGF0b21pYyBzbmFwc2hvdCArIGpvdXJuYWwgcmVwbGFjZS5cbmltcG9ydCB7IENvbW1hbmRKb3VybmFsLCBHYW1lU2Vzc2lvbiB9IGZyb20gJy4vc2Vzc2lvbic7XG5pbXBvcnQgeyBXb3JsZFNuYXBzaG90IH0gZnJvbSAnLi4vc2ltL3NuYXBzaG90JztcbmltcG9ydCB7IEdFTkVSQVRPUl9WRVJTSU9OIH0gZnJvbSAnLi4vc2ltL3dvcmxkJztcblxuZXhwb3J0IGNvbnN0IFNBVkVfU0NIRU1BID0gMSBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBERVNJR05fU0FWRV9TQ0hFTUEgPSAyIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IENVUlJFTlRfU0FWRV9TQ0hFTUEgPSAzIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IE1BWF9TQVZFX0pTT05fQllURVMgPSAzMF8wMDBfMDAwO1xuZXhwb3J0IGludGVyZmFjZSBTYXZlUmVjb3JkIHtcbiAgc2NoZW1hOiB0eXBlb2YgU0FWRV9TQ0hFTUEgfCB0eXBlb2YgREVTSUdOX1NBVkVfU0NIRU1BIHwgdHlwZW9mIENVUlJFTlRfU0FWRV9TQ0hFTUE7XG4gIHNlZWQ6IG51bWJlcjtcbiAgc25hcHNob3Q6IFdvcmxkU25hcHNob3Q7XG4gIGpvdXJuYWw6IENvbW1hbmRKb3VybmFsO1xufVxuZXhwb3J0IGludGVyZmFjZSBLZXlWYWx1ZVN0b3JhZ2Uge1xuICBnZXRJdGVtKGtleTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbDtcbiAgc2V0SXRlbShrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IHZvaWQ7XG4gIHJlbW92ZUl0ZW0oa2V5OiBzdHJpbmcpOiB2b2lkO1xufVxuZXhwb3J0IHR5cGUgTG9hZFN0YXR1cyA9ICduZXcnIHwgJ3Jlc3RvcmVkJyB8ICdzYXZlZCcgfCAnY29ycnVwdCcgfCAndW5hdmFpbGFibGUnO1xuZXhwb3J0IGludGVyZmFjZSBMb2FkUmVzdWx0IHtcbiAgc2Vzc2lvbjogR2FtZVNlc3Npb247XG4gIHN0YXR1czogTG9hZFN0YXR1cztcbiAgbWVzc2FnZTogc3RyaW5nO1xufVxuZXhwb3J0IGludGVyZmFjZSBQZXJzaXN0ZW5jZU1ldHJpY3Mge1xuICBzY2hlbWE6IFNhdmVSZWNvcmRbJ3NjaGVtYSddO1xuICBrZXk6IHN0cmluZztcbiAgc3RhdHVzOiBMb2FkU3RhdHVzO1xuICAvKiogVHJ1ZSBvbmx5IHdoZW4gc3RvcmFnZSBpcyBjdXJyZW50bHkgdXNhYmxlIGFuZCB0aGUgbGF0ZXN0IHNhdmUgYXR0ZW1wdCBzdWNjZWVkZWQuICovXG4gIHBlcnNpc3RlbnQ6IGJvb2xlYW47XG4gIG1lc3NhZ2U6IHN0cmluZztcbn1cbmV4cG9ydCBpbnRlcmZhY2UgU2F2ZVJlc3VsdCB7XG4gIG9rOiBib29sZWFuO1xuICBtZXNzYWdlOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIHNhdmVLZXkoc2VlZDogbnVtYmVyLCBzY2hlbWE6IFNhdmVSZWNvcmRbJ3NjaGVtYSddKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBhc3RyaXg6bTAwMjp2JHtzY2hlbWF9OnNlZWQ6JHtzZWVkfWA7XG59XG5cbi8qKiBWYWxpZGF0ZSB0aGUgZW52ZWxvcGUgYmVmb3JlIHJlc3RvcmluZzsgbmV2ZXIgdHJ1c3QgSlNPTiB0eXBlIGFzc2VydGlvbnMuICovXG5mdW5jdGlvbiBwYXJzZVNhdmUocmF3OiBzdHJpbmcsIHNlZWQ6IG51bWJlciwgc2NoZW1hOiBTYXZlUmVjb3JkWydzY2hlbWEnXSk6IFNhdmVSZWNvcmQge1xuICBpZiAocmF3Lmxlbmd0aCA+IE1BWF9TQVZFX0pTT05fQllURVMpIHRocm93IG5ldyBFcnJvcignc2F2ZSBleGNlZWRzIHRoZSBKU09OIHNpemUgbGltaXQnKTtcbiAgY29uc3QgdmFsdWU6IHVua25vd24gPSBKU09OLnBhcnNlKHJhdyk7XG4gIGlmICh0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnIHx8IHZhbHVlID09PSBudWxsIHx8IEFycmF5LmlzQXJyYXkodmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgc2F2ZSBlbnZlbG9wZScpO1xuICBjb25zdCByZWNvcmQgPSB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgaWYgKHJlY29yZC5zY2hlbWEgIT09IHNjaGVtYSB8fCByZWNvcmQuc2VlZCAhPT0gc2VlZFxuICAgIHx8ICEoJ3NuYXBzaG90JyBpbiByZWNvcmQpIHx8ICEoJ2pvdXJuYWwnIGluIHJlY29yZClcbiAgICB8fCBPYmplY3Qua2V5cyhyZWNvcmQpLmxlbmd0aCAhPT0gNCkgdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBvciBtYWxmb3JtZWQgc2F2ZSBlbnZlbG9wZScpO1xuICByZXR1cm4gcmVjb3JkIGFzIHVua25vd24gYXMgU2F2ZVJlY29yZDtcbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJTYXZlU3RvcmUge1xuICBwcml2YXRlIHN0YXR1czogTG9hZFN0YXR1cyA9ICduZXcnO1xuICBwcml2YXRlIG1lc3NhZ2UgPSAnJztcbiAgcHJpdmF0ZSBzY2hlbWE6IFNhdmVSZWNvcmRbJ3NjaGVtYSddID0gQ1VSUkVOVF9TQVZFX1NDSEVNQTtcbiAgcHJpdmF0ZSBwZXJzaXN0ZW50ID0gZmFsc2U7XG5cbiAgLyoqXG4gICAqIGBuZXdXb3JsZEdlbmVyYXRvcmAgYXBwbGllcyBvbmx5IHdoZW4gbm8gc2F2ZSBleGlzdHMgZm9yIHRoaXMgc2VlZC4gQW5cbiAgICogZXhpc3Rpbmcgc2F2ZSBhbHdheXMgcmVzdG9yZXMgb24gdGhlIGdlbmVyYXRvciByZWNvcmRlZCBpbiBpdHMgc25hcHNob3RcbiAgICogYW5kIGpvdXJuYWwsIHNvIG9sZGVyIHdvcmxkcyBrZWVwIGxvYWRpbmcgdW5jaGFuZ2VkLlxuICAgKi9cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlOiBLZXlWYWx1ZVN0b3JhZ2UgfCBudWxsLFxuICAgIHByaXZhdGUgcmVhZG9ubHkgc2VlZDogbnVtYmVyLFxuICAgIHByaXZhdGUgcmVhZG9ubHkgbmV3V29ybGRHZW5lcmF0b3IgPSBHRU5FUkFUT1JfVkVSU0lPTixcbiAgKSB7fVxuXG4gIC8qKlxuICAgKiBNb3ZlIGV2ZXJ5IHNhdmUgZm9yIHRoaXMgc2VlZCB0byBhbiBhcmNoaXZlIGtleSBzbyB0aGUgbmV4dCBsb2FkIHN0YXJ0cyBhXG4gICAqIG5ldyB3b3JsZC4gUmV2ZXJzaWJsZTogdGhlIGFyY2hpdmVkIGJ5dGVzIGFyZSBrZXB0IHVudG91Y2hlZCB1bmRlclxuICAgKiBgPGtleT46YXJjaGl2ZWQ6PHRpbWVzdGFtcD5gLiBSZXR1cm5zIHRoZSBhcmNoaXZlIGtleXMgd3JpdHRlbi5cbiAgICovXG4gIGFyY2hpdmVDdXJyZW50KG5vdyA9IERhdGUubm93KCkpOiBzdHJpbmdbXSB7XG4gICAgY29uc3QgYXJjaGl2ZWQ6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKCF0aGlzLnN0b3JhZ2UpIHJldHVybiBhcmNoaXZlZDtcbiAgICBmb3IgKGNvbnN0IHNjaGVtYSBvZiBbQ1VSUkVOVF9TQVZFX1NDSEVNQSwgREVTSUdOX1NBVkVfU0NIRU1BLCBTQVZFX1NDSEVNQV0gYXMgY29uc3QpIHtcbiAgICAgIGNvbnN0IGtleSA9IHNhdmVLZXkodGhpcy5zZWVkLCBzY2hlbWEpO1xuICAgICAgY29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlLmdldEl0ZW0oa2V5KTtcbiAgICAgIGlmIChyYXcgPT09IG51bGwpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgdGFyZ2V0ID0gYCR7a2V5fTphcmNoaXZlZDoke25vd31gO1xuICAgICAgdGhpcy5zdG9yYWdlLnNldEl0ZW0odGFyZ2V0LCByYXcpO1xuICAgICAgaWYgKHRoaXMuc3RvcmFnZS5nZXRJdGVtKHRhcmdldCkgIT09IHJhdykgdGhyb3cgbmV3IEVycm9yKCdhcmNoaXZlIHdyaXRlIGNvdWxkIG5vdCBiZSB2ZXJpZmllZCcpO1xuICAgICAgdGhpcy5zdG9yYWdlLnJlbW92ZUl0ZW0oa2V5KTtcbiAgICAgIGFyY2hpdmVkLnB1c2godGFyZ2V0KTtcbiAgICB9XG4gICAgcmV0dXJuIGFyY2hpdmVkO1xuICB9XG5cbiAgcHJpdmF0ZSBnZW5lc2lzKCk6IEdhbWVTZXNzaW9uIHtcbiAgICByZXR1cm4gR2FtZVNlc3Npb24uZ2VuZXNpcyh0aGlzLnNlZWQsIHRoaXMubmV3V29ybGRHZW5lcmF0b3IpO1xuICB9XG5cbiAgbG9hZCgpOiBMb2FkUmVzdWx0IHtcbiAgICBsZXQgcmF3OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgc2NoZW1hOiBTYXZlUmVjb3JkWydzY2hlbWEnXSA9IENVUlJFTlRfU0FWRV9TQ0hFTUE7XG4gICAgdGhpcy5zY2hlbWEgPSBDVVJSRU5UX1NBVkVfU0NIRU1BO1xuICAgIHRoaXMucGVyc2lzdGVudCA9IGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICByYXcgPSB0aGlzLnN0b3JhZ2U/LmdldEl0ZW0oc2F2ZUtleSh0aGlzLnNlZWQsIHNjaGVtYSkpID8/IG51bGw7XG4gICAgICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBbQ1VSUkVOVF9TQVZFX1NDSEVNQSwgREVTSUdOX1NBVkVfU0NIRU1BLCBTQVZFX1NDSEVNQV0gYXMgY29uc3QpIHtcbiAgICAgICAgcmF3ID0gdGhpcy5zdG9yYWdlPy5nZXRJdGVtKHNhdmVLZXkodGhpcy5zZWVkLCBjYW5kaWRhdGUpKSA/PyBudWxsO1xuICAgICAgICBpZiAocmF3ICE9PSBudWxsKSB7IHNjaGVtYSA9IGNhbmRpZGF0ZTsgdGhpcy5zY2hlbWEgPSBjYW5kaWRhdGU7IGJyZWFrOyB9XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiB0aGlzLnVuYXZhaWxhYmxlKGBMb2NhbCBzYXZlIHVuYXZhaWxhYmxlOiAkeyhlcnJvciBhcyBFcnJvcikubWVzc2FnZX07IHRoaXMgc2Vzc2lvbiBpcyB2b2xhdGlsZS5gKTtcbiAgICB9XG4gICAgaWYgKHJhdyA9PT0gbnVsbCkge1xuICAgICAgaWYgKCF0aGlzLnN0b3JhZ2UpIHJldHVybiB0aGlzLnVuYXZhaWxhYmxlKCdMb2NhbCBzdG9yYWdlIGlzIHVuYXZhaWxhYmxlOyB0aGlzIHNlc3Npb24gaXMgdm9sYXRpbGUuJyk7XG4gICAgICB0aGlzLnN0YXR1cyA9ICduZXcnO1xuICAgICAgdGhpcy5tZXNzYWdlID0gJ05ldyBsb2NhbCB3b3JsZC4nO1xuICAgICAgcmV0dXJuIHRoaXMucmVzdWx0KHRoaXMuZ2VuZXNpcygpKTtcbiAgICB9XG4gICAgY29uc3Qga2V5ID0gc2F2ZUtleSh0aGlzLnNlZWQsIHNjaGVtYSk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHNhdmUgPSBwYXJzZVNhdmUocmF3LCB0aGlzLnNlZWQsIHNjaGVtYSk7XG4gICAgICBjb25zdCBzZXNzaW9uID0gR2FtZVNlc3Npb24ucmVzdG9yZShzYXZlLnNuYXBzaG90LCBzYXZlLmpvdXJuYWwpO1xuICAgICAgdGhpcy5zdGF0dXMgPSAncmVzdG9yZWQnO1xuICAgICAgdGhpcy5tZXNzYWdlID0gYFJlc3RvcmVkICR7c2Vzc2lvbi5uZXh0U2VxdWVuY2V9IGFjY2VwdGVkIGNvbW1hbmQke3Nlc3Npb24ubmV4dFNlcXVlbmNlID09PSAxID8gJycgOiAncyd9LmA7XG4gICAgICB0aGlzLnBlcnNpc3RlbnQgPSB0cnVlO1xuICAgICAgcmV0dXJuIHRoaXMucmVzdWx0KHNlc3Npb24pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBQcmVzZXJ2ZSB0aGUgcmVqZWN0ZWQgYnl0ZXMgZm9yIGRpYWdub3Npcy4gSWYgcXVhcmFudGluZSBpcyB1bmF2YWlsYWJsZSxcbiAgICAgIC8vIGtlZXAgdGhlIG9yaWdpbmFsIGtleSB1bnRvdWNoZWQgYW5kIG1ha2UgdGhpcyBzZXNzaW9uIGV4cGxpY2l0bHkgdm9sYXRpbGUuXG4gICAgICB0cnkge1xuICAgICAgICBpZiAoIXRoaXMuc3RvcmFnZSkgdGhyb3cgbmV3IEVycm9yKCdsb2NhbCBzdG9yYWdlIGlzIHVuYXZhaWxhYmxlJyk7XG4gICAgICAgIHRoaXMuc3RvcmFnZS5zZXRJdGVtKGAke2tleX06Y29ycnVwdGAsIHJhdyk7XG4gICAgICAgIHRoaXMuc3RvcmFnZS5yZW1vdmVJdGVtKGtleSk7XG4gICAgICAgIHRoaXMuc3RhdHVzID0gJ2NvcnJ1cHQnO1xuICAgICAgICB0aGlzLm1lc3NhZ2UgPSBgU2F2ZSByZWplY3RlZDogJHsoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2V9LiBPcmlnaW5hbCBieXRlcyBxdWFyYW50aW5lZDsgc3RhcnRlZCBhIG5ldyB3b3JsZC5gO1xuICAgICAgICByZXR1cm4gdGhpcy5yZXN1bHQodGhpcy5nZW5lc2lzKCkpO1xuICAgICAgfSBjYXRjaCAocXVhcmFudGluZUVycm9yKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnVuYXZhaWxhYmxlKGBTYXZlIHJlamVjdGVkOiAkeyhlcnJvciBhcyBFcnJvcikubWVzc2FnZX07IHF1YXJhbnRpbmUgZmFpbGVkOiAkeyhxdWFyYW50aW5lRXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2V9LiBPcmlnaW5hbCBzYXZlIGxlZnQgdW50b3VjaGVkOyB0aGlzIHNlc3Npb24gaXMgdm9sYXRpbGUuYCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqIFJlcGxhY2UgdGhlIHNvbGUgcmVjb3JkIG9ubHkgYWZ0ZXIgYW4gYWNjZXB0ZWQgY29tbWFuZCByZWFjaGVzIHRoZSBqb3VybmFsLiAqL1xuICBzYXZlKHNlc3Npb246IEdhbWVTZXNzaW9uKTogU2F2ZVJlc3VsdCB7XG4gICAgdHJ5IHtcbiAgICAgIGlmICghdGhpcy5zdG9yYWdlKSB0aHJvdyBuZXcgRXJyb3IoJ2xvY2FsIHN0b3JhZ2UgaXMgdW5hdmFpbGFibGUnKTtcbiAgICAgIGlmIChzZXNzaW9uLndvcmxkLnNlZWQgIT09IHRoaXMuc2VlZCkgdGhyb3cgbmV3IEVycm9yKCdzYXZlIHNlZWQgZG9lcyBub3QgbWF0Y2ggdGhpcyBicm93c2VyIHNlc3Npb24nKTtcbiAgICAgIGNvbnN0IHNjaGVtYSA9IHNlc3Npb24uam91cm5hbC5zY2hlbWE7XG4gICAgICBpZiAoc2NoZW1hICE9PSBTQVZFX1NDSEVNQSAmJiBzY2hlbWEgIT09IERFU0lHTl9TQVZFX1NDSEVNQSAmJiBzY2hlbWEgIT09IENVUlJFTlRfU0FWRV9TQ0hFTUEpIHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQgam91cm5hbCBzY2hlbWEnKTtcbiAgICAgIGNvbnN0IHJlY29yZDogU2F2ZVJlY29yZCA9IHtcbiAgICAgICAgc2NoZW1hLCBzZWVkOiB0aGlzLnNlZWQsXG4gICAgICAgIHNuYXBzaG90OiBzZXNzaW9uLnNuYXBzaG90LCBqb3VybmFsOiBzZXNzaW9uLmpvdXJuYWwsXG4gICAgICB9O1xuICAgICAgY29uc3QgcmF3ID0gSlNPTi5zdHJpbmdpZnkocmVjb3JkKTtcbiAgICAgIGlmIChyYXcubGVuZ3RoID4gTUFYX1NBVkVfSlNPTl9CWVRFUykgdGhyb3cgbmV3IEVycm9yKCdzYXZlIGV4Y2VlZHMgdGhlIEpTT04gc2l6ZSBsaW1pdCcpO1xuICAgICAgdGhpcy5zdG9yYWdlLnNldEl0ZW0oc2F2ZUtleSh0aGlzLnNlZWQsIHNjaGVtYSksIHJhdyk7XG4gICAgICB0aGlzLnNjaGVtYSA9IHNjaGVtYTtcbiAgICAgIHRoaXMuc3RhdHVzID0gJ3NhdmVkJztcbiAgICAgIHRoaXMubWVzc2FnZSA9ICdTYXZlZCBsb2NhbGx5Lic7XG4gICAgICB0aGlzLnBlcnNpc3RlbnQgPSB0cnVlO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIG1lc3NhZ2U6IHRoaXMubWVzc2FnZSB9O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0aGlzLnN0YXR1cyA9ICd1bmF2YWlsYWJsZSc7XG4gICAgICB0aGlzLm1lc3NhZ2UgPSBgU2F2ZSBmYWlsZWQ6ICR7KGVycm9yIGFzIEVycm9yKS5tZXNzYWdlfS4gTGF0ZXN0IGFjY2VwdGVkIHdvcmsgaXMgbm90IHNhZmVseSBwZXJzaXN0ZWQuYDtcbiAgICAgIHRoaXMucGVyc2lzdGVudCA9IGZhbHNlO1xuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBtZXNzYWdlOiB0aGlzLm1lc3NhZ2UgfTtcbiAgICB9XG4gIH1cblxuICBtZXRyaWNzKCk6IFBlcnNpc3RlbmNlTWV0cmljcyB7XG4gICAgcmV0dXJuIHsgc2NoZW1hOiB0aGlzLnNjaGVtYSwga2V5OiBzYXZlS2V5KHRoaXMuc2VlZCwgdGhpcy5zY2hlbWEpLCBzdGF0dXM6IHRoaXMuc3RhdHVzLCBwZXJzaXN0ZW50OiB0aGlzLnBlcnNpc3RlbnQsIG1lc3NhZ2U6IHRoaXMubWVzc2FnZSB9O1xuICB9XG5cbiAgcHJpdmF0ZSByZXN1bHQoc2Vzc2lvbjogR2FtZVNlc3Npb24pOiBMb2FkUmVzdWx0IHtcbiAgICByZXR1cm4geyBzZXNzaW9uLCBzdGF0dXM6IHRoaXMuc3RhdHVzLCBtZXNzYWdlOiB0aGlzLm1lc3NhZ2UgfTtcbiAgfVxuXG4gIHByaXZhdGUgdW5hdmFpbGFibGUobWVzc2FnZTogc3RyaW5nKTogTG9hZFJlc3VsdCB7XG4gICAgdGhpcy5zdGF0dXMgPSAndW5hdmFpbGFibGUnO1xuICAgIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG4gICAgdGhpcy5wZXJzaXN0ZW50ID0gZmFsc2U7XG4gICAgcmV0dXJuIHRoaXMucmVzdWx0KHRoaXMuZ2VuZXNpcygpKTtcbiAgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFBLE9BQU8sWUFBWTtBQUNuQixPQUFPLFVBQVU7QUFDakIsWUFBWUEsWUFBVzs7O0FDRWhCLElBQU0saUJBQWlCLENBQUMsU0FBUyxRQUFRLE9BQU8sV0FBVyxRQUFRLFNBQVMsTUFBTTtBQUVsRixJQUFNLG1CQUFtQjtBQUN6QixJQUFNLHFCQUFxQjtBQUMzQixJQUFNLHNCQUFzQjtBQUM1QixJQUFNLHdCQUF3QjtBQUM5QixJQUFNLG9CQUFvQjtBQUUx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QU0sUUFBUSxTQUFTLE9BQU8sQ0FBQyxVQUFVLE1BQU0sU0FBUyxNQUFNLEVBQUUsUUFBUSxDQUFDO0FBQ2hGLFNBQU8sYUFBYSxNQUFNLEtBQUssUUFBUSxDQUFDO0FBQ3hDLFNBQU87QUFBQSxJQUFNLFFBQVEsU0FBUyxPQUFPLENBQUMsVUFBVSxNQUFNLFNBQVMsTUFBTSxFQUFFO0FBQUEsSUFBUTtBQUFBLElBQzdFO0FBQUEsRUFBd0Q7QUFDNUQsQ0FBQzsiLAogICJuYW1lcyI6IFsiVEhSRUUiLCAiam9iIiwgImEiLCAiYiIsICJzbW9vdGgiLCAidG90YWwiLCAiaWQiLCAiaWQiLCAiaWQiLCAidGV4dCIsICJpZCIsICJvYmplY3QiLCAidGV4dCIsICJpZCIsICJ0b3RhbCIsICJpbnZlbnRvcnkiLCAiaWQiLCAiaWQiLCAiZGlnZXN0IiwgImZhaWwiLCAidGV4dCIsICJpbnZlbnRvcnkiLCAiaWQiLCAiaWQiLCAiaWQiLCAidWludCIsICJlbnRpdHlJZCIsICJvdXRjb21lIiwgImhpc3RvcmljYWwiLCAiZXJyb3IiLCAiaWQiLCAiZXJyb3IiXQp9Cg==
