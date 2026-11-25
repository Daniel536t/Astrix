// Shared distance LOD for batched, instanced scenery and (later) animals.
//
// LOD is presentation only. It chooses which geometry draws an instance and
// whether that geometry casts a shadow; it must never decide whether an entity
// exists. A tree in the far band is still a full simulation entity, and an
// animal whose detailed model is not drawn keeps existing and acting in the
// simulation. Callers register every live entity; the band only swaps models.
//
// Layout: one LodBatch owns two THREE.BatchedMesh objects.
//   * `main` casts shadows and holds the near and mid geometry of every
//     instance (near/mid instances are visible here);
//   * `far` casts no shadow and holds the far geometry (far instances are
//     visible here).
// Every logical instance has the same instance id in both meshes, so raycast
// batch ids map to the same entity whichever mesh was hit. That is two draw
// calls in the main pass (one with WEBGL_multi_draw per mesh) and one in the
// shadow pass. Without WEBGL_multi_draw, three.js issues one call per visible
// instance of a BatchedMesh, so mobile GPUs lacking the extension pay per tree.
import * as THREE from 'three';

export type LodBand = 0 | 1 | 2;
export const LOD_NEAR: LodBand = 0;
export const LOD_MID: LodBand = 1;
export const LOD_FAR: LodBand = 2;
export const LOD_NAMES = ['near', 'mid', 'far'] as const;

export interface LodBands {
  /** Distance (m) where near switches to mid. */
  near: number;
  /** Distance (m) where mid switches to far. */
  mid: number;
  /** Half-width (m) of the dead zone around each threshold. */
  hysteresis: number;
}

/**
 * Near was 60 m in the first M008 pass. Review v1 raised it to 90 m: in the
 * browser farm view 25 of 42 vegetation instances now draw at full detail
 * instead of 10 (LOD triangles 2,088 to 3,098); in the forest view 244 of
 * 500 instead of 120 (27,616 to 35,488). Both stay well inside the budget
 * (Evidence/M008-vegetation/views-close.json).
 */
export const DEFAULT_LOD_BANDS: LodBands = { near: 90, mid: 130, hysteresis: 4 };

/**
 * Pure band selection with hysteresis. With no previous band the thresholds
 * are used as is. Otherwise leaving a band needs the distance to pass its
 * threshold by more than `hysteresis`, so an instance hovering at a boundary
 * does not flip back and forth.
 */
export function selectLodBand(distance: number, previous: LodBand | null, bands: LodBands = DEFAULT_LOD_BANDS): LodBand {
  let band: LodBand = LOD_NEAR;
  const thresholds = [bands.near, bands.mid];
  for (let b = 0; b < 2; b++) {
    const shift = previous === null ? 0 : previous <= b ? bands.hysteresis : -bands.hysteresis;
    if (distance > thresholds[b] + shift) band = (b + 1) as LodBand;
  }
  return band;
}

export interface Vec3Like { x: number; y: number; z: number }

/** Band of an instance at `pos` seen from `camera`. */
export function lodBandAt(camera: Vec3Like, pos: Vec3Like, previous: LodBand | null, bands: LodBands = DEFAULT_LOD_BANDS): LodBand {
  return selectLodBand(Math.hypot(pos.x - camera.x, pos.y - camera.y, pos.z - camera.z), previous, bands);
}

/** Geometry ids for one logical instance: near and mid in `main`, far in `far`. */
export interface LodGeometry {
  near: number;
  mid: number;
  far: number;
  /** Triangles of each LOD geometry. */
  triangles: [number, number, number];
}

export interface LodBatchOptions {
  name: string;
  material: THREE.Material;
  maxInstances: number;
  /** Vertex capacity of the shadow-casting near/mid mesh. */
  mainVertices: number;
  /** Vertex capacity of the non-casting far mesh. */
  farVertices: number;
  bands?: LodBands;
  /** Re-evaluate bands only after the camera moved this far (m). */
  moveThreshold?: number;
}

