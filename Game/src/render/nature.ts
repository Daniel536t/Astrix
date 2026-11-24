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
import { Entity, World } from '../sim/world';
import { growthStage, isVegetationKind, treeSpecies, vegetationVariant } from '../sim/vegetation';
import { DEFAULT_LOD_BANDS, LOD_FAR, LOD_MID, LOD_NEAR, LodBand, LodBands, LodBatch, LodGeometry, LodSet, LodTarget, TiledLodMesh, Vec3Like } from './lod';
import { VegetationPlan, blocksGeometry, cairnPlan, orePlan, planBlocks, vegetationPlan } from './vegetation-kit';

interface ResolvedModel { key: string; plan: VegetationPlan }

const propPlans = new Map<string, VegetationPlan>();

/** The model of one entity, or null when the kind has no natural asset. */
export function natureModel(e: Entity, seed: number): ResolvedModel | null {
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

/**
 * Build the natural assets of the supplied loaded chunks into one LodBatch
 * (a shadow-casting near/mid BatchedMesh and a non-casting far BatchedMesh),
 * or into a TiledLodMesh when WEBGL_multi_draw is missing.
 * Entities remain the source of truth; harvested entities are skipped.
 */
export function buildNoxelNature(
  world: World,
  loadedChunks: ReadonlySet<string> | null = null,
  options: NatureBuildOptions = {},
): NatureBuildResult {
  const group = new THREE.Group();
  group.name = 'styl_nature';
  const live: Array<{ e: Entity; model: ResolvedModel }> = [];
  const models = new Map<string, ResolvedModel>();

  for (const e of world.entities.values()) {
    if (e.harvested) continue;
    if (world.entityRemovals?.has(e.id)) continue;
    if (loadedChunks && !loadedChunks.has(e.chunk)) continue;
    const model = natureModel(e, world.seed);
    if (!model) continue;
    live.push({ e, model });
    models.set(model.key, model);
  }
  if (live.length === 0) return { group, triangles: 0, instances: 0, lodCounts: lodCounts(null), lod: null };

  let mainVertices = 0, farVertices = 0;
  for (const model of models.values()) {
    mainVertices += natureGeometry(model, LOD_NEAR).attributes.position.count
      + natureGeometry(model, LOD_MID).attributes.position.count;
    farVertices += natureGeometry(model, LOD_FAR).attributes.position.count;
  }
  const bands = options.bands ?? DEFAULT_LOD_BANDS;
  const lod: LodSet = options.multiDraw === false
    ? new TiledLodMesh({ name: 'styl_nature', material: natureMaterial, bands })
    : new LodBatch({
      name: 'styl_nature_batch',
      material: natureMaterial,
      maxInstances: live.length,
      mainVertices,
      farVertices,
      bands,
    });

  const ids = new Map<string, LodGeometry>();
  for (const [key, model] of models) {
    const near = natureGeometry(model, LOD_NEAR), mid = natureGeometry(model, LOD_MID), far = natureGeometry(model, LOD_FAR);
    ids.set(key, {
      near: lod.addGeometry(LOD_NEAR, near),
      mid: lod.addGeometry(LOD_MID, mid),
      far: lod.addGeometry(LOD_FAR, far),
      triangles: [tris(near), tris(mid), tris(far)],
    });
  }

  // Raycasts report a batchId (instance id), not a Mesh per entity; the id
  // list maps it to the entity. Keyboard targets list each entity once.
  const batchIds: string[] = [];
  const targets: LodTarget[] = [];

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const { e, model } of live) {
    q.setFromAxisAngle(up, e.rot);
    v.set(e.x, e.y - 0.15, e.z);
    s.setScalar(e.scale);
    const id = lod.addInstance(ids.get(model.key)!, m.compose(v, q, s), { x: e.x, y: e.y + 2, z: e.z });
    batchIds[id] = e.id;
    const top = natureGeometry(model, LOD_NEAR).boundingBox!.max.y;
    const targetHeight = e.kind.startsWith('styl_tree_') ? Math.min(3.0, top * 0.5) * e.scale
      : e.kind === 'styl_shrub' ? Math.min(0.7, top * 0.6) * e.scale
      : e.kind === 'styl_ore' ? 0.65 * e.scale
      : e.scale;
    targets[id] = { entityId: e.id, x: e.x, y: e.y + targetHeight, z: e.z };
  }
  lod.setInspection(batchIds, targets);
  if (options.camera) lod.update(options.camera, true);
  lod.finish();
  group.add(...lod.objects);

  return { group, triangles: lod.drawnTriangles(), instances: live.length, lodCounts: lodCounts(lod), lod };
}
