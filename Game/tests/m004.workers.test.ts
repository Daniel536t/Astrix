import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENERATOR_V2, GENERATOR_VERSION, MAT, chunkOriginX, chunkOriginZ, computeBaseColumns, createWorld, ensureChunk,
  generateBaseChunk, installBaseChunk, seedBaseColumns, setVoxel, surfaceAt, chunkKey,
} from '../src/sim/world';
import { meshChunk, paddedFor } from '../src/render/terrain';
import { meshPadded } from '../src/render/mesher';

// The worker runs exactly these pure functions; this test proves that the
// off-thread path installs the same chunk, entities and mesh as the
// synchronous path, including durable edits made before the result arrives.
for (const version of [GENERATOR_VERSION, GENERATOR_V2]) {
  test(`worker-path generation is identical to synchronous generation (v${version})`, () => {
    const sync = createWorld(1337, version);
    const viaWorker = createWorld(1337, version);
    const cx = 29, cz = 29;
    // A durable edit recorded before the chunk becomes resident.
    for (const w of [sync, viaWorker]) {
      const probe = createWorld(1337, version);
      const y = surfaceAt(probe, chunkOriginX(cx) + 5, chunkOriginZ(cz) + 5);
      w.edits.set(chunkKey(cx, cz), new Map());
      setVoxel(w, chunkOriginX(cx) + 5, y, chunkOriginZ(cz) + 5, MAT.STONE);
      w.chunks.clear();
      w.entities.clear(); w.entityChunks.clear();
    }
    const a = ensureChunk(sync, cx, cz)!;
    const base = generateBaseChunk(1337, version, cx, cz);
    seedBaseColumns(viaWorker, chunkKey(cx, cz), computeBaseColumns(1337, version, cx, cz));
    const b = installBaseChunk(viaWorker, base)!;
    assert.deepEqual(b.data, a.data);
    assert.deepEqual(b.heights, a.heights);
    assert.deepEqual(b.topMaterials, a.topMaterials);
    assert.deepEqual([...viaWorker.entities.values()], [...sync.entities.values()]);
    assert.equal(installBaseChunk(viaWorker, base), b, 'a second result for a resident chunk is ignored');
    assert.throws(() => installBaseChunk(createWorld(7, version), base), /different world/);

    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { ensureChunk(sync, cx + dx, cz + dz); ensureChunk(viaWorker, cx + dx, cz + dz); }
    const m1 = meshChunk(sync, a);
    const m2 = meshPadded(paddedFor(viaWorker, b), b.heights, chunkOriginX(cx), chunkOriginZ(cz), 1337);
    assert.deepEqual(Array.from(m2.positions), Array.from(m1.geometry.getAttribute('position').array));
    assert.deepEqual(Array.from(m2.indices), Array.from(m1.geometry.index!.array));
  });
}
