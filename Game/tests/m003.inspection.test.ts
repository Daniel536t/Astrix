// Identity and raycast coverage. Browser pointer/UI behavior is verified
// separately against the production bundle; no synthetic renderer hit is called
// proof of a usable hover or touch interaction.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GameSession } from '../src/app/session';
import {
  INSPECTION_CATALOG, inspectionRef, resolveInspection,
} from '../src/app/inspection';
import {
  SceneInspector, identifiedRef, objectTarget, visibleInHierarchy,
} from '../src/app/inspector';
import { InspectorPanel } from '../src/ui/inspector';
import { buildNoxelNature } from '../src/render/nature';
import { buildKit, buildNoxelSite } from '../src/render/noxel';
import { buildLifeMeshes } from '../src/render/life';
import { buildStructureMesh } from '../src/render/structures';
import { FOUNDER_STOCKPILE_ID } from '../src/sim/economy';
import { canonicalWorldHash } from '../src/sim/snapshot';
import { EntityKind, isRetiredStoneKind } from '../src/sim/world';

const ALL_KINDS: EntityKind[] = [
  'styl_tree_spire', 'styl_tree_table', 'styl_tree_cluster', 'styl_tree_blossom',
  'styl_shrub', 'styl_ore', 'styl_cairn', 'waystone', 'marker',
];
const RETIRED_KINDS = ['styl_rock_small', 'styl_rock_medium', 'styl_rock_large'] as const;

test('every retained entity kind has a distinct identity; all retired stones are absent', () => {
  assert.equal(Object.keys(INSPECTION_CATALOG).length, ALL_KINDS.length);
  for (const kind of ALL_KINDS) {
    assert.ok(INSPECTION_CATALOG[kind].name.length > 2);
    assert.ok(INSPECTION_CATALOG[kind].description.length > 30);
  }
  const session = GameSession.genesis();
  assert.equal([...session.world.entities.values()].some((entity) => isRetiredStoneKind(entity.kind)), false);
  for (const kind of RETIRED_KINDS) {
    assert.ok(isRetiredStoneKind(kind));
    assert.equal(INSPECTION_CATALOG[kind as keyof typeof INSPECTION_CATALOG], undefined);
  }
  const hashes: string[] = [];
  for (const kind of ALL_KINDS.filter((kind) => kind.startsWith('styl_'))) {
    const entity = [...session.world.entities.values()].find((entity) => entity.kind === kind);
    assert.ok(entity, kind);
    const info = resolveInspection(session.world, { entityId: entity.id })!;
    assert.equal(info.name, INSPECTION_CATALOG[kind].name);
    assert.equal(info.category, 'Natural resource');
    hashes.push(canonicalWorldHash(session.world, session.nextSequence, 3));
    assert.match(info.facts.find((fact) => fact.label === 'Remaining')!.value,
      new RegExp(`^${entity.remaining} · `));
    entity.harvested = true;
    assert.equal(resolveInspection(session.world, { entityId: entity.id }), null);
    entity.harvested = false;
    hashes.push(canonicalWorldHash(session.world, session.nextSequence, 3));
  }
  assert.ok(hashes.every((hash) => hash === hashes[0]));
  assert.equal(session.world.revision, 0);
  assert.deepEqual(session.world.inventory, { stone: 48, wood: 24 });
});

test('natural batches preserve authoritative IDs and keyboard anchors inside a stable wrapper', () => {
  const session = GameSession.genesis();
  const result = buildNoxelNature(session.world);
  const scene = new THREE.Scene();
  const wrapper = new THREE.Group();
  wrapper.add(result.group);
  scene.add(wrapper);
  const batch = result.group.children[0] as THREE.BatchedMesh;
  assert.ok(batch.isBatchedMesh);
  const ids = batch.userData.inspectableBatchIds as string[];
  assert.equal(ids.length, result.instances);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.deepEqual(inspectionRef(batch, batch.userData.inspectableBatchIds.indexOf(id)), { entityId: id });
    const entity = session.world.entities.get(id)!;
    assert.equal(entity.harvested, false);
  }
  assert.equal(session.world.entities.has('hero:styl_rock_medium:-6:-10'), false);
  assert.equal(ids.some((id) => isRetiredStoneKind(session.world.entities.get(id)!.kind)), false);
  assert.equal(inspectionRef(batch), null);
  assert.equal(resolveInspection(session.world, { entityId: 'hero:styl_rock_medium:-6:-10' }), null);

  const controller = bareInspector(session, scene, wrapper);
  const targets = controller.metrics().targets;
  assert.equal(Object.keys(targets).length, result.instances);
  const ore = session.world.entities.get('hero:styl_ore:-38:-42')!;
  assert.equal(targets['entityId:hero:styl_ore:-38:-42'].y, ore.y + 0.65 * ore.scale,
    'ore tap target is on the block mass, below its tallest corner');
  assert.equal(targets['entityId:hero:styl_ore:-38:-42'].name, 'Purple-seam ore deposit');
  wrapper.visible = false;
  assert.equal(visibleInHierarchy(batch, scene), false);
  wrapper.visible = true;
  assert.equal(visibleInHierarchy(batch, scene), true);
});

