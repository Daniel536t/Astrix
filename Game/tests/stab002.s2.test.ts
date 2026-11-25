// STAB-002 S2 "bodies and presence" (settlement rules v7). The journaled
// `tick` carries the founder's quantised presence; under rules v7 the
// founder's cells join the occupancy map villagers share, and farm animals
// keep their distance: they route round the founder, step aside (away and
// off the founder's line, never through a gate, staying in their pen) and
// pick no new target near them. Villagers queue behind the founder and give
// up after NAV_GIVE_UP ticks; no gate is shut onto the founder. The founder's
// own contact with the capsules (built from sim state, as main.ts does) is
// player-local physics. Rules v1-v6 never see presence; v7 journals without
// presence replay exactly as under S1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2 } from '../src/sim/world';
import {
  DM, NAV_GIVE_UP, PLAYER_ID, SPECIES_RULES, YIELD_SPEED, facility, findFieldSpot, findSiteSpot, homesteadNav, penCells, penGate, playerPresence,
  recentHomesteadEvents, straysOf,
} from '../src/sim/homestead';
import type { Animal, EnclosureId, Species } from '../src/sim/homestead';
import { canMove, navStats } from '../src/sim/nav';
import { FARM_BODIES, PLAYER_R, keepDm, presenceCells, ringDm } from '../src/sim/bodies';
import type { Presence } from '../src/sim/bodies';
import { CONTACT_SQUEEZE_DEPTH } from '../src/sim/character';
import { CHARACTER_RADIUS, Walk, animalsOf, farm, ok, send, stretchIn, tick } from './stab002-s2-harness';

const cellOf = (v: number) => Math.floor(v / DM);
/** A move between two ticks never crosses a fence, a closed gate or a blocked corner (open gates only, like an animal). */
function assertGridMove(g: ReturnType<typeof homesteadNav>, a: { x: number; z: number }, b: { x: number; z: number }, what: string) {
  const ax = cellOf(a.x), az = cellOf(a.z), bx = cellOf(b.x), bz = cellOf(b.z);
  if (ax === bx && az === bz) return;
  const o = { openGatesOnly: true, maxExpansions: 0 };
  if (canMove(g, ax, az, bx, bz, o)) return;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (canMove(g, ax, az, ax + dx, az + dz, o) && canMove(g, ax + dx, az + dz, bx, bz, o)) return;
  }
  assert.fail(`${what}: moved from cell ${ax},${az} to ${bx},${bz} across a fence or closed gate`);
}
const young = (s: GameSession, a: Animal) => s.world.life!.tick - a.born < SPECIES_RULES[a.species].adultAge;
const insideOf = (s: GameSession, a: Animal) => { const r = facility(s.world.homestead!, SPECIES_RULES[a.species].enclosure)!.rect; return a.x >= r.x0 && a.x < r.x1 && a.z >= r.z0 && a.z < r.z1; };

function reference(rules: number, presence?: () => Presence | null): GameSession {
  const s = GameSession.genesis(1337, GENERATOR_V2);
  const t = (n: number) => { for (let i = 0; i < n; i++) tick(s, presence?.()); };
  ok(s, { type: 'found_homestead', rules });
  ok(s, { type: 'mark_field', ...findFieldSpot(s.world, 5, 4, 'potato')! });
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
  ok(s, { type: 'place_site', kind: 'woodshed', ...findSiteSpot(s.world)! });
  ok(s, { type: 'approve_site', siteId: s.world.homestead!.sites![0].id });
  ok(s, { type: 'assign_role', villagerId: 'villager:0', role: 'builder', actor: 'player' });
  t(400);
  ok(s, { type: 'set_gate', gateId: 'gate:pen', state: 'open' });
  t(50);
  return s;
}
/** A presence walking a loop through the pens (as a player wandering the farm would). */
const wandering = (s: GameSession) => {
  let k = 0;
  return () => {
    const h = s.world.homestead!, ids: EnclosureId[] = ['coop', 'pen', 'sty', 'paddock'];
    const r = facility(h, ids[Math.floor(k / 25) % 4])!.rect; k++;
    return { x: Math.round((r.x0 + r.x1) / 2 + Math.sin(k) * 15), z: Math.round((r.z0 + r.z1) / 2 + Math.cos(k) * 12), mx: Math.sign(Math.cos(k)) as -1 | 0 | 1, mz: 0 as const };
  };
};