export interface LodStats {
  instances: [number, number, number];
  triangles: [number, number, number];
  /** Band re-evaluations performed (throttled) and instances switched. */
  evaluations: number;
  switches: number;
}

/** Raycast/keyboard inspection target of one logical instance. */
export interface LodTarget { entityId: string; x: number; y: number; z: number }

/**
 * What the vegetation builder and the frame loop need from a LOD renderer.
 * LodBatch (BatchedMesh, needs WEBGL_multi_draw to stay at a few calls) and
 * TiledLodMesh (merged static tiles, bounded calls on any GPU) implement it.
 */
export interface LodSet {
  /** Scene objects to add (the renderer's meshes or groups). */
  readonly objects: THREE.Object3D[];
  readonly count: number;
  bandAt(id: number): LodBand;
  addGeometry(lod: LodBand, geometry: THREE.BufferGeometry): number;
  addInstance(geometry: LodGeometry, matrix: THREE.Matrix4, position: Vec3Like): number;
  /** Entity id per instance id and keyboard targets, for inspection. */
  setInspection(batchIds: string[], targets: LodTarget[]): void;
  update(camera: Vec3Like, force?: boolean): boolean;
  stats(): LodStats;
  drawnTriangles(): number;
  finish(): void;
  // ---- M013 incremental updates (a tree grows, is felled, a chunk loads) ----
  /** Retire an instance; its id may be reused by a later addInstance. */
  removeInstance(id: number): void;
  /** Swap an instance's model (all three LOD geometries), keeping its band. */
  setInstanceGeometry(id: number, geometry: LodGeometry): void;
  /** Put a new instance straight into the band the camera calls for. */
  placeBand(id: number, camera: Vec3Like): void;
  /** Bounds and pending work after a batch of incremental changes. */
  commit(): void;
  readonly live: number;
}

export class LodBatch implements LodSet {
  readonly main: THREE.BatchedMesh;
  readonly far: THREE.BatchedMesh;
  readonly bands: LodBands;
  readonly moveThreshold: number;
  private readonly positions: number[] = [];
  private readonly geometry: LodGeometry[] = [];
  private readonly band: LodBand[] = [];
  private readonly lastCamera = new THREE.Vector3(Infinity, Infinity, Infinity);
  private readonly alive: boolean[] = [];
  private evaluations = 0;
  private switches = 0;
  private boundsDirty = false;

  constructor(options: LodBatchOptions) {
    this.bands = options.bands ?? DEFAULT_LOD_BANDS;
    this.moveThreshold = options.moveThreshold ?? 4;
    this.main = new THREE.BatchedMesh(options.maxInstances, options.mainVertices, 0, options.material);
    this.main.name = options.name;
    this.main.castShadow = true;
    this.main.receiveShadow = true;
    this.far = new THREE.BatchedMesh(options.maxInstances, options.farVertices, 0, options.material);
    this.far.name = `${options.name}_far`;
    this.far.castShadow = false;
    this.far.receiveShadow = true;
    for (const mesh of [this.main, this.far]) mesh.perObjectFrustumCulled = true;
  }

  get objects(): THREE.Object3D[] { return [this.main, this.far]; }

  /** Adds a geometry to the mesh that draws `lod`; returns its geometry id. Grows the vertex buffer when needed (M013: new stages appear over time). */
  addGeometry(lod: LodBand, geometry: THREE.BufferGeometry): number {
    const mesh = lod === LOD_FAR ? this.far : this.main;
    const need = geometry.attributes.position.count;
    if (mesh.unusedVertexCount < need) {
      const size = Math.ceil((mesh as unknown as { _maxVertexCount: number })._maxVertexCount * 1.5) + need * 4;
      mesh.setGeometrySize(size, size * 2);
    }
    return mesh.addGeometry(geometry);
  }

