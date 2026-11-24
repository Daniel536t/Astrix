import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPACT_AT, GameSession } from '../src/app/session';
import { BrowserSaveStore } from '../src/app/persistence';
import { GENERATOR_V2 } from '../src/sim/world';
import { homesteadSnapshot } from '../src/sim/homestead';

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

function send(s: GameSession, c: Record<string, unknown>) {
  return s.dispatch({ schema: 3, id: s.commandId(c.type as 'tick', 'x'), expectedRevision: s.world.revision, ...c });
}
function farmed(ticks: number) {
  const s = GameSession.genesis(1337, GENERATOR_V2);
  assert.ok(send(s, { type: 'found_homestead' }).ok);
  for (let i = 0; i < ticks; i++) assert.ok(send(s, { type: 'tick', ticks: 1 }).ok);
  return s;
}

test('compaction keeps the state hash and bounds the journal', () => {
  const s = farmed(COMPACT_AT + 100);
  const hash = s.stateHash, seq = s.nextSequence;
  assert.ok(s.compact());
  assert.equal(s.stateHash, hash, 'compaction does not change authoritative state');
  assert.equal(s.nextSequence, seq);
  assert.equal(s.journal.entries.length, 0);
  assert.equal(s.journal.base?.sequence, seq);
  // The session keeps working and keeps appending after the base.
  assert.ok(send(s, { type: 'tick', ticks: 1 }).ok);
  assert.equal(s.nextSequence, seq + 1);
  assert.equal(s.entry(seq)?.sequence, seq);
});

test('a compacted save restores exactly, and continuing from it matches continuing live', () => {
  const live = farmed(COMPACT_AT + 50);
  live.compact();
  for (let i = 0; i < 30; i++) send(live, { type: 'tick', ticks: 1 });
  const restored = GameSession.restore(JSON.parse(JSON.stringify(live.snapshot)), JSON.parse(JSON.stringify(live.journal)));
  assert.equal(restored.stateHash, live.stateHash);
  assert.equal(restored.nextSequence, live.nextSequence);
  for (let i = 0; i < 100; i++) { send(live, { type: 'tick', ticks: 1 }); send(restored, { type: 'tick', ticks: 1 }); }
  assert.equal(restored.stateHash, live.stateHash, 'identical futures');
  assert.deepEqual(homesteadSnapshot(restored.world.homestead!), homesteadSnapshot(live.world.homestead!));
});

test('the browser save stays small however long the world has run', () => {
  const storage = new MemoryStorage();
  const store = new BrowserSaveStore(storage, 1337, GENERATOR_V2);
  const s = GameSession.genesis(1337, GENERATOR_V2);
  send(s, { type: 'found_homestead' });
  let largest = 0;
  for (let i = 1; i <= 3000; i++) {
    send(s, { type: 'tick', ticks: 1 });
    if (i % 10 === 0) {
      const r = store.save(s);
      assert.ok(r.ok, r.message);
      largest = Math.max(largest, (storage.getItem(`astrix:m002:v3:seed:1337`) ?? '').length);
    }
  }
  assert.ok(largest < 250_000, `largest save ${largest} bytes`);
  // Reload from storage: the world, tick and homestead come back exactly.
  const again = new BrowserSaveStore(storage, 1337, GENERATOR_V2).load();
  assert.equal(again.session.stateHash, s.stateHash);
  assert.equal(again.session.world.life!.tick, 3000);
});

test('a tampered base or snapshot is rejected', () => {
  const s = farmed(COMPACT_AT + 10);
  s.compact();
  const snapshot = JSON.parse(JSON.stringify(s.snapshot));
  const journal = JSON.parse(JSON.stringify(s.journal));
  const badHash = { ...journal, base: { ...journal.base, hash: '0'.repeat(16) } };
  assert.throws(() => GameSession.restore(snapshot, badHash), /boundary/);
  const badSeq = { ...journal, base: { ...journal.base, sequence: journal.base.sequence + 1 } };
  assert.throws(() => GameSession.restore(snapshot, badSeq));
  const forged = JSON.parse(JSON.stringify(snapshot));
  forged.inventory = { wood: 99 };
  assert.throws(() => GameSession.restore(forged, journal));
  assert.throws(() => GameSession.restore(snapshot, { ...journal, base: { sequence: 0, hash: journal.base.hash } }), /base/);
  assert.throws(() => GameSession.replay(journal), /compacted/, 'no genesis history to replay');
});

test('uncompacted journals are unchanged (old saves keep their exact bytes)', () => {
  const s = farmed(20);
  assert.equal('base' in s.journal, false);
  assert.equal(GameSession.replay(JSON.parse(JSON.stringify(s.journal))).stateHash, s.stateHash);
});
