// Versioned, JSON-safe snapshots of complete authoritative M002 state.
// Chunk bytes, height/material caches, renderer data and timing counters are
// regenerated from the manifest and durable edits; they are not a second save.
import {
  CHUNK_SIZE, CHUNK_VOLUME, CHUNKS_PER_SIDE, Entity, EntityKind,
  GENERATOR_VERSION, HALF, MatId, ResourceType, World, WorldManifest,
  createWorld, placeAuthoredSites, worldManifest, ensureChunk, isRetiredStoneKind,
  markEditsChanged, isSupportedGenerator, MAX_MAT_ID, touchStructures,
} from './world';
import { FOUNDER_DESIGN_VERSION, Structure } from './structures';
import {
  enableStoneReplay, finishStoneReplay, isHistoricalStoneHash, isStoneReplay,
} from './stone-compat';
import { HomesteadState, homesteadSnapshot, validateHomestead, cloneHomestead } from './homestead';
import {
  CARRIED_CAPACITY, CROP_GROWTH_TICKS, CROP_PLOT_IDS, FOUNDER_STOCKPILE,
  FOUNDER_STOCKPILE_ID, LIFE_RESOURCES, MAX_PRODUCTION_JOBS, MAX_TICKS_PER_COMMAND,
  RECIPES, STOCKPILE_CAPACITY, createLifeState,
} from './economy';

export const SNAPSHOT_SCHEMA = 1 as const;
export const DESIGN_SNAPSHOT_SCHEMA = 2 as const;
export const CURRENT_SNAPSHOT_SCHEMA = 3 as const;
export const MAX_SNAPSHOT_JSON_BYTES = 25_000_000;
export const MAX_SNAPSHOT_EDITS = 1_000_000;
export const MAX_SNAPSHOT_ENTITIES = 500_000;

interface BaseWorldSnapshot {
  schema: typeof SNAPSHOT_SCHEMA | typeof DESIGN_SNAPSHOT_SCHEMA | typeof CURRENT_SNAPSHOT_SCHEMA;
  manifest: WorldManifest;
  revision: number;
  edits: Array<{ chunk: string; cells: Array<{ i: number; m: number }> }>;
  entities: Entity[];
  /** Chunks with durable generated-entity changes; pure queries are excluded. */
  entityChunks: string[];
  entityRemovals: string[];
  inventory: Record<string, number>;
  structures: Structure[];
  authoredPlaced: boolean;
  /** Next accepted journal sequence at this snapshot boundary. */
  nextSequence: number;
}
export type WorldSnapshot = BaseWorldSnapshot & ({
  schema: typeof SNAPSHOT_SCHEMA | typeof DESIGN_SNAPSHOT_SCHEMA;
} | {
  schema: typeof CURRENT_SNAPSHOT_SCHEMA;
  tick: number;
  stockpiles: Array<{
    id: typeof FOUNDER_STOCKPILE_ID; x: number; z: number;
    capacity: typeof STOCKPILE_CAPACITY; inventory: Record<string, number>;
  }>;
  jobs: Array<{
    id: string; stockpileId: typeof FOUNDER_STOCKPILE_ID;
    recipe: 'seed' | 'rations'; remainingTicks: number;
  }>;
  crops: Array<{ id: string; plantedTick: number; growthTicks: typeof CROP_GROWTH_TICKS }>;
  /** M006: absent until founded, so older saves keep their exact bytes and hashes. */
  homestead?: HomesteadState;
});
type LifeSnapshot = Extract<WorldSnapshot, { schema: typeof CURRENT_SNAPSHOT_SCHEMA }>;

function cloneEntity(e: Entity): Entity {
  return {
    id: e.id, kind: e.kind, chunk: e.chunk, x: e.x, y: e.y, z: e.z,
    rot: e.rot, scale: e.scale, variant: e.variant, resource: e.resource,
    remaining: e.remaining, yieldPerHarvest: e.yieldPerHarvest, harvested: e.harvested,
    ...(e.harvestedOnce === undefined ? {} : { harvestedOnce: e.harvestedOnce }),
    provisional: e.provisional, authored: e.authored,
  };
}

