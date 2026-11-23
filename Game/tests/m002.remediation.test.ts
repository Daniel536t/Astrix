import test from 'node:test';
import assert from 'node:assert/strict';
import { createM002Fixture, M002_LAYOUT } from '../src/sim/m002';
import { M002_STARTER_INVENTORY } from '../src/sim/scenario';
import { LocalAuthorizer, planPreparation } from '../src/sim/preparation';
import { LocalStructureAuthorizer } from '../src/sim/structures';
import { obstructionsIn } from '../src/sim/terrain';
import { canonicalEntityHash, canonicalRegionHash, canonicalInventoryHash, canonicalStructureHash } from '../src/sim/canonical';
import { buildProject, M2_PROJECTS, projectSiteProposal } from '../src/app/projects';
import { Entity, evictChunk, generateChunk, chunkKey, worldToChunkX, worldToChunkZ } from '../src/sim/world';
import { canonicalWorldHash, createWorldSnapshot, decodeWorldSnapshot, worldFromSnapshot } from '../src/sim/snapshot';

function fixture() {
  const m = createM002Fixture();
  m.world.inventory = { ...M002_STARTER_INVENTORY };
  return m;
}

function hash(world: ReturnType<typeof createM002Fixture>['world']) {
  return canonicalWorldHash(world);
}

function chunkEntity(id: string, x: number, z: number): Entity {
  return {
    id, kind: 'styl_tree_cluster', chunk: chunkKey(worldToChunkX(x), worldToChunkZ(z)),
    x, y: 12, z, rot: 0, scale: 1, variant: 0, resource: 'wood', remaining: 4,
    yieldPerHarvest: 2, harvested: false, provisional: true, authored: false,
  };
}

for (const [label, x, z, rect] of [
  ['x', -1.25, -32.5, { x0: 0, x1: 0, z0: -33, z1: -33 }],
  ['z', -32.5, -1.25, { x0: -33, x1: -33, z0: 0, z1: 0 }],
] as const) {
  test(`an entity rooted in the adjacent ${label} chunk obstructs the footprint`, () => {
    const world = createM002Fixture().world;
    const [cx, cz] = [worldToChunkX(x), worldToChunkZ(z)];
    if (label === 'x') assert.notEqual(cx, worldToChunkX(rect.x0));
    if (label === 'z') assert.notEqual(cz, worldToChunkZ(rect.z0));
    generateChunk(world, cx, cz);
    const e = chunkEntity(`edge:${label}`, x, z);
    world.entities.set(e.id, e);
    world.entityChunks.get(e.chunk)?.push(e.id);
    assert.deepEqual(obstructionsIn(world, rect).filter((o) => o.entityId === e.id).map((o) => o.entityId), [e.id]);
  });
}

test('a disjoint adjacent-chunk entity does not obstruct and a boundary root invalidates a token', () => {
  const world = createM002Fixture().world;
  const far = chunkEntity('edge:disjoint', -32.5 - 4, -32.5);
  world.entities.set(far.id, far);
  world.entityChunks.get(far.chunk)?.push(far.id);
  const rect = { x0: -32, x1: -32, z0: -33, z1: -33 };
  assert.equal(obstructionsIn(world, rect).length, 0);
  const project = M2_PROJECTS[0];
  const planned = planPreparation(world, projectSiteProposal(project), project.prep);
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const token = new LocalAuthorizer({ envelope: M002_LAYOUT.envelope }).authorize(world, planned.plan);
  assert.equal(token.ok, true);
  const near = chunkEntity('edge:new', M002_LAYOUT.house.rect.x0 - 1.4, M002_LAYOUT.house.rect.z0 + 0.5);
  world.entities.set(near.id, near);
  world.entityChunks.get(near.chunk)?.push(near.id);
  const decision = new LocalAuthorizer({ envelope: M002_LAYOUT.envelope }).authorize(world, planned.plan);
  assert.equal(decision.ok, false);
  assert.ok(decision.reasons.some((r) => r.includes('do not match footprint obstructions')));
});

test('a structure authorization fault rolls back preparation, resources and entities', () => {
  const world = createM002Fixture().world;
  world.inventory = { ...M002_STARTER_INVENTORY };
  const before = hash(world);
  const result = buildProject(
    world, new LocalAuthorizer({ envelope: M002_LAYOUT.envelope }),
    new LocalStructureAuthorizer({ envelope: M002_LAYOUT.envelope }, { maxModules: 1 }),
    M2_PROJECTS[0],
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.structureFailureRetained, false);
  assert.equal(hash(world), before);
});

