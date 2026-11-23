import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GameSession } from '../src/app/session';
import { buildLifeMeshes, disposeLifeMeshes } from '../src/render/life';
import { FOUNDER_STOCKPILE_ID } from '../src/sim/economy';
import { surfaceAt } from '../src/sim/world';

function buildFarm(session: GameSession): void {
  const result = session.dispatch({
    schema: 3, id: 'render-test-farm', type: 'build', projectId: 'farm',
    designVersion: 2, expectedRevision: session.world.revision,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
}

function stock(session: GameSession) {
  return session.world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!;
}

function crop(session: GameSession, id: string): THREE.Mesh {
  const group = buildLifeMeshes(session.world);
  const plot = group.children.find((child) => child.userData.cropId === id);
  assert.ok(plot instanceof THREE.Mesh);
  return plot;
}

test('schema-3 stockpile is at its authoritative surface and visibly distinguishes empty from stored', () => {
  const session = GameSession.genesis();
  assert.equal(session.snapshot.schema, 3);
  const revision = session.world.revision;
  const tick = session.world.life!.tick;
  const group = buildLifeMeshes(session.world);
  assert.equal(group.name, 'life_state');
  const depot = group.getObjectByName(`life_${FOUNDER_STOCKPILE_ID}`)!;
  assert.equal(depot.position.x, stock(session).x);
  assert.equal(depot.position.z, stock(session).z);
  assert.equal(depot.position.y, surfaceAt(session.world, stock(session).x, stock(session).z));
  assert.ok(depot.getObjectByName('stockpile_frame') instanceof THREE.Mesh);
  assert.equal(depot.userData.empty, true);
  assert.equal(depot.getObjectByName('stockpile_empty')!.visible, true);
  assert.equal(depot.getObjectByName('stockpile_resources'), undefined);

  stock(session).inventory = { wood: 4, stone: 3 };
  const stored = buildLifeMeshes(session.world);
  const storedDepot = stored.getObjectByName(`life_${FOUNDER_STOCKPILE_ID}`)!;
  const resources = storedDepot.getObjectByName('stockpile_resources');
  assert.ok(resources instanceof THREE.Mesh);
  assert.equal(storedDepot.userData.empty, false);
  assert.equal(storedDepot.getObjectByName('stockpile_empty')!.visible, false);
  assert.deepEqual(resources!.userData.resources, { stone: 3, wood: 4 });
  assert.equal(resources!.userData.stored, 7);
  assert.equal(resources!.userData.capacity, 200);
  assert.equal(session.world.revision, revision);
  assert.equal(session.world.life!.tick, tick);
});

test('the life overlay owns exactly one geometry for each of the nine farm rows', () => {
  const session = GameSession.genesis();
  buildFarm(session);
  const rows = [...session.world.structures.values()][0].modules.filter((m) => m.kind === 'crop_row');
  assert.equal(rows.length, 9);
  const group = buildLifeMeshes(session.world);
  const plots = group.children.filter((child) => child.userData.cropId);
  assert.equal(plots.length, 9);
  assert.equal(new Set(plots.map((plot) => plot.name)).size, 9);
  assert.equal(group.children.some((child) => child.name === 'crop_row_foliage'), false);
  assert.equal(group.children.some((child) => child.name.startsWith('structure_terrace')), false);
  for (let i = 0; i < plots.length; i++) {
    const plot = plots[i] as THREE.Mesh;
    assert.equal(plot.userData.cropId, `crop:${i}`);
    assert.equal(plot.userData.state, 'empty');
    const row = rows[i];
    const bounds = plot.geometry.boundingBox!;
    assert.ok(bounds.min.x >= row.x - row.w / 2 - 1e-5);
    assert.ok(bounds.max.x <= row.x + row.w / 2 + 1e-5);
    assert.ok(bounds.min.y >= row.y - 1e-5);
    assert.ok(bounds.max.y <= row.y + row.h + 1e-5);
    assert.ok(bounds.min.z >= row.z - row.d / 2 - 1e-5);
    assert.ok(bounds.max.z <= row.z + row.d / 2 + 1e-5);
  }
});

test('crop geometry follows plantedTick, growthTicks and authoritative life tick through ready and harvest', () => {
  const session = GameSession.genesis();
  buildFarm(session);
  const life = session.world.life!;
  life.crops.set('crop:0', { id: 'crop:0', plantedTick: 1, growthTicks: 4 });

  life.tick = 1;
  const planted = crop(session, 'crop:0');
  assert.equal(planted.userData.state, 'sprout');
  const plantedHeight = planted.geometry.boundingBox!.max.y - planted.geometry.boundingBox!.min.y;
  life.tick = 3;
  const growing = crop(session, 'crop:0');
  assert.equal(growing.userData.state, 'sprout');
  assert.ok(growing.geometry.boundingBox!.max.y > planted.geometry.boundingBox!.max.y);
  life.tick = 5;
  const ready = crop(session, 'crop:0');
  assert.equal(ready.userData.state, 'ready');
  assert.ok(ready.geometry.boundingBox!.max.y > growing.geometry.boundingBox!.max.y);
  assert.ok(ready.geometry.boundingBox!.max.y - ready.geometry.boundingBox!.min.y > plantedHeight);
  assert.notDeepEqual(
    Array.from(ready.geometry.getAttribute('color').array),
    Array.from(growing.geometry.getAttribute('color').array),
  );

  life.crops.delete('crop:0');
  const harvested = crop(session, 'crop:0');
  assert.equal(harvested.userData.state, 'empty');
  assert.equal(life.tick, 5, 'rendering never advances simulation time');
});

test('legacy worlds have no life geometry and generated meshes can be disposed', () => {
  const legacy = GameSession.legacyGenesis();
  const empty = buildLifeMeshes(legacy.world);
  assert.equal(empty.children.length, 0);

  const session = GameSession.genesis();
  buildFarm(session);
  const group = buildLifeMeshes(session.world);
  let meshCount = 0;
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) meshCount++;
  });
  assert.equal(meshCount, 10);
  disposeLifeMeshes(group);
  assert.equal(group.children.length, 0);
});
