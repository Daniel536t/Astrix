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

export const DEFAULT_LOD_BANDS: LodBands = { near: 60, mid: 130, hysteresis: 4 };

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

export class LodBatch {
  readonly main: THREE.BatchedMesh;
  readonly far: THREE.BatchedMesh;
  readonly bands: LodBands;
  readonly moveThreshold: number;
  private readonly positions: number[] = [];
  private readonly geometry: LodGeometry[] = [];
  private readonly band: LodBand[] = [];
  private readonly lastCamera = new THREE.Vector3(Infinity, Infinity, Infinity);
  private evaluations = 0;
  private switches = 0;

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

  /** Adds a geometry to the mesh that draws `lod`; returns its geometry id. */
  addGeometry(lod: LodBand, geometry: THREE.BufferGeometry): number {
    return (lod === LOD_FAR ? this.far : this.main).addGeometry(geometry);
  }

  /** Registers a logical instance, initially in the near band; returns its id in both meshes. */
  addInstance(geometry: LodGeometry, matrix: THREE.Matrix4, position: Vec3Like): number {
    const id = this.main.addInstance(geometry.near);
    const farId = this.far.addInstance(geometry.far);
    if (farId !== id) throw new Error('LodBatch instance ids diverged');
    this.main.setMatrixAt(id, matrix);
    this.far.setMatrixAt(id, matrix);
    this.far.setVisibleAt(id, false);
    this.positions.push(position.x, position.y, position.z);
    this.geometry.push(geometry);
    this.band.push(LOD_NEAR);
    return id;
  }

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
