// STAB-002 S1 "animal unstick" (settlement rules v7). Founding animals,
// newborns and every wander, graze and herding target stand on free cells of
// the main walkable area of their enclosure; an animal on a blocked or cut-off
// cell walks out cell by cell (never a jump); an empty route is an arrival;
// farm animals graze, drink, rest and wander as sim states the renderer draws.
// Rules v1-v6 keep their exact hashes, and a v6 save made by the build before
// this change (4169c21) restores byte-identical and upgrades by one journaled
// command that keeps everything on the farm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2, MAT, topMaterialAtWorld } from '../src/sim/world';
import {
  ANIMAL_SPEED, DAY_TICKS, DM, DRIVEN_SPEED, HOMESTEAD_BUILD_VERSION, HOMESTEAD_HERD_VERSION, HOMESTEAD_LATEST_VERSION, HOMESTEAD_VERSIONS,
  SPECIES_RULES, TROUGH_REACH, escapeRoute, facility, findFieldSpot, findSiteSpot, homesteadNav, homesteadSnapshot, penCells, validateHomestead,
} from '../src/sim/homestead';
import type { Animal, HomesteadState } from '../src/sim/homestead';
import { BLOCK, canMove } from '../src/sim/nav';
import { FOUNDER_STOCKPILE_ID } from '../src/sim/economy';
import { HerdTime } from '../src/app/herd-time';

