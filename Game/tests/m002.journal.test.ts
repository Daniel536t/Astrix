import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Command, CommandJournal, GameSession, createJournal, genesisWorld, validateJournal,
} from '../src/app/session';
import {
  canonicalWorldHash, createWorldSnapshot, worldFromSnapshot,
} from '../src/sim/snapshot';
import { M002_LAYOUT } from '../src/sim/m002';
import { evictChunk, generateChunk, nearestHarvestable } from '../src/sim/world';
import { canonicalEntityHash, canonicalRegionHash } from '../src/sim/canonical';

function command(session: GameSession, id: string, projectId: 'house' | 'path' | 'farm'): Command {
  return { schema: 1, id, type: 'build', projectId, expectedRevision: session.world.revision };
}
function harvest(session: GameSession, id: string, entityId: string): Command {
  return { schema: 1, id, type: 'harvest', entityId, expectedRevision: session.world.revision };
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }

test('accepted build commands replay deterministically from genesis with stable receipts', () => {
  const live = GameSession.legacyGenesis();
  for (const projectId of ['house', 'path', 'farm'] as const) {
    const receipt = live.dispatch(command(live, `build-${projectId}`, projectId));
    assert.equal(receipt.ok, true);
    assert.equal(receipt.duplicate, false);
  }
  const replayed = GameSession.replay(clone(live.journal));
  assert.equal(replayed.stateHash, live.stateHash);
  assert.equal(canonicalRegionHash(replayed.world, M002_LAYOUT.protectedRegion).hash,
    canonicalRegionHash(live.world, M002_LAYOUT.protectedRegion).hash);
  assert.equal(canonicalEntityHash(replayed.world), canonicalEntityHash(live.world));
  assert.equal(JSON.stringify(replayed.snapshot), JSON.stringify(live.snapshot));
  assert.equal(JSON.stringify(replayed.journal), JSON.stringify(live.journal));
});

test('duplicate accepted command is idempotent but cannot be reused for different work', () => {
  const session = GameSession.legacyGenesis();
  const input = command(session, 'stable-id', 'house');
  const first = session.dispatch(input);
  assert.equal(first.ok, true);
  const before = session.stateHash;
  const duplicate = session.dispatch(clone(input));
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  const { duplicate: _firstDuplicate, ...firstResult } = first;
  const { duplicate: _secondDuplicate, ...duplicateResult } = duplicate;
  assert.deepEqual(duplicateResult, firstResult);
  assert.equal(session.nextSequence, 1);
  assert.equal(session.stateHash, before);
  const forged = { ...input, projectId: 'path', expectedRevision: session.world.revision };
  const rejected = session.dispatch(forged);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.code, 'duplicate_command_id');
  assert.equal(session.nextSequence, 1);
  assert.equal(session.stateHash, before);
});

test('invalid, stale, unaffordable and unknown commands never change world or history', () => {
  const session = GameSession.legacyGenesis();
  const before = session.stateHash;
  const attempts: unknown[] = [
    null, {}, { schema: 1, id: 'bad', type: 'dig', expectedRevision: 0 },
    { ...command(session, 'bad-extra', 'house'), extra: true },
    { ...command(session, 'bad-type', 'house'), projectId: 'other' },
    { ...command(session, 'bad-id', 'house'), id: '../rewrite' },
    { ...command(session, 'bad-revision', 'house'), expectedRevision: -1 },
    { ...command(session, 'stale', 'house'), expectedRevision: session.world.revision + 1 },
    harvest(session, 'missing-entity', 'e:0,0:999999'),
  ];
  for (const attempt of attempts) {
    const result = session.dispatch(attempt);
    assert.equal(result.ok, false);
    assert.equal(session.nextSequence, 0);
    assert.equal(session.stateHash, before);
  }
  session.world.inventory = {};
  const result = session.dispatch(command(session, 'unaffordable', 'house'));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'insufficient_resources');
  assert.equal(session.nextSequence, 0);
  assert.equal(canonicalRegionHash(session.world, M002_LAYOUT.protectedRegion).hash,
    canonicalRegionHash(genesisWorld(), M002_LAYOUT.protectedRegion).hash);
});