function cloneStructure(s: Structure): Structure {
  return {
    ...s,
    modules: s.modules.map((m) => ({ ...m })),
    cost: Object.fromEntries(Object.entries(s.cost).filter(([, amount]) => (amount ?? 0) > 0)
      .sort(([a], [b]) => a.localeCompare(b))),
  };
}

export function createWorldSnapshot(
  world: World, nextSequence = 0,
  schema: WorldSnapshot['schema'] = world.life ? CURRENT_SNAPSHOT_SCHEMA
    : [...world.structures.values()].some((s) => s.designVersion === FOUNDER_DESIGN_VERSION)
      ? DESIGN_SNAPSHOT_SCHEMA : SNAPSHOT_SCHEMA,
): WorldSnapshot {
  if (schema !== CURRENT_SNAPSHOT_SCHEMA && (world.life || [...world.structures.values()].some(
    (s) => schema === SNAPSHOT_SCHEMA && s.designVersion !== undefined,
  ))) throw new Error('legacy snapshots cannot contain newer authoritative state');
  const base: BaseWorldSnapshot = {
    schema,
    manifest: worldManifest(world),
    revision: world.revision,
    edits: [...world.edits.entries()].sort(([a], [b]) => a.localeCompare(b)).map(
      ([chunk, cells]) => ({
        chunk,
        cells: [...cells.entries()].sort(([a], [b]) => a - b).map(([i, m]) => ({ i, m })),
      }),
    ),
    entities: [...world.entities.values()].filter((e) => (isHistoricalStoneHash(world) || !isRetiredStoneKind(e.kind))
      && (e.authored || world.entityChanges.has(e.chunk)))
      .sort((a, b) => a.id.localeCompare(b.id)).map(cloneEntity),
    entityChunks: [...world.entityChanges].sort((a, b) => a.localeCompare(b)),
    entityRemovals: [...world.entityRemovals].sort((a, b) => a.localeCompare(b)),
    inventory: Object.fromEntries(Object.entries(world.inventory).filter(([, amount]) => amount > 0)
      .sort(([a], [b]) => a.localeCompare(b))),
    structures: [...world.structures.values()].sort((a, b) => a.id.localeCompare(b.id)).map(cloneStructure),
    authoredPlaced: world.authoredPlaced,
    nextSequence,
  };
  if (schema !== CURRENT_SNAPSHOT_SCHEMA) return { ...base, schema } as WorldSnapshot;
  if (!world.life) throw new Error('schema-3 snapshot requires life state');
  return {
    ...base, schema,
    tick: world.life.tick,
    stockpiles: [...world.life.stockpiles.values()].sort((a, b) => a.id.localeCompare(b.id)).map((s) => ({
      id: s.id, x: s.x, z: s.z, capacity: s.capacity,
      inventory: Object.fromEntries(Object.entries(s.inventory).filter(([, amount]) => amount > 0)
        .sort(([a], [b]) => a.localeCompare(b))),
    })),
    jobs: [...world.life.jobs.values()].sort((a, b) => a.id.localeCompare(b.id)).map((j) => ({ ...j })),
    crops: [...world.life.crops.values()].sort((a, b) => a.id.localeCompare(b.id)).map((c) => ({ ...c })),
    ...(world.homestead ? { homestead: homesteadSnapshot(world.homestead) } : {}),
  };
}

/** Two lanes, with length included; not a cryptographic integrity signature. */
export function canonicalHash(text: string): string {
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ (c + 0x9e), 0x85ebca6b);
    b ^= b >>> 13;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

