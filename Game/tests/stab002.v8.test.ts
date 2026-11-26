// STAB-002 versioning correction: settlement rules v8.
// The S3 build (bf23ae5, rules v7) was deployed to the live site on 2026-11-25 (release
// 20261125T230303Z-bf23ae5) before the STAB-002 acceptance pass, so players hold v7 saves with S3 semantics.
// S4 had changed v7 outcomes without a new rules number. Now:
//  - rules v7 behave exactly as on bf23ae5: a reference run and a save fixture, both made by running the S3
//    code (a git worktree of bf23ae5, tests/stab002-v7-scenario.ts), give the same hashes here, and the
//    fixture restores byte-identical and replays from genesis to its recorded hash;
//  - every S4 change (speed 39 dm, exact part steps, seed kept for owner fields, critical age 85) and the
//    newborn follow rule apply only from rules v8;
//  - new farms are founded at v8; older farms (v7 included) switch by one journaled upgrade_homestead { rules: 8 },
//    which from v7 changes nothing but the rules number.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2 } from '../src/sim/world';
import {
  AGE_CRITICAL, DM, FOLLOW_DM, HOMESTEAD_LATEST_VERSION, HOMESTEAD_PACE_VERSION, SPECIES_RULES, VILLAGER_SPEED, VILLAGER_SPEED_V8,
  homesteadNav, homesteadSnapshot, motherOf, penCells, validateHomestead, villagerSpeed,
} from '../src/sim/homestead';
import type { Animal, HomesteadState } from '../src/sim/homestead';
import { FOUNDER_STOCKPILE_ID } from '../src/sim/economy';
import { v7Scenario } from './stab002-v7-scenario';

