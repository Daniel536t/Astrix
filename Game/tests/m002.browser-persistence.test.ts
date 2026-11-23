import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BrowserSaveStore, KeyValueStorage, MAX_SAVE_JSON_BYTES,
} from '../src/app/persistence';
import { GameSession } from '../src/app/session';
import { evictChunk, generateChunk, generateEntityChunk, isRetiredStoneKind } from '../src/sim/world';
import { FOUNDER_STOCKPILE_ID } from '../src/sim/economy';

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();
  failNextWrite = false;
  failReads = false;
  getItem(key: string): string | null {
    if (this.failReads) throw new Error('denied by browser policy');
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failNextWrite || value.length > MAX_SAVE_JSON_BYTES) throw new Error('quota exceeded');
    this.values.set(key, value);
  }
  removeItem(key: string): void { this.values.delete(key); }
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }

/** Build a raw old save so the production loader can exercise verified migration. */
function oldStoneSave(): any {
  const original = GameSession.historicalGenesisWorld(1337, 1);
  const live = GameSession.historicalJournal(original);
  const target = [...live.world.entities.values()].find((entity) =>
    entity.kind === 'styl_rock_medium' && entity.authored)!;
  const harvest = live.dispatch({
    schema: 1, id: 'old-stone-harvest', type: 'harvest', entityId: target.id,
    expectedRevision: live.world.revision,
  });
  assert.equal(harvest.ok, true, JSON.stringify(harvest));
  assert.equal(harvest.outcome.type, 'harvest');
  if (harvest.outcome.type === 'harvest') assert.equal(harvest.outcome.amount, 3);
  const boundary = live.snapshot;
  assert.equal(live.dispatch({
    schema: 1, id: 'old-house', type: 'build', projectId: 'house',
    expectedRevision: live.world.revision,
  }).ok, true);
  assert.equal(live.world.structures.size, 1);
  assert.equal(live.snapshot.entities.some((entity) => isRetiredStoneKind(entity.kind)), true);
  const save = { schema: 1, seed: 1337, snapshot: clone(boundary), journal: clone(live.journal) };
  save.journal.entries[0].hash = harvest.hash;
  return save;
}

test('old stone saves retain accepted yields and buildings across migration and repeated saves', () => {
  const save = oldStoneSave();
  const storage = new MemoryStorage();
  storage.values.set(key, JSON.stringify(save));
  const first = new BrowserSaveStore(storage, 1337).load();
  assert.equal(first.status, 'restored', first.message);
  // Restoration replays the accepted house tail: 48 + 3 harvested - 18 built.
  assert.equal(first.session.world.inventory.stone, 33);
  assert.equal(first.session.world.structures.size, 1);
  assert.equal(first.session.world.entities.size > 0, true);
  assert.equal([...first.session.world.entities.values()].some((entity) => isRetiredStoneKind(entity.kind)), false);
  assert.equal(first.session.world.entities.has('hero:styl_rock_medium:-6:-10'), false);
  assert.equal(first.session.world.entityChanges.has('30,30'), true);
  assert.equal(first.session.nextSequence, 2);
  const rejected = first.session.dispatch({
    schema: 1, id: 'retired-harvest', type: 'harvest', entityId: 'hero:styl_rock_medium:-6:-10',
    expectedRevision: first.session.world.revision,
  });
  assert.equal(rejected.ok, false);
  assert.equal(first.session.world.inventory.stone, 33);
  for (const key of first.session.world.entityChanges) {
    const [cx, cz] = key.split(',').map(Number);
    generateChunk(first.session.world, cx, cz);
  }
  assert.equal([...first.session.world.entities.values()].some((entity) => isRetiredStoneKind(entity.kind)), false);
  assert.equal(first.session.world.entities.has('hero:styl_tree_blossom:-28:-38'), true);
  const store = new BrowserSaveStore(storage, 1337);
  assert.equal(store.save(first.session).ok, true);
  const second = new BrowserSaveStore(storage, 1337).load();
  assert.equal(second.status, 'restored', second.message);
  assert.equal(second.stateHash, first.stateHash);
  assert.deepEqual(second.session.snapshot, first.session.snapshot);
  assert.deepEqual(second.session.journal, first.session.journal);
  assert.equal(store.save(second.session).ok, true);
  const third = new BrowserSaveStore(storage, 1337).load();
  assert.equal(third.stateHash, second.stateHash);
  assert.equal(third.session.world.inventory.stone, 33);
});

test('schema-3 historical natural stones preserve carried and stored resources after eviction', () => {
  const live = GameSession.historicalJournal(GameSession.historicalGenesisWorld(1337, 3));
  const retired = [...live.world.entities.values()].filter((entity) =>
    !entity.authored && isRetiredStoneKind(entity.kind));
  assert.ok(retired.length > 0, 'the historical fixture must contain real natural retired stones');
  const ids = retired.map((entity) => entity.id);
  // Record exactly the changed entity deltas that the old save format persisted.
  for (const entity of retired.slice(0, 8)) live.world.entityChanges.add(entity.chunk);
  for (const [index, resource] of ['stone', 'wood'].entries()) {
    assert.equal(live.dispatch({
      schema: 3, id: `historical-deposit-${resource}`, type: 'deposit',
      stockpileId: FOUNDER_STOCKPILE_ID, resources: { [resource]: 3 + index },
      expectedRevision: live.world.revision,
    }).ok, true);
  }
  const boundaryOne = clone(live.snapshot);
  const snapshot = boundaryOne;
  const carried = clone(live.world.inventory);
  const stored = clone(live.world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory);
  assert.ok(snapshot.entities.some((entity: any) => !entity.authored && isRetiredStoneKind(entity.kind)));
  assert.deepEqual(snapshot.inventory, carried);
  assert.deepEqual(snapshot.stockpiles[0].inventory, stored);

  const migrated = GameSession.restore(snapshot, clone(live.journal));
  assert.equal(migrated.journal.schema, 3);
  assert.deepEqual(migrated.world.inventory, carried);
  assert.deepEqual(migrated.world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory, stored);
  assert.equal([...migrated.world.entities.values()].some((entity) => isRetiredStoneKind(entity.kind)), false,
    JSON.stringify([...migrated.world.entities.values()].filter((entity) => isRetiredStoneKind(entity.kind)).map((entity) => entity.id)));
  assert.equal(migrated.world.entityRemovals.has('hero:styl_rock_medium:-6:-10'), false);
  assert.ok(ids.some((id) => migrated.world.entityRemovals.has(id)));
  assert.ok(ids.every((id) => !migrated.world.entities.has(id)));

  assert.equal(GameSession.restore(migrated.snapshot, clone(migrated.journal)).stateHash, migrated.stateHash);
  for (const chunk of migrated.world.entityChanges) {
    evictChunk(migrated.world, chunk);
    const [cx, cz] = chunk.split(',').map(Number);
    generateEntityChunk(migrated.world, cx, cz);
    assert.equal(generateChunk(migrated.world, cx, cz).key, chunk);
  }
  assert.equal([...migrated.world.entities.values()].some((entity) => isRetiredStoneKind(entity.kind)), false);
  assert.deepEqual(migrated.world.inventory, carried);
  assert.deepEqual(migrated.world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory, stored);
});

test('historical snapshot boundaries are authenticated before retirement', () => {
  const save = oldStoneSave();
  assert.equal(save.snapshot.nextSequence, 1);
  save.snapshot.inventory.stone += 1;
  assert.throws(() => GameSession.restore(save.snapshot, save.journal), /original journal boundary/);
});
test('browser command helpers use canonical envelope ordering', () => {
  const session = GameSession.legacyGenesis();
  const buildId = session.commandId('build', 'house');
  assert.equal(session.dispatch({
    schema: 1, id: buildId, type: 'build', projectId: 'house',
    expectedRevision: session.world.revision,
  }).ok, true);
});

function build(session: GameSession, projectId: 'house' | 'path' | 'farm') {
  return session.dispatch({
    schema: 1, id: `build-${projectId}`, type: 'build', projectId,
    expectedRevision: session.world.revision,
  });
}
const key = 'astrix:m002:v1:seed:1337';
const v2Key = 'astrix:m002:v2:seed:1337';
const v3Key = 'astrix:m002:v3:seed:1337';

test('schema-2 browser save restores inventory once and preserves an accepted snapshot tail', () => {
  const storage = new MemoryStorage();
  const first = new BrowserSaveStore(storage, 1337);
  const live = { session: GameSession.legacyGenesis(1337, 2), status: 'new' as const };
  assert.equal(live.status, 'new');
  assert.equal(live.session.journal.schema, 2);
  assert.equal(live.session.snapshot.schema, 2);
  assert.deepEqual(live.session.world.inventory, { stone: 48, wood: 24 });
  assert.equal(live.session.dispatch({
    schema: 2, id: 'build:0:house', type: 'build', projectId: 'house',
    expectedRevision: live.session.world.revision, designVersion: 2,
  }).ok, true);
  assert.equal(first.save(live.session).ok, true);
  const boundarySnapshot = clone(live.session.snapshot);
  assert.equal(live.session.dispatch({
    schema: 2, id: 'build:1:path', type: 'build', projectId: 'path',
    expectedRevision: live.session.world.revision, designVersion: 2,
  }).ok, true);
  const fromTail = GameSession.restore(boundarySnapshot, clone(live.session.journal));
  assert.equal(fromTail.stateHash, live.session.stateHash);
  // The last persisted snapshot is boundary 1, followed by accepted journal tail 2.
  assert.equal(first.save(live.session).ok, true);
  assert.equal(storage.getItem(key), null);
  assert.equal(storage.values.size, 1);
  const afterSave = {
    hash: live.session.stateHash,
    snapshot: clone(live.session.snapshot),
    journal: clone(live.session.journal),
  };
  assert.equal(JSON.parse(storage.getItem(v2Key)!).schema, 2);
  const loaded = new BrowserSaveStore(storage, 1337).load();
  assert.equal(loaded.status, 'restored');
  assert.equal(loaded.session.stateHash, afterSave.hash);
  assert.deepEqual(loaded.session.snapshot, afterSave.snapshot);
  assert.deepEqual(live.session.snapshot, afterSave.snapshot);
  assert.deepEqual(loaded.session.journal, afterSave.journal);
  assert.deepEqual(live.session.journal, afterSave.journal);
  assert.equal(loaded.session.snapshot.schema, 2);
  assert.equal(loaded.session.world.inventory.wood, 14);
  assert.equal(new BrowserSaveStore(storage, 1337).save(loaded.session).ok, true);
  assert.equal(storage.getItem(key), null);
  assert.equal(loaded.session.dispatch({
    schema: 2, id: 'build:2:farm', type: 'build', projectId: 'farm',
    expectedRevision: loaded.session.world.revision, designVersion: 2,
  }).ok, true);
  assert.equal(loaded.session.world.structures.size, 3);
});

test('legacy browser saves retain their exact bytes and restore the journal tail', () => {
  const storage = new MemoryStorage();
  const first = new BrowserSaveStore(storage, 1337);
  const live = { session: GameSession.legacyGenesis(1337), status: 'new' };
  assert.equal(live.status, 'new');
  assert.equal(live.session.journal.schema, 1);
  assert.equal(live.session.snapshot.schema, 1);
  assert.deepEqual(live.session.world.inventory, { stone: 48, wood: 24 });
  assert.equal(build(live.session, 'house').ok, true);
  assert.equal(first.save(live.session).ok, true);
  assert.equal(build(live.session, 'path').ok, true);
  // The last persisted snapshot is boundary 1, followed by accepted journal tail 2.
  assert.equal(first.save(live.session).ok, true);
  assert.equal(storage.values.size, 1);
  const before = storage.getItem(key);
  assert.equal(JSON.parse(before!).schema, 1);
  const afterSave = {
    hash: live.session.stateHash,
    snapshot: clone(live.session.snapshot),
    journal: clone(live.session.journal),
  };
  const loaded = new BrowserSaveStore(storage, 1337).load();
  assert.equal(loaded.status, 'restored');
  assert.equal(loaded.session.stateHash, afterSave.hash);
  assert.deepEqual(loaded.session.snapshot, afterSave.snapshot);
  assert.deepEqual(live.session.snapshot, afterSave.snapshot);
  assert.deepEqual(loaded.session.journal, afterSave.journal);
  assert.deepEqual(live.session.journal, afterSave.journal);
  assert.equal(loaded.session.world.inventory.wood, 14);
  assert.equal(build(loaded.session, 'farm').ok, true);
  assert.equal(loaded.session.world.structures.size, 3);
});

test('rejected commands leave the saved record and ordered history unchanged', () => {
  const storage = new MemoryStorage();
  const store = new BrowserSaveStore(storage, 1337);
  const session = GameSession.legacyGenesis(1337);
  assert.equal(build(session, 'house').ok, true);
  assert.equal(store.save(session).ok, true);
  const before = storage.getItem(key);
  const stateHash = session.stateHash;
  const rejected = session.dispatch({
    schema: 1, id: 'stale', type: 'build', projectId: 'path', expectedRevision: 999,
  });
  assert.equal(rejected.ok, false);
  assert.equal(session.stateHash, stateHash);
  assert.equal(storage.getItem(key), before);
});

