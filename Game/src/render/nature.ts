// Styl natural assets: block-built trees, bushes and stone props.
//
// The project has three distinct authored languages (ADB §2):
//   * voxel terrain   — 1 m occupancy/material volume, this directory's terrain;
//   * Noxel           — human-made architecture and props (`noxel.ts`);
//   * Styl (`nat_`)   — organic natural assets, implemented here.
//
// M008 replaces the faceted NatMass crowns of AS-001 v2 with stacked-cube
// species (render/vegetation-kit.ts), as the owner's REF-004 references ask.
// Species and growth stage come from sim/vegetation.ts, pure functions of the
// existing entity data, so generation and saves are unchanged.
//
// Entities are the source of truth. A harvested entity is not rendered; the
// renderer never decides whether a tree exists. Distance LOD (render/lod.ts)
// only swaps the model and its shadow casting.
import * as THREE from 'three';
import { Entity, World, chunkOriginX, chunkOriginZ } from '../sim/world';
import { TreeStage, livingWoodlandOf, treeChangesSince, treeLife } from '../sim/woodland';
import { growthStage, isVegetationKind, treeSpecies, vegetationVariant } from '../sim/vegetation';
import { DEFAULT_LOD_BANDS, LOD_FAR, LOD_MID, LOD_NEAR, LodBand, LodBands, LodBatch, LodGeometry, LodSet, LodTarget, TiledLodMesh, Vec3Like } from './lod';
import { VegetationPlan, blocksGeometry, cairnPlan, orePlan, planBlocks, vegetationPlan } from './vegetation-kit';

interface ResolvedModel { key: string; plan: VegetationPlan }

const propPlans = new Map<string, VegetationPlan>();

/**
 * The model of one entity, or null when nothing is drawn. With `world`, a
 * tree's species and stage come from the simulation's lifecycle (M013 rules
 * v5: growing, dying, dead snags, stumps; a gap draws nothing); without it,
 * or under older rules, they are the M008 visual stage.
 */
/**
 * M014: the multidraw=0 fallback (TiledLodMesh) bakes every near instance into
 * its tiles, so it drew 15-28k more triangles than multi-draw in the same
 * forest views (M013: peaks of 237k against the 250k budget). It switches to
 * mid detail at 70 m instead of 90 m; mid and far are unchanged.
 */
export const FALLBACK_LOD_BANDS: LodBands = { ...DEFAULT_LOD_BANDS, near: 70 };

export function natureModel(e: Entity, seed: number, world?: World): ResolvedModel | null {
  if (e.kind.startsWith('styl_tree_') && world) {
    const life = treeLife(world, e);
    if (!life || !life.present) return null;
    const variant = vegetationVariant(e);
    return { key: `${life.species}:${life.stage}:${variant}`, plan: vegetationPlan(life.species, life.stage as TreeStage, variant) };
  }
  if (isVegetationKind(e.kind)) {
    const species = treeSpecies(e, seed), stage = growthStage(e);
    if (!species || !stage) return null;
    const variant = vegetationVariant(e);
    return { key: `${species}:${stage}:${variant}`, plan: vegetationPlan(species, stage, variant) };
  }
  if (e.kind === 'styl_ore' || e.kind === 'styl_cairn') {
    const key = e.kind === 'styl_ore' ? `ore:${Math.abs(e.variant) % 2}` : 'cairn';
    let plan = propPlans.get(key);
    if (!plan) {
      plan = e.kind === 'styl_ore' ? orePlan(Math.abs(e.variant) % 2) : cairnPlan();
      propPlans.set(key, plan);
    }
    return { key, plan };
  }
  return null;
}

// Geometry is a pure function of (model key, lod). Build each once and reuse
// it: BatchedMesh.addGeometry copies the data, so a nature rebuild never
// disposes the cached source.
const geometryCache = new Map<string, THREE.BufferGeometry>();

export function natureGeometry(model: ResolvedModel, lod: LodBand): THREE.BufferGeometry {
  const key = `${model.key}:${lod}`;
  let geo = geometryCache.get(key);
  if (!geo) {
    geo = blocksGeometry(planBlocks(model.plan, lod));
    geometryCache.set(key, geo);
  }
  return geo;
}

const tris = (g: THREE.BufferGeometry) => g.attributes.position.count / 3;

export interface NatureLodCounts {
  near: { instances: number; triangles: number };
  mid: { instances: number; triangles: number };
  far: { instances: number; triangles: number };
}