test('presence never changes rules v1-v6 (v6 M014 run with presence on every tick keeps 037429c4ffbcf710); v7 journals without presence replay exactly as S1 (pinned on cd0aff6)', () => {
  assert.equal(GameSession.genesis(1337).stateHash, 'e659504b056654dc');
  const v6 = GameSession.genesis(1337, GENERATOR_V2);
  ok(v6, { type: 'found_homestead', rules: 6 });
  const p6 = wandering(v6);
  // The same M014 reference scenario, every tick carrying a presence that walks through the pens.
  const withPresence = reference(6, p6);
  assert.equal(withPresence.stateHash, '037429c4ffbcf710');
  assert.equal(reference(5, () => ({ x: -200, z: 0, mx: 1, mz: 0 })).stateHash, 'f249cb544027b9bd');
  assert.ok(withPresence.journal.entries.some((e) => e.command.type === 'tick' && e.command.presence), 'the v6 journal holds presence');
  // v7 without presence: the S1 results (measured on cd0aff6 before S2).
  assert.equal(reference(7).stateHash, 'f849279d086aa120');
  const fresh: Record<number, string> = { 1: '0a9011b2db7e9b63', 42: 'a4837164213ddc3b', 1337: '69c99cab31257384', 2024: 'd3c8cd112e45a006' };
  for (const [seed, hash] of Object.entries(fresh)) {
    const s = GameSession.genesis(Number(seed), GENERATOR_V2);
    ok(s, { type: 'found_homestead', rules: 7 });
    for (let i = 0; i < 900; i++) tick(s);
    assert.equal(s.stateHash, hash, `fresh v7 seed ${seed}`);
  }
  // With presence v7 does react (otherwise the rest of this file would test nothing).
  assert.notEqual(reference(7, wandering(v6)).stateHash, 'f849279d086aa120');
});

test('tick presence is strict and replays: bad presence is rejected, the journal with presence replays to the same hash, a save mid-run restores and plays on identically', () => {
  const s = farm();
  const bad: unknown[] = [
    { x: 1.5, z: 0, mx: 0, mz: 0 }, { x: 0, z: 0, mx: 2, mz: 0 }, { x: 0, z: 0, mx: 0 }, { x: 0, z: 0, mx: 0, mz: 0, y: 3 },
    { x: 20_001, z: 0, mx: 0, mz: 0 }, { x: '1', z: 0, mx: 0, mz: 0 }, [1, 2, 0, 0], null,
  ];
  for (const p of bad) {
    let rejected = false;
    try { const r = send(s, { type: 'tick', ticks: 1, presence: p }); rejected = !r.ok; } catch { rejected = true; }
    assert.ok(rejected, `rejected: ${JSON.stringify(p)}`);
  }
  // Keys in another order are the same canonical command.
  ok(s, { type: 'tick', ticks: 1, presence: { mz: 0, mx: 1, z: 30, x: -250 } });
  const e = s.journal.entries[s.journal.entries.length - 1];
  assert.deepEqual(Object.keys((e.command as { presence: object }).presence), ['x', 'z', 'mx', 'mz']);
  const p = wandering(s);
  for (let i = 0; i < 200; i++) tick(s, i % 7 === 3 ? null : p());
  const mid = { snapshot: JSON.parse(JSON.stringify(s.snapshot)), journal: JSON.parse(JSON.stringify(s.journal)) };
  const replayed = GameSession.replay(JSON.parse(JSON.stringify(s.journal)));
  assert.equal(replayed.stateHash, s.stateHash, 'journal replay');
  const back = GameSession.restore(mid.snapshot, mid.journal);
  assert.equal(back.stateHash, s.stateHash, 'restore');
  for (let i = 0; i < 100; i++) { const q = p(); tick(s, q); tick(back, q); }
  assert.equal(back.stateHash, s.stateHash, 'plays on identically');
  assert.ok(!JSON.stringify(s.snapshot).includes('presence'), 'presence is input, never in the snapshot');
});

test('the founder cannot pass through any of the six farm species on the farm: walking at each (60 fps and fixed 1/30 s steps), capsules from sim state, presence on the ticks', () => {
  const rows: string[] = [];
  const cases: Array<[Species, number]> = [['cattle', 5], ['horse', 5], ['sheep', 5], ['goat', 5], ['pig', 2], ['chicken', 2.5]];
  for (const mode of ['60fps', 'fixed'] as const) {
    for (const [sp, len] of cases) {
      const s = farm(); const h = s.world.homestead!;
      const st = stretchIn(s, SPECIES_RULES[sp].enclosure, len);
      const a = animalsOf(h, sp)[0];
      // The animal stands (rests) 70 % along a clear stretch; the others are moved out of the way.
      a.x = Math.round((st.x + st.dx * len * 0.7) * DM); a.z = Math.round((st.z + st.dz * len * 0.7) * DM); a.tx = a.x; a.tz = a.z;
      a.hunger = 0; a.act = 'rest'; a.until = 10_000;
      for (const o of h.animals) if (o !== a) { o.x = 0; o.z = 0; o.tx = 0; o.tz = 0; }
      const w = new Walk(s, st.x, st.z, mode);
      let minCentre = Infinity;
      w.walkTo(st.x + st.dx * len, st.z + st.dz * len, 6, false, () => {
        const b = w.current().find((q) => q.id === a.id)!;
        minCentre = Math.min(minCentre, Math.hypot(w.ch.x - (b.x - Math.sin(b.heading) * FARM_BODIES[sp].off), w.ch.z - (b.z - Math.cos(b.heading) * FARM_BODIES[sp].off)));
      });
      rows.push(`${mode} ${sp}: min gap ${w.minGap.toFixed(3)} m, min centre distance ${minCentre.toFixed(2)} m`);
      assert.ok(w.minGap >= -0.05, `${mode} ${sp}: deepest overlap ${(-w.minGap).toFixed(3)} m`);
      assert.ok(minCentre >= FARM_BODIES[sp].r + CHARACTER_RADIUS - 0.05, `${mode} ${sp}: centre distance ${minCentre.toFixed(2)}`);
      assert.ok(w.ticks >= 2, 'ticks ran with presence');
    }
  }
  console.log(rows.join('\n'));
});

test('an animal walking into the standing founder stops or detours: never within its keep distance (sim), the drawn capsule never deeper than 0.05 m, every move on the grid', () => {
  for (const sp of ['cattle', 'horse', 'sheep', 'goat'] as const) {
    const s = farm(); const h = s.world.homestead!; const g = homesteadNav(s.world, h);
    const st = stretchIn(s, SPECIES_RULES[sp].enclosure, 5);
    const a = animalsOf(h, sp)[0];
    for (const o of h.animals) if (o !== a) { o.x = 0; o.z = 0; o.tx = 0; o.tz = 0; }
    const w = new Walk(s, st.x + 2.5 * st.dx, st.z + 2.5 * st.dz);
    const p0 = { x: w.ch.x, z: w.ch.z };
    a.x = Math.round(st.x * DM); a.z = Math.round(st.z * DM); a.hunger = 0; a.act = 'wander'; a.until = 0;
    a.tx = Math.round((st.x + 5 * st.dx) * DM); a.tz = Math.round((st.z + 5 * st.dz) * DM);
    const keep = keepDm(sp, young(s, a));
    let minSim = Infinity, prev = { x: a.x, z: a.z }, passed = false;
    for (let k = 0; k < 30 * 60; k++) {
      w.frame({});
      if (prev.x !== a.x || prev.z !== a.z) { assertGridMove(g, prev, a, `${sp}`); prev = { x: a.x, z: a.z }; }
      const p = playerPresence(s.world, w.ch)!;
      minSim = Math.min(minSim, Math.hypot(a.x - p.x, a.z - p.z));
      if ((a.x - p.x) * st.dx + (a.z - p.z) * st.dz > 10) passed = true;
    }
    assert.ok(minSim >= keep - 1, `${sp}: sim distance ${minSim.toFixed(1)} dm, keep ${keep} dm`);
    assert.ok(w.minGap >= -0.05, `${sp}: drawn overlap ${(-w.minGap).toFixed(3)} m`);
    assert.ok(Math.hypot(w.ch.x - p0.x, w.ch.z - p0.z) < 0.3, `${sp}: the founder was not shoved`);
    console.log(`${sp}: ${passed ? 'detoured past the founder' : 'stopped'}; closest (sim) ${(minSim / 10).toFixed(2)} m (keep ${(keep / 10).toFixed(1)} m), min drawn gap ${w.minGap.toFixed(3)} m`);
  }
});

test('a founder standing still in each pen: animals step aside once, away and never through a gate or out of the pen; nobody comes back into the ring (no oscillation) over 100 ticks', () => {
  for (const id of ['coop', 'pen', 'sty', 'paddock'] as const) {
    const s = farm(); const h = s.world.homestead!; const g = homesteadNav(s.world, h);
    const pen = penCells(s.world, h, g, id);
    const mine = h.animals.filter((a) => SPECIES_RULES[a.species].enclosure === id);
    // Stand on a main-area cell next to the first animal (at 1 m: inside every species' ring).
    const a0 = mine[0];
    const next = pen.list.find((c) => Math.max(Math.abs(g.cellX(c) - cellOf(a0.x)), Math.abs(g.cellZ(c) - cellOf(a0.z))) === 1)!;
    a0.x = Math.floor(a0.x / DM) * DM + 5; a0.z = Math.floor(a0.z / DM) * DM + 5; a0.tx = a0.x; a0.tz = a0.z;
    const w = new Walk(s, g.cellX(next) + 0.5, g.cellZ(next) + 0.5);
    const inside = new Map(mine.map((a) => [a.id, insideOf(s, a)]));
    const last = new Map(mine.map((a) => [a.id, { x: a.x, z: a.z }]));
    const left = new Set<string>();
    let reentries = 0, yields = 0, closer = 0;
    for (let t = 0; t < 100; t++) {
      w.stand(2);
      const p = playerPresence(s.world, w.ch)!;
      for (const a of mine) {
        const was = last.get(a.id)!;
        if (was.x !== a.x || was.z !== a.z) assertGridMove(g, was, a, `${a.id} tick ${s.world.life!.tick}`);
        assert.equal(insideOf(s, a), inside.get(a.id), `${a.id} stays on its side of the fence`);
        const ring = ringDm(a.species, young(s, a));
        const d0 = Math.hypot(was.x - p.x, was.z - p.z), d1 = Math.hypot(a.x - p.x, a.z - p.z);
        if (d0 < ring && d1 > d0) yields++;
        if (d0 < ring && d1 < d0 - 0.5) closer++;
        if (t >= 2) { if (d1 >= ring) left.add(a.id); else if (left.has(a.id)) { reentries++; left.delete(a.id); } }
        last.set(a.id, { x: a.x, z: a.z });
      }
    }
    assert.ok(yields >= 1, `${id}: animals stepped aside (${yields})`);
    assert.equal(reentries, 0, `${id}: ring re-entries`);
    assert.equal(closer, 0, `${id}: an animal inside the ring never moves closer`);
    void pen;
  }
});

test('step aside prefers cells off the founder\'s line of travel; the step never crosses a gate; one step, no more than YIELD_SPEED', () => {
  const s = farm(); const h = s.world.homestead!;
  const st = stretchIn(s, 'paddock', 5);
  const a = animalsOf(h, 'cattle')[0];
  for (const o of h.animals) if (o !== a) { o.x = 0; o.z = 0; o.tx = 0; o.tz = 0; }
  // The cow at a cell centre 1.2 m ahead of a founder walking straight at it (+dx).
  const cx = Math.floor(st.x + st.dx * 3), cz = Math.floor(st.z + st.dz * 3);
  a.x = cx * DM + 5; a.z = cz * DM + 5; a.tx = a.x; a.tz = a.z; a.hunger = 0; a.act = 'wander'; a.until = 0;
  const before = { x: a.x, z: a.z };
  const pres: Presence = { x: a.x - 12 * st.dx, z: a.z - 12 * st.dz, mx: st.dx as -1 | 0 | 1, mz: st.dz as -1 | 0 | 1 };
  tick(s, pres);
  const moved = Math.hypot(a.x - before.x, a.z - before.z);
  assert.ok(moved > 0 && moved <= YIELD_SPEED + 0.5, `stepped ${moved.toFixed(1)} dm`);
  const along = (a.x - before.x) * st.dx + (a.z - before.z) * st.dz;
  const across = Math.abs((a.x - before.x) * st.dz - (a.z - before.z) * st.dx);
  assert.ok(across > 0, `the cow stepped off the line (across ${across.toFixed(1)} dm, along ${along.toFixed(1)} dm)`);
  assert.ok(Math.hypot(a.x - pres.x, a.z - pres.z) > 12, 'and farther from the founder');
});

test('the founder in the pen gate: strays and drives wait, nothing passes the gate, the herder never shuts it on the founder and leaves it open after a bounded wait; once the founder leaves the round-up completes', () => {
  const s = farm(); const h = s.world.homestead!; const g = homesteadNav(s.world, h);
  const gate = penGate(h, 'pen');
  const gc = g.gateCells.get('gate:pen')!;
  const pen = h.animals.filter((a) => SPECIES_RULES[a.species].enclosure === 'pen');
  for (const [i, a] of pen.slice(0, 2).entries()) { a.x = (gate.outside[0] + 2 + i) * DM + 5; a.z = (gate.outside[1] - 3) * DM + 5; a.tx = a.x; a.tz = a.z; a.act = 'wander'; a.until = 0; }
  const w = new Walk(s, gate.inside[0] + 0.5, gate.inside[1] + 0.5);
  const onGate = (a: { x: number; z: number }) => { const x = cellOf(a.x), z = cellOf(a.z); return (x === gc[0] && z === gc[1]) || (x === gc[2] && z === gc[3]); };
  let closedOnPlayer = 0, opened = false, passed = 0, leftAt = -1;
  for (let t = 0; t < 130; t++) {
    if (t === 90) { w.walkTo(gate.inside[0] + 3.5, gate.inside[1] + 3.5, 3); leftAt = s.world.life!.tick; }
    w.stand(2);
    const p = playerPresence(s.world, w.ch);
    const st = h.gates!.find((q) => q.id === 'gate:pen')!.state;
    if (st === 'open') opened = true;
    const playerOnGate = !!p && presenceCells(p).some(([x, z]) => (x === gc[0] && z === gc[1]) || (x === gc[2] && z === gc[3]));
    if (playerOnGate && opened && st === 'closed') closedOnPlayer++;
    if (leftAt < 0) for (const a of pen) if (onGate(a)) passed++;
  }
  assert.ok(opened, 'the herder opened the gate for the round-up');
  assert.equal(closedOnPlayer, 0, 'never shut onto the founder');
  assert.equal(passed, 0, 'no animal entered the gate cells while the founder stood there');
  const log = (recentHomesteadEvents.get(s.world) ?? []).join(' | ');
  assert.match(log, /left the pen gate open: you are standing in it/);
  assert.equal(straysOf(h, 'pen').filter((a) => a.go === 'home').length, 0, `the driven strays went in after the founder left (${log})`);
});

test('crowded pens at capacity: the founder in a corner for 300 ticks: no animal in the founder\'s cells, no starvation, no oscillation; then walking out through the gate neither founder nor animal is held more than 3 s', () => {
  for (const id of ['coop', 'pen', 'sty', 'paddock'] as const) {
    const s = farm(); const h = s.world.homestead!; const g = homesteadNav(s.world, h);
    const fac = facility(h, id)!;
    const pen = penCells(s.world, h, g, id);
    const r = fac.rect;
    let corner = pen.list[0], bd = Infinity;
    for (const c of pen.list) { const d = Math.hypot(g.cellX(c) * DM + 5 - r.x0, g.cellZ(c) * DM + 5 - r.z1); if (d < bd) { bd = d; corner = c; } }
    const px = g.cellX(corner) + 0.5, pz = g.cellZ(corner) + 0.5;
    // Fill to capacity with copies of the founding animals, on main-area cells away from the corner.
    const mine = h.animals.filter((a) => SPECIES_RULES[a.species].enclosure === id);
    const far = pen.list.filter((c) => Math.hypot(g.cellX(c) + 0.5 - px, g.cellZ(c) + 0.5 - pz) > 2.5);
    for (let k = 0; mine.length + k < (fac.capacity ?? 0); k++) {
      const src = mine[k % mine.length], c = far[(k * 7) % far.length];
      h.animals.push({ ...src, id: `animal:${String(h.nextId++).padStart(3, '0')}`, x: g.cellX(c) * DM + 5, z: g.cellZ(c) * DM + 5, tx: g.cellX(c) * DM + 5, tz: g.cellZ(c) * DM + 5 });
    }
    h.animals.sort((a, b) => a.id.localeCompare(b.id));
    const animals = h.animals.filter((a) => SPECIES_RULES[a.species].enclosure === id);
    const w = new Walk(s, px, pz);
    let inCells = 0, starving = 0, reentries = 0, stuck = 0;
    const left = new Set<string>(), still = new Map<string, number>(), last = new Map<string, string>();
    for (let t = 0; t < 300; t++) {
      w.stand(2);
      const p = playerPresence(s.world, w.ch)!;
      const cells = new Set(presenceCells(p).map(([x, z]) => `${x},${z}`));
      for (const a of animals) {
        if (t > 0 && cells.has(`${cellOf(a.x)},${cellOf(a.z)}`)) inCells++;
        if (a.hunger >= 100) starving++;
        const d = Math.hypot(a.x - p.x, a.z - p.z), keep = keepDm(a.species, young(s, a)), ring = ringDm(a.species, young(s, a));
        if (t >= 2) { if (d >= ring) left.add(a.id); else if (left.has(a.id)) { reentries++; left.delete(a.id); } }
        // Held: inside the founder's keep distance and not moving for more than one tick (3 s or more).
        const key = `${a.x},${a.z}`, n = d < keep && last.get(a.id) === key ? (still.get(a.id) ?? 0) + 1 : 0;
        still.set(a.id, n); last.set(a.id, key);
        if (n > 1) stuck++;
      }
    }
    assert.equal(inCells, 0, `${id}: animals in the founder's cells`);
    assert.equal(starving, 0, `${id}: starving animal-ticks`);
    assert.equal(reentries, 0, `${id}: ring re-entries`);
    assert.equal(stuck, 0, `${id}: animals held inside the founder's keep distance`);
    // Walk out: open the gate, go to its inside cell and through it.
    const gate = penGate(h, id);
    ok(s, { type: 'set_gate', gateId: gate.id, state: 'open' });
    w.minGap = Infinity;
    let held = 0, maxHeld = 0, traceTick = -1;
    // Held against animals (a villager at work in the gateway is a person the founder waits for, not counted here).
    const touching = () => w.current().some((b) => b.id.startsWith('animal:') && penetrationOf(b, w) > -0.03);
    const go = (x: number, z: number, secs: number) => w.walkTo(x, z, secs, false, () => {
      if (w.ch.speed < 0.3 && Math.hypot(x - w.ch.x, z - w.ch.z) > 0.3 && touching()) { held += 1 / 60; maxHeld = Math.max(maxHeld, held); } else held = 0;
      if (process.env.S2_TRACE === id && s.world.life!.tick !== traceTick) {
        traceTick = s.world.life!.tick;
        const p = playerPresence(s.world, w.ch, w.intent);
        console.log(`T${traceTick} player ${w.ch.x.toFixed(2)},${w.ch.z.toFixed(2)} p ${JSON.stringify(p)} held ${held.toFixed(2)} ` + animals.filter((a) => p && Math.hypot(a.x - p.x, a.z - p.z) < 30).map((a) => `${a.id}@${a.x},${a.z} ${a.act}/${a.until} go${a.go ?? "-"} t${a.tx},${a.tz} d${p ? Math.hypot(a.x - p.x, a.z - p.z).toFixed(0) : ''}`).join(' | '));
      }
    });
    const trace = process.env.S2_TRACE === id;
    let tk = -1;
    go(gate.inside[0] + 0.5, gate.inside[1] + 0.5, 15);
    void tk; void trace;
    go(gate.outside[0] + 0.5, gate.outside[1] + 0.5, 30);
    assert.ok(Math.hypot(w.ch.x - gate.outside[0] - 0.5, w.ch.z - gate.outside[1] - 0.5) < 0.5, `${id}: the founder got out (at ${w.ch.x.toFixed(2)}, ${w.ch.z.toFixed(2)}; gate ${JSON.stringify(gate)}; start ${px}, ${pz}; near ${w.current().filter((b) => penetrationOf(b, w) > -0.3).map((b) => `${b.id}@${b.x.toFixed(2)},${b.z.toFixed(2)} gap ${(-penetrationOf(b, w)).toFixed(3)}`).join(' ')}; gate ${h.gates!.find((q) => q.id === gate.id)!.state}; villagers ${JSON.stringify(h.villagers.map((v) => ({ n: v.name, x: v.x, z: v.z, task: v.task?.kind, leg: v.task?.legs[v.task.leg], wait: v.nav?.wait })))})`);
    assert.ok(maxHeld <= 3, `${id}: held ${maxHeld.toFixed(2)} s against animals`);
    // Against animals that cannot yield (a dead end by the gate) the founder squeezes past after CONTACT_SQUEEZE_AFTER.
    assert.ok(w.minGap >= -(CONTACT_SQUEEZE_DEPTH + 0.03), `${id}: overlap ${(-w.minGap).toFixed(3)} m`);
    console.log(`${id}: ${animals.length} animals; walking out held at most ${maxHeld.toFixed(2)} s, min gap ${w.minGap.toFixed(3)} m`);
  }
});
function penetrationOf(b: { x: number; z: number; r: number; hl: number; heading: number }, w: Walk): number {
  const ux = Math.sin(b.heading), uz = Math.cos(b.heading);
  let t = (w.ch.x - b.x) * ux + (w.ch.z - b.z) * uz;
  t = Math.max(-b.hl, Math.min(b.hl, t));
  return -(Math.hypot(w.ch.x - (b.x + ux * t), w.ch.z - (b.z + uz * t)) - b.r - CHARACTER_RADIUS);
}

test('villagers never walk through the founder: in the farmhouse door they queue "behind you", give up after NAV_GIVE_UP ticks with the reason kept; when the founder steps away they go in', () => {
  for (const leave of [false, true]) {
    const s = farm(); const h = s.world.homestead!; const g = homesteadNav(s.world, h);
    const c = g.gateCells.get('door:farmhouse')!;
    const w = new Walk(s, c[2] + 0.5, c[3] + 0.5);
    let inCells = 0, waitedFor = 0, leftAt = -1, firstWait = -1;
    for (let t = 0; t < 230; t++) {
      if (leave && firstWait >= 0 && leftAt < 0 && s.world.life!.tick >= firstWait + 5) { w.walkTo(c[2] + 4.5, c[3] + 3.5, 3); leftAt = s.world.life!.tick; }
      w.stand(2);
      const p = playerPresence(s.world, w.ch);
      if (!p) continue;
      const cells = new Set(presenceCells(p).map(([x, z]) => `${x},${z}`));
      for (const v of h.villagers) {
        if (cells.has(`${cellOf(v.x)},${cellOf(v.z)}`)) inCells++;
        const d = Math.hypot(v.x - p.x, v.z - p.z);
        assert.ok(d >= (PLAYER_R * 2) * 10 - 1, `${v.name} ${d.toFixed(1)} dm from the founder`);
        if (v.nav?.wait?.by === PLAYER_ID) { waitedFor++; if (firstWait < 0) firstWait = s.world.life!.tick; assert.match(v.nav.wait.reason, /you/); }
      }
    }
    assert.equal(inCells, 0, 'no villager in the founder\'s cells');
    assert.ok(waitedFor > 0, 'a villager waited for the founder');
    const log = (recentHomesteadEvents.get(s.world) ?? []).join(' | ');
    if (!leave) {
      assert.match(log, new RegExp(`gave up on home after ${NAV_GIVE_UP} ticks: queueing at the farmhouse door behind you`));
      assert.ok(h.villagers.some((v) => v.avoid?.some((a) => a.by === PLAYER_ID)), 'the reason stays on the villager');
    } else {
      assert.doesNotMatch(log, /gave up/);
      const house = facility(h, 'farmhouse')!.rect;
      assert.ok(h.villagers.some((v) => v.x >= house.x0 && v.x < house.x1 && v.z >= house.z0 && v.z < house.z1), 'a villager went in once the founder stepped away');
    }
    // The saved villagers validate (a wait on 'player' is part of v7).
    const back = GameSession.restore(JSON.parse(JSON.stringify(s.snapshot)), JSON.parse(JSON.stringify(s.journal)));
    assert.equal(back.stateHash, s.stateHash);
  }
});

