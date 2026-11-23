// Diagnostic approximation of VoxelTerrainView's generation/eviction order.
// Not production-browser evidence; exact browser measurements are recorded separately.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { GameSession } from '../../../Game/tests/.diagnostics/session.mjs';
import { BrowserSaveStore } from '../../../Game/tests/.diagnostics/persistence.mjs';
import { generateEntityChunk, evictChunk, worldToChunkX, worldToChunkZ } from '../../../Game/tests/.diagnostics/world.mjs';
const storage = new Map();
const suffix = new Date().toISOString().replaceAll(':', '-');
const adapter = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
const store = new BrowserSaveStore(adapter, 1337);
let session = store.load().session;
const steps = [];
function stream(session, x, z) {
  const w = session.world;
  const ccx = worldToChunkX(Math.round(x)), ccz = worldToChunkZ(Math.round(z));
  const loaded = new Set();
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    const cx = ccx + dx, cz = ccz + dz;
    for (let nz = -1; nz <= 1; nz++) for (let nx = -1; nx <= 1; nx++) generateEntityChunk(w, cx + nx, cz + nz);
    loaded.add(`${cx},${cz}`);
  }
  for (const [key] of w.chunks) {
    const [cx, cz] = key.split(',').map(Number);
    if (Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) > 4) evictChunk(w, key);
  }
  steps.push({ focus: [x, z], entities: w.entities.size, generated: w.stats.chunksGenerated,
    loaded: w.chunks.size, liveEvicted: w.stats.chunksEvicted });
}
function save() { const receipt = store.save(session); assert.equal(receipt.ok, true); }
function reload(label) {
  session = store.load().session;
  steps.push({ focus: label, entities: session.world.entities.size,
    generated: session.world.stats.chunksGenerated, cached: session.world.chunks.size });
}
stream(session, -14, -8);
reload('before waystone new page');
stream(session, -10, -14);
reload('before final original new page');
stream(session, -14, -8);
function command(input) {
  const receipt = session.dispatch({ schema: 3,
    ...(input.type === 'build' ? { designVersion: 2 } : {}), ...input,
    expectedRevision: session.world.revision });
  assert.equal(receipt.ok, true, JSON.stringify(receipt));
}
command({ id: 'harvest:0:hero:shrub', type: 'harvest', entityId: 'hero:styl_shrub:-14:-8' });
save();
command({ id: 'deposit:1', type: 'deposit', stockpileId: 'stockpile:founder', resources: { fiber: 1 } });
save();
stream(session, -56.5, -43.5);
command({ id: 'build:2:house', type: 'build', projectId: 'house' }); save();
stream(session, -48.5, -43);
command({ id: 'build:3:path', type: 'build', projectId: 'path' }); save();
stream(session, -32.5, -38.5);
command({ id: 'build:4:farm', type: 'build', projectId: 'farm' }); save();
stream(session, -43, -41);
reload('original after restore');
stream(session, -14, -8);
const restoredHash = session.stateHash;
const restoredIdsAfterOriginal = [...session.world.entities.keys()].sort();
stream(session, -56.5, -43.5);
stream(session, -48.5, -43);
stream(session, -32.5, -38.5);
stream(session, -43, -41);
const fullRestoredHash = session.stateHash;
assert.equal(session.world.entities.size, 144);
assert.equal(session.stateHash, restoredHash);
assert.equal(restoredIdsAfterOriginal.length, 103);
reload('original view after second restore');
stream(session, -14, -8);
assert.equal(session.world.entities.size, 103);
assert.deepEqual([...session.world.entities.keys()].sort(), restoredIdsAfterOriginal);
assert.equal(session.stateHash, fullRestoredHash);
stream(session, -10, -14);
const waystoneIds = [...session.world.entities.keys()].sort();
assert.equal(waystoneIds.length, 103);
assert.deepEqual(waystoneIds, restoredIdsAfterOriginal);
assert.equal(session.stateHash, fullRestoredHash);
reload('original plus final focus after third restore');
stream(session, -14, -8);
stream(session, -43, -41);
assert.equal(session.world.entities.size, 133);
assert.equal(session.stateHash, fullRestoredHash);
const result = { steps, canonicalHash: session.stateHash,
  originalViewUnion: 103, originalPlusFinalFocusUnion: 133, fullViewHistoryUnion: 144,
  sameWaystoneViewAfterRestoreMatchesOriginalUnion: true,
  note: 'Fresh restore materializes only persisted deltas until chunks are demanded. Equivalent original/Waystone and full construction histories reproduce their exact retained sets; a smaller original-plus-final-focus history is measured separately.' };
writeFileSync(new URL(`terrain-materialization-${suffix}.json`, import.meta.url).pathname, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));