// Schema-3 life loop. All quantities are integers and all mutations are driven
// by accepted commands; wall-clock time and rendering never advance this state.
import type { World } from './world';

/** Every resource a bag or store may hold. M006 adds animal products and carried water buckets. */
export const LIFE_RESOURCES = ['eggs', 'fiber', 'food', 'milk', 'ore', 'rations', 'seed', 'stone', 'water', 'wood', 'wool'] as const;
export type LifeResource = (typeof LIFE_RESOURCES)[number];
export const CARRIED_CAPACITY = 120;
export const STOCKPILE_CAPACITY = 200;
export const MAX_PRODUCTION_JOBS = 16;
export const MAX_TICKS_PER_COMMAND = 64;
export const CROP_GROWTH_TICKS = 4;
/** Fixed harvest from one ready crop plot. Journal outcomes must match it exactly. */
export const CROP_YIELD = { food: 6, fiber: 1 } as const;
export const CROP_YIELD_LABEL = `${CROP_YIELD.food} food + ${CROP_YIELD.fiber} fiber`;
export const FOUNDER_STOCKPILE_ID = 'stockpile:founder';
export const FOUNDER_STOCKPILE = { id: FOUNDER_STOCKPILE_ID, x: -50, z: -32, capacity: STOCKPILE_CAPACITY } as const;

export type LifeResourceBag = Partial<Record<LifeResource, number>>;

export interface Stockpile {
  id: typeof FOUNDER_STOCKPILE_ID;
  x: number;
  z: number;
  capacity: typeof STOCKPILE_CAPACITY;
  inventory: Record<string, number>;
}

export type RecipeId = 'seed' | 'rations';
export const RECIPES: Record<RecipeId, { input: LifeResourceBag; output: LifeResourceBag; ticks: number }> = {
  seed: { input: { fiber: 2 }, output: { seed: 3 }, ticks: 1 },
  rations: { input: { food: 2 }, output: { rations: 3 }, ticks: 2 },
};

export interface ProductionJob {
  id: string;
  stockpileId: typeof FOUNDER_STOCKPILE_ID;
  recipe: RecipeId;
  remainingTicks: number;
}

/** Fixed plots correspond to the nine authoritative terrace crop-row volumes. */
export const CROP_PLOT_IDS = Array.from({ length: 9 }, (_, i) => `crop:${i}`);
export interface CropPlot {
  id: string;
  plantedTick: number;
  growthTicks: typeof CROP_GROWTH_TICKS;
}

export interface LifeState {
  stockpiles: Map<string, Stockpile>;
  jobs: Map<string, ProductionJob>;
  crops: Map<string, CropPlot>;
  tick: number;
}

export function createLifeState(): LifeState {
  return {
    stockpiles: new Map([[FOUNDER_STOCKPILE_ID, {
      id: FOUNDER_STOCKPILE_ID, x: FOUNDER_STOCKPILE.x, z: FOUNDER_STOCKPILE.z,
      capacity: STOCKPILE_CAPACITY, inventory: {},
    }]]), jobs: new Map(), crops: new Map(), tick: 0,
  };
}

export function total(bag: Record<string, number>): number {
  return Object.values(bag).reduce((sum, amount) => sum + amount, 0);
}

export function cloneBag(bag: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(bag).filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => a.localeCompare(b)));
}

export function lifeState(world: World): LifeState {
  if (!world.life) throw new Error('life-loop commands require a schema-3 world');
  return world.life;
}

export type LifeFailure = { ok: false; code: string; reasons: string[] };
export type LifeSuccess<T> = { ok: true; value: T };
export type LifeResult<T> = LifeSuccess<T> | LifeFailure;
function rejectLife(code: string, reasons: string[]): LifeFailure {
  return { ok: false, code, reasons };
}
type ParsedAmount = { ok: true; resource: LifeResource; amount: number } | { ok: false; reasons: string[] };
function requireAmount(bag: LifeResourceBag): ParsedAmount {
  const entries = Object.entries(bag);
  if (entries.length !== 1) return { ok: false, reasons: ['transfer exactly one resource at a time'] };
  const [resource, amount] = entries[0];
  if (!LIFE_RESOURCES.includes(resource as LifeResource) || !Number.isSafeInteger(amount) || (amount ?? 0) <= 0) {
    return { ok: false, reasons: ['resource amount must be a positive integer'] };
  }
  return { ok: true, resource: resource as LifeResource, amount };
}