test('journal growth and cost: presence adds at most 50 bytes per tick entry; 600 ticks with a founder walking the farm search at most 1.5x the expansions', () => {
  const measure = (withPresence: boolean) => {
    const s = farm();
    const p = wandering(s);
    const st = navStats(s.world), e0 = st.expanded;
    const t0 = performance.now();
    for (let i = 0; i < 600; i++) tick(s, withPresence ? p() : null);
    const ms = performance.now() - t0;
    const ticks = s.journal.entries.filter((e) => e.command.type === 'tick');
    const bytes = ticks.reduce((n, e) => n + JSON.stringify(e).length, 0);
    return { ms, bytes, n: ticks.length, expanded: st.expanded - e0 };
  };
  const a = measure(false), b = measure(true);
  const per = (b.bytes - a.bytes) / b.n;
  console.log(`journal: ${(a.bytes / a.n).toFixed(0)} B per tick entry without presence, ${(b.bytes / b.n).toFixed(0)} B with (+${per.toFixed(1)} B; ${(per * 30 / 1024).toFixed(2)} KB per minute at one tick per 2 s); 600 ticks ${a.ms.toFixed(0)} ms vs ${b.ms.toFixed(0)} ms; expansions ${a.expanded} vs ${b.expanded}`);
  assert.ok(per <= 50, `+${per.toFixed(1)} B per tick`);
  // A founder moving 1.5 m about each pen every tick (busier than walking): searches round them, bounded by the tick budget.
  assert.ok(b.expanded <= a.expanded * 1.5, `expansions ${b.expanded} vs ${a.expanded}`);
});