test('snapshot-tail replay matches live state and refuses an incompatible boundary', () => {
  const live = GameSession.legacyGenesis();
  assert.equal(live.dispatch(command(live, 'house-1', 'house')).ok, true);
  const snapshot = live.snapshot;
  assert.equal(live.dispatch(command(live, 'path-2', 'path')).ok, true);
  assert.equal(live.dispatch(command(live, 'farm-3', 'farm')).ok, true);
  const restored = GameSession.restore(clone(snapshot), clone(live.journal));
  assert.equal(restored.stateHash, live.stateHash);
  assert.deepEqual(restored.snapshot, live.snapshot);
  assert.deepEqual(restored.journal, live.journal);
  const completeBoundary = GameSession.restore(clone(live.snapshot), clone(live.journal));
  assert.equal(completeBoundary.stateHash, live.stateHash);
  const mismatchedSnapshot = clone(live.snapshot);
  mismatchedSnapshot.inventory = { stone: 1, wood: 2 };
  assert.throws(() => GameSession.restore(mismatchedSnapshot, clone(live.journal)), /snapshot hash/);
  assert.throws(() => GameSession.restore({ ...snapshot, nextSequence: 99 }, clone(live.journal)), /ahead/);
  const wrong = clone(live.journal);
  wrong.starterInventory.wood = 23;
  assert.throws(() => GameSession.restore(live.snapshot, wrong));
  const truncated = clone(live.journal);
  truncated.entries.pop();
  assert.throws(() => GameSession.restore(live.snapshot, truncated), /ahead/);
});

test('browser-generated harvest IDs accept generated and authored entities and replay', () => {
  const session = GameSession.legacyGenesis();
  const generated = nearestHarvestable(session.world, -42, -40, 40, 'wood')!;
  assert.equal(generated.id, 'e:30,30:4');
  const targets = [generated.id, 'hero:styl_shrub:-14:-8'];
  for (const entityId of targets) {
    const id = session.commandId('harvest', entityId);
    assert.equal(id, `harvest:${session.nextSequence}:${encodeURIComponent(entityId)}`);
    const receipt = session.dispatch({
      schema: 1, id, type: 'harvest', entityId,
      expectedRevision: session.world.revision,
    });
    assert.equal(receipt.ok, true, JSON.stringify(receipt));
  }
  assert.equal(session.nextSequence, 2);
  assert.equal(GameSession.replay(clone(session.journal)).stateHash, session.stateHash);
});

test('harvest, eviction and regeneration survive snapshot and genesis replay', () => {
  const session = GameSession.legacyGenesis();
  const e = nearestHarvestable(session.world, -43, -40, 50, 'wood')!;
  const original = { ...e };
  const receipt = session.dispatch(harvest(session, 'harvest-0', e.id));
  assert.equal(receipt.ok, true);
  assert.equal(session.world.entities.get(e.id)?.harvestedOnce, true);
  assert.equal(session.world.entities.get(e.id)?.remaining,
    original.remaining - original.yieldPerHarvest);
  assert.equal(session.world.inventory.wood, 24 + original.yieldPerHarvest);
  assert.equal(evictChunk(session.world, e.chunk), true);
  assert.deepEqual(session.world.entities.get(e.id), session.world.entities.get(e.id));
  const [cx, cz] = e.chunk.split(',').map(Number);
  generateChunk(session.world, cx, cz);
  assert.equal(session.world.entities.get(e.id)?.remaining,
    original.remaining - original.yieldPerHarvest);
  const snapshot = session.snapshot;
  const tailReceipt = session.dispatch(command(session, 'house-1', 'house'));
  assert.equal(tailReceipt.ok, true);
  const fromTail = GameSession.restore(clone(snapshot), clone(session.journal));
  const fromGenesis = GameSession.replay(clone(session.journal));
  const finalSnapshot = clone(session.snapshot);
  const finalJournal = clone(session.journal);
  for (const restored of [fromTail, fromGenesis, GameSession.restore(finalSnapshot, finalJournal)]) {
    assert.equal(restored.stateHash, session.stateHash);
    assert.deepEqual(restored.world.entities.get(e.id), session.world.entities.get(e.id));
    assert.equal(restored.world.inventory.wood, session.world.inventory.wood);
    const second = restored.dispatch(harvest(restored, 'replay-harvest-again', e.id));
    assert.equal(second.ok, original.remaining - original.yieldPerHarvest > 0 && !e.harvested);
    if (second.ok) assert.equal(restored.world.entities.get(e.id)?.harvested,
      original.remaining <= original.yieldPerHarvest * 2);
  }
});