function move(world: World, from: Record<string, number>, to: Record<string, number>,
  requested: LifeResourceBag, toCapacity: number): LifeResult<LifeResourceBag> {
  const checked = requireAmount(requested);
  if (!checked.ok) return rejectLife('invalid_transfer', [checked.reasons[0]]);
  const { resource, amount } = checked;
  if ((from[resource] ?? 0) < amount) return rejectLife('insufficient_resources', [`need ${amount} ${String(resource)}, have ${from[resource] ?? 0}`]);
  if (total(to) + amount > toCapacity) return rejectLife('capacity_exceeded', [`destination capacity ${toCapacity} would be exceeded`]);
  from[resource] = (from[resource] ?? 0) - amount;
  if (from[resource] === 0) delete from[resource];
  to[resource] = (to[resource] ?? 0) + amount;
  world.revision++;
  return { ok: true, value: { [resource]: amount } };
}

export function transfer(world: World, kind: 'deposit' | 'withdraw', bag: LifeResourceBag): LifeResult<LifeResourceBag> {
  const life = lifeState(world);
  const stock = life.stockpiles.get(FOUNDER_STOCKPILE_ID);
  if (!stock) return rejectLife('missing_stockpile', ['founder stockpile is absent']);
  return kind === 'deposit'
    ? move(world, world.inventory, stock.inventory, bag, stock.capacity)
    : move(world, stock.inventory, world.inventory, bag, CARRIED_CAPACITY);
}

export function startProduction(world: World, recipeId: RecipeId, jobId: string): LifeResult<ProductionJob> {
  const life = lifeState(world);
  const stock = life.stockpiles.get(FOUNDER_STOCKPILE_ID);
  if (!stock) return rejectLife('missing_stockpile', ['founder stockpile is absent']);
  if (life.jobs.has(jobId)) return rejectLife('duplicate_job', ['production job already exists']);
  if (life.jobs.size >= MAX_PRODUCTION_JOBS) return rejectLife('job_limit', [`at most ${MAX_PRODUCTION_JOBS} jobs may be active`]);
  const recipe = RECIPES[recipeId];
  for (const [resource, amount] of Object.entries(recipe.input)) {
    if ((stock.inventory[resource] ?? 0) < (amount ?? 0)) {
      return rejectLife('insufficient_resources', [`need ${amount} ${String(resource)}, have ${stock.inventory[resource] ?? 0}`]);
    }
  }
  const reservedOutput = [...life.jobs.values()].filter((j) => j.stockpileId === stock.id)
    .reduce((sum, job) => sum + total(cloneBag(RECIPES[job.recipe].output as Record<string, number>)), 0);
  if (total(stock.inventory) - total(cloneBag(recipe.input as Record<string, number>))
    + reservedOutput + total(cloneBag(recipe.output as Record<string, number>)) > stock.capacity) {
    return rejectLife('capacity_exceeded', ['reserved production output would exceed stockpile capacity']);
  }
  for (const [resource, amount] of Object.entries(recipe.input)) {
    stock.inventory[resource] = (stock.inventory[resource] ?? 0) - (amount ?? 0);
    if (stock.inventory[resource] === 0) delete stock.inventory[resource];
  }
  const job: ProductionJob = { id: jobId, stockpileId: stock.id, recipe: recipeId, remainingTicks: recipe.ticks };
  life.jobs.set(job.id, job);
  world.revision++;
  return { ok: true, value: { ...job } };
}