test('landmarks, provisional kit, founder architecture, stockpile and crops expose stable identities', () => {
  const session = GameSession.genesis();
  for (const site of session.world.sites) {
    const mesh = buildNoxelSite(site);
    assert.deepEqual(inspectionRef(mesh), { siteId: site.id });
    assert.deepEqual(objectTarget(mesh)?.toArray(), [site.x, site.y - 0.12 + (site.kind === 'waystone' ? 3.2 : 1.8), site.z]);
    assert.equal(resolveInspection(session.world, { siteId: site.id })?.category, 'Architecture · landmark');
  }
  for (const mesh of buildKit()) {
    const ref = inspectionRef(mesh)!;
    assert.ok(ref && 'kitId' in ref);
    assert.equal(resolveInspection(session.world, ref)?.category, 'Architecture · provisional kit');
  }
  const build = session.dispatch({ schema: 3, id: 'inspect-farm', type: 'build', projectId: 'farm',
    designVersion: 2, expectedRevision: session.world.revision });
  assert.equal(build.ok, true, JSON.stringify(build));
  const structure = [...session.world.structures.values()][0];
  const mesh = buildStructureMesh(structure);
  assert.deepEqual(inspectionRef(mesh), { structureId: structure.id });
  assert.ok(objectTarget(mesh));
  const structureInfo = resolveInspection(session.world, { structureId: structure.id })!;
  assert.equal(structureInfo.name, 'Terraced field');
  const footprint = structureInfo.facts.find((fact) => fact.label === 'Footprint')?.value;
  assert.equal(footprint, `${Math.max(...structure.modules.map((m) => m.x + m.w / 2)) - Math.min(...structure.modules.map((m) => m.x - m.w / 2))} × ${Math.max(...structure.modules.map((m) => m.z + m.d / 2)) - Math.min(...structure.modules.map((m) => m.z - m.d / 2))} m`);
  const life = buildLifeMeshes(session.world);
  const stock = life.children.find((child) => child.userData.stockpileId === FOUNDER_STOCKPILE_ID)!;
  assert.equal(objectTarget(stock)?.y, stock.position.y + 1.5);
  const crops = life.children.filter((child) => child.userData.cropId);
  assert.equal(crops.length, 9);
  for (const crop of crops) assert.equal(resolveInspection(session.world, inspectionRef(crop)!)?.facts[0].value, 'Empty · needs 1 seed');
});

test('stockpile and crop cards read live quantities and readiness without mutating either', () => {
  const session = GameSession.genesis();
  const stock = session.world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!;
  stock.inventory = { wood: 4, fiber: 2, stone: 3 };
  const stockInfo = resolveInspection(session.world, { stockpileId: FOUNDER_STOCKPILE_ID })!;
  assert.equal(stockInfo.name, 'Founder stockpile');
  assert.equal(stockInfo.facts[0].value, '9 / 200');
  assert.equal(stockInfo.facts[1].value, '2 fiber · 3 stone · 4 wood');
  assert.equal(resolveInspection(session.world, { cropId: 'crop:0' }), null);
  assert.equal(resolveInspection(session.world, { cropId: 'crop:9' }), null);
  session.dispatch({ schema: 3, id: 'inspect-farm-live', type: 'build', projectId: 'farm',
    designVersion: 2, expectedRevision: session.world.revision });
  const life = session.world.life!;
  life.crops.set('crop:0', { id: 'crop:0', plantedTick: 1, growthTicks: 4 });
  life.tick = 4;
  const growing = resolveInspection(session.world, { cropId: 'crop:0' })!;
  assert.equal(growing.facts[0].value, 'Growing');
  assert.equal(growing.facts[2].value, '3 / 4 ticks');
  life.tick = 5;
  const ready = resolveInspection(session.world, { cropId: 'crop:0' })!;
  assert.equal(ready.facts[0].value, 'Ready to harvest');
  assert.equal(ready.facts[1].value, '6 food + 1 fiber when harvested');
  const revisionBefore = session.world.revision;
  const hash = canonicalWorldHash(session.world, session.nextSequence, 3);
  assert.equal(canonicalWorldHash(session.world, session.nextSequence, 3), hash);
  assert.equal(session.world.revision, revisionBefore);
});