  // BatchedMesh raycasts expose batchId. Both meshes share instance ids, so
  // both carry the same id list; keyboard targets live on the main mesh only.
  setInspection(batchIds: string[], targets: LodTarget[]): void {
    this.main.userData.inspectableBatchIds = batchIds;
    this.main.userData.inspectableTargets = targets;
    this.far.userData.inspectableBatchIds = batchIds;
  }

  /** Registers a logical instance, initially in the near band; returns its id in both meshes (a retired id is reused). */
  addInstance(geometry: LodGeometry, matrix: THREE.Matrix4, position: Vec3Like): number {
    if (this.main.instanceCount >= this.main.maxInstanceCount) {
      const grow = Math.ceil(this.main.maxInstanceCount * 1.5) + 16;
      this.main.setInstanceCount(grow);
      this.far.setInstanceCount(grow);
    }
    const id = this.main.addInstance(geometry.near);
    const farId = this.far.addInstance(geometry.far);
    if (farId !== id) throw new Error('LodBatch instance ids diverged');
    this.main.setMatrixAt(id, matrix);
    this.far.setMatrixAt(id, matrix);
    this.main.setVisibleAt(id, true);
    this.far.setVisibleAt(id, false);
    this.positions[id * 3] = position.x; this.positions[id * 3 + 1] = position.y; this.positions[id * 3 + 2] = position.z;
    this.geometry[id] = geometry;
    this.band[id] = LOD_NEAR;
    this.alive[id] = true;
    this.boundsDirty = true;
    return id;
  }

  removeInstance(id: number): void {
    if (!this.alive[id]) return;
    this.main.deleteInstance(id);
    this.far.deleteInstance(id);
    this.alive[id] = false;
    this.boundsDirty = true;
  }

  setInstanceGeometry(id: number, geometry: LodGeometry): void {
    if (!this.alive[id]) return;
    this.geometry[id] = geometry;
    this.far.setGeometryIdAt(id, geometry.far);
    const b = this.band[id];
    if (b !== LOD_FAR) this.main.setGeometryIdAt(id, b === LOD_NEAR ? geometry.near : geometry.mid);
    this.boundsDirty = true;
  }

  placeBand(id: number, camera: Vec3Like): void {
    if (!this.alive[id] || !Number.isFinite(camera.x)) return;
    const p = this.positions;
    this.apply(id, selectLodBand(Math.hypot(p[id * 3] - camera.x, p[id * 3 + 1] - camera.y, p[id * 3 + 2] - camera.z), null, this.bands));
  }

  commit(): void {
    if (!this.boundsDirty) return;
    this.boundsDirty = false;
    this.finish();
  }

  get live(): number { let n = 0; for (let i = 0; i < this.alive.length; i++) if (this.alive[i]) n++; return n; }

  get count(): number { return this.band.length; }

  bandAt(id: number): LodBand { return this.band[id]; }

  /** Moves one instance to `band`, touching the meshes only when it changes. */
  private apply(id: number, band: LodBand): void {
    const previous = this.band[id];
    if (previous === band) return;
    const g = this.geometry[id];
    if (band === LOD_FAR) {
      this.main.setVisibleAt(id, false);
      this.far.setVisibleAt(id, true);
    } else {
      this.main.setGeometryIdAt(id, band === LOD_NEAR ? g.near : g.mid);
      if (previous === LOD_FAR) {
        this.main.setVisibleAt(id, true);
        this.far.setVisibleAt(id, false);
      }
    }
    this.band[id] = band;
    this.switches++;
  }