export interface NatureBuildResult {
  group: THREE.Group;
  /** Triangles selected for drawing at the current LOD (before culling). */
  triangles: number;
  instances: number;
  /** Per-band instance and triangle counts at the current LOD. */
  lodCounts: NatureLodCounts;
  /** LOD controller; null when nothing is drawn. */
  lod: LodSet | null;
  /** The incremental view that owns the result (M013). */
  view?: NatureView;
}

export function lodCounts(lod: LodSet | null): NatureLodCounts {
  const s = lod?.stats() ?? { instances: [0, 0, 0], triangles: [0, 0, 0] };
  return {
    near: { instances: s.instances[0], triangles: s.triangles[0] },
    mid: { instances: s.instances[1], triangles: s.triangles[1] },
    far: { instances: s.instances[2], triangles: s.triangles[2] },
  };
}

export const natureMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

export interface NatureBuildOptions {
  /** Camera position for the initial LOD bands; without it every instance starts near. */
  camera?: Vec3Like;
  bands?: LodBands;
  /**
   * WEBGL_multi_draw available (default true). Without it a BatchedMesh costs
   * one draw call per visible instance, so the build uses TiledLodMesh:
   * merged static tiles with a bounded number of calls.
   */
  multiDraw?: boolean;
}

export interface NatureSyncStats {
  /** Incremental work so far: instances added, retired and given a new model; chunks added and dropped. */
  adds: number; removes: number; swaps: number; chunksAdded: number; chunksDropped: number;
  /** Entities re-checked by the rotating lifecycle scan. */
  scanned: number;
  /** Chunks still queued for adding. */
  pendingChunks: number;
  lastMs: number; maxMs: number; syncs: number; totalMs: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * The drawn natural assets, kept in step with the world incrementally (M013).
 *
 * The first build registers every loaded entity. After that `sync` only
 * touches what changed: entities of newly loaded chunks are added (a few
 * chunks per call), those of dropped chunks retired, and trees whose
 * simulated stage or presence changed (felled, cut, resprouted, planted,
 * seeded, or simply grown over time) get their new model in place. Growth
 * is noticed two ways: the simulation's change channel names trees it
 * touched, and a rotating scan re-checks a bounded slice of entities per
 * call so time-driven stage changes appear within a few frames. Geometry for
 * a model is registered once, when it first appears. Entities stay the
 * source of truth: the view never decides whether a tree exists.
 */
export class NatureView {
  readonly group = new THREE.Group();
  lod: LodSet | null = null;
  readonly stats: NatureSyncStats = { adds: 0, removes: 0, swaps: 0, chunksAdded: 0, chunksDropped: 0, scanned: 0, pendingChunks: 0, lastMs: 0, maxMs: 0, syncs: 0, totalMs: 0 };
  private readonly entries = new Map<string, { inst: number; key: string; chunk: string }>();
  private readonly geo = new Map<string, LodGeometry>();
  private readonly models = new Map<string, ResolvedModel>();
  private readonly batchIds: string[] = [];
  private readonly targets: Array<LodTarget | null> = [];
  private readonly chunks = new Set<string>();
  private readonly queue: string[] = [];
  private changeSeq = 0;
  private scan: string[] = [];
  private scanAt = 0;
  private lastTick = -1;
  /** W3: trees drawn by a presentation proxy (shaking, falling) instead of the batch. */
  private readonly hidden = new Set<string>();
  private readonly hiddenDirty: string[] = [];

  constructor(private readonly world: World, private readonly options: NatureBuildOptions = {}) {
    this.group.name = 'styl_nature';
  }

  get instances(): number { return this.entries.size; }

  /** The initial build: every entity of the loaded chunks at once (or all chunks when `loaded` is null). */
  build(loaded: ReadonlySet<string> | null, camera?: Vec3Like): void {
    const world = this.world;
    this.changeSeq = treeChangesSince(world, 0).seq;
    const live: Array<{ e: Entity; model: ResolvedModel }> = [];
    for (const e of world.entities.values()) {
      if (world.entityRemovals?.has(e.id)) continue;
      if (loaded && !loaded.has(e.chunk)) continue;
      const model = this.modelOf(e);
      if (!model) continue;
      live.push({ e, model });
      this.models.set(model.key, model);
    }
    if (loaded) for (const k of loaded) this.chunks.add(k);
    else for (const k of world.entityChunks.keys()) this.chunks.add(k);
    if (live.length === 0 && this.options.multiDraw !== false) return;
    let mainVertices = 0, farVertices = 0;
    for (const model of this.models.values()) {
      mainVertices += natureGeometry(model, LOD_NEAR).attributes.position.count + natureGeometry(model, LOD_MID).attributes.position.count;
      farVertices += natureGeometry(model, LOD_FAR).attributes.position.count;
    }
    const bands = this.options.bands ?? (this.options.multiDraw === false ? FALLBACK_LOD_BANDS : DEFAULT_LOD_BANDS);
    this.lod = this.options.multiDraw === false
      ? new TiledLodMesh({ name: 'styl_nature', material: natureMaterial, bands })
      : new LodBatch({ name: 'styl_nature_batch', material: natureMaterial, maxInstances: Math.max(16, live.length), mainVertices: Math.max(64, mainVertices), farVertices: Math.max(64, farVertices), bands });
    for (const model of this.models.values()) this.register(model);
    for (const { e, model } of live) this.addEntity(e, model);
    this.lod.setInspection(this.batchIds as string[], this.targets as LodTarget[]);
    if (camera) this.lod.update(camera, true);
    this.lod.finish();
    this.group.add(...this.lod.objects);
  }