test('opaque terrain blocks deeper targets and parent decoration inherits one owner', () => {
  const session = GameSession.genesis();
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const site = session.world.sites[0];
  const landmark = buildNoxelSite(site);
  landmark.position.set(0, 0, 0);
  root.add(landmark);
  const terrain = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 0.2));
  terrain.position.set(0, 0, 3);
  scene.add(terrain);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const panel = { renderList() {}, setVisible() {}, show() {}, hideCard() {}, setListVisible() {},
    isListVisible() { return false; }, pinnedKey() { return null; }, focusCard() {}, focusList() {} };
  const controller = new SceneInspector({ world: session.world, scene, camera,
    canvas: { getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
      addEventListener() {}, tabIndex: 0, setAttribute() {} } as any,
    terrain,
  }, panel as InspectorPanel);
  const pick = (controller as any).pick.bind(controller) as (x: number, y: number) => unknown;
  controller.addRoot(root);
  scene.updateMatrixWorld(true);
  assert.equal(pick(50, 50), null);
  terrain.position.z = 13;
  scene.updateMatrixWorld(true);
  assert.deepEqual(pick(50, 50), { siteId: site.id });
  root.visible = false;
  assert.equal(pick(50, 50), null);
  const child = landmark.children[0];
  assert.deepEqual(identifiedRef(child), { siteId: site.id });
  assert.equal(canonicalWorldHash(session.world, session.nextSequence, 3),
    canonicalWorldHash(session.world, session.nextSequence, 3));
});

test('terrace soil cannot hide its authoritative crop row from a real ray', () => {
  const session = GameSession.genesis();
  const result = session.dispatch({ schema: 3, id: 'inspect-crop-ray', type: 'build', projectId: 'farm',
    designVersion: 2, expectedRevision: session.world.revision });
  assert.equal(result.ok, true, JSON.stringify(result));
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const structure = [...session.world.structures.values()][0];
  root.add(buildStructureMesh(structure));
  buildLifeMeshes(session.world).children.filter((child) => child.userData.cropId)
    .forEach((child) => root.add(child));
  const row = structure.modules.find((module) => module.kind === 'crop_row')!;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(row.x, row.y + 10, row.z + 10);
  camera.lookAt(row.x, row.y + row.h / 2, row.z);
  camera.updateMatrixWorld();
  const panel = { renderList() {}, setVisible() {}, show() {}, hideCard() {}, setListVisible() {},
    isListVisible() { return false; }, pinnedKey() { return null; }, focusCard() {}, focusList() {} };
  const terrain = new THREE.Group();
  scene.add(terrain);
  const controller = new SceneInspector({ world: session.world, scene, camera,
    canvas: { getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
      addEventListener() {}, tabIndex: 0, setAttribute() {} } as any,
    terrain,
  }, panel as InspectorPanel);
  controller.addRoot(root);
  scene.updateMatrixWorld(true);
  const pick = (controller as any).pick.bind(controller) as (x: number, y: number) => unknown;
  assert.deepEqual(pick(50, 50), { cropId: 'crop:0' });
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 0.1));
  blocker.position.copy(camera.position).lerp(new THREE.Vector3(row.x, row.y, row.z), 0.5);
  blocker.quaternion.copy(camera.quaternion);
  terrain.add(blocker);
  scene.updateMatrixWorld(true);
  assert.equal(pick(50, 50), null, 'nearer opaque terrain still blocks crop selection');
});

function bareInspector(session: GameSession, scene: THREE.Scene, root: THREE.Object3D): SceneInspector {
  const controller = Object.create(SceneInspector.prototype) as SceneInspector;
  (controller as any).options = { world: session.world, scene };
  (controller as any).roots = new Set([root]);
  (controller as any).targetCache = {};
  (controller as any).panel = { renderList() {} } as InspectorPanel;
  controller.refreshTargets();
  return controller;
}