  /**
   * Re-evaluates bands for the camera position. Throttled: unless `force` is
   * set, it does nothing until the camera has moved `moveThreshold` metres
   * since the last evaluation. Returns true when it evaluated.
   */
  update(camera: Vec3Like, force = false): boolean {
    const dx = camera.x - this.lastCamera.x, dy = camera.y - this.lastCamera.y, dz = camera.z - this.lastCamera.z;
    if (!force && dx * dx + dy * dy + dz * dz < this.moveThreshold * this.moveThreshold) return false;
    this.lastCamera.set(camera.x, camera.y, camera.z);
    const p = this.positions;
    for (let i = 0; i < this.band.length; i++) {
      if (!this.alive[i]) continue;
      const d = Math.hypot(p[i * 3] - camera.x, p[i * 3 + 1] - camera.y, p[i * 3 + 2] - camera.z);
      this.apply(i, selectLodBand(d, this.band[i], this.bands));
    }
    this.evaluations++;
    return true;
  }

  stats(): LodStats {
    const instances: [number, number, number] = [0, 0, 0];
    const triangles: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < this.band.length; i++) {
      if (!this.alive[i]) continue;
      const b = this.band[i];
      instances[b]++;
      triangles[b] += this.geometry[i].triangles[b];
    }
    return { instances, triangles, evaluations: this.evaluations, switches: this.switches };
  }

  /** Triangles currently selected for drawing, before frustum culling. */
  drawnTriangles(): number {
    const t = this.stats().triangles;
    return t[0] + t[1] + t[2];
  }

  finish(): void {
    for (const mesh of [this.main, this.far]) {
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    }
  }
}

/** Default side (m) of a TiledLodMesh tile: three 32 m chunks. */
export const LOD_TILE_SIZE = 96;

interface LodTile {
  key: string;
  ids: number[];
  /** Near and mid instances, shadow casting. */
  main: THREE.Mesh;
  /** Far instances, no shadow. */
  far: THREE.Mesh;
  /** `main` needs a re-bake (a near/mid instance changed geometry or band). */
  dirtyMain: boolean;
  /** `far` needs a re-bake (an instance entered or left the far band). */
  dirtyFar: boolean;
  /** Tile centre (x, z) for nearest-first rebuild order. */
  cx: number;
  cz: number;
}

export interface TiledLodMeshOptions {
  name: string;
  material: THREE.Material;
  bands?: LodBands;
  moveThreshold?: number;
  tileSize?: number;
  /** Tile meshes re-baked per update() at most; the rest wait for later frames. */
  maxBakesPerUpdate?: number;
}

/**
 * Default re-bake budget per frame. Panning the forest view at about 40 m/s
 * dirtied up to 8 of 9 tiles in one update (node harness, review v1); two
 * meshes per frame keep the worst frame near the median one.
 */
export const TILED_LOD_BAKES_PER_UPDATE = 2;

const _tm = new THREE.Matrix4();
const _tn = new THREE.Matrix3();
const _tv = new THREE.Vector3();
const _hits: THREE.Intersection[] = [];

/** Report the instance under the hit triangle as batchId, like BatchedMesh. */
function installOwnerRaycast(mesh: THREE.Mesh): void {
  mesh.raycast = function (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
    _hits.length = 0;
    THREE.Mesh.prototype.raycast.call(this, raycaster, _hits);
    const owner = this.userData.triangleOwner as Uint32Array | undefined;
    for (const hit of _hits) {
      if (owner && hit.faceIndex !== undefined && hit.faceIndex !== null) {
        (hit as THREE.Intersection & { batchId?: number }).batchId = owner[hit.faceIndex];
      }
      intersects.push(hit);
    }
  };
}

/**
 * Bounded-draw LOD renderer for GPUs without WEBGL_multi_draw, where a
 * BatchedMesh costs one draw call per visible instance. Instances are
 * grouped into square tiles; each tile bakes its near/mid instances into one
 * shadow-casting mesh and its far instances into one non-casting mesh. A
 * tile is rebuilt only when one of its instances changes band, so the cost
 * is at most two calls per visible tile in the main pass and one per tile
 * inside the shadow box, whatever the tree count. Tiles cull by bounding
 * sphere like any mesh. Raycasts report `batchId` = instance id (from the
 * hit triangle), so inspection works exactly as with LodBatch.
 */