test('save results and metrics preserve the latest success or failure', () => {
  const storage = new MemoryStorage();
  const store = new BrowserSaveStore(storage, 1337);
  const fresh = { session: GameSession.genesis(1337), status: 'new' as const };
  assert.equal(store.metrics().persistent, false, 'a new unsaved world is not yet persistent');
  assert.equal(store.metrics().status, 'new');
  const saved = store.save(fresh.session);
  assert.equal(saved.ok, true);
  assert.equal(saved.message, 'Saved locally.');
  assert.deepEqual(store.metrics(), {
    schema: 3, key: v3Key, status: 'saved', persistent: true, message: saved.message,
  });

  storage.failNextWrite = true;
  const failed = store.save(fresh.session);
  assert.equal(failed.ok, false);
  assert.equal(store.metrics().message, failed.message);
  assert.equal(store.metrics().status, 'unavailable');
  assert.equal(store.metrics().persistent, false);
  assert.equal(store.metrics().key, v3Key, 'failed writes do not point at a new schema key');

  storage.failNextWrite = false;
  const recovered = store.save(fresh.session);
  assert.equal(recovered.ok, true);
  assert.equal(store.metrics().status, 'saved');
  assert.equal(store.metrics().persistent, true);
  assert.equal(store.metrics().message, recovered.message);
});

test('invalid saves are quarantined byte-for-byte before a fresh genesis', () => {
  for (const raw of ['{broken', JSON.stringify({ schema: 999 }),
    JSON.stringify({ schema: 1, seed: 1337, snapshot: {}, journal: { schema: 1 } })]) {
    const storage = new MemoryStorage();
    storage.values.set(key, raw);
    const loaded = new BrowserSaveStore(storage, 1337).load();
    assert.equal(loaded.status, 'corrupt');
    assert.equal(storage.getItem(`${key}:corrupt`), raw);
    assert.equal(storage.getItem(key), null);
    assert.equal(loaded.session.nextSequence, 0);
    assert.equal(loaded.session.world.inventory.wood, 24);
  }
});

test('malformed schema-2 saves are quarantined without falling back to legacy', () => {
  const legacyStore = new BrowserSaveStore(new MemoryStorage(), 1337);
  const legacy = GameSession.legacyGenesis(1337);
  legacyStore.save(legacy);
  for (const raw of ['{broken', JSON.stringify({ schema: 999 }),
    JSON.stringify({ schema: 2, seed: 1337, snapshot: {}, journal: { schema: 2 } })]) {
    const storage = new MemoryStorage();
    assert.equal(new BrowserSaveStore(storage, 1337).save(legacy).ok, true);
    const legacyBytes = storage.getItem(key);
    storage.values.set(v2Key, raw);
    const store = new BrowserSaveStore(storage, 1337);
    const loaded = store.load();
    assert.equal(loaded.status, 'corrupt');
    assert.equal(loaded.session.journal.schema, 3);
    assert.equal(storage.getItem(`${v2Key}:corrupt`), raw);
    assert.equal(storage.getItem(v2Key), null);
    assert.equal(storage.getItem(key), legacyBytes);
    assert.equal(store.save(loaded.session).ok, true);
    assert.equal(storage.getItem(key), legacyBytes);
    assert.equal(storage.getItem(v3Key), JSON.stringify({
      schema: 3, seed: 1337, snapshot: loaded.session.snapshot, journal: loaded.session.journal,
    }));
  }
});

test('failed quarantine preserves original bytes and reports volatile state', () => {
  const storage = new MemoryStorage();
  storage.values.set(key, '{broken');
  storage.failNextWrite = true;
  const loaded = new BrowserSaveStore(storage, 1337).load();
  assert.equal(loaded.status, 'unavailable');
  assert.match(loaded.message, /Original save left untouched/);
  assert.equal(storage.getItem(key), '{broken');
});

test('quota and policy failures do not falsely claim work is persistent', () => {
  const storage = new MemoryStorage();
  storage.failReads = true;
  const denied = new BrowserSaveStore(storage, 1337).load();
  assert.equal(denied.status, 'unavailable');
  assert.equal(denied.session.world.inventory.wood, 24);
  storage.failReads = false;
  storage.failNextWrite = true;
  assert.equal(new BrowserSaveStore(storage, 1337).save(denied.session).ok, false);

  storage.failReads = false;
  storage.failNextWrite = false;
  const store = new BrowserSaveStore(storage, 1337);
  const session = GameSession.legacyGenesis(1337);
  storage.failNextWrite = true;
  assert.equal(build(session, 'house').ok, true);
  assert.equal(store.save(session).ok, false);
  assert.equal(storage.getItem(key), null);
  const unavailable = new BrowserSaveStore(null, 1337);
  const freshUnavailable = unavailable.load();
  assert.equal(freshUnavailable.status, 'unavailable');
  assert.equal(unavailable.metrics().persistent, false);
  assert.equal(unavailable.save(freshUnavailable.session).ok, false);
  assert.equal(unavailable.metrics().persistent, false);
});
