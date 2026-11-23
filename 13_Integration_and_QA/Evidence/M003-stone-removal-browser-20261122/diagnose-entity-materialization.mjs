// Diagnostic reproduction of the desktop browser's construction materialization.
// This is not production-browser evidence and does not replace that verification.
import assert from 'node:assert/strict';
import { GameSession } from '../../../Game/tests/.diagnostics/session.mjs';
import { BrowserSaveStore } from '../../../Game/tests/.diagnostics/persistence.mjs';
import { generateEntityChunk, worldToChunkX, worldToChunkZ } from '../../../Game/tests/.diagnostics/world.mjs';

const ids = w => [...w.entities.keys()].sort();
const diff = (before, after) => ({ added: after.filter(id => !before.includes(id)), removed: before.filter(id => !after.includes(id)) });
const session = GameSession.genesis(1337);
const world = session.world;
const steps = [{ step: 'genesis', entities: world.entities.size, chunks: world.stats.chunksGenerated }];
function command(input) {
  const receipt = session.dispatch({ schema: 3, ...(input.type === 'build' ? { designVersion: 2 } : {}),
    ...input, expectedRevision: world.revision });
  assert.equal(receipt.ok, true, JSON.stringify(receipt));
}
command({ id: 'harvest:0:hero:shrub', type: 'harvest', entityId: 'hero:styl_shrub:-14:-8' });
command({ id: 'deposit:1', type: 'deposit', stockpileId: 'stockpile:founder', resources: { fiber: 1 } });
for (const projectId of ['house', 'path', 'farm']) {
  const before = ids(world);
  const hash = session.stateHash;
  command({ id: `build:2:${projectId}`, type: 'build', projectId });
  const delta = diff(before, ids(world));
  steps.push({ step: projectId, entities: world.entities.size, hash, nextHash: session.stateHash,
    entityChanges: [...world.entityChanges].sort(), delta });
}
const raw = JSON.stringify({ schema: 3, seed: 1337, snapshot: session.snapshot, journal: session.journal });
const storage = new Map([['astrix:m002:v3:seed:1337', raw]]);
const adapter = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
const loaded = new BrowserSaveStore(adapter, 1337).load();
assert.equal(loaded.status, 'restored');
assert.equal(loaded.session.stateHash, session.stateHash);
const restoredBefore = ids(loaded.session.world);
const forFocus = (w, x, z) => {
  const cx = worldToChunkX(x), cz = worldToChunkZ(z);
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) generateEntityChunk(w, cx + dx, cz + dz);
};
forFocus(world, -43, -41);
forFocus(loaded.session.world, -43, -41);
steps.push({ step: 'same founder view materialized', before: world.entities.size, restored: loaded.session.world.entities.size,
  beforeGenerated: world.stats.chunksGenerated, restoredGenerated: loaded.session.world.stats.chunksGenerated,
  delta: diff(restoredBefore, ids(loaded.session.world)) });
assert.equal(world.entities.size, loaded.session.world.entities.size);
assert.deepEqual(ids(world), ids(loaded.session.world));
forFocus(world, -14, -8);
forFocus(loaded.session.world, -14, -8);
steps.push({ step: 'union with original founder camera view', before: world.entities.size,
  restored: loaded.session.world.entities.size,
  beforeGenerated: world.stats.chunksGenerated, restoredGenerated: loaded.session.world.stats.chunksGenerated,
  delta: diff(ids(world), ids(loaded.session.world)) });
assert.equal(world.entities.size, loaded.session.world.entities.size);
assert.deepEqual(ids(world), ids(loaded.session.world));
forFocus(world, -10, -14);
forFocus(loaded.session.world, -10, -14);
steps.push({ step: 'union with Waystone pointer camera view', before: world.entities.size,
  restored: loaded.session.world.entities.size,
  beforeGenerated: world.stats.chunksGenerated, restoredGenerated: loaded.session.world.stats.chunksGenerated });
assert.equal(world.entities.size, loaded.session.world.entities.size);
assert.deepEqual(ids(world), ids(loaded.session.world));
console.log(JSON.stringify({ restoredStatus: loaded.status, stateHash: session.stateHash,
  persistedEntities: session.snapshot.entities.length, steps }, null, 2));