export class TiledLodMesh implements LodSet {
  readonly group = new THREE.Group();
  readonly bands: LodBands;
  readonly moveThreshold: number;
  private readonly tileSize: number;
  private readonly material: THREE.Material;
  private readonly name: string;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly lodOf: LodBand[] = [];
  private readonly positions: number[] = [];
  private readonly matrices: THREE.Matrix4[] = [];
  private readonly geometry: LodGeometry[] = [];
  private readonly band: LodBand[] = [];
  private readonly tileOf: LodTile[] = [];
  private readonly tiles = new Map<string, LodTile>();
  private readonly lastCamera = new THREE.Vector3(Infinity, Infinity, Infinity);
  private readonly alive: boolean[] = [];
  private readonly free: number[] = [];
  private batchIds: string[] = [];
  private evaluations = 0;
  private switches = 0;
  private readonly maxBakes: number;
  /** Tile geometry rebuilds so far (for metrics and tests). */
  tileBuilds = 0;
  /** Individual mesh bakes so far (a tile rebuild bakes one or both meshes). */
  meshBakes = 0;

  constructor(options: TiledLodMeshOptions) {
    this.bands = options.bands ?? DEFAULT_LOD_BANDS;
    this.moveThreshold = options.moveThreshold ?? 4;
    this.maxBakes = Math.max(1, options.maxBakesPerUpdate ?? TILED_LOD_BAKES_PER_UPDATE);
    this.tileSize = options.tileSize ?? LOD_TILE_SIZE;
    this.material = options.material;
    this.name = options.name;
    this.group.name = `${options.name}_tiles`;
  }

  get objects(): THREE.Object3D[] { return [this.group]; }
  get count(): number { return this.band.length; }
  get tileCount(): number { return this.tiles.size; }
  /** Tile meshes waiting for a re-bake (spread over the next updates). */
  get pendingBakes(): number {
    let n = 0;
    for (const t of this.tiles.values()) n += (t.dirtyMain ? 1 : 0) + (t.dirtyFar ? 1 : 0);
    return n;
  }
  bandAt(id: number): LodBand { return this.band[id]; }

  addGeometry(lod: LodBand, geometry: THREE.BufferGeometry): number {
    this.geometries.push(geometry);
    this.lodOf.push(lod);
    return this.geometries.length - 1;
  }

  addInstance(geometry: LodGeometry, matrix: THREE.Matrix4, position: Vec3Like): number {
    // M013: retired ids are reused (lowest first), as BatchedMesh does.
    this.free.sort((a, b) => b - a);
    const id = this.free.length ? this.free.pop()! : this.band.length;
    this.positions[id * 3] = position.x; this.positions[id * 3 + 1] = position.y; this.positions[id * 3 + 2] = position.z;
    this.matrices[id] = matrix.clone();
    this.geometry[id] = geometry;
    this.band[id] = LOD_NEAR;
    this.alive[id] = true;
    const key = `${Math.floor(position.x / this.tileSize)},${Math.floor(position.z / this.tileSize)}`;
    let tile = this.tiles.get(key);
    if (!tile) {
      const mk = (suffix: string, cast: boolean) => {
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
        mesh.name = `${this.name}${suffix}`;
        mesh.castShadow = cast;
        mesh.receiveShadow = true;
        mesh.visible = false;
        return mesh;
      };
      const tx = Math.floor(position.x / this.tileSize), tz = Math.floor(position.z / this.tileSize);
      tile = {
        key, ids: [], main: mk('_tile', true), far: mk('_tile_far', false), dirtyMain: true, dirtyFar: true,
        cx: (tx + 0.5) * this.tileSize, cz: (tz + 0.5) * this.tileSize,
      };
      this.tiles.set(key, tile);
      for (const mesh of [tile.main, tile.far]) { mesh.userData.inspectableBatchIds = this.batchIds; installOwnerRaycast(mesh); }
      this.group.add(tile.main, tile.far);
    }
    tile.ids.push(id);
    tile.dirtyMain = true;
    tile.dirtyFar = true;
    this.tileOf[id] = tile;
    return id;
  }