  /** W3: hide or show one tree's batch instance (presentation only; applied on the next sync). */
  setHidden(id: string, on: boolean): void {
    if (this.hidden.has(id) === on) return;
    if (on) this.hidden.add(id); else this.hidden.delete(id);
    this.hiddenDirty.push(id);
  }

  private modelOf(e: Entity): ResolvedModel | null {
    if (this.hidden.has(e.id)) return null;
    if (e.harvested && !e.kind.startsWith('styl_tree_')) return null;
    return natureModel(e, this.world.seed, this.world);
  }

  private register(model: ResolvedModel): LodGeometry {
    let g = this.geo.get(model.key);
    if (g) return g;
    const near = natureGeometry(model, LOD_NEAR), mid = natureGeometry(model, LOD_MID), far = natureGeometry(model, LOD_FAR);
    g = { near: this.lod!.addGeometry(LOD_NEAR, near), mid: this.lod!.addGeometry(LOD_MID, mid), far: this.lod!.addGeometry(LOD_FAR, far), triangles: [tris(near), tris(mid), tris(far)] };
    this.geo.set(model.key, g);
    return g;
  }

  private target(e: Entity, model: ResolvedModel): LodTarget {
    const top = natureGeometry(model, LOD_NEAR).boundingBox!.max.y;
    const h = e.kind.startsWith('styl_tree_') ? Math.min(3.0, top * 0.5) * e.scale
      : e.kind === 'styl_shrub' ? Math.min(0.7, top * 0.6) * e.scale : e.kind === 'styl_ore' ? 0.65 * e.scale : e.scale;
    return { entityId: e.id, x: e.x, y: e.y + h, z: e.z };
  }

  private addEntity(e: Entity, model: ResolvedModel, camera?: Vec3Like): void {
    _q.setFromAxisAngle(_up, e.rot);
    _v.set(e.x, e.y - 0.15, e.z);
    _s.setScalar(e.scale);
    const id = this.lod!.addInstance(this.register(model), _m.compose(_v, _q, _s), { x: e.x, y: e.y + 2, z: e.z });
    this.batchIds[id] = e.id;
    this.targets[id] = this.target(e, model);
    this.entries.set(e.id, { inst: id, key: model.key, chunk: e.chunk });
    if (camera) this.lod!.placeBand(id, camera);
  }

  private retire(id: string): void {
    const en = this.entries.get(id);
    if (!en) return;
    this.lod!.removeInstance(en.inst);
    delete this.batchIds[en.inst];
    this.targets[en.inst] = null;
    this.entries.delete(id);
    this.stats.removes++;
  }

  /** Bring one entity's drawing in line with the world (add, retire or swap the model). Returns true when something changed. */
  private refresh(id: string, camera: Vec3Like): boolean {
    const e = this.world.entities.get(id);
    const en = this.entries.get(id);
    const model = e && this.chunks.has(e.chunk) && !this.world.entityRemovals.has(id) ? this.modelOf(e) : null;
    if (!model) { if (en) { this.retire(id); return true; } return false; }
    if (!en) { this.ensureLod(); this.addEntity(e!, model, camera); this.stats.adds++; return true; }
    if (en.key === model.key) return false;
    this.lod!.setInstanceGeometry(en.inst, this.register(model));
    en.key = model.key;
    this.targets[en.inst] = this.target(e!, model);
    this.stats.swaps++;
    return true;
  }

  private ensureLod(): void {
    if (this.lod) return;
    const bands = this.options.bands ?? (this.options.multiDraw === false ? FALLBACK_LOD_BANDS : DEFAULT_LOD_BANDS);
    this.lod = this.options.multiDraw === false
      ? new TiledLodMesh({ name: 'styl_nature', material: natureMaterial, bands })
      : new LodBatch({ name: 'styl_nature_batch', material: natureMaterial, maxInstances: 256, mainVertices: 20_000, farVertices: 4_000, bands });
    this.lod.setInspection(this.batchIds as string[], this.targets as LodTarget[]);
    this.group.add(...this.lod.objects);
  }

