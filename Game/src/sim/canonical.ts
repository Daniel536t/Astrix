// Canonical state hashing — pure simulation, no three.js imports.
//
// The no-flatten proof compares the authoritative voxel volume outside the
// complete authorized work envelope. It deliberately does not hash chunk
// heights/topMaterials (derived caches), mesh geometry, streaming state or
// navigation data. Those are checked separately as derived state, so a cache
// or mesh rebuild can never be mistaken for a terrain mutation.
import {
  World, Y_MIN, Y_MAX, HALF, CHUNK_SIZE, CHUNK_AREA,
  ensureChunk, worldToChunkX, worldToChunkZ, chunkKey,
  chunkOriginX, chunkOriginZ, localIndex, yToIndex, isSolid,
  Entity,
} from './world';
import { VoxelRegion, envelopeContains } from './terrain';

export interface StateHash {
  /** 16 hex characters: two independent 32-bit lanes. */
  hash: string;
  cells: number;
  excludedCells: number;
  chunks: number;
  region: VoxelRegion;
}

export interface CacheMismatch {
  x: number;
  z: number;
  field: 'height' | 'material';
  expected: number;
  actual: number;
}

class Hasher {
  private a = 0x811c9dc5;
  private b = 0x9e3779b9;

  byte(v: number): void {
    const x = v & 0xff;
    this.a = Math.imul(this.a ^ x, 0x01000193);
    this.b = Math.imul(this.b ^ (x + 0x9e), 0x85ebca6b);
    this.b ^= this.b >>> 13;
  }

  u32(v: number): void {
    let n = v >>> 0;
    for (let i = 0; i < 4; i++) {
      this.byte(n);
      n >>>= 8;
    }
  }

  string(s: string): void {
    this.u32(s.length);
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }

  hex(): string {
    return (this.a >>> 0).toString(16).padStart(8, '0')
      + (this.b >>> 0).toString(16).padStart(8, '0');
  }
}

export function clampRegion(region: VoxelRegion): VoxelRegion {
  const r: VoxelRegion = {
    x0: Math.max(-HALF, Math.floor(region.x0)),
    z0: Math.max(-HALF, Math.floor(region.z0)),
    x1: Math.min(HALF - 1, Math.floor(region.x1)),
    z1: Math.min(HALF - 1, Math.floor(region.z1)),
    y0: Math.max(Y_MIN, Math.floor(region.y0)),
    y1: Math.min(Y_MAX - 1, Math.floor(region.y1)),
  };
  if (r.x0 > r.x1 || r.z0 > r.z1 || r.y0 > r.y1) {
    throw new Error(`empty voxel region ${JSON.stringify(region)}`);
  }
  return r;
}

/** Sort an envelope so its hash is independent of rect order. */
export function normalizeEnvelope(rects: readonly VoxelRegion[]): VoxelRegion[] {
  return rects
    .map((r) => ({
      x0: Math.floor(r.x0), z0: Math.floor(r.z0), x1: Math.floor(r.x1), z1: Math.floor(r.z1),
      y0: Math.floor(r.y0), y1: Math.floor(r.y1),
    }))
    .sort((a, b) => a.x0 - b.x0 || a.z0 - b.z0 || a.y0 - b.y0
      || a.x1 - b.x1 || a.z1 - b.z1 || a.y1 - b.y1);
}

