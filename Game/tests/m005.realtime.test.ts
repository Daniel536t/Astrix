import test from 'node:test';
import assert from 'node:assert/strict';
import { SimClock, SaveScheduler, TabLease, TICK_SECONDS } from '../src/app/sim-clock';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2 } from '../src/sim/world';

class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }

test('clock issues one tick per two seconds of active play only', () => {
  const c = new SimClock();
  let ticks = 0;
  for (let i = 0; i < 605; i++) if (c.advance(1 / 60, true)) ticks++;   // ~10 s at 60 fps
  assert.equal(ticks, Math.floor(10 / TICK_SECONDS));
  for (let i = 0; i < 600; i++) assert.equal(c.advance(1 / 60, false), false, 'paused/hidden: no ticks');
  // A suspended tab resumes with a huge dt: at most one tick, no catch-up burst.
  let burst = c.advance(3600, true) ? 1 : 0;
  for (let i = 0; i < 30; i++) if (c.advance(1 / 60, true)) burst++;
  assert.ok(burst <= 1, `resume burst ${burst}`);
  c.reset();
  assert.equal(c.secondsToNext, TICK_SECONDS);
});

test('save scheduler throttles real-time saves and flushes on demand', () => {
  let saves = 0;
  const s = new SaveScheduler(() => { saves++; }, 10_000);
  s.markDirty(0); s.poll(0); assert.equal(saves, 1, 'first dirty state saves');
  for (let t = 2000; t < 10_000; t += 2000) { s.markDirty(t); s.poll(t); }
  assert.equal(saves, 1, 'within the interval nothing else is written');
  s.markDirty(10_000); s.poll(10_000); assert.equal(saves, 2);
  s.markDirty(11_000); s.flush(11_500); assert.equal(saves, 3, 'hide/close flushes immediately');
  s.flush(12_000); assert.equal(saves, 3, 'nothing pending, nothing written');
});

test('only one tab may run a world at a time', () => {
  const store = new Mem();
  const a = new TabLease(store, 'lease', 6000), b = new TabLease(store, 'lease', 6000);
  assert.equal(a.heartbeat(1000), true);
  assert.equal(b.heartbeat(1500), false, 'second tab is read-only while the first is alive');
  assert.equal(a.heartbeat(4000), true);
  assert.equal(b.heartbeat(11_000), true, 'takes over after the heartbeat lapses');
  assert.equal(a.heartbeat(11_500), false);
  b.release();
  assert.equal(a.heartbeat(12_000), true);
});

test('real-time ticks are ordinary journaled commands and replay exactly', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2);
  for (let i = 0; i < 30; i++) {
    const r = s.dispatch({ schema: 3, id: s.commandId('tick', 'realtime'), type: 'tick', ticks: 1, expectedRevision: s.world.revision });
    assert.equal(r.ok, true);
  }
  assert.equal(s.world.life!.tick, 30);
  const replayed = GameSession.replay(JSON.parse(JSON.stringify(s.journal)));
  assert.equal(replayed.stateHash, s.stateHash);
  const restored = GameSession.restore(JSON.parse(JSON.stringify(s.snapshot)), JSON.parse(JSON.stringify(s.journal)));
  assert.equal(restored.stateHash, s.stateHash);
});
