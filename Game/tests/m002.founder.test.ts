import assert from 'node:assert/strict';
import test from 'node:test';
import { GameSession, validateCommand } from '../src/app/session';
import {
  FOUNDER_DESIGN_VERSION, Structure, StructureModule,
} from '../src/sim/structures';
import { projectById } from '../src/app/projects';
import { canonicalStructureHash } from '../src/sim/canonical';
import { buildStructureMesh } from '../src/render/structures';
import { decodeWorldSnapshot, validateWorldSnapshot } from '../src/sim/snapshot';

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function build(session: GameSession, projectId: 'house' | 'path' | 'farm') {
  return session.dispatch({
    schema: session.journal.schema, id: `build-${projectId}`, type: 'build',
    projectId, expectedRevision: session.world.revision,
    ...(session.journal.schema >= 2 ? { designVersion: FOUNDER_DESIGN_VERSION } : {}),
  });
}
function overlap(a: StructureModule, b: StructureModule): boolean {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w - 1e-9
    && Math.abs(a.z - b.z) * 2 < a.d + b.d - 1e-9
    && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
}
function assertOpening(structure: Structure, opening: Structure['modules'][number]): void {
  assert.equal(structure.modules.some((m) => overlap(m, opening)), false,
    `opening intersects ${JSON.stringify(opening)}`);
}

test('schema-2 commands select only design 2 and preserve harvest schema 1', () => {
  const session = GameSession.legacyGenesis(1337, 2);
  assert.equal(session.journal.schema, 2);
  assert.equal(session.snapshot.schema, 2);
  const result = build(session, 'house');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(session.world.structures.values().next().value?.designVersion, 2);
  assert.equal(session.dispatch(clone(session.journal.entries[0].command)).duplicate, true);
  assert.equal(session.dispatch({
    schema: 1, id: 'wrong-world', type: 'build', projectId: 'path',
    expectedRevision: session.world.revision,
  }).code, 'schema_mismatch');
  assert.throws(() => validateCommand({
    schema: 2, id: 'wrong-harvest', type: 'harvest', entityId: 'e:30,30:4', expectedRevision: 0,
  }), /unsupported/);
  assert.throws(() => validateCommand({
    schema: 2, id: 'bad-design', type: 'build', projectId: 'house',
    expectedRevision: 0, designVersion: 1,
  }), /design/);
  assert.throws(() => validateCommand({
    schema: 1, id: 'sneak-design', type: 'build', projectId: 'house',
    expectedRevision: 0, designVersion: 2,
  }));
});

test('legacy planning, structure hashes and snapshots remain byte-compatible', () => {
  const legacy = GameSession.legacyGenesis();
  assert.equal(legacy.snapshot.schema, 1);
  assert.equal(build(legacy, 'house').ok, true);
  const record = legacy.world.structures.values().next().value!;
  assert.equal(record.designVersion, undefined);
  assert.equal(record.modules.length, 17);
  assert.equal('designVersion' in record, false);
  const goldenDigest = record.id;
  const goldenHash = canonicalStructureHash(legacy.world);
  const goldenSnapshot = JSON.stringify(legacy.snapshot);
  const replay = GameSession.replay(clone(legacy.journal));
  assert.equal(replay.world.structures.get(goldenDigest)?.designVersion, undefined);
  assert.equal(canonicalStructureHash(replay.world), goldenHash);
  assert.equal(JSON.stringify(replay.snapshot), goldenSnapshot);
  assert.equal(decodeWorldSnapshot(goldenSnapshot).schema, 1);
  assert.equal(legacy.dispatch({
    schema: 2, id: 'current-content', type: 'build', projectId: 'path',
    expectedRevision: legacy.world.revision,
  }).code, 'invalid_command');
});

test('founder house has full-thickness door and window voids and bounded wall spans', () => {
  const session = GameSession.legacyGenesis(1337, 2);
  assert.equal(build(session, 'house').ok, true);
  const structure = [...session.world.structures.values()][0];
  assert.equal(structure.modules.length, 19);
  assert.equal(structure.modules.some((m) => m.kind === 'window' || m.kind === 'door'), false);
  assert.equal(structure.modules.every((m) => m.tone === 'stone'), true);
  const wallModules = structure.modules.filter((m) => m.kind === 'wall' || m.kind === 'lintel');
  for (let i = 0; i < wallModules.length; i++) {
    for (let j = i + 1; j < wallModules.length; j++) {
      assert.equal(overlap(wallModules[i], wallModules[j]), false,
        `${JSON.stringify(wallModules[i])} overlaps ${JSON.stringify(wallModules[j])}`);
    }
  }
  const rect = projectById('house').rect;
  const floorY = projectById('house').floorY;
  const doorX = rect.x1 + 1 - 0.3;
  const doorZ = projectById('house').door!.z + 0.5;
  assertOpening(structure, {
    kind: 'wall', x: doorX, y: floorY, z: doorZ, w: 0.6, h: 2.2, d: 1.2,
  });
  const southZ = rect.z1 + 1 - 0.3, cx = (rect.x0 + rect.x1 + 1) / 2;
  for (const x of [cx - 2, cx + 2]) assertOpening(structure, {
    kind: 'wall', x, y: floorY + 1, z: southZ, w: 1.2, h: 1.4, d: 0.6,
  });
  for (const module of structure.modules) {
    assert.ok(module.x - module.w / 2 >= rect.x0 - 1e-9);
    assert.ok(module.x + module.w / 2 <= rect.x1 + 1 + 1e-9);
    assert.ok(module.z - module.d / 2 >= rect.z0 - 1e-9);
    assert.ok(module.z + module.d / 2 <= rect.z1 + 1 + 1e-9);
  }
});

