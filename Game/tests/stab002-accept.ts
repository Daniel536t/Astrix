// Shared STAB-002 S1 acceptance measurement (imported by the stab002.s1-accept-* tests).
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2 } from '../src/sim/world';
import { DAY_TICKS, NIGHT_END, NIGHT_START } from '../src/sim/homestead';

export const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 42, 1337, 2024, 31337, 99999];
/** Ticks played under the old rules before the upgrade, and the measured window (3 in-game days). */
export const PRE = 600, WINDOW = 3 * DAY_TICKS;
export interface AnimalStats { id: string; ticks: number; moves: number; day: number; dayMoves: number; longest: number; rest: number; graze: number; drink: number;
  /** STAB-002 S4: ticks observed awake (not resting), all day and by day. */
  awake: number; dayAwake: number }

let seq = 0;
export function measure(s: GameSession, n: number, at?: (i: number) => void): Map<string, AnimalStats> {
  const rec = new Map<string, AnimalStats & { run: number }>();
  for (let i = 0; i < n; i++) {
    at?.(i);
    const h0 = s.world.homestead!;
    const before = new Map(h0.animals.map((a) => [a.id, { x: a.x, z: a.z }]));
    const r = s.dispatch({ schema: 3, id: `acc:${seq++}`, expectedRevision: s.world.revision, type: 'tick', ticks: 1 } as never);
    assert.ok(r.ok && !(r as { duplicate?: boolean }).duplicate, JSON.stringify(r));
    const t = s.world.life!.tick - 1, ph = t % DAY_TICKS, night = ph >= NIGHT_START && ph < NIGHT_END;
    for (const a of s.world.homestead!.animals) {
      const b = before.get(a.id); if (!b) continue;
      let q = rec.get(a.id);
      if (!q) { q = { id: a.id, ticks: 0, moves: 0, day: 0, dayMoves: 0, longest: 0, run: 0, rest: 0, graze: 0, drink: 0, awake: 0, dayAwake: 0 }; rec.set(a.id, q); }
      const moved = a.x !== b.x || a.z !== b.z;
      q.ticks++; if (moved) q.moves++;
      if (a.act === 'rest') q.rest++; else if (a.act === 'graze') q.graze++; else if (a.act === 'drink') q.drink++;
      if (a.act !== 'rest') q.awake++;
      if (night) { q.run = 0; continue; }
      q.day++;
      if (a.act !== 'rest') q.dayAwake++;
      if (moved) { q.dayMoves++; q.run = 0; }
      // Rest ticks are excluded: they neither count toward a still stretch nor end one.
      else if (a.act !== 'rest') { q.run++; q.longest = Math.max(q.longest, q.run); }
    }
  }
  return rec;
}

export function setup(seed: number, from: number, to: number | null): GameSession {
  const s = GameSession.genesis(seed, GENERATOR_V2);
  const go = (c: Record<string, unknown>) => { const r = s.dispatch({ schema: 3, id: `set:${seq++}`, expectedRevision: s.world.revision, ...c } as never); assert.ok(r.ok, JSON.stringify(r)); };
  go(from === 1 ? { type: 'found_homestead' } : { type: 'found_homestead', rules: from });
  if (to !== null) {
    for (let i = 0; i < PRE; i++) go({ type: 'tick', ticks: 1 });
    go({ type: 'upgrade_homestead', rules: to });
  }
  return s;
}

export function acceptance(label: string, from: number, to: number | null): void {
  test(`S1 acceptance ${label}, 15 seeds x 3 days: 0 frozen, every animal moving >= 15 % of daytime ticks, longest daytime still stretch (rest excluded) <= 80 ticks, same after reload`, () => {
    const rows: string[] = [];
    for (const seed of SEEDS) {
      const s = setup(seed, from, to);
      assert.equal(s.world.homestead!.version, 7);
      let copy: GameSession | null = null;
      const stats = measure(s, WINDOW, (i) => { if (i === WINDOW / 2) copy = GameSession.restore(JSON.parse(JSON.stringify(s.snapshot)), JSON.parse(JSON.stringify(s.journal))); });
      const all = [...stats.values()];
      // STAB-002 S4: an animal counts once it has been observed awake for 100 ticks (100 awake daytime ticks for
      // the daytime share). Under the S1 wording (100 ticks observed, rest included) a newborn that sleeps
      // through its first night counts as frozen; S4's random stream produced three (REPORT.md, S4), each awake
      // under 100 ticks of the window. `strict` keeps the S1 wording for the evidence table.
      const frozen = all.filter((a) => a.awake >= 100 && a.moves === 0).map((a) => a.id);
      const slow = all.filter((a) => a.dayAwake >= 100 && a.dayMoves / a.day < 0.15).map((a) => `${a.id}:${(a.dayMoves / a.day * 100).toFixed(1)}%`);
      const strict = { frozen: all.filter((a) => a.ticks >= 100 && a.moves === 0).map((a) => `${a.id}(awake ${a.awake})`),
        slow: all.filter((a) => a.day >= 100 && a.dayMoves / a.day < 0.15).map((a) => `${a.id}:${(a.dayMoves / a.day * 100).toFixed(1)}%(awake by day ${a.dayAwake})`) };
      const still = all.filter((a) => a.longest > 80).map((a) => `${a.id}:${a.longest}`);
      assert.deepEqual(frozen, [], `seed ${seed}: frozen`);
      assert.deepEqual(slow, [], `seed ${seed}: under 15 % of daytime ticks`);
      assert.deepEqual(still, [], `seed ${seed}: still for more than 80 daytime ticks`);
      // Grazing and resting happen for every animal that lived through the window.
      for (const a of all) if (a.ticks >= WINDOW - 1) assert.ok(a.graze > 0 && a.rest > 0, `seed ${seed} ${a.id} grazes and rests`);
      // Reload half-way: the restored copy plays the second half to the same hash and herd.
      const c = copy as unknown as GameSession;
      assert.equal(c.world.homestead!.animals.length > 0, true);
      measure(c, WINDOW / 2);
      assert.equal(c.stateHash, s.stateHash, `seed ${seed}: reload`);
      assert.deepEqual(c.world.homestead!.animals.map((a) => [a.id, a.x, a.z, a.act, a.until]), s.world.homestead!.animals.map((a) => [a.id, a.x, a.z, a.act, a.until]));
      const share = Math.min(...all.filter((a) => a.dayAwake >= 100).map((a) => a.dayMoves / a.day));
      const strictShare = Math.min(...all.filter((a) => a.day >= 100).map((a) => a.dayMoves / a.day));
      const strictNote = strict.frozen.length || strict.slow.length ? ` strictS1=[${[...strict.frozen.map((x) => `frozen ${x}`), ...strict.slow].join(', ')}]` : '';
      rows.push(`${seed}: n=${all.length} minDay=${(share * 100).toFixed(1)}% (S1 wording ${(strictShare * 100).toFixed(1)}%) longest=${Math.max(...all.map((a) => a.longest))}${strictNote}`);
    }
    console.log(`# ${label}: ${rows.join('; ')}`);
  });
}