test('snapshot validation is non-mutating and journal corruption is never replayed', () => {
  const live = GameSession.legacyGenesis();
  assert.equal(live.dispatch(command(live, 'house', 'house')).ok, true);
  const journal = clone(live.journal);
  const cases: CommandJournal[] = [
    { ...journal, schema: 99 as never },
    { ...journal, entries: [{ ...journal.entries[0], sequence: 1 }] },
    { ...journal, entries: [{ ...journal.entries[0], hash: '0'.repeat(16) }] },
    { ...journal, entries: [{ ...journal.entries[0], revision: 0 }] },
    { ...journal, entries: [{ ...journal.entries[0], outcome: { type: 'harvest', entityId: 'x', resource: 'wood', amount: 1 } }] },
    { ...journal, entries: [...journal.entries, { ...journal.entries[0], sequence: 1 }] },
    { ...journal, seed: 1338 },
  ];
  for (const corrupt of cases) {
    // Syntax validation is separate from deterministic execution. Semantic
    // corruption (revision, hash or outcome) is caught during replay.
    assert.throws(() => GameSession.replay(corrupt));
  }
  const base = createWorldSnapshot(live.world, 1);
  const hash = canonicalWorldHash(live.world, 1);
  assert.throws(() => worldFromSnapshot({ ...base, schema: 99 as never }));
  assert.equal(canonicalWorldHash(live.world, 1), hash);
  assert.throws(() => GameSession.restore({ ...base, manifest: { ...base.manifest, seed: 1338 } }, journal));
  assert.equal(canonicalWorldHash(live.world, 1), hash);
});

test('the 2048 m world replays through the same bounded authority and preserves outside terrain', () => {
  const live = GameSession.legacyGenesis(1337);
  const before = canonicalRegionHash(live.world, M002_LAYOUT.protectedRegion, M002_LAYOUT.envelope).hash;
  for (const projectId of ['house', 'path', 'farm'] as const) {
    assert.equal(live.dispatch(command(live, projectId, projectId)).ok, true);
  }
  assert.equal(live.world.entities.size > 0, true);
  const replayed = GameSession.replay(clone(live.journal));
  assert.equal(replayed.stateHash, live.stateHash);
  assert.equal(
    canonicalRegionHash(replayed.world, M002_LAYOUT.protectedRegion, M002_LAYOUT.envelope).hash,
    before,
  );
});

test('journal entries are bounded and rejected rather than partially accepted', () => {
  const journal = createJournal();
  assert.throws(() => validateJournal({ ...journal, starterInventory: { ...journal.starterInventory, wood: -1 } }));
  assert.throws(() => validateJournal({ ...journal, unknown: true }));
  assert.throws(() => validateJournal({ ...journal, starterInventory: { wood: 24, stone: 48, unknown: 2 } }));
  assert.throws(() => GameSession.restore({ ...genesisSnapshot(), nextSequence: -1 }, journal));
});

function genesisSnapshot() { return createWorldSnapshot(genesisWorld()); }