export function canonicalWorldHash(
  world: World, nextSequence = 0, schema: WorldSnapshot['schema'] = DESIGN_SNAPSHOT_SCHEMA,
): string {
  return canonicalHash(JSON.stringify(createWorldSnapshot(world, nextSequence, schema)));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uint(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function text(value: unknown, maximum = 256): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function validChunk(key: unknown): key is string {
  if (typeof key !== 'string' || !/^-?\d+,-?\d+$/.test(key)) return false;
  const [cx, cz] = key.split(',').map(Number);
  return Number.isInteger(cx) && Number.isInteger(cz)
    && cx >= 0 && cz >= 0 && cx < CHUNKS_PER_SIDE && cz < CHUNKS_PER_SIDE;
}

/** A strict legacy snapshot is already canonical createWorldSnapshot output.
 * Verify its recorded boundary before filtering the three retired stone forms. */
export function legacyStoneHash(snapshot: WorldSnapshot): string {
  return canonicalHash(JSON.stringify(snapshot));
}

/** Migration only: no inventory, structure, life, edit or command data changes. */
/** @internal Retire only after reconstructing the old state in replay mode. */
export function migrateStoneSnapshot(snapshot: WorldSnapshot): WorldSnapshot {
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
    entityRemovals: [...removals].sort((a, b) => a.localeCompare(b)),
  };
}
const ENTITY_KINDS = new Set<EntityKind>([
  'styl_tree_spire', 'styl_tree_table', 'styl_tree_cluster', 'styl_tree_blossom',
  'styl_shrub', 'styl_rock_small', 'styl_rock_medium', 'styl_rock_large',
  'styl_ore', 'styl_cairn', 'waystone', 'marker',
]);
const RESOURCES = new Set<ResourceType>(['wood', 'stone', 'ore', 'fiber']);
const RECORD_RESOURCES = new Set<string>(LIFE_RESOURCES);
const STRUCTURE_KINDS = new Set(['house', 'path', 'terrace']);
const MODULE_KINDS = new Set([
  'floor', 'wall', 'post', 'lintel', 'roof', 'parapet', 'window', 'door',
  'threshold', 'path', 'curb', 'soil_bed', 'retaining_wall', 'crop_row',
]);
const MODULE_TONES = new Set(['stone', 'stone_b', 'ochre', 'timber', 'accent', 'soil', 'crop', 'gravel']);

function validateEntity(value: unknown, ids: Set<string>): Entity {
  if (!isObject(value) || !text(value.id) || ids.has(value.id)
    || !text(value.kind) || !ENTITY_KINDS.has(value.kind as EntityKind)
    || !validChunk(value.chunk)
    || !finite(value.x) || !finite(value.y) || !finite(value.z)
    || value.x < -HALF || value.x >= HALF || value.z < -HALF || value.z >= HALF
    || !finite(value.rot) || !finite(value.scale) || !uint(value.variant, 1000)
    || value.resource !== null && !(typeof value.resource === 'string' && RESOURCES.has(value.resource as ResourceType))
    || !uint(value.remaining, 1_000_000) || !uint(value.yieldPerHarvest, 1_000_000)
    || typeof value.harvested !== 'boolean' || typeof value.provisional !== 'boolean'
    || typeof value.authored !== 'boolean'
    || value.harvestedOnce !== undefined && typeof value.harvestedOnce !== 'boolean') {
    throw new Error('snapshot contains an invalid or duplicate entity');
  }
  ids.add(value.id);
  return {
    id: value.id, kind: value.kind as EntityKind, chunk: value.chunk,
    x: value.x, y: value.y, z: value.z, rot: value.rot, scale: value.scale,
    variant: value.variant, resource: value.resource as ResourceType | null,
    remaining: value.remaining, yieldPerHarvest: value.yieldPerHarvest,
    harvested: value.harvested,
    ...(value.harvestedOnce === undefined ? {} : { harvestedOnce: value.harvestedOnce }),
    provisional: value.provisional, authored: value.authored,
  };
}

function validateInventory(value: unknown): Record<string, number> {
  if (!isObject(value)) throw new Error('snapshot inventory is invalid');
  const out: Record<string, number> = {};
  for (const key of Object.keys(value).sort()) {
    if (!RECORD_RESOURCES.has(key) || !uint(value[key], 1_000_000_000)) {
      throw new Error(`snapshot has invalid inventory resource ${key}`);
    }
    if (value[key] > 0) out[key] = value[key];
  }
  return out;
}

function stockTotal(value: Record<string, number>): number {
  return Object.values(value).reduce((sum, amount) => sum + amount, 0);
}

function validateLifeFields(value: Record<string, unknown>): Pick<LifeSnapshot, 'tick' | 'stockpiles' | 'jobs' | 'crops' | 'homestead'> {
  if (!uint(value.tick, Number.MAX_SAFE_INTEGER)
    || !Array.isArray(value.stockpiles) || value.stockpiles.length !== 1
    || !Array.isArray(value.jobs) || value.jobs.length > MAX_PRODUCTION_JOBS
    || !Array.isArray(value.crops) || value.crops.length > CROP_PLOT_IDS.length) {
    throw new Error('snapshot has invalid life-loop fields');
  }
  const stockpiles: NonNullable<LifeSnapshot['stockpiles']> = [];
  for (const raw of value.stockpiles) {
    if (!isObject(raw) || raw.id !== FOUNDER_STOCKPILE_ID || raw.x !== FOUNDER_STOCKPILE.x
      || raw.z !== FOUNDER_STOCKPILE.z || raw.capacity !== FOUNDER_STOCKPILE.capacity) {
      throw new Error('snapshot has an unsupported stockpile');
    }
    const inventory = validateInventory(raw.inventory);
    if (stockTotal(inventory) > STOCKPILE_CAPACITY) throw new Error('stockpile exceeds capacity');
    stockpiles.push({ id: FOUNDER_STOCKPILE_ID, x: raw.x, z: raw.z,
      capacity: STOCKPILE_CAPACITY, inventory });
  }
  let reserved = stockTotal(stockpiles[0].inventory);
  const ids = new Set<string>();
  const jobs: NonNullable<LifeSnapshot['jobs']> = [];
  for (const raw of value.jobs) {
    if (!isObject(raw) || !text(raw.id, 128) || !/^[A-Za-z0-9][A-Za-z0-9._:%-]*$/.test(raw.id)
      || ids.has(raw.id) || raw.stockpileId !== FOUNDER_STOCKPILE_ID
      || raw.recipe !== 'seed' && raw.recipe !== 'rations'
      || !uint(raw.remainingTicks, MAX_TICKS_PER_COMMAND) || raw.remainingTicks < 1
      || raw.remainingTicks > RECIPES[raw.recipe].ticks) throw new Error('snapshot has an invalid production job');
    reserved += stockTotal(RECIPES[raw.recipe].output as Record<string, number>);
    ids.add(raw.id);
    jobs.push({ id: raw.id, stockpileId: FOUNDER_STOCKPILE_ID, recipe: raw.recipe, remainingTicks: raw.remainingTicks });
  }
  if (reserved > STOCKPILE_CAPACITY) throw new Error('stockpile reserved output exceeds capacity');
  ids.clear();
  const crops: NonNullable<LifeSnapshot['crops']> = [];
  for (const raw of value.crops) {
    if (!isObject(raw) || !CROP_PLOT_IDS.includes(String(raw.id)) || ids.has(String(raw.id))
      || !uint(raw.plantedTick, value.tick) || raw.growthTicks !== CROP_GROWTH_TICKS) {
      throw new Error('snapshot has an invalid crop plot');
    }
    const plotId = String(raw.id);
    ids.add(plotId);
    crops.push({ id: plotId, plantedTick: raw.plantedTick, growthTicks: CROP_GROWTH_TICKS });
  }
  stockpiles.sort((a, b) => a.id.localeCompare(b.id));
  jobs.sort((a, b) => a.id.localeCompare(b.id));
  crops.sort((a, b) => a.id.localeCompare(b.id));
  const homestead = value.homestead === undefined ? undefined : validateHomestead(value.homestead, value.tick);
  // Rules v4: site reservations are store stock set aside, so they can never exceed it.
  for (const st of homestead?.sites ?? []) for (const k of Object.keys(st.reserved)) {
    const held = homestead!.sites!.reduce((n, x) => n + (x.reserved[k] ?? 0), 0);
    // v6: timber in finished woodsheds and log stores is store stock too.
    const stored = homestead!.sites!.reduce((n, x) => n + (x.stock?.[k] ?? 0), 0);
    if (held > (stockpiles[0].inventory[k] ?? 0) + stored) throw new Error('building-site reservations exceed the store');
  }
  return { tick: value.tick, stockpiles, jobs, crops, ...(homestead ? { homestead } : {}) };
}

function validateCost(value: unknown): Partial<Record<ResourceType, number>> {
  const out = validateInventory(value);
  return out;
}

function validateStructure(
  value: unknown, ids: Set<string>, schema: WorldSnapshot['schema'],
): Structure {
  if (!isObject(value) || !text(value.id) || ids.has(value.id)
    || !text(value.kind) || !STRUCTURE_KINDS.has(value.kind)
    || !text(value.siteId)
    || !finite(value.x) || !finite(value.y) || !finite(value.z) || !finite(value.rot)
    || !Array.isArray(value.modules) || value.modules.length > 64
    || !uint(value.builtRevision, Number.MAX_SAFE_INTEGER) || value.provisional !== true
    || schema === SNAPSHOT_SCHEMA && value.designVersion !== undefined
    || schema !== SNAPSHOT_SCHEMA && value.designVersion !== undefined
      && value.designVersion !== FOUNDER_DESIGN_VERSION) {
    throw new Error('snapshot contains an invalid or duplicate structure');
  }
  const modules: Structure['modules'] = [];
  const moduleIds = new Set<string>();
  for (const raw of value.modules) {
    if (!isObject(raw) || !text(raw.kind) || !MODULE_KINDS.has(raw.kind)
      || !finite(raw.x) || !finite(raw.y) || !finite(raw.z)
      || !finite(raw.w) || raw.w <= 0 || !finite(raw.h) || raw.h <= 0 || !finite(raw.d) || raw.d <= 0
      || raw.rot !== undefined && !finite(raw.rot)
      || raw.tone !== undefined && (typeof raw.tone !== 'string' || !MODULE_TONES.has(raw.tone))) {
      throw new Error(`structure ${value.id} contains an invalid module`);
    }
    const signature = JSON.stringify(raw);
    if (moduleIds.has(signature)) throw new Error(`structure ${value.id} contains duplicate modules`);
    moduleIds.add(signature);
    modules.push({
      kind: raw.kind as Structure['modules'][number]['kind'],
      x: raw.x, y: raw.y, z: raw.z, w: raw.w, h: raw.h, d: raw.d,
      ...(raw.rot === undefined ? {} : { rot: raw.rot }),
      ...(raw.tone === undefined ? {} : { tone: raw.tone as Structure['modules'][number]['tone'] }),
    });
  }
  ids.add(value.id);
  return {
    id: value.id, kind: value.kind as Structure['kind'], siteId: value.siteId,
    x: value.x, y: value.y, z: value.z, rot: value.rot,
    modules, cost: validateCost(value.cost), builtRevision: value.builtRevision,
    ...(value.designVersion === undefined ? {} : { designVersion: FOUNDER_DESIGN_VERSION }),
    provisional: true,
  };
}

/** Strict runtime validation; JSON's TypeScript casts are never trusted. */
export function validateWorldSnapshot(value: unknown): WorldSnapshot {
  if (!isObject(value)
    || value.schema !== SNAPSHOT_SCHEMA && value.schema !== DESIGN_SNAPSHOT_SCHEMA
    && value.schema !== CURRENT_SNAPSHOT_SCHEMA
    || !isObject(value.manifest)) {
    throw new Error('unsupported or malformed world snapshot');
  }
  const schema = value.schema;
  const m = value.manifest;
  // Every supported generator restores with its own version; v1 saves keep
  // GENERATOR_VERSION exactly, so their manifests and hashes are unchanged.
  const params = {
    size: 2048, chunkSize: CHUNK_SIZE, yMin: -16, yMax: 112,
    seaLevel: 0, generatorVersion: isSupportedGenerator(m.generatorVersion) ? m.generatorVersion : GENERATOR_VERSION,
  };
  if (m.schema !== 1 || !uint(m.seed, 0xffffffff)
    || !isSupportedGenerator(m.generatorVersion)
    || m.size !== params.size || m.chunkSize !== params.chunkSize
    || m.yMin !== params.yMin || m.yMax !== params.yMax || m.seaLevel !== params.seaLevel
    || !/^[0-9a-f]{8}$/.test(String(m.paramsHash))) {
    throw new Error('snapshot generator configuration is unsupported or incompatible');
  }
  if (!uint(value.revision, Number.MAX_SAFE_INTEGER)
    || !uint(value.nextSequence, 10_000_000)
    || typeof value.authoredPlaced !== 'boolean'
    || !Array.isArray(value.edits) || !Array.isArray(value.entities)
    || !Array.isArray(value.entityRemovals)
    || value.entities.length > MAX_SNAPSHOT_ENTITIES
    || !Array.isArray(value.entityChunks) || !Array.isArray(value.structures)) {
    throw new Error('snapshot has invalid authoritative-state fields');
  }
  const world = createWorld(m.seed, params.generatorVersion);
  // The manifest hash is checked against the actual restored configuration.
  if (worldManifest(world).paramsHash !== m.paramsHash) throw new Error('snapshot manifest hash mismatch');

  const edits: WorldSnapshot['edits'] = [];
  let editCount = 0;
  const chunkIds = new Set<string>();
  for (const raw of value.edits) {
    if (!isObject(raw) || !validChunk(raw.chunk) || chunkIds.has(raw.chunk)
      || !Array.isArray(raw.cells) || raw.cells.length > CHUNK_VOLUME) {
      throw new Error('snapshot contains invalid chunk edits');
    }
    const cellIds = new Set<number>();
    const cells: Array<{ i: number; m: number }> = [];
    for (const cell of raw.cells) {
      if (!isObject(cell) || !uint(cell.i, CHUNK_VOLUME - 1) || cellIds.has(cell.i)
        || !uint(cell.m, MAX_MAT_ID)) throw new Error('snapshot contains an invalid voxel edit');
      cellIds.add(cell.i);
      cells.push({ i: cell.i, m: cell.m });
    }
    cellIds.clear();
    cells.sort((a, b) => a.i - b.i);
    editCount += cells.length;
    if (editCount > MAX_SNAPSHOT_EDITS) throw new Error('snapshot exceeds the bounded edit limit');
    chunkIds.add(raw.chunk);
    edits.push({ chunk: raw.chunk, cells });
  }
  edits.sort((a, b) => a.chunk.localeCompare(b.chunk));

  const entityIds = new Set<string>();
  const entities = value.entities.map((e) => validateEntity(e, entityIds));
  const entityChunks: string[] = [];
  const generated = new Set<string>();
  for (const key of value.entityChunks) {
    if (!validChunk(key) || generated.has(key)) throw new Error('snapshot generated-chunk index is invalid');
    generated.add(key);
    entityChunks.push(key);
  }
  for (const entity of entities) {
    if (!entity.authored && !generated.has(entity.chunk)) throw new Error(`entity ${entity.id} belongs to an unmarked chunk`);
  }
  entityChunks.sort((a, b) => a.localeCompare(b));
  const removals = new Set<string>();
  for (const id of value.entityRemovals) {
    if (!text(id) || removals.has(id) || entityIds.has(id) || !/^e:\d+,\d+:\d+$/.test(id)) {
      throw new Error('snapshot entity tombstone is invalid');
    }
    removals.add(id);
  }
  const entityRemovals = [...removals].sort((a, b) => a.localeCompare(b));

  const structureIds = new Set<string>();
  const structures = value.structures.map((s) => validateStructure(s, structureIds, schema))
    .sort((a, b) => a.id.localeCompare(b.id));
  const carried = validateInventory(value.inventory);
  if (schema === CURRENT_SNAPSHOT_SCHEMA && stockTotal(carried) > CARRIED_CAPACITY) throw new Error('carried inventory exceeds capacity');
  const snapshot: BaseWorldSnapshot = {
    schema,
    manifest: {
      schema: 1, seed: m.seed, generatorVersion: params.generatorVersion,
      size: params.size, chunkSize: params.chunkSize, yMin: params.yMin,
      yMax: params.yMax, seaLevel: params.seaLevel, paramsHash: m.paramsHash,
    },
    revision: value.revision,
    edits,
    entities,
    entityChunks,
    entityRemovals,
    inventory: carried,
    structures,
    authoredPlaced: value.authoredPlaced,
    nextSequence: value.nextSequence,
  };
  const result: WorldSnapshot = schema === CURRENT_SNAPSHOT_SCHEMA
    ? { ...snapshot, schema: CURRENT_SNAPSHOT_SCHEMA, ...validateLifeFields(value) }
    : { ...snapshot, schema: schema as typeof SNAPSHOT_SCHEMA | typeof DESIGN_SNAPSHOT_SCHEMA };
  if (JSON.stringify(result) !== JSON.stringify(value)) {
    throw new Error('snapshot contains unknown, non-canonical or ambiguous fields');
  }
  return result;
}

export function decodeWorldSnapshot(json: string): WorldSnapshot {
  if (json.length > MAX_SNAPSHOT_JSON_BYTES) throw new Error('snapshot exceeds the JSON size limit');
  return validateWorldSnapshot(JSON.parse(json));
}

/** Restore in place so controllers retain the same World reference. All
 * validation happens before mutation, so a rejected save cannot erase work. */
export function restoreWorldSnapshot(world: World, input: WorldSnapshot): void {
  // Ordinary snapshots and transactional rollbacks restore their exact recorded
  // state. Retired historical entities are removed only after GameSession has
  // authenticated the original journal and explicitly migrated that save.
  finishStoneReplay(world);
  restoreWorldSnapshotExact(world, input);
}

/** @internal Historical reconstruction or exact new-snapshot restoration. */
export function restoreWorldSnapshotExact(world: World, input: WorldSnapshot): void {
  const snapshot = validateWorldSnapshot(input);
  if (snapshot.manifest.seed !== world.seed) throw new Error('snapshot seed does not match the world');
  world.params = {
    size: snapshot.manifest.size,
    chunkSize: snapshot.manifest.chunkSize,
    yMin: snapshot.manifest.yMin,
    yMax: snapshot.manifest.yMax,
    seaLevel: snapshot.manifest.seaLevel,
    generatorVersion: snapshot.manifest.generatorVersion,
  };
  world.chunks.clear();
  world.entities.clear();
  world.entityChunks.clear();
  world.entityChanges.clear();
  world.entityRemovals.clear();
  world.structures.clear();
  world.edits.clear();
  world.inventory = { ...snapshot.inventory };
  world.life = snapshot.schema === CURRENT_SNAPSHOT_SCHEMA ? createLifeState() : undefined;
  if (world.life && snapshot.schema === CURRENT_SNAPSHOT_SCHEMA) {
    world.life.tick = snapshot.tick;
    for (const s of snapshot.stockpiles) world.life.stockpiles.set(s.id, { ...s, inventory: { ...s.inventory } });
    for (const j of snapshot.jobs) world.life.jobs.set(j.id, { ...j });
    for (const c of snapshot.crops) world.life.crops.set(c.id, { ...c });
  }
  world.homestead = snapshot.schema === CURRENT_SNAPSHOT_SCHEMA && snapshot.homestead ? cloneHomestead(snapshot.homestead) : undefined;
  world.dirty.clear();
  world.sites = [];
  world.stats = {
    chunksGenerated: 0, chunksEvicted: 0, voxelsFilled: 0, generationMs: 0,
    entities: snapshot.entities.length, trees: 0, pinkTrees: 0, pinkOverflow: 0,
  };
  world.revision = snapshot.revision;
  world.authoredPlaced = snapshot.authoredPlaced;
  for (const key of snapshot.entityChunks) world.entityChanges.add(key);
  // Apply durable voxel edits before any authored-site query can generate a
  // chunk. Otherwise those chunks cache the unedited base terrain permanently.
  for (const delta of snapshot.edits) {
    world.edits.set(delta.chunk, new Map(delta.cells.map((e) => [e.i, e.m as MatId])));
  }
  markEditsChanged(world);
  // Recreate authored site records. Suppress their entity placement so the
  // exact saved entity records below cannot be affected by a modified chunk.
  if (world.authoredPlaced) {
    world.authoredPlaced = false;
    placeAuthoredSites(world);
    world.authoredPlaced = true;
  }
  // Authored placement derives site/entity scaffolding and may advance the
  // revision. The saved revision is restored only after that derived work.
  world.revision = snapshot.revision;
  // Tombstones must exist before any changed chunk regenerates its entities.
  for (const id of snapshot.entityRemovals) world.entityRemovals.add(id);
  // Replace generated entities with the exact saved records, including
  // harvested/removed ones.
  world.entities.clear();
  world.entityChunks.clear();
  // Install persisted entity deltas directly. This is reconstruction, not a
  // command: removeEntity would create fresh tombstones and advance revision.
  for (const key of snapshot.entityChunks) {
    const [cx, cz] = key.split(',').map(Number);
    const chunk = ensureChunk(world, cx, cz);
    if (!chunk) throw new Error(`snapshot references unavailable chunk ${key}`);
    const saved = new Set(snapshot.entities.filter((e) => e.chunk === key).map((e) => e.id));
    // Authored entities for the same chunk survive alongside natural deltas.
    const ids = (world.entityChunks.get(key) ?? []).filter((id) => {
      const entity = world.entities.get(id);
      return !id.startsWith('e:') && !!entity
        && (!isRetiredStoneKind(entity.kind) || isStoneReplay(world));
    });
    for (const id of [...world.entities.keys()]) {
      const entity = world.entities.get(id);
      if (entity?.chunk === key && !entity.authored && !saved.has(id)) world.entities.delete(id);
    }
    for (const id of saved) if (!ids.includes(id)) ids.push(id);
    world.entityChunks.set(key, ids);
  }
  for (const e of snapshot.entities) {
    world.entities.set(e.id, cloneEntity(e));
  }
  for (const key of snapshot.entityChunks) world.entityChanges.add(key);
  world.stats.entities = world.entities.size;
  for (const e of world.entities.values()) {
    if (e.kind.startsWith('styl_tree')) world.stats.trees++;
    if (e.kind === 'styl_tree_blossom') world.stats.pinkTrees++;
  }
  for (const s of snapshot.structures) world.structures.set(s.id, cloneStructure(s));
  touchStructures(world);
}

export function worldFromSnapshot(snapshot: WorldSnapshot): World {
  const valid = validateWorldSnapshot(snapshot);
  const world = createWorld(valid.manifest.seed, valid.manifest.generatorVersion);
  restoreWorldSnapshot(world, valid);
  return world;
}

/** Raw old state is used only while validating a recorded accepted journal. */
export function historicalWorldFromSnapshot(snapshot: WorldSnapshot): World {
  const valid = validateWorldSnapshot(snapshot);
  const world = createWorld(valid.manifest.seed);
  enableStoneReplay(world);
  restoreWorldSnapshotExact(world, valid);
  return world;
}