  removeInstance(id: number): void {
    if (!this.alive[id]) return;
    this.alive[id] = false;
    const tile = this.tileOf[id];
    tile.ids = tile.ids.filter((x) => x !== id);
    if (this.band[id] === LOD_FAR) tile.dirtyFar = true; else tile.dirtyMain = true;
    this.free.push(id);
  }

  setInstanceGeometry(id: number, geometry: LodGeometry): void {
    if (!this.alive[id]) return;
    this.geometry[id] = geometry;
    const tile = this.tileOf[id];
    if (this.band[id] === LOD_FAR) tile.dirtyFar = true; else tile.dirtyMain = true;
  }

  placeBand(id: number, camera: Vec3Like): void {
    if (!this.alive[id] || !Number.isFinite(camera.x)) return;
    const p = this.positions;
    const band = selectLodBand(Math.hypot(p[id * 3] - camera.x, p[id * 3 + 1] - camera.y, p[id * 3 + 2] - camera.z), null, this.bands);
    if (band === this.band[id]) return;
    this.band[id] = band;
    this.tileOf[id].dirtyMain = true;
    this.tileOf[id].dirtyFar = true;
  }

  /** Dirty tiles are baked by later update() calls, nearest first and a few per frame. */
  commit(): void { /* bakes are spread by update() */ }

  get live(): number { let n = 0; for (let i = 0; i < this.alive.length; i++) if (this.alive[i]) n++; return n; }

  setInspection(batchIds: string[], targets: LodTarget[]): void {
    this.batchIds = batchIds;
    this.group.userData.inspectableTargets = targets;
    for (const tile of this.tiles.values()) {
      tile.main.userData.inspectableBatchIds = batchIds;
      tile.far.userData.inspectableBatchIds = batchIds;
    }
  }

  private geometryFor(id: number): THREE.BufferGeometry {
    const g = this.geometry[id], b = this.band[id];
    return this.geometries[b === LOD_NEAR ? g.near : b === LOD_MID ? g.mid : g.far];
  }