type Session = GameSession;
let seq = 0;
const send = (s: Session, c: Record<string, unknown>) => s.dispatch({ schema: 3, id: `s1:${seq++}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never);
const ok = (s: Session, c: Record<string, unknown>) => { const r = send(s, c); assert.ok(r.ok, `${String(c.type)}: ${JSON.stringify(r)}`); return r; };
const ticks = (s: Session, n: number, each?: () => void) => { for (let i = 0; i < n; i++) { ok(s, { type: 'tick', ticks: 1 }); each?.(); } };
const founded = (rules: number, seed = 1337) => { const s = GameSession.genesis(seed, GENERATOR_V2); ok(s, rules === 1 ? { type: 'found_homestead' } : { type: 'found_homestead', rules }); return s; };
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 42, 1337, 2024, 31337, 99999];

/** Where an animal stands: blocked cell, cut off from its enclosure's main area, or fine. */
function standing(s: Session, a: Animal): 'blocked' | 'cut_off' | 'ok' {
  const h = s.world.homestead!, g = homesteadNav(s.world, h);
  const i = g.index(Math.floor(a.x / DM), Math.floor(a.z / DM));
  if (g.block[i] !== BLOCK.none) return 'blocked';
  const id = SPECIES_RULES[a.species].enclosure, r = facility(h, id)!.rect;
  const inside = a.x >= r.x0 && a.x < r.x1 && a.z >= r.z0 && a.z < r.z1;
  return inside && !penCells(s.world, h, g, id).main.has(i) ? 'cut_off' : 'ok';
}
const trapped = (s: Session) => s.world.homestead!.animals.filter((a) => standing(s, a) !== 'ok').map((a) => a.id);

/** The M014 reference scenario (m014.construction.test.ts), pinned per rules version. */
function reference(rules: number): Session {
  const s = GameSession.genesis(1337, GENERATOR_V2);
  ok(s, { type: 'found_homestead', rules });
  ok(s, { type: 'mark_field', ...findFieldSpot(s.world, 5, 4, 'potato')! });
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
  ok(s, { type: 'place_site', kind: 'woodshed', ...findSiteSpot(s.world)! });
  ok(s, { type: 'approve_site', siteId: s.world.homestead!.sites![0].id });
  ok(s, { type: 'assign_role', villagerId: 'villager:0', role: 'builder', actor: 'player' });
  ticks(s, 400);
  ok(s, { type: 'set_gate', gateId: 'gate:pen', state: 'open' });
  ticks(s, 50);
  return s;
}
/** The M011/M012 scenario that pinned v1-v3. */
function m012Run(rules: 1 | 2 | 3): Session {
  const s = founded(rules);
  ok(s, { type: 'mark_field', ...findFieldSpot(s.world, 5, 4, 'potato')! });
  ticks(s, 300);
  if (rules >= 2) ok(s, { type: 'set_gate', gateId: 'gate:pen', state: 'open' });
  ticks(s, 100);
  return s;
}
const fixture = () => JSON.parse(readFileSync('tests/fixtures/stab002-v6-save.json', 'utf8')) as { hash: string; snapshot: unknown; journal: unknown };

test('rules v1-v6 keep their hashes: v1-v3 (M012 run), v4-v6 (M014 reference run; v6 measured on 4169c21 before this change); genesis unchanged', () => {
  assert.equal(GameSession.genesis(1337).stateHash, 'e659504b056654dc');
  assert.equal(m012Run(1).stateHash, '16ca4c350d98096f');
  assert.equal(m012Run(2).stateHash, '542411888c83bf3a');
  assert.equal(m012Run(3).stateHash, 'd2c28283712a8de7');
  assert.equal(reference(4).stateHash, '6ce5ae532227eeb9');
  assert.equal(reference(5).stateHash, 'f249cb544027b9bd');
  const v6 = reference(6);
  assert.equal(v6.stateHash, '037429c4ffbcf710');
  assert.ok(!/"act"|"until"/.test(JSON.stringify(v6.snapshot.homestead)), 'no v7 fields under v6');
  assert.deepEqual(HOMESTEAD_VERSIONS, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(HOMESTEAD_LATEST_VERSION, HOMESTEAD_HERD_VERSION);
});

test('a v6 save written by the build before v7 (4169c21) restores byte-identical with its recorded hash; v6 refuses v7 animal fields', () => {
  const f = fixture();
  const s = GameSession.restore(JSON.parse(JSON.stringify(f.snapshot)), JSON.parse(JSON.stringify(f.journal)));
  assert.equal(s.stateHash, f.hash);
  assert.equal(s.stateHash, '037429c4ffbcf710');
  assert.equal(JSON.stringify(s.snapshot), JSON.stringify(f.snapshot), 'byte-identical');
  assert.equal(s.world.homestead!.version, HOMESTEAD_BUILD_VERSION);
  // The same journal replayed from genesis gives the same hash too.
  const again = reference(6);
  assert.equal(again.stateHash, f.hash);
  const raw = JSON.parse(JSON.stringify(homesteadSnapshot(s.world.homestead!)));
  raw.animals[0].act = 'graze'; raw.animals[0].until = 0;
  assert.throws(() => validateHomestead(raw, s.world.life!.tick), /invalid animal/);
});

test('v7 founding: on 15 seeds every starter stands on a free cell of its enclosure\'s main area, wandering', () => {
  for (const seed of SEEDS) {
    const s = founded(7, seed);
    const h = s.world.homestead!;
    assert.equal(h.version, 7);
    assert.equal(h.animals.length, 15);
    assert.deepEqual(trapped(s), [], `seed ${seed}`);
    for (const a of h.animals) { assert.equal(a.act, 'wander'); assert.equal(a.tx, a.x); assert.equal(a.tz, a.z); }
  }
  // Under v6 the same seeds put animals on blocked shelter cells (the STAB-001 fault).
  assert.ok(SEEDS.slice(0, 5).some((seed) => trapped(founded(6, seed)).length > 0));
});

test('v7 births: every newborn starts on a free cell of the main area, even when its mother stands on a shelter cell', () => {
  const s = founded(7, 1337);
  const h = s.world.homestead!;
  const g = homesteadNav(s.world, h);
  // Put the sow on a shelter cell with no exit, due to give birth on the next tick.
  const sow = h.animals.find((a) => a.species === 'pig' && a.sex === 'f')!;
  const sty = facility(h, 'sty')!.rect;
  let cell: [number, number] | null = null;
  for (let z = sty.z0 / DM; z < sty.z1 / DM && !cell; z++) for (let x = sty.x0 / DM; x < sty.x1 / DM && !cell; x++) {
    const i = g.index(x, z);
    if (g.block[i] === BLOCK.none) continue;
    let exits = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) if (canMove(g, x, z, x + dx, z + dz, { openGatesOnly: true, maxExpansions: 0 })) exits++;
    if (!exits) cell = [x, z];
  }
  assert.ok(cell, 'the sty has a shelter cell with no exit');
  sow.x = sow.tx = cell![0] * DM + 5; sow.z = sow.tz = cell![1] * DM + 5;
  sow.pregnantUntil = s.world.life!.tick + 1;
  const before = new Set(h.animals.map((a) => a.id));
  let born: Animal[] = [];
  for (let i = 0; i < 3 && !born.length; i++) { ticks(s, 1); born = s.world.homestead!.animals.filter((a) => !before.has(a.id)); }
  assert.equal(born.length, 2, 'a litter of two');
  for (const a of born) { assert.equal(standing(s, a), 'ok'); assert.equal(a.act, 'wander'); }
  // Over 3 days on several seeds, no newborn ever starts trapped.
  for (const seed of [1337, 8, 10]) {
    const r = founded(7, seed);
    let seen = new Set(r.world.homestead!.animals.map((a) => a.id)), births = 0;
    ticks(r, 900, () => {
      for (const a of r.world.homestead!.animals) if (!seen.has(a.id)) { births++; assert.equal(standing(r, a), 'ok', `${seed} ${a.id}`); }
      seen = new Set(r.world.homestead!.animals.map((a) => a.id));
    });
    assert.ok(births > 0, `seed ${seed} has births`);
  }
});

test('v7 escape: an animal on a no-exit shelter cell walks out through the shelter footprint, one step a tick, no jump', () => {
  const s = founded(7, 1337);
  const h = s.world.homestead!, g = homesteadNav(s.world, h);
  // The STAB-001 sow cell (-18,-4) in the sty at seed 1337: fence north, shelter on the other sides.
  const sow = h.animals.find((a) => a.species === 'pig')!;
  sow.x = sow.tx = -18 * DM + 5; sow.z = sow.tz = -4 * DM + 5;
  assert.equal(standing(s, sow), 'blocked');
  const route = escapeRoute(s.world, h, g, sow)!;
  assert.ok(route.length >= 1);
  // The route's cells are neighbours in turn, ending on a main-area cell; the cells before it are shelter cells.
  const pen = penCells(s.world, h, g, 'sty');
  assert.ok(pen.main.has(route[route.length - 1]));
  for (const i of route.slice(0, -1)) assert.match(g.blockId.get(i) ?? '', /^shelter:sty$/);
  let prev = { x: sow.x, z: sow.z }, n = 0;
  while (standing(s, sow) !== 'ok') {
    ticks(s, 1);
    const d = Math.hypot(sow.x - prev.x, sow.z - prev.z);
    assert.ok(d > 0 && d <= ANIMAL_SPEED + 0.5, `step ${d}`);
    prev = { x: sow.x, z: sow.z };
    assert.ok(++n <= 10, 'out within 10 ticks');
  }
  // Out and free: it moves on later.
  let moved = 0;
  ticks(s, 120, () => { if (sow.x !== prev.x || sow.z !== prev.z) moved++; prev = { x: sow.x, z: sow.z }; });
  assert.ok(moved > 10);
});

test('v7 arrival: a target 7-8 dm away in the next cell is reached and the animal goes idle (no dead band); an empty route is an arrival', () => {
  const s = founded(7, 1337);
  const h = s.world.homestead!, g = homesteadNav(s.world, h);
  const pen = penCells(s.world, h, g, 'paddock');
  const horse = h.animals.find((a) => a.species === 'horse')!;
  // A main-area cell whose east neighbour is in the main area too.
  const i = pen.list.find((c) => pen.main.has(c + 1) && pen.main.has(c - 1))!;
  const x = g.cellX(i), z = g.cellZ(i);
  horse.x = x * DM + 5; horse.z = z * DM + 5;
  horse.tx = horse.x + 8; horse.tz = horse.z; horse.act = 'wander'; horse.until = s.world.life!.tick; horse.hunger = 0;
  ticks(s, 1);
  assert.equal(horse.x, x * DM + 12, 'one step (7 dm) toward the target');
  ticks(s, 1);
  assert.equal(horse.x, x * DM + 13, 'stepped onto the target point');
  assert.equal(horse.tx, horse.x, 'arrived: idle again, free to choose');
  // An empty route: target in its own cell, reached and idle in the same tick.
  const gx = horse.x - 3, gz = horse.z + 2;
  horse.tx = gx; horse.tz = gz; horse.act = 'wander';
  ticks(s, 1);
  assert.deepEqual([horse.x, horse.z, horse.tx, horse.tz], [gx, gz, gx, gz]);
  // Under v6 the same setup parks the animal 8 dm short (the STAB-001 dead band).
  const o = founded(6, 1337), oh = o.world.homestead!;
  const og = homesteadNav(o.world, oh), opn = penCells(o.world, oh, og, 'paddock');
  const oi = opn.list.find((c) => opn.main.has(c + 1) && opn.main.has(c - 1))!;
  const old = oh.animals.find((a) => a.species === 'horse')!;
  old.x = og.cellX(oi) * DM + 5; old.z = og.cellZ(oi) * DM + 5; old.tx = old.x + 8; old.tz = old.z; old.hunger = 0;
  ticks(o, 5);
  assert.equal(old.tx - old.x, 8, 'v6 never arrives');
});

test('v7 states: graze happens on grass cells with the head down for a bout, drinks at the trough, rests by day (short) and night (long), all recorded per animal', () => {
  const s = founded(7, 1337);
  const time = new HerdTime();
  const per = new Map<string, Record<string, number>>();
  const restLen: { day: number[]; night: number[] } = { day: [], night: [] };
  const startedRest = new Map<string, number>();
  let grazeBouts = 0, drinks = 0;
  const water0 = new Map<string, number>();
  ticks(s, 900, () => {
    const h = s.world.homestead!, tick = s.world.life!.tick, g = homesteadNav(s.world, h);
    time.observe(h, tick);
    for (const a of h.animals) {
      const r = per.get(a.id) ?? {}; r[a.act!] = (r[a.act!] ?? 0) + 1; per.set(a.id, r);
      const fac = facility(h, SPECIES_RULES[a.species].enclosure)!;
      const inside = a.x >= fac.rect.x0 && a.x < fac.rect.x1 && a.z >= fac.rect.z0 && a.z < fac.rect.z1;
      if (a.act === 'graze' && a.until! > 0 && inside) {
        // Head-down grazing stands on a grass cell.
        assert.equal(topMaterialAtWorld(s.world, Math.floor(a.x / DM), Math.floor(a.z / DM)), MAT.GRASS);
        grazeBouts++;
      }
      if (a.act === 'drink' && a.until! > 0) {
        // Drinking stands in a cell next to the trough (its centre within the trough reach).
        const cx = Math.floor(a.x / DM) * DM + 5, cz = Math.floor(a.z / DM) * DM + 5;
        assert.ok(Math.hypot(cx - fac.trough!.x, cz - fac.trough!.z) <= TROUGH_REACH, `${a.id} drinks at the trough`);
        drinks++;
      }
      if (a.act === 'rest' && !startedRest.has(a.id)) startedRest.set(a.id, tick);
      if (a.act !== 'rest' && startedRest.has(a.id)) {
        const t0 = startedRest.get(a.id)!; startedRest.delete(a.id);
        const ph = (t0 - 1) % DAY_TICKS;
        (ph >= 171 && ph < 291 ? restLen.night : restLen.day).push(tick - t0);
      }
    }
    for (const e of h.enclosures) water0.set(e.id, Math.min(water0.get(e.id) ?? 99, e.water));
  });
  const h = s.world.homestead!;
  for (const a of h.animals) {
    if (s.world.life!.tick - a.born < 300) continue;
    const r = per.get(a.id)!;
    assert.ok(r.graze > 0 && r.rest > 0 && r.wander > 0, `${a.id} grazes, rests and wanders: ${JSON.stringify(r)}`);
  }
  assert.ok(grazeBouts > 0 && drinks > 0);
  const mean = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
  assert.ok(restLen.day.length > 10 && restLen.night.length > 10);
  assert.ok(mean(restLen.night) > 2 * mean(restLen.day), `night rests ${mean(restLen.night)} vs day ${mean(restLen.day)}`);
  // The evidence counter sees the same states.
  const m = time.metrics();
  assert.ok(m.total.graze > 0 && m.total.rest > 0 && m.total.drink > 0 && m.total.wander > 0 && m.total.none === 0);
  // Needs are met: nobody starves.
  assert.ok(h.animals.every((a) => a.starving === 0));
});

test('v7 save and reload: the same states and hash after a restore mid-run; snapshots with act/until validate only under v7', () => {
  const s = founded(7, 8);
  ticks(s, 250);
  const back = GameSession.restore(JSON.parse(JSON.stringify(s.snapshot)), JSON.parse(JSON.stringify(s.journal)));
  assert.equal(back.stateHash, s.stateHash);
  assert.equal(JSON.stringify(back.snapshot), JSON.stringify(s.snapshot));
  ticks(s, 300); ticks(back, 300);
  assert.equal(back.stateHash, s.stateHash);
  assert.deepEqual(back.world.homestead!.animals.map((a) => [a.id, a.x, a.z, a.act, a.until]), s.world.homestead!.animals.map((a) => [a.id, a.x, a.z, a.act, a.until]));
  const raw = JSON.parse(JSON.stringify(homesteadSnapshot(s.world.homestead!)));
  assert.ok(raw.animals.every((a: Animal) => typeof a.act === 'string' && Number.isSafeInteger(a.until)));
  const bad = JSON.parse(JSON.stringify(raw)); bad.animals[0].act = 'fly';
  assert.throws(() => validateHomestead(bad, s.world.life!.tick));
  const bad2 = JSON.parse(JSON.stringify(raw)); delete bad2.animals[0].until;
  assert.throws(() => validateHomestead(bad2, s.world.life!.tick));
});

test('v6 save -> v7: one journaled upgrade keeps every animal, villager, building, field, woodland and stock; trapped animals walk out; reload keeps the hash', () => {
  const f = fixture();
  const s = GameSession.restore(JSON.parse(JSON.stringify(f.snapshot)), JSON.parse(JSON.stringify(f.journal)));
  const h = s.world.homestead!;
  assert.equal(h.sites![0].state, 'done');
  const caught = trapped(s);
  assert.ok(caught.length > 0, 'the v6 farm has animals trapped on shelter cells');
  const keep = (x: HomesteadState) => {
    const snap = homesteadSnapshot(x) as unknown as Record<string, unknown> & { animals: Array<Record<string, unknown>> };
    return JSON.stringify({ ...snap, version: 0, animals: snap.animals.map(({ act, until, tx, tz, ...rest }) => rest) });
  };
  const before = keep(h);
  const store = JSON.stringify(s.world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory), bag = JSON.stringify(s.world.inventory);
  const r = ok(s, { type: 'upgrade_homestead', rules: 7 });
  assert.ok(r.ok && r.outcome.type === 'upgrade_homestead' && r.outcome.version === 7);
  assert.equal(send(s, { type: 'upgrade_homestead', rules: 7 }).ok, false, 'once only');
  assert.equal(s.journal.entries.at(-1)!.command.type, 'upgrade_homestead');
  // Nothing changed but the rules number and the animals' new state fields: same places, needs, ids, sites (rotation and stock), woodland.
  assert.equal(keep(s.world.homestead!), before);
  assert.equal(JSON.stringify(s.world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory), store);
  assert.equal(JSON.stringify(s.world.inventory), bag);
  assert.ok(s.world.homestead!.animals.every((a) => a.act === 'wander'));
  // The trapped animals walk out within a few ticks, never more than one step a tick.
  const last = new Map(s.world.homestead!.animals.map((a) => [a.id, { x: a.x, z: a.z }]));
  let n = 0;
  while (trapped(s).length) {
    ticks(s, 1);
    for (const a of s.world.homestead!.animals) {
      const p = last.get(a.id);
      if (p) assert.ok(Math.hypot(a.x - p.x, a.z - p.z) <= DRIVEN_SPEED + 0.5, `${a.id} no jump`);
      last.set(a.id, { x: a.x, z: a.z });
    }
    assert.ok(++n <= 12, `out within 12 ticks: ${trapped(s)}`);
  }
  // Reload after the upgrade: same hash and the same next 200 ticks.
  const back = GameSession.restore(JSON.parse(JSON.stringify(s.snapshot)), JSON.parse(JSON.stringify(s.journal)));
  assert.equal(back.stateHash, s.stateHash);
  ticks(s, 200); ticks(back, 200);
  assert.equal(back.stateHash, s.stateHash);
});

test('v6 -> v7 keeps timber in a finished timber store and site rotation (the v6 step is not re-applied)', () => {
  const f = fixture();
  const s = GameSession.restore(JSON.parse(JSON.stringify(f.snapshot)), JSON.parse(JSON.stringify(f.journal)));
  const st = s.world.homestead!.sites![0];
  st.stock = { wood: 7 }; st.rot = 2; // as a v6 farm can have them (a test-only edit; not replayed)
  const villagers = JSON.stringify(s.world.homestead!.villagers);
  ok(s, { type: 'upgrade_homestead', rules: 7 });
  assert.deepEqual(st.stock, { wood: 7 });
  assert.equal(st.rot, 2);
  assert.equal(JSON.stringify(s.world.homestead!.villagers), villagers, 'no settler added or moved');
});