/** Plant into an empty fixed terrace plot. The founder farm must already exist. */
export function plantCrop(world: World, plotId: string): LifeResult<CropPlot> {
  const life = lifeState(world);
  if (!CROP_PLOT_IDS.includes(plotId)) return rejectLife('invalid_plot', ['unknown crop plot']);
  if (![...world.structures.values()].some((s) => s.kind === 'terrace')) {
    return rejectLife('farm_required', ['build the founder terraced farm before planting']);
  }
  if (life.crops.has(plotId)) return rejectLife('plot_occupied', ['crop plot is already planted']);
  const stock = life.stockpiles.get(FOUNDER_STOCKPILE_ID);
  if (!stock || (stock.inventory.seed ?? 0) < 1) return rejectLife('insufficient_resources', ['need 1 seed in the founder stockpile']);
  stock.inventory.seed!--;
  if (stock.inventory.seed === 0) delete stock.inventory.seed;
  const crop: CropPlot = { id: plotId, plantedTick: life.tick, growthTicks: CROP_GROWTH_TICKS };
  life.crops.set(plotId, crop);
  world.revision++;
  return { ok: true, value: { ...crop } };
}

export function cropReady(crop: CropPlot, tick: number): boolean {
  return tick - crop.plantedTick >= crop.growthTicks;
}

export function harvestCrop(world: World, plotId: string): LifeResult<{ food: number; fiber: number }> {
  const life = lifeState(world);
  const crop = life.crops.get(plotId);
  if (!crop) return rejectLife('not_planted', ['crop plot is empty']);
  if (!cropReady(crop, life.tick)) return rejectLife('crop_not_ready', [`crop needs ${crop.growthTicks - (life.tick - crop.plantedTick)} more ticks`]);
  // Plant growth is the explicit biological source; every other life-loop
  // transformation conserves its declared inputs and outputs.
  const yieldBag = { food: CROP_YIELD.food, fiber: CROP_YIELD.fiber };
  if (total(world.inventory) + yieldBag.food + yieldBag.fiber > CARRIED_CAPACITY) {
    return rejectLife('capacity_exceeded', [`carried capacity ${CARRIED_CAPACITY} would be exceeded`]);
  }
  world.inventory.food = (world.inventory.food ?? 0) + yieldBag.food;
  world.inventory.fiber = (world.inventory.fiber ?? 0) + yieldBag.fiber;
  life.crops.delete(plotId);
  world.revision++;
  return { ok: true, value: yieldBag };
}

export interface TickOutcome {
  fromTick: number;
  toTick: number;
  completedJobs: Array<{ id: string; recipe: RecipeId; output: Record<string, number> }>;
  readyCrops: string[];
}

/** `onStep` runs after production jobs on every tick (the homestead simulation). */
export function advanceTicks(world: World, count: number, onStep?: (tick: number) => void): LifeResult<TickOutcome> {
  const life = lifeState(world);
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_TICKS_PER_COMMAND) {
    return rejectLife('invalid_tick_count', [`ticks must be an integer from 1 to ${MAX_TICKS_PER_COMMAND}`]);
  }
  const completed: TickOutcome['completedJobs'] = [];
  const fromTick = life.tick;
  // Jobs are processed in stable id order at each tick, never map insertion,
  // wall time, frame delta, or asynchronous completion order.
  for (let step = 0; step < count; step++) {
    life.tick++;
    for (const job of [...life.jobs.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      job.remainingTicks--;
      if (job.remainingTicks > 0) continue;
      const stock = life.stockpiles.get(job.stockpileId);
      if (!stock) throw new Error('active production references a missing stockpile');
      const output = cloneBag(RECIPES[job.recipe].output as Record<string, number>);
      if (total(stock.inventory) + total(output) > stock.capacity) throw new Error('reserved production output exceeds capacity');
      for (const [resource, amount] of Object.entries(output)) stock.inventory[resource] = (stock.inventory[resource] ?? 0) + amount;
      life.jobs.delete(job.id);
      completed.push({ id: job.id, recipe: job.recipe, output });
    }
    onStep?.(life.tick);
  }
  const readyCrops = [...life.crops.values()].filter((crop) => cropReady(crop, life.tick)
    && crop.plantedTick + crop.growthTicks > fromTick).map((crop) => crop.id).sort();
  world.revision++;
  return { ok: true, value: { fromTick, toTick: life.tick, completedJobs: completed, readyCrops } };
}