  /**
   * Bake the dirty meshes of one tile: near/mid instances into `main`, far
   * ones into `far`. A near/mid switch only re-bakes `main`; entering or
   * leaving the far band re-bakes both, together, so an instance is never
   * drawn twice or missing between frames.
   */
  private buildTile(tile: LodTile): void {
    for (const [mesh, far] of [[tile.main, false], [tile.far, true]] as const) {
      if (!(far ? tile.dirtyFar : tile.dirtyMain)) continue;
      this.meshBakes++;
      const ids = tile.ids.filter((id) => (this.band[id] === LOD_FAR) === far);
      let vertices = 0;
      for (const id of ids) vertices += this.geometryFor(id).attributes.position.count;
      const position = new Float32Array(vertices * 3), normal = new Float32Array(vertices * 3), color = new Float32Array(vertices * 3);
      const owner = new Uint32Array(vertices / 3);
      let o = 0;
      for (const id of ids) {
        const g = this.geometryFor(id);
        const gp = g.attributes.position.array as ArrayLike<number>;
        const gn = g.attributes.normal.array as ArrayLike<number>;
        const gc = g.attributes.color?.array as ArrayLike<number> | undefined;
        _tm.copy(this.matrices[id]);
        _tn.getNormalMatrix(_tm);
        owner.fill(id, o / 9, o / 9 + gp.length / 9);
        for (let i = 0; i < gp.length; i += 3, o += 3) {
          _tv.set(gp[i], gp[i + 1], gp[i + 2]).applyMatrix4(_tm);
          position[o] = _tv.x; position[o + 1] = _tv.y; position[o + 2] = _tv.z;
          _tv.set(gn[i], gn[i + 1], gn[i + 2]).applyMatrix3(_tn).normalize();
          normal[o] = _tv.x; normal[o + 1] = _tv.y; normal[o + 2] = _tv.z;
          if (gc) { color[o] = gc[i]; color[o + 1] = gc[i + 1]; color[o + 2] = gc[i + 2]; } else color.fill(1, o, o + 3);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
      geometry.computeBoundingSphere();
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      mesh.visible = vertices > 0;
      mesh.userData.triangleOwner = owner;
    }
    tile.dirtyMain = false;
    tile.dirtyFar = false;
    this.tileBuilds++;
  }

  /**
   * Re-evaluates bands once the camera has moved `moveThreshold` metres (or
   * on `force`), then re-bakes dirty tiles nearest the camera first, at most
   * `maxBakesPerUpdate` meshes per call. Tiles left dirty keep their previous
   * (still correct, one band older) geometry and are baked on later calls,
   * even while the camera stands still. `force` bakes everything at once.
   * Returns true when it evaluated bands.
   */
  update(camera: Vec3Like, force = false): boolean {
    const dx = camera.x - this.lastCamera.x, dy = camera.y - this.lastCamera.y, dz = camera.z - this.lastCamera.z;
    const evaluate = force || dx * dx + dy * dy + dz * dz >= this.moveThreshold * this.moveThreshold;
    if (evaluate) {
      this.lastCamera.set(camera.x, camera.y, camera.z);
      const p = this.positions;
      for (let i = 0; i < this.band.length; i++) {
        if (!this.alive[i]) continue;
        const d = Math.hypot(p[i * 3] - camera.x, p[i * 3 + 1] - camera.y, p[i * 3 + 2] - camera.z);
        const band = selectLodBand(d, this.band[i], this.bands);
        const previous = this.band[i];
        if (band === previous) continue;
        this.band[i] = band;
        const tile = this.tileOf[i];
        tile.dirtyMain = true;
        if (band === LOD_FAR || previous === LOD_FAR) tile.dirtyFar = true;
        this.switches++;
      }
      this.evaluations++;
    }
    this.rebuildDirty(force ? Infinity : this.maxBakes, camera);
    return evaluate;
  }

  private rebuildDirty(budget = Infinity, camera?: Vec3Like): void {
    const dirty: LodTile[] = [];
    for (const tile of this.tiles.values()) if (tile.dirtyMain || tile.dirtyFar) dirty.push(tile);
    if (dirty.length === 0) return;
    if (camera && Number.isFinite(budget)) {
      dirty.sort((a, b) => Math.hypot(a.cx - camera.x, a.cz - camera.z) - Math.hypot(b.cx - camera.x, b.cz - camera.z));
    }
    let used = 0;
    for (const tile of dirty) {
      const cost = (tile.dirtyMain ? 1 : 0) + (tile.dirtyFar ? 1 : 0);
      // Always make progress: the first tile is baked even if it exceeds the budget.
      if (used > 0 && used + cost > budget) break;
      this.buildTile(tile);
      used += cost;
    }
  }

  stats(): LodStats {
    const instances: [number, number, number] = [0, 0, 0];
    const triangles: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < this.band.length; i++) {
      if (!this.alive[i]) continue;
      const b = this.band[i];
      instances[b]++;
      triangles[b] += this.geometry[i].triangles[b];
    }
    return { instances, triangles, evaluations: this.evaluations, switches: this.switches };
  }

  drawnTriangles(): number {
    const t = this.stats().triangles;
    return t[0] + t[1] + t[2];
  }

  finish(): void {
    const batchIds = this.batchIds;
    for (const tile of this.tiles.values()) {
      for (const mesh of [tile.main, tile.far]) mesh.userData.inspectableBatchIds = batchIds;
    }
    this.rebuildDirty();
  }

  dispose(): void {
    for (const tile of this.tiles.values()) { tile.main.geometry.dispose(); tile.far.geometry.dispose(); }
  }
}