test('an obstruction introduced between preparation and structure execution rolls all work back', () => {
  const world = createM002Fixture().world;
  world.inventory = { ...M002_STARTER_INVENTORY };
  const before = hash(world);
  const injectedAuthorizer = new LocalStructureAuthorizer({ envelope: M002_LAYOUT.envelope });
  const originalAuthorize = injectedAuthorizer.authorize.bind(injectedAuthorizer);
  injectedAuthorizer.authorize = (currentWorld, plan) => {
    const decision = originalAuthorize(currentWorld, plan);
    const e = chunkEntity('late-obstruction', M002_LAYOUT.house.rect.x0 - 1.4, -43.5);
    currentWorld.entities.set(e.id, e);
    const ids = currentWorld.entityChunks.get(e.chunk);
    if (!ids) throw new Error('fault injection target chunk was not preloaded');
    ids.push(e.id);
    currentWorld.revision++;
    return decision;
  };
  const result = buildProject(
    world, new LocalAuthorizer({ envelope: M002_LAYOUT.envelope }),
    injectedAuthorizer, M2_PROJECTS[0],
  );
  assert.equal(result.ok, false, 'fault injection must reach the structure stage');
  assert.equal(hash(world), before);
});

test('full snapshot round trip, eviction and derived regeneration preserve every authoritative field', () => {
  const world = createM002Fixture().world;
  world.inventory = { ...M002_STARTER_INVENTORY };
  const prep = new LocalAuthorizer({ envelope: M002_LAYOUT.envelope });
  const structures = new LocalStructureAuthorizer({ envelope: M002_LAYOUT.envelope });
  for (const project of M2_PROJECTS) assert.equal(buildProject(world, prep, structures, project).ok, true);
  const before = hash(world);
  const snapshot = decodeWorldSnapshot(JSON.stringify(createWorldSnapshot(world)));
  const restored = worldFromSnapshot(snapshot);
  assert.equal(hash(restored), before);
  assert.equal(world.revision, restored.revision);
  assert.deepEqual([...world.edits], [...restored.edits]);
  assert.deepEqual([...world.structures.entries()].sort(([a], [b]) => a.localeCompare(b)),
    [...restored.structures.entries()].sort(([a], [b]) => a.localeCompare(b)));
  assert.equal(canonicalRegionHash(world, M002_LAYOUT.protectedRegion).hash,
    canonicalRegionHash(restored, M002_LAYOUT.protectedRegion).hash);
  assert.equal(canonicalEntityHash(restored), canonicalEntityHash(world));
  assert.equal(canonicalInventoryHash(restored), canonicalInventoryHash(world));
  assert.equal(canonicalStructureHash(restored), canonicalStructureHash(world));
  for (const key of restored.edits.keys()) {
    assert.equal(evictChunk(restored, key), true);
    const [cx, cz] = key.split(',').map(Number);
    const regenerated = generateChunk(restored, cx, cz)!;
    const original = world.chunks.get(key)!;
    assert.deepEqual(regenerated.data, original.data, `edited chunk ${key} must regenerate byte-for-byte`);
    assert.deepEqual(regenerated.heights, original.heights, `height cache ${key} must be derived again`);
    assert.deepEqual(regenerated.topMaterials, original.topMaterials, `material cache ${key} must be derived again`);
  }
  assert.equal(canonicalRegionHash(restored, M002_LAYOUT.protectedRegion).hash,
    canonicalRegionHash(world, M002_LAYOUT.protectedRegion).hash);
  assert.equal(hash(restored), before);
});

test('chunk eviction retains generated entities and all harvest state', () => {
  const world = createM002Fixture().world;
  const key = [...world.entityChunks.keys()][0];
  const ids = world.entityChunks.get(key)!;
  assert.ok(ids.length > 0);
  const before = canonicalEntityHash(world);
  assert.equal(evictChunk(world, key), true);
  assert.equal(canonicalEntityHash(world), before);
  const [cx, cz] = key.split(',').map(Number);
  assert.equal(generateChunk(world, cx, cz)?.key, key);
  assert.equal(canonicalEntityHash(world), before);
});

test('corrupt, incompatible and duplicate snapshot fields are rejected without mutation', () => {
  const world = createM002Fixture().world;
  const snapshot = createWorldSnapshot(world);
  const cases: unknown[] = [
    { ...snapshot, schema: 999 },
    { ...snapshot, edits: [{ chunk: snapshot.edits[0]?.chunk ?? '30,30', cells: [{ i: 0, m: 99 }] }] },
    { ...snapshot, entities: [snapshot.entities[0], snapshot.entities[0]] },
    { ...snapshot, manifest: { ...snapshot.manifest, generatorVersion: 99 } },
  ];
  for (const corrupt of cases) assert.throws(() => worldFromSnapshot(corrupt as never));
});