type Session = GameSession;
let seq = 0;
const send = (s: Session, c: Record<string, unknown>) => s.dispatch({ schema: 3, id: `v8:${seq++}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never);
const ok = (s: Session, c: Record<string, unknown>) => { const r = send(s, c); assert.ok(r.ok, `${String(c.type)}: ${JSON.stringify(r)}`); return r; };
const ticks = (s: Session, n: number) => { for (let i = 0; i < n; i++) ok(s, { type: 'tick', ticks: 1 }); };
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const restore = (s: Session) => GameSession.restore(clone(s.snapshot), clone(s.journal));

/** Pinned on the S3 tree (bf23ae5) with tests/stab002-v7-scenario.ts { rules: 7, ticks: 900 }. */
const V7_S3_FRESH = '4b53db46a1916870';
/** The fixture: made on bf23ae5 by { rules: 7, from: 6, pre: 300, ticks: 600 } (v6 farm upgraded to v7, then played). */
const V7_S3_SAVE = '75eaf4d14533a811';
/** Rules v8 pins of the same scenario, measured on this change. */
const V8_FRESH = '362adca8d692a1c0';
const V8_FROM_V7_SAVE = '8eab5d5e44cca5ea';
const fixture = () => JSON.parse(readFileSync('tests/fixtures/stab002-v7-s3-save.json', 'utf8')) as { made: string; hash: string; snapshot: unknown; journal: unknown };
const v6Fixture = () => JSON.parse(readFileSync('tests/fixtures/stab002-v6-save.json', 'utf8')) as { hash: string; snapshot: unknown; journal: unknown };
/** Everything on the farm, the rules number set aside. */
const farmState = (s: Session) => {
  const snap = homesteadSnapshot(s.world.homestead!) as unknown as Record<string, unknown>;
  return JSON.stringify({ ...snap, version: 0, store: s.world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory, bag: s.world.inventory,
    entities: [...s.world.entities.values()].length, removals: [...s.world.entityRemovals].sort() });
};

test('rules v7 are the S3 rules: the v7 reference run made on bf23ae5 gives the same hash; v8 is latest, v1-v7 walk 26 dm, v8 39', () => {
  assert.equal(GameSession.genesis(1337).stateHash, 'e659504b056654dc');
  const v7 = v7Scenario({ rules: 7, ticks: 900 });
  assert.equal(v7.rejected, 0);
  assert.equal(v7.s.stateHash, V7_S3_FRESH);
  const h = v7.s.world.homestead!;
  // The scenario did exercise S1-S3: births, animal states, presence on the tick, the steward, a finished site.
  assert.equal(h.version, 7);
  assert.ok(h.animals.length > 15, `births (${h.animals.length} animals)`);
  assert.ok(h.animals.every((a) => a.act !== undefined));
  assert.equal(v7.s.journal.entries.filter((e) => e.command.type === 'tick' && (e.command as { presence?: unknown }).presence).length, 300);
  assert.ok(v7.s.journal.entries.some((e) => e.command.type === 'assign_role'), 'the steward assigned a role');
  assert.ok(h.sites!.some((x) => x.state === 'done'));
  assert.equal(HOMESTEAD_LATEST_VERSION, HOMESTEAD_PACE_VERSION);
  assert.equal(HOMESTEAD_PACE_VERSION, 8);
  for (const v of [1, 2, 3, 4, 5, 6, 7]) assert.equal(villagerSpeed({ version: v as never }), VILLAGER_SPEED);
  assert.equal(villagerSpeed({ version: 8 }), VILLAGER_SPEED_V8);
  assert.ok(AGE_CRITICAL === 85);
});

test('a v7 save made by the S3 build restores byte-identical with its recorded hash and replays from genesis to it', () => {
  const f = fixture();
  assert.match(f.made, /^bf23ae5 /);
  assert.equal(f.hash, V7_S3_SAVE);
  const s = GameSession.restore(clone(f.snapshot) as never, clone(f.journal));
  assert.equal(s.stateHash, f.hash);
  assert.equal(JSON.stringify(s.snapshot), JSON.stringify(f.snapshot), 'byte-identical');
  assert.equal(s.world.homestead!.version, 7);
  assert.equal(JSON.stringify(validateHomestead(clone(homesteadSnapshot(s.world.homestead!)), s.world.life!.tick)), JSON.stringify(homesteadSnapshot(s.world.homestead!)));
  // Replay from genesis: every entry's recorded hash is checked on the way (replayEntry throws on divergence).
  const again = GameSession.replay(clone(f.journal));
  assert.equal(again.stateHash, f.hash);
  assert.equal(JSON.stringify(again.snapshot), JSON.stringify(f.snapshot));
  // The same scenario run here, under v7, gives the same journal outcome.
  assert.equal(v7Scenario({ rules: 7, from: 6, pre: 300, ticks: 600 }).s.stateHash, f.hash);
  // Played on under v7 after restore, it matches the replayed copy.
  ticks(s, 120); ticks(again, 120);
  assert.equal(s.stateHash, again.stateHash);
});

test('v7 -> v8: one journaled upgrade_homestead { rules: 8 } changes only the rules number (animals, villagers, tasks, loads, routes, sites, fields, woodland, stock kept); once only; replays and reloads', () => {
  // The fixture's end state, and a mid-run v7 farm with a site being built and loads in hand.
  const f = fixture();
  const saved = GameSession.restore(clone(f.snapshot) as never, clone(f.journal));
  const mid = v7Scenario({ rules: 7, ticks: 40 }).s;
  for (let i = 0; i < 200; i++) {
    const h = mid.world.homestead!;
    if (h.villagers.some((v) => v.carry) && h.villagers.some((v) => v.task && v.nav) && h.sites!.some((x) => x.state !== 'done' && Object.keys(x.delivered).length)) break;
    ticks(mid, 1);
  }
  const hm = mid.world.homestead!;
  assert.ok(hm.villagers.some((v) => v.carry), 'a villager carries a load');
  assert.ok(hm.sites!.some((x) => x.state !== 'done' && Object.keys(x.delivered).length), 'a site has materials delivered');
  for (const s of [saved, mid]) {
    const before = farmState(s);
    const animals = JSON.stringify(s.world.homestead!.animals);
    const r = ok(s, { type: 'upgrade_homestead', rules: 8 }) as { outcome: { type: string; version: number } };
    assert.deepEqual(r.outcome, { type: 'upgrade_homestead', version: 8 });
    assert.equal(s.world.homestead!.version, 8);
    assert.equal(farmState(s), before, 'nothing but the rules number changed');
    assert.equal(JSON.stringify(s.world.homestead!.animals), animals, 'animal states and end ticks kept (the v7 step is not re-applied)');
    const again = send(s, { type: 'upgrade_homestead', rules: 8 });
    assert.ok(!again.ok && again.code === 'unchanged', 'once only');
    assert.ok(!send(s, { type: 'upgrade_homestead', rules: 7 }).ok, 'no way back');
    ticks(s, 150);
    const back = restore(s);
    assert.equal(back.stateHash, s.stateHash);
    ticks(s, 100); ticks(back, 100);
    assert.equal(back.stateHash, s.stateHash, 'reload plays on identically');
    assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'the upgraded journal replays from genesis');
  }
  assert.equal(saved.stateHash, V8_FROM_V7_SAVE);
});

test('v6 -> v8 applies the v7 step once (every animal stays where it stood and starts wandering) and keeps timber stock, rotations and settlers; v1 -> v8 founds gates, Cora and the woodland', () => {
  const f = v6Fixture();
  const s = GameSession.restore(clone(f.snapshot) as never, clone(f.journal));
  assert.equal(s.stateHash, '037429c4ffbcf710');
  const st = s.world.homestead!.sites![0];
  st.stock = { wood: 7 }; st.rot = 2; // as a v6 farm can have them (a test-only edit; not replayed)
  const villagers = JSON.stringify(s.world.homestead!.villagers);
  const where = JSON.stringify(s.world.homestead!.animals.map((a) => [a.id, a.x, a.z]));
  ok(s, { type: 'upgrade_homestead', rules: 8 });
  assert.equal(s.world.homestead!.version, 8);
  assert.deepEqual(st.stock, { wood: 7 });
  assert.equal(st.rot, 2);
  assert.equal(JSON.stringify(s.world.homestead!.villagers), villagers, 'no settler added or moved');
  assert.equal(JSON.stringify(s.world.homestead!.animals.map((a) => [a.id, a.x, a.z])), where, 'every animal where it stood');
  assert.ok(s.world.homestead!.animals.every((a) => a.act === 'wander'));
  const legacy = GameSession.genesis(1337, GENERATOR_V2);
  ok(legacy, { type: 'found_homestead' });
  ticks(legacy, 30);
  ok(legacy, { type: 'upgrade_homestead', rules: 8 });
  const h = legacy.world.homestead!;
  assert.equal(h.version, 8);
  assert.equal(h.villagers.length, 3);
  assert.ok(h.gates && h.sites && h.woodland);
});

test('found_homestead { rules: 8 } is the v7 founding with a new rules number; journal commands accept rules 8 and refuse 9', () => {
  const at = (rules: number) => { const s = GameSession.genesis(42, GENERATOR_V2); ok(s, { type: 'found_homestead', rules }); return s; };
  const a = at(7), b = at(8);
  assert.equal(b.world.homestead!.version, 8);
  assert.equal(farmState(b), farmState(a));
  for (const bad of [9, 0, '8']) {
    const s = GameSession.genesis(42, GENERATOR_V2);
    assert.ok(!send(s, { type: 'found_homestead', rules: bad }).ok, `found rules ${bad}`);
    ok(s, { type: 'found_homestead', rules: 6 });
    assert.ok(!send(s, { type: 'upgrade_homestead', rules: bad }).ok, `upgrade rules ${bad}`);
  }
  // A v8 journal round-trips through validation (restore) and replay.
  ticks(b, 60);
  assert.equal(restore(b).stateHash, b.stateHash);
  assert.equal(GameSession.replay(clone(b.journal)).stateHash, b.stateHash);
  const raw = clone(homesteadSnapshot(b.world.homestead!)) as Record<string, unknown>;
  raw.version = 9;
  assert.throws(() => validateHomestead(raw, b.world.life!.tick));
});

test('v8 pins: the same scenario fresh under v8', () => {
  const v8 = v7Scenario({ rules: 8, ticks: 900 });
  assert.equal(v8.rejected, 0);
  assert.equal(v8.s.stateHash, V8_FRESH);
  assert.notEqual(v8.s.stateHash, V7_S3_FRESH);
});

test('v8 newborns follow their mother (v7 newborns do not): a newborn moves whenever its mother walks off, also by night, and stays near her', () => {
  for (const rules of [8, 7]) {
    const s = GameSession.genesis(1337, GENERATOR_V2);
    ok(s, { type: 'found_homestead', rules });
    const h = s.world.homestead!;
    const ewe = h.animals.find((a) => a.species === 'sheep' && a.sex === 'f')!;
    // Due on the next tick, at dusk: the lamb's first hours are night.
    s.world.life!.tick = 160;
    ewe.pregnantUntil = 161;
    const known = new Set(h.animals.map((a) => a.id));
    let lamb: Animal | undefined;
    for (let i = 0; i < 3 && !lamb; i++) { ticks(s, 1); lamb = s.world.homestead!.animals.find((a) => !known.has(a.id)); }
    assert.ok(lamb, 'a lamb is born');
    const id = lamb!.id;
    let moves = 0, near = 0, n = 0, prev = { x: lamb!.x, z: lamb!.z };
    // Its first 290 ticks (a lamb is grown at 300 and then lives as an adult does).
    for (let i = 0; i < 290; i++) {
      ticks(s, 1);
      const hh = s.world.homestead!;
      const l = hh.animals.find((a) => a.id === id)!;
      if (l.x !== prev.x || l.z !== prev.z) moves++;
      assert.ok(Math.hypot(l.x - prev.x, l.z - prev.z) <= 13, 'no jump');
      prev = { x: l.x, z: l.z };
      const m = motherOf(hh, l, s.world.life!.tick);
      if (rules === 8) assert.ok(m, 'the lamb has a mother');
      if (m) { n++; if (Math.hypot(m.x - l.x, m.z - l.z) <= FOLLOW_DM + 2 * DM) near++; }
    }
    const g = homesteadNav(s.world, s.world.homestead!);
    const l = s.world.homestead!.animals.find((a) => a.id === id)!;
    assert.ok(penCells(s.world, s.world.homestead!, g, 'pen').main.has(g.index(Math.floor(l.x / DM), Math.floor(l.z / DM))), 'on a free cell of the pen');
    console.log(`# v${rules} lamb: ${moves} moving ticks of 290, within ${FOLLOW_DM / DM + 2} m of its mother ${near} of ${n}`);
    if (rules === 8) {
      assert.ok(moves >= 30, `v8 lamb moves (${moves})`);
      assert.ok(near / n >= 0.8, `v8 lamb keeps near its mother (${near} of ${n})`);
    }
  }
});

test('the v7 save played on under v7 (300 ticks, young animals in the herd) stays v7 and its journal replays from genesis', () => {
  const s = GameSession.restore(clone(fixture().snapshot) as never, clone(fixture().journal));
  const h: HomesteadState = s.world.homestead!;
  assert.ok(h.animals.some((a) => s.world.life!.tick - a.born < SPECIES_RULES[a.species].adultAge), 'the fixture holds young animals');
  ticks(s, 300);
  assert.equal(s.world.homestead!.version, 7);
  const again = GameSession.replay(clone(s.journal));
  assert.equal(again.stateHash, s.stateHash);
});