  /**
   * Incremental update, bounded by `budgetMs` (at least one unit of work per
   * call). Returns true when anything visible changed (the inspector's
   * target list is then stale).
   */
  sync(loaded: ReadonlySet<string>, camera: Vec3Like, budgetMs = 1.5, scanPerCall = 400): boolean {
    const t0 = performance.now();
    const world = this.world;
    let changed = false;
    // Dropped chunks: retire their instances now (cheap).
    for (const k of [...this.chunks]) {
      if (loaded.has(k)) continue;
      this.chunks.delete(k);
      for (const [id, en] of [...this.entries]) if (en.chunk === k) { this.retire(id); changed = true; }
      this.stats.chunksDropped++;
    }
    // New chunks queue (nearest first), added a few per call.
    const queued = new Set(this.queue);
    for (const k of loaded) if (!this.chunks.has(k) && !queued.has(k)) this.queue.push(k);
    if (this.queue.length) {
      const dist = (k: string) => { const [cx, cz] = k.split(',').map(Number); return Math.hypot(chunkOriginX(cx) + 16 - camera.x, chunkOriginZ(cz) + 16 - camera.z); };
      this.queue.sort((a, b) => dist(a) - dist(b));
    }
    while (this.queue.length && (performance.now() - t0 < budgetMs || this.stats.syncs === 0)) {
      const k = this.queue.shift()!;
      if (!loaded.has(k)) continue;
      this.chunks.add(k);
      for (const id of world.entityChunks.get(k) ?? []) changed = this.refresh(id, camera) || changed;
      this.stats.chunksAdded++;
      if (performance.now() - t0 >= budgetMs) break;
    }
    // Trees the simulation touched (felled, cut, planted, seeded, resprouted, fell).
    const ch = treeChangesSince(world, this.changeSeq);
    this.changeSeq = ch.seq;
    const ids = ch.ids ?? [...this.entries.keys()];
    for (const id of ids) changed = this.refresh(id, camera) || changed;
    for (const id of this.hiddenDirty.splice(0)) changed = this.refresh(id, camera) || changed;
    // Time-driven growth: a rotating scan of every drawn entity, a slice per call, restarted when the tick moves.
    const tick = world.life?.tick ?? 0;
    // Only a living woodland (rules v5) changes over time; older worlds have nothing to scan for.
    if (livingWoodlandOf(world) && tick !== this.lastTick && this.scanAt >= this.scan.length) {
      this.lastTick = tick;
      this.scan = [...this.entries.keys()];
      this.scanAt = 0;
    }
    const end = Math.min(this.scan.length, this.scanAt + scanPerCall);
    for (; this.scanAt < end; this.scanAt++) { changed = this.refresh(this.scan[this.scanAt], camera) || changed; this.stats.scanned++; }
    this.lod?.commit();
    const ms = performance.now() - t0;
    this.stats.syncs++; this.stats.lastMs = ms; this.stats.maxMs = Math.max(this.stats.maxMs, ms); this.stats.totalMs += ms;
    this.stats.pendingChunks = this.queue.length;
    return changed;
  }

  dispose(): void {
    for (const o of this.lod?.objects ?? []) o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh || (m as unknown as THREE.BatchedMesh).isBatchedMesh) m.geometry?.dispose(); });
    if (this.lod instanceof TiledLodMesh) this.lod.dispose();
    this.group.clear();
  }
}

/**
 * Build the natural assets of the supplied loaded chunks into one LodBatch
 * (a shadow-casting near/mid BatchedMesh and a non-casting far BatchedMesh),
 * or into a TiledLodMesh when WEBGL_multi_draw is missing.
 * Entities remain the source of truth; harvested entities are skipped (under
 * rules v5 a felled tree's stump is drawn until it rots or resprouts).
 */
export function buildNoxelNature(
  world: World,
  loadedChunks: ReadonlySet<string> | null = null,
  options: NatureBuildOptions = {},
): NatureBuildResult {
  const view = new NatureView(world, options);
  view.build(loadedChunks, options.camera);
  const lod = view.lod;
  if (!lod) return { group: view.group, triangles: 0, instances: 0, lodCounts: lodCounts(null), lod: null, view };
  return { group: view.group, triangles: lod.drawnTriangles(), instances: view.instances, lodCounts: lodCounts(lod), lod, view };
}
