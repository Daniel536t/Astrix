// M008 vegetation (FEAT-004): simulation state is independent of rendering
// distance, LOD bands, ground cover and the multi-draw fallback; the one-mesh
// villager figure poses exactly like the old one-mesh-per-part hierarchy.
import test from 'node:test';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import { Entity, GENERATOR_V2, World, chunkKey, ensureChunk, worldToChunkX, worldToChunkZ } from '../src/sim/world';
import { Creature, spawnChunkFauna, stepCreature } from '../src/sim/fauna';
import { homesteadSnapshot } from '../src/sim/homestead';
import { buildNoxelNature, NatureBuildResult } from '../src/render/nature';
import { GroundCoverView } from '../src/render/ground-cover';
import { LOD_FAR, LOD_NEAR, LodBatch } from '../src/render/lod';
import { FARMER_STYLE, buildFigure, placeFigure } from '../src/render/characters';

const FARM = { x: -28, z: 4 };
type RenderMode = 'near' | 'far' | 'tiled' | 'none';

function send(s: GameSession, c: Record<string, unknown>) {
  return s.dispatch({ schema: 3, id: `test:${s.nextSequence}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never);
}

function loadAround(world: World, p: { x: number; z: number }, r: number): Set<string> {
  const ccx = worldToChunkX(p.x), ccz = worldToChunkZ(p.z);
  const keys = new Set<string>();
  for (let dz = -r - 1; dz <= r + 1; dz++) for (let dx = -r - 1; dx <= r + 1; dx++) {
    ensureChunk(world, ccx + dx, ccz + dz);
    if (Math.abs(dx) <= r && Math.abs(dz) <= r) keys.add(chunkKey(ccx + dx, ccz + dz));
  }
  return keys;
}

/** Nearest live, never-harvested tree to the farm: the same entity in every run. */
function targetTree(world: World): Entity {
  const trees = [...world.entities.values()]
    .filter((e) => e.kind.startsWith('styl_tree') && !e.harvested && !e.harvestedOnce && !e.authored)
    .sort((a, b) => Math.hypot(a.x - FARM.x, a.z - FARM.z) - Math.hypot(b.x - FARM.x, b.z - FARM.z) || (a.id < b.id ? -1 : 1));
  assert.ok(trees.length > 0, 'a tree near the farm');
  return trees[0];
}

function batchIds(nature: NatureBuildResult): string[] {
  return (nature.lod!.objects[0].userData.inspectableBatchIds as string[]) ?? [];
}

/** Harvests through the journaled command path until the entity is depleted. */
function fell(s: GameSession, id: string): number {
  let n = 0;
  while (!s.world.entities.get(id)!.harvested && n < 50) {
    assert.ok(send(s, { type: 'harvest', entityId: id }).ok, 'harvest accepted');
    n++;
  }
  return n;
}

function entitySummary(world: World): string {
  return JSON.stringify([...world.entities.values()]
    .map((e) => [e.id, e.kind, e.x, e.z, e.remaining, e.harvested, !!e.harvestedOnce])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

function run(mode: RenderMode) {
  const s = GameSession.genesis(1337, GENERATOR_V2);
  assert.ok(send(s, { type: 'found_homestead' }).ok);
  const world = s.world;
  const loaded = loadAround(world, FARM, 3);
  const tree = targetTree(world);
  const ccx = worldToChunkX(FARM.x), ccz = worldToChunkZ(FARM.z);
  const creatures: Creature[] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) creatures.push(...spawnChunkFauna(world, ccx + dx, ccz + dz));

  const cameraAt = (i: number) => mode === 'far'
    ? { x: FARM.x + 900, y: 400, z: FARM.z + 900 }
    : { x: FARM.x + Math.cos(i / 6) * 70, y: 30, z: FARM.z + Math.sin(i / 6) * 70 };
  let nature: NatureBuildResult | null = null;
  const cover = mode === 'none' ? null : new GroundCoverView(world);
  const build = (i: number) => {
    if (mode === 'none') return;
    nature = buildNoxelNature(world, loaded, { camera: cameraAt(i), multiDraw: mode !== 'tiled' });
  };
  build(0);
  let switches = 0, farSeen = 0; // band counts after the last update
  for (let i = 0; i < 120; i++) {
    assert.ok(send(s, { type: 'tick', ticks: 1 }).ok);
    for (const c of creatures) stepCreature(world, c, { threats: [], night: false });
    if (i === 40) { fell(s, tree.id); build(i); }
    if (nature && cover) {
      const cam = cameraAt(i);
      (nature as NatureBuildResult).lod!.update(cam);
      cover.update(mode === 'far' ? cam : FARM, loaded);
      const st = (nature as NatureBuildResult).lod!.stats();
      switches = st.switches;
      farSeen = st.instances[LOD_FAR];
    }
  }
  return {
    session: s,
    hash: s.stateHash,
    snapshot: JSON.stringify(s.snapshot),
    entities: entitySummary(world),
    homestead: JSON.stringify(homesteadSnapshot(world.homestead!)),
    creatures: JSON.stringify(creatures),
    tree: tree.id,
    switches,
    farSeen,
    instances: nature ? (nature as NatureBuildResult).instances : 0,
    coverPieces: cover ? cover.metrics().pieces : 0,
  };
}

test('same seed and journal give identical sim state whatever the camera, LOD, ground cover or fallback', () => {
  const none = run('none');
  const near = run('near');
  const far = run('far');
  const tiled = run('tiled');
  // The rendered runs really exercised the render paths.
  assert.ok(near.instances > 0 && near.switches > 0, `near camera moved trees between bands (${near.switches})`);
  assert.ok(far.farSeen > 0 && far.farSeen === far.instances, 'far camera put every tree in the far band');
  assert.ok(near.coverPieces > 0, 'ground cover was built near the farm');
  assert.ok(tiled.instances > 0 && tiled.switches > 0, 'the no-multi-draw tiled path ran');
  for (const r of [near, far, tiled]) {
    assert.equal(r.tree, none.tree);
    assert.equal(r.hash, none.hash, 'state hash');
    assert.equal(r.snapshot, none.snapshot, 'saved snapshot');
    assert.equal(r.entities, none.entities, 'entity set and yields');
    assert.equal(r.homestead, none.homestead, 'homestead villagers and animals');
    assert.equal(r.creatures, none.creatures, 'ambient fauna');
  }
  // The journal of a rendered run replays headless to the same hash.
  const replay = GameSession.replay(JSON.parse(JSON.stringify(near.session.journal)));
  assert.equal(replay.stateHash, none.hash);
  assert.equal(replay.world.entities.get(none.tree)!.harvested, true);
});

test('building and updating the render views does not touch the state hash', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2);
  assert.ok(send(s, { type: 'found_homestead' }).ok);
  const loaded = loadAround(s.world, FARM, 3);
  const hash = s.stateHash, entities = entitySummary(s.world);
  for (const multiDraw of [true, false]) {
    const nature = buildNoxelNature(s.world, loaded, { camera: { x: FARM.x, y: 30, z: FARM.z }, multiDraw });
    for (const cam of [{ x: FARM.x + 200, y: 30, z: FARM.z }, { x: FARM.x, y: 30, z: FARM.z }]) nature.lod!.update(cam, true);
    const cover = new GroundCoverView(s.world);
    cover.update(FARM, loaded);
    cover.update({ x: FARM.x + 20, z: FARM.z }, loaded);
  }
  assert.equal(s.stateHash, hash);
  assert.equal(entitySummary(s.world), entities);
});

test('a tree drawn at far LOD stays in the sim, is harvestable, and leaves the batch only once depleted', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2);
  const world = s.world;
  const loaded = loadAround(world, FARM, 3);
  const tree = targetTree(world);
  const farCam = { x: FARM.x + 900, y: 400, z: FARM.z + 900 };
  let nature = buildNoxelNature(world, loaded, { camera: farCam });
  assert.ok(nature.lod instanceof LodBatch);
  let index = batchIds(nature).indexOf(tree.id);
  assert.ok(index >= 0, 'the tree is in the batch');
  assert.equal(nature.lod!.bandAt(index), LOD_FAR, 'drawn as a far impostor');
  assert.ok(world.entities.has(tree.id), 'still a sim entity at far LOD');
  // One harvest leaves yield: still in the sim and still drawn.
  const start = tree.remaining;
  assert.ok(send(s, { type: 'harvest', entityId: tree.id }).ok);
  assert.ok(tree.remaining < start);
  if (!tree.harvested) {
    nature = buildNoxelNature(world, loaded, { camera: farCam });
    assert.ok(batchIds(nature).includes(tree.id), 'partly harvested tree is still drawn');
  }
  fell(s, tree.id);
  assert.equal(tree.harvested, true);
  nature = buildNoxelNature(world, loaded, { camera: farCam });
  assert.equal(batchIds(nature).includes(tree.id), false, 'depleted tree leaves the batch');
  // Moving the camera close does not bring it back: the sim decides.
  nature.lod!.update({ x: tree.x, y: tree.y + 2, z: tree.z }, true);
  assert.equal(batchIds(nature).includes(tree.id), false);
  const ids = batchIds(nature);
  const dist = (id: string) => { const e = world.entities.get(id)!; return Math.hypot(e.x - tree.x, e.z - tree.z); };
  index = ids.reduce((best, id, i) => (dist(id) < dist(ids[best]) ? i : best), 0);
  assert.equal(nature.lod!.bandAt(index), LOD_NEAR, 'the nearest remaining asset switches to near');
});

test('the skinned villager figure is one mesh and moves every part rigidly with its joint', () => {
  const f = buildFigure(FARMER_STYLE);
  const meshes: THREE.Mesh[] = [];
  f.root.traverse((n) => { if ((n as THREE.Mesh).isMesh) meshes.push(n as THREE.Mesh); });
  assert.equal(meshes.length, 1, 'one draw per pass');
  const mesh = meshes[0] as THREE.SkinnedMesh;
  assert.ok(mesh.isSkinnedMesh);
  f.root.updateMatrixWorld(true);
  const rootBind = f.root.matrixWorld.clone();
  const bones = mesh.skeleton.bones;
  const jointBind = bones.map((b) => b.parent!.matrixWorld.clone());
  assert.deepEqual(bones.map((b) => b.parent!.name).sort(), ['armL', 'armR', 'head', 'legL', 'legR', 'torso']);
  // A walking, turning pose away from the origin.
  f.legL.rotation.x = 0.6; f.legR.rotation.x = -0.6;
  f.armL.rotation.x = -0.8; f.armR.rotation.z = 0.4;
  f.torso.rotation.y = 0.2; f.head.rotation.x = 0.3; f.hips.position.y += 0.05;
  placeFigure(f, 5, 1, 3, 1.2);
  f.root.updateMatrixWorld(true);
  const pos = mesh.geometry.attributes.position, skin = mesh.geometry.attributes.skinIndex;
  const perBone = new Array(bones.length).fill(0);
  let worst = 0;
  const v = new THREE.Vector3(), expected = new THREE.Vector3(), rel = new THREE.Matrix4();
  for (let i = 0; i < pos.count; i++) {
    const b = skin.getX(i);
    perBone[b]++;
    // Old hierarchy: the vertex was fixed in its joint's frame.
    expected.fromBufferAttribute(pos, i).applyMatrix4(rootBind);
    rel.copy(jointBind[b]).invert().premultiply(bones[b].parent!.matrixWorld);
    expected.applyMatrix4(rel);
    mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
    worst = Math.max(worst, v.distanceTo(expected));
  }
  assert.ok(perBone.every((n) => n > 0), 'every part has vertices');
  assert.ok(worst < 1e-4, `posed vertices match the rigid hierarchy (worst ${worst})`);
});