/** Materialise every chunk that overlaps the region and return sorted keys. */
export function ensureRegionChunks(world: World, region: VoxelRegion): string[] {
  const r = clampRegion(region);
  const keys: string[] = [];
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

/**
 * Hash the authoritative material byte of every voxel in `region`, excluding
 * every voxel inside `exclude`. Two calls with the same region and envelope
 * are directly comparable.
 */
export function canonicalRegionHash(
  world: World,
  region: VoxelRegion,
  exclude: readonly VoxelRegion[] = [],
): StateHash {
  const r = clampRegion(region);
  const envelope = normalizeEnvelope(exclude);
  const keys = ensureRegionChunks(world, r);
  const h = new Hasher();
  h.string('m002:voxel-state:v1');
  h.u32(r.x0); h.u32(r.z0); h.u32(r.x1); h.u32(r.z1); h.u32(r.y0); h.u32(r.y1);
  h.u32(envelope.length);
  for (const e of envelope) {
    h.u32(e.x0); h.u32(e.z0); h.u32(e.x1); h.u32(e.z1); h.u32(e.y0); h.u32(e.y1);
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
    h.string('chunk');
    h.u32(chunk.cx); h.u32(chunk.cz);
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

/** Canonical inventory hash; key order cannot affect the result. */
export function canonicalInventoryHash(world: World): string {
  const h = new Hasher();
  h.string('m002:inventory:v1');
  const keys = Object.keys(world.inventory).sort();
  h.u32(keys.length);
  for (const key of keys) {
    h.string(key);
    h.u32(world.inventory[key]);
  }
  return h.hex();
}

export function inventorySnapshot(world: World): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(world.inventory).sort()) out[key] = world.inventory[key];
  return out;
}

function hashEntity(h: Hasher, e: Entity): void {
  h.string(e.id);
  h.string(e.kind);
  h.string(e.chunk);
  h.u32(Math.round(e.x * 1000));
  h.u32(Math.round(e.y * 1000));
  h.u32(Math.round(e.z * 1000));
  h.u32(Math.round(e.rot * 10000));
  h.u32(Math.round(e.scale * 1000));
  h.u32(e.variant);
  h.string(e.resource ?? '');
  h.u32(e.remaining);
  h.u32(e.harvested ? 1 : 0);
  h.u32(e.harvestedOnce ? 1 : 0);
}

/** Hash entity state; with a region, only entities rooted inside it. */
export function canonicalEntityHash(world: World, region?: VoxelRegion): string {
  let entities: Entity[];
  if (region) {
    const r = clampRegion(region);
    ensureRegionChunks(world, r);
    entities = [...world.entities.values()].filter(
      (e) => e.x >= r.x0 && e.x < r.x1 + 1 && e.z >= r.z0 && e.z < r.z1 + 1,
    );
  } else {
    entities = [...world.entities.values()];
  }
  entities.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const h = new Hasher();
  h.string('m002:entity-state:v1');
  h.u32(entities.length);
  for (const e of entities) hashEntity(h, e);
  return h.hex();
}

/**
 * Canonical hash of built structures. Layout modules and paid costs are
 * authoritative simulation state; renderer meshes are not.
 */
export function canonicalStructureHash(world: World): string {
  const structures = [...world.structures.values()]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const h = new Hasher();
  h.string('m002:structure-state:v1');
  h.u32(structures.length);
  for (const s of structures) {
    h.string(s.id);
    h.string(s.kind);
    h.string(s.siteId);
    h.u32(Math.round(s.x * 1000));
    h.u32(Math.round(s.y * 1000));
    h.u32(Math.round(s.z * 1000));
    h.u32(Math.round(s.rot * 10000));
    h.u32(s.modules.length);
    for (const m of s.modules) {
      h.string(m.kind);
      h.u32(Math.round(m.x * 1000));
      h.u32(Math.round(m.y * 1000));
      h.u32(Math.round(m.z * 1000));
      h.u32(Math.round(m.w * 1000));
      h.u32(Math.round(m.h * 1000));
      h.u32(Math.round(m.d * 1000));
      h.u32(Math.round((m.rot ?? 0) * 10000));
      h.string(m.tone ?? '');
    }
    const costKeys = Object.keys(s.cost).sort();
    h.u32(costKeys.length);
    for (const key of costKeys) {
      h.string(key);
      h.u32(s.cost[key as keyof typeof s.cost] ?? 0);
    }
    h.u32(s.builtRevision);
  }
  return h.hex();
}

export interface CacheHash {
  hash: string;
  columns: number;
  chunks: number;
}

/** Derived column-cache hash. Not authoritative terrain state. */
export function derivedCacheHash(world: World, region: VoxelRegion): CacheHash {
  const r = clampRegion(region);
  const keys = ensureRegionChunks(world, r);
  const h = new Hasher();
  h.string('m002:derived-column-cache:v1');
  h.u32(r.x0); h.u32(r.z0); h.u32(r.x1); h.u32(r.z1);
  let columns = 0;
  for (const key of keys) {
    const chunk = world.chunks.get(key);
    if (!chunk) throw new Error(`chunk ${key} was not generated`);
    const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
    const lx0 = Math.max(0, r.x0 - ox), lx1 = Math.min(CHUNK_SIZE - 1, r.x1 - ox);
    const lz0 = Math.max(0, r.z0 - oz), lz1 = Math.min(CHUNK_SIZE - 1, r.z1 - oz);
    h.string('chunk');
    h.u32(chunk.cx); h.u32(chunk.cz);
    for (let lz = lz0; lz <= lz1; lz++) {
      for (let lx = lx0; lx <= lx1; lx++) {
        const col = lz * CHUNK_SIZE + lx;
        h.u32(chunk.heights[col]);
        h.u32(chunk.topMaterials[col]);
        columns++;
      }
    }
  }
  return { hash: h.hex(), columns, chunks: keys.length };
}

/**
 * Recompute every column cache from the authoritative voxel data and report
 * mismatches. This proves heights/topMaterials are derived, not a second
 * terrain representation.
 */
export function checkDerivedCaches(world: World, region: VoxelRegion, limit = 64): CacheMismatch[] {
  const r = clampRegion(region);
  const keys = ensureRegionChunks(world, r);
  const out: CacheMismatch[] = [];
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
          if (isSolid(m)) { topSolid = y; topMat = m; break; }
        }
        const expectedHeight = topSolid - Y_MIN;
        if (chunk.heights[col] !== expectedHeight) {
          out.push({ x: ox + lx, z: oz + lz, field: 'height', expected: expectedHeight, actual: chunk.heights[col] });
        }
        if (chunk.topMaterials[col] !== topMat) {
          out.push({ x: ox + lx, z: oz + lz, field: 'material', expected: topMat, actual: chunk.topMaterials[col] });
        }
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

export interface EditOutside {
  chunk: string;
  index: number;
  x: number;
  y: number;
  z: number;
  material: number;
}

/** Every recorded voxel edit outside the authorized work envelope. */
export function editsOutsideEnvelope(world: World, envelope: readonly VoxelRegion[]): EditOutside[] {
  const out: EditOutside[] = [];
  for (const [key, edits] of world.edits) {
    const [cx, cz] = key.split(',').map(Number);
    const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
    for (const [index, material] of edits) {
      const lx = index % CHUNK_SIZE;
      const lz = Math.floor((index % CHUNK_AREA) / CHUNK_SIZE);
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

/** New chunks generated since the baseline that do not overlap the envelope. */
export function newChunksOutsideEnvelope(
  world: World, baselineKeys: Iterable<string>, envelope: readonly VoxelRegion[],
): string[] {
  const baseline = new Set(baselineKeys);
  const out: string[] = [];
  for (const [key, chunk] of world.chunks) {
    if (baseline.has(key)) continue;
    const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
    const overlaps = envelope.some(
      (r) => ox <= r.x1 && ox + CHUNK_SIZE - 1 >= r.x0 && oz <= r.z1 && oz + CHUNK_SIZE - 1 >= r.z0,
    );
    if (!overlaps) out.push(key);
  }
  return out.sort();
}

/** All chunk keys currently materialised, sorted. */
export function chunkKeys(world: World): string[] {
  return [...world.chunks.keys()].sort();
}

/** Bounding voxel region covering every materialised chunk. */
export function worldChunkRegion(world: World): VoxelRegion {
  if (world.chunks.size === 0) throw new Error('world has no chunks');
  let minCx = Number.POSITIVE_INFINITY, maxCx = Number.NEGATIVE_INFINITY;
  let minCz = Number.POSITIVE_INFINITY, maxCz = Number.NEGATIVE_INFINITY;
  for (const chunk of world.chunks.values()) {
    minCx = Math.min(minCx, chunk.cx); maxCx = Math.max(maxCx, chunk.cx);
    minCz = Math.min(minCz, chunk.cz); maxCz = Math.max(maxCz, chunk.cz);
  }
  return {
    x0: chunkOriginX(minCx),
    z0: chunkOriginZ(minCz),
    x1: chunkOriginX(maxCx) + CHUNK_SIZE - 1,
    z1: chunkOriginZ(maxCz) + CHUNK_SIZE - 1,
    y0: Y_MIN,
    y1: Y_MAX - 1,
  };
}