test('founder paths consolidate equal-height runs and preserve the stepped profile', () => {
  const legacy = GameSession.legacyGenesis();
  const founder = GameSession.genesis();
  assert.equal(build(legacy, 'path').ok, true);
  assert.equal(build(founder, 'path').ok, true);
  const old = [...legacy.world.structures.values()][0];
  const current = [...founder.world.structures.values()][0];
  assert.equal(old.modules.length, 27);
  assert.equal(current.modules.length, 9);
  const oldPaths = old.modules.filter((m) => m.kind === 'path');
  const paths = current.modules.filter((m) => m.kind === 'path');
  for (const segment of oldPaths) {
    const run = paths.find((m) => m.y === segment.y && Math.abs(m.z - segment.z) < 1e-9
      && segment.x >= m.x - m.w / 2 && segment.x <= m.x + m.w / 2);
    assert.ok(run, `no equivalent run for ${JSON.stringify(segment)}`);
  }
  assert.equal(current.modules.filter((m) => m.kind === 'curb').length, 6);
  assert.ok(new Set(paths.map((m) => m.y)).size > 1);
});

test('schema-2 structures round-trip exactly through snapshots and tail replay', () => {
  const live = GameSession.genesis();
  assert.equal(build(live, 'house').ok, true);
  const boundary = clone(live.snapshot);
  assert.equal(build(live, 'path').ok, true);
  assert.equal(build(live, 'farm').ok, true);
  const tail = GameSession.restore(clone(boundary), clone(live.journal));
  const genesis = GameSession.replay(clone(live.journal));
  for (const restored of [tail, genesis]) {
    assert.equal(restored.stateHash, live.stateHash);
    assert.deepEqual(restored.snapshot, live.snapshot);
    assert.deepEqual(restored.journal, live.journal);
  }
  for (const structure of live.world.structures.values()) {
    assert.equal(validateWorldSnapshot(live.snapshot).structures.find((s) => s.id === structure.id)?.designVersion, 2);
  }
  const legacy = clone(boundary);
  assert.equal(legacy.structures.length, 1);
  assert.throws(() => validateWorldSnapshot({ ...legacy, schema: 1 as never }));
  const reordered = clone(boundary);
  const record = reordered.structures[0];
  const reorderedRecord: Structure = {
    id: record.id, kind: record.kind, siteId: record.siteId,
    x: record.x, y: record.y, z: record.z, rot: record.rot,
    modules: record.modules, cost: record.cost, builtRevision: record.builtRevision,
    provisional: true, designVersion: 2,
  };
  reordered.structures[0] = reorderedRecord;
  assert.throws(() => validateWorldSnapshot(reordered), /canonical/);
  const before = clone(live.snapshot);
  const invalid = clone(live.snapshot);
  assert.deepEqual(live.snapshot, before);
});

test('crop aggregates have bounded presentation volumes without plant lifecycle claims', async () => {
  const session = GameSession.legacyGenesis(1337, 2);
  assert.equal(build(session, 'farm').ok, true);
  const farm = [...session.world.structures.values()][0];
  const rows = farm.modules.filter((m) => m.kind === 'crop_row');
  assert.equal(rows.length, 9);
  assert.equal(farm.modules.length, rows.length + 5);
  const geometry = buildStructureMesh(farm);
  assert.equal(geometry.type, 'Group');
  const foliage = geometry.children.find((child) => child.name === 'crop_row_foliage');
  assert.ok(foliage?.isMesh);
  assert.equal(foliage.castShadow, true);
  assert.equal(foliage.receiveShadow, true);
  const vertices = foliage.geometry.getAttribute('position');
  const matches = rows.map(() => false);
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    const rowIndex = rows.findIndex((row) => x >= row.x - row.w / 2 - 1e-5
      && x <= row.x + row.w / 2 + 1e-5 && z >= row.z - row.d / 2 - 1e-5
      && z <= row.z + row.d / 2 + 1e-5 && y >= row.y - 1e-5 && y <= row.y + row.h + 1e-5);
    assert.ok(rowIndex >= 0, `crop vertex outside every authoritative row: ${x},${y},${z}`);
    matches[rowIndex] = true;
  }
  assert.equal(matches.every(Boolean), true);
  assert.equal([...session.world.entities.values()].some((entity) => entity.kind.includes('crop')), false);
  assert.equal(session.world.inventory.wood, 30);
});

test('founder architecture casts and receives shadows', () => {
  const session = GameSession.legacyGenesis(1337, 2);
  assert.equal(build(session, 'house').ok, true);
  const mesh = buildStructureMesh([...session.world.structures.values()][0]);
  assert.equal(mesh.type, 'Mesh');
  assert.equal(mesh.castShadow, true);
  assert.equal(mesh.receiveShadow, true);
});
