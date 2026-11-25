// M012 Stage A "living settlement": one structure and navigation layer for
// villagers, homestead animals and the player. Animals respect fences and use
// open gates, strays are driven home by the herder, the player collides with
// fences, gates and buildings and works gates by hand (journaled), villagers
// never share a cell and queue at gates and work spots, and the farmhouse
// door is drawn from its simulated state. Settlement rules v3 gate every new
// hashed behaviour, so old saves and journals keep their exact hashes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2, World, ensureChunk, worldToChunkX, worldToChunkZ } from '../src/sim/world';
import {
  Animal, DM, EnclosureId, HOMESTEAD_LIVING_VERSION, Leg, SPECIES_RULES, Villager, bedSpot, facility, findFieldSpot, homesteadGates,
  homesteadNav, homesteadSnapshot, nearbyGate, penGate, settlementCollision, straysOf, validateHomestead,
} from '../src/sim/homestead';
import { canMove, navStats, resetNavCache, structureHits, SOLID } from '../src/sim/nav';
import { CHARACTER_RADIUS, CharacterState, canStandAt, createCharacter, findStandingY, settlementHits, stepCharacter } from '../src/sim/character';
import { findLanding, homeBannerFor } from '../src/sim/banners';
import { drawnLeaves } from '../src/render/homestead';

type Session = GameSession;
let seq = 0;
function send(s: Session, c: Record<string, unknown>) {
  return s.dispatch({ schema: 3, id: `m012:${seq++}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never);
}
function ticks(s: Session, n: number, each?: (t: number) => void) {
  for (let i = 0; i < n; i++) {
    const r = send(s, { type: 'tick', ticks: 1 });
    assert.ok(r.ok, JSON.stringify(r));
    each?.(s.world.life!.tick);
  }
}
const founded = (rules: 1 | 2 | 3 = 3) => {
  const s = GameSession.genesis(1337, GENERATOR_V2);
  assert.ok(send(s, rules === 1 ? { type: 'found_homestead' } : { type: 'found_homestead', rules }).ok);
  return s;
};
/** Keep every pen supplied so only what a test sets up drives the herder. */
function calm(s: Session) {
  const h = s.world.homestead!;
  for (const e of h.enclosures) { e.water = 30; e.feed = 30; e.grass = 100; e.eggs = 0; }
  for (const a of h.animals) a.product = 0;
}
const cellOf = (dm: number) => Math.floor(dm / DM);
const inside = (s: Session, a: Animal) => {
  const r = facility(s.world.homestead!, SPECIES_RULES[a.species].enclosure)!.rect;
  return a.x >= r.x0 && a.x < r.x1 && a.z >= r.z0 && a.z < r.z1;
};
const gate = (s: Session, id: string) => s.world.homestead!.gates!.find((g) => g.id === id)!.state;

// ---------- animals ----------

test('animals stay inside their closed pens over many ticks, and every move follows the walking grid', () => {
  const s = founded();
  const h = s.world.homestead!;
  assert.equal(h.version, HOMESTEAD_LIVING_VERSION);
  let moved = 0, ate = 0;
  const prev = new Map(h.animals.map((a) => [a.id, { x: a.x, z: a.z, hunger: a.hunger }]));
  ticks(s, 1500, () => {
    if (s.world.life!.tick % 100 === 0) calm(s);
    const g = homesteadNav(s.world, h);
    for (const a of h.animals) {
      assert.ok(inside(s, a), `${a.id} left its pen at tick ${s.world.life!.tick} with every gate closed`);
      const p = prev.get(a.id);
      if (p) {
        if (p.x !== a.x || p.z !== a.z) moved++;
        if (a.hunger < p.hunger - 20) ate++;
        assertGridMove(g, p, a, `${a.id} tick ${s.world.life!.tick}`);
      }
      prev.set(a.id, { x: a.x, z: a.z, hunger: a.hunger });
      assert.equal(a.go, undefined);
    }
  });
  assert.ok(moved > 500, `animals wander (${moved} moves)`);
  assert.ok(ate > 20, `animals eat (${ate} meals)`);
  assert.ok(h.gates!.every((g) => g.state === 'closed'), 'villagers closed every gate they used');
});

/** A move between two ticks never crosses a fence, a closed gate or a blocked corner (open gates only, like an animal). */
function assertGridMove(g: ReturnType<typeof homesteadNav>, a: { x: number; z: number }, b: { x: number; z: number }, what: string) {
  const ax = cellOf(a.x), az = cellOf(a.z), bx = cellOf(b.x), bz = cellOf(b.z);
  if (ax === bx && az === bz) return;
  const o = { openGatesOnly: true, maxExpansions: 0 };
  // At most two cells apart per tick (12 dm/tick driven): reachable in one or two grid moves.
  if (canMove(g, ax, az, bx, bz, o)) return;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (canMove(g, ax, az, ax + dx, az + dz, o) && canMove(g, ax + dx, az + dz, bx, bz, o)) return;
  }
  assert.fail(`${what}: moved from cell ${ax},${az} to ${bx},${bz} across a fence or closed gate`);
}

test('an open gate lets animals out through the gate only; outside they graze near it; closing it keeps the rest in', () => {
  const s = founded();
  const h = s.world.homestead!;
  ticks(s, 20);
  calm(s);
  assert.ok(send(s, { type: 'set_gate', gateId: 'gate:pen', state: 'open' }).ok);
  const pg = penGate(h, 'pen');
  const prev = new Map(h.animals.map((a) => [a.id, { x: a.x, z: a.z, in: inside(s, a) }]));
  const left = new Set<string>();
  // The herder holds no round-up while the owner keeps the gate open.
  ticks(s, 400, () => {
    const g = homesteadNav(s.world, h);
    for (const a of h.animals) {
      const p = prev.get(a.id);
      if (!p) { prev.set(a.id, { x: a.x, z: a.z, in: inside(s, a) }); continue; } // born this tick
      assertGridMove(g, p, a, a.id);
      const now = inside(s, a);
      if (p.in !== now) {
        assert.equal(SPECIES_RULES[a.species].enclosure, 'pen', `${a.id} only pen animals can cross: their gate is the open one`);
        // The crossing is the gate edge: the cells on either side of it.
        const cells = [`${cellOf(p.x)},${cellOf(p.z)}`, `${cellOf(a.x)},${cellOf(a.z)}`];
        assert.ok(cells.includes(`${pg.inside[0]},${pg.inside[1]}`) || cells.includes(`${pg.outside[0]},${pg.outside[1]}`), `${a.id} crossed at ${cells} away from the gate`);
        if (!now) left.add(a.id);
      }
      if (!now) {
        // Strays stay near their gate and outside every pen.
        assert.ok(Math.abs(cellOf(a.x) - pg.outside[0]) <= 13 && Math.abs(cellOf(a.z) - pg.outside[1]) <= 13, `${a.id} wandered off`);
      }
      prev.set(a.id, { x: a.x, z: a.z, in: now });
    }
    for (const v of h.villagers) assert.notEqual(v.task?.kind, 'round_up');
  });
  assert.ok(left.size >= 2, `sheep and goats wandered out through the open gate (${left.size})`);
  // Strays graze the wild grass and do not starve.
  for (const a of straysOf(h, 'pen')) assert.ok(a.hunger < 100);
  for (const id of ['coop', 'sty', 'paddock'] as EnclosureId[]) assert.equal(straysOf(h, id).length, 0, `${id} animals stay in`);
});

test('the herder drives strays back through the gate and shuts it; an owner-locked gate keeps them out', () => {
  const s = founded();
  const h = s.world.homestead!;
  ticks(s, 10);
  assert.ok(send(s, { type: 'set_gate', gateId: 'gate:pen', state: 'open' }).ok);
  ticks(s, 400, () => calm(s));
  const out = straysOf(h, 'pen').length;
  assert.ok(out >= 1, 'some sheep or goats are out');
  // Locked: nobody brings them in (the herder may not open it).
  assert.ok(send(s, { type: 'set_gate', gateId: 'gate:pen', state: 'locked' }).ok);
  ticks(s, 30, () => { calm(s); assert.equal(gate(s, 'gate:pen'), 'locked'); });
  assert.equal(straysOf(h, 'pen').length >= 1, true);
  // Closed: the herder fetches them.
  assert.ok(send(s, { type: 'set_gate', gateId: 'gate:pen', state: 'closed' }).ok);
  let roundUp = false, held = false, home = 0;
  const bram = h.villagers.find((v) => v.role === 'herder')!;
  for (let i = 0; i < 600 && straysOf(h, 'pen').length; i++) {
    ticks(s, 1, () => calm(s));
    if (bram.task?.kind === 'round_up') roundUp = true;
    if (bram.task?.legs[bram.task.leg]?.effect === 'hold_gate' && gate(s, 'gate:pen') === 'open') held = true;
    home = Math.max(home, h.animals.filter((a) => a.go === 'home').length);
  }
  assert.ok(roundUp && held && home >= 1, `round-up seen (${roundUp}), gate held (${held}), driven (${home})`);
  assert.equal(straysOf(h, 'pen').length, 0, 'every stray is back in the pen');
  ticks(s, 40, () => calm(s));
  assert.equal(gate(s, 'gate:pen'), 'closed', 'the herder shut the gate behind them');
  assert.ok(h.animals.every((a) => inside(s, a)));
});

// ---------- villagers ----------

function walkTask(kind: string, target: string, to: { x: number; z: number }, workTicks = 6): NonNullable<Villager['task']> {
  const legs: Leg[] = [{ op: 'walk', x: to.x, z: to.z, ticks: 0, effect: 'none' }, { op: 'work', x: to.x, z: to.z, ticks: workTicks, effect: 'none' }];
  return { kind, target, legs, leg: 0, progress: 0 };
}
const cellKey = (v: { x: number; z: number }) => `${cellOf(v.x)},${cellOf(v.z)}`;

test('villagers never share a cell or a work spot over a working day, and they sleep in their own beds', () => {
  const s = founded();
  const h = s.world.homestead!;
  assert.ok(send(s, { type: 'mark_field', ...findFieldSpot(s.world, 6, 6, 'flax')! }).ok);
  let waits = 0, rested = 0;
  ticks(s, 900, () => {
    const [a, b] = h.villagers;
    assert.notEqual(cellKey(a), cellKey(b), `tick ${s.world.life!.tick}: ${a.name} and ${b.name} share a cell`);
    waits += h.villagers.filter((v) => v.nav?.wait).length;
    if (h.villagers.every((v) => v.task?.kind === 'rest' && v.task.leg === 1)) rested++;
  });
  assert.ok(rested > 20, 'both rested at night');
  // Beds are distinct cells inside the farmhouse.
  const beds = h.villagers.map((v) => bedSpot(h, v));
  assert.notEqual(cellKey(beds[0]), cellKey(beds[1]));
  assert.ok(waits >= 1, 'they made way for each other at least once');
  const store = s.world.life!.stockpiles.get('stockpile:founder')!.inventory;
  assert.ok((store.eggs ?? 0) + (store.wool ?? 0) + (store.milk ?? 0) > 0, 'the farm still works');
});

test('two villagers queue at a narrow gate (the wait is in the saved state) and take distinct work spots', () => {
  const s = founded();
  const h = s.world.homestead!;
  calm(s);
  const pg = penGate(h, 'pen');
  const [ada, bram] = [...h.villagers].sort((a, b) => a.id.localeCompare(b.id));
  // Both in line north of the pen gate, both sent to the pen trough.
  const trough = facility(h, 'pen')!.trough!;
  ada.x = pg.outside[0] * DM + 5; ada.z = (pg.outside[1] - 1) * DM + 5;
  bram.x = pg.outside[0] * DM + 5; bram.z = (pg.outside[1] - 2) * DM + 5;
  for (const v of [ada, bram]) { delete v.nav; v.task = walkTask('feed', `feed:${v === ada ? 'pen' : 'sty'}`, trough, 20); v.hunger = 0; v.energy = 100; }
  // (Night must not interrupt: start at dawn.)
  s.world.life!.tick = 300;
  let queued = '', queuedSnapshotOk = false;
  const spot = new Map<string, string>();
  for (let i = 0; i < 40; i++) {
    ticks(s, 1, () => calm(s));
    assert.notEqual(cellKey(ada), cellKey(bram), `tick ${i}: shared a cell`);
    for (const v of [ada, bram]) if (v.task?.kind === 'feed' && v.task.leg === 1 && !spot.has(v.name)) spot.set(v.name, cellKey(v));
    const w = bram.nav?.wait;
    if (w && /queueing at the pen gate behind Ada/.test(w.reason)) {
      queued = w.reason;
      // The wait is authoritative, saved state: it validates and round-trips.
      const snap = JSON.parse(JSON.stringify(homesteadSnapshot(h)));
      queuedSnapshotOk = JSON.stringify(validateHomestead(snap, s.world.life!.tick)) === JSON.stringify(snap);
    }
  }
  assert.match(queued, /queueing at the pen gate behind Ada/);
  assert.ok(queuedSnapshotOk);
  // Both reached the trough, on different cells (two work spots), and the gate was closed behind them.
  const r = facility(h, 'pen')!.rect;
  assert.equal(spot.size, 2, 'both worked at the trough');
  for (const [name, key] of spot) {
    const [x, z] = key.split(',').map(Number);
    assert.ok(x * DM >= r.x0 && x * DM < r.x1 && z * DM >= r.z0 && z * DM < r.z1, `${name} got in`);
  }
  assert.notEqual(spot.get('Ada'), spot.get('Bram'));
  assert.equal(gate(s, 'gate:pen'), 'closed');
});

test('head-on at a gate: the later villager steps aside, both get through, neither shares a cell', () => {
  const s = founded();
  const h = s.world.homestead!;
  calm(s);
  const pg = penGate(h, 'pen');
  const [ada, bram] = [...h.villagers].sort((a, b) => a.id.localeCompare(b.id));
  ada.x = pg.inside[0] * DM + 5; ada.z = (pg.inside[1] + 1) * DM + 5;   // inside, going out
  bram.x = pg.outside[0] * DM + 5; bram.z = (pg.outside[1] - 1) * DM + 5; // outside, going in
  const yard = { x: pg.outside[0] * DM + 5, z: (pg.outside[1] - 4) * DM + 5 };
  const pen = { x: pg.inside[0] * DM + 5, z: (pg.inside[1] + 3) * DM + 5 };
  for (const v of [ada, bram]) { delete v.nav; v.hunger = 0; v.energy = 100; }
  ada.task = walkTask('store', 'carry:villager:0', yard, 30);
  bram.task = walkTask('feed', 'feed:pen', pen, 30);
  s.world.life!.tick = 300;
  let aside = false;
  const arrived = new Set<string>();
  let shut: string | null = null;
  const at = (v: Villager, p: { x: number; z: number }) => Math.abs(v.x - p.x) <= 10 && Math.abs(v.z - p.z) <= 10;
  for (let i = 0; i < 40; i++) {
    ticks(s, 1, () => calm(s));
    assert.notEqual(cellKey(ada), cellKey(bram), `tick ${i}: shared a cell`);
    if (/stepping aside/.test(bram.nav?.wait?.reason ?? '')) aside = true;
    if (at(ada, yard)) arrived.add('Ada');
    if (at(bram, pen)) arrived.add('Bram');
    if (arrived.size === 2 && shut === null) shut = gate(s, 'gate:pen');
  }
  assert.ok(arrived.has('Ada') && arrived.has('Bram'), `both got through (${[...arrived]})`);
  assert.ok(aside, 'the standoff was broken by Bram (the later id) stepping aside');
  assert.equal(shut, 'closed', 'the gate was shut behind them');
});

// ---------- the player ----------

function residentAround(world: World, x: number, z: number, r = 2) {
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) ensureChunk(world, worldToChunkX(x) + dx, worldToChunkZ(z) + dz);
}
function placeAt(world: World, x: number, z: number): CharacterState {
  const y = findStandingY(world, x, z, 60)!;
  assert.ok(y !== null);
  let c = createCharacter(x, y, z);
  for (let i = 0; i < 20; i++) c = stepCharacter(world, c, { moveX: 0, moveZ: 0, run: false, jump: false });
  return c;
}
function walk(world: World, c: CharacterState, dx: number, dz: number, steps: number, each?: (c: CharacterState) => void): CharacterState {
  for (let i = 0; i < steps; i++) { c = stepCharacter(world, c, { moveX: dx, moveZ: dz, run: false, jump: false }); each?.(c); }
  return c;
}

test('the player is stopped by fences, closed gates and buildings, walks through an open gate, and opens gates by hand (journaled) from either side', () => {
  const s = founded();
  const world = s.world, h = world.homestead!;
  const pg = penGate(h, 'pen');
  residentAround(world, pg.outside[0], pg.outside[1]);
  assert.ok(settlementCollision(world), 'the structure layer is there');
  const fenceZ = pg.inside[1]; // the pen's -z fence line (metres)
  // 1. Straight into the fence two metres west of the gate: stopped on the outside.
  let c = placeAt(world, pg.inside[0] - 1.5, fenceZ - 2);
  c = walk(world, c, 0, 1, 90, (k) => assert.ok(k.z < fenceZ - CHARACTER_RADIUS + 0.09, `through the fence at z ${k.z}`));
  assert.ok(c.z > fenceZ - 0.5, 'it walked up to the fence');
  // 2. Into the closed gate: stopped too.
  c = placeAt(world, pg.inside[0] + 0.5, fenceZ - 2);
  c = walk(world, c, 0, 1, 90);
  assert.ok(c.z < fenceZ - CHARACTER_RADIUS + 0.09, 'a closed gate holds the player');
  // 3. Use (E / the Use button) next to it issues the journaled set_gate.
  const use = nearbyGate(world, c.x, c.z)!;
  assert.equal(use.gateId, 'gate:pen');
  assert.equal(use.label, 'Open the pen gate');
  const before = s.journal.entries.length;
  const r = send(s, use.command);
  assert.ok(r.ok);
  assert.equal(s.journal.entries.length, before + 1);
  assert.equal(s.journal.entries.at(-1)!.command.type, 'set_gate');
  // 4. Through the open gate into the pen.
  c = walk(world, c, 0, 1, 15);
  assert.ok(c.z > fenceZ + 1, `in the pen (${c.z})`);
  // 5. Shut in: the gate can be opened from inside the same way, and the player walks out.
  assert.ok(send(s, nearbyGate(world, c.x, c.z)!.command).ok); // closes it
  assert.equal(gate(s, 'gate:pen'), 'closed');
  c = walk(world, c, 0, -1, 60);
  assert.ok(c.z > fenceZ, 'the closed gate holds from inside too');
  const fromInside = nearbyGate(world, c.x, c.z)!;
  assert.equal(fromInside.next, 'open');
  assert.ok(send(s, fromInside.command).ok);
  c = walk(world, c, 0, -1, 60);
  assert.ok(c.z < fenceZ - 1, 'out again');
  // 6. Locked by the owner, Use unlocks and opens it: the player is never sealed in.
  assert.ok(send(s, { type: 'set_gate', gateId: 'gate:pen', state: 'locked' }).ok);
  const unlock = nearbyGate(world, pg.inside[0] + 0.5, fenceZ + 0.6)!;
  assert.equal(unlock.label, 'Unlock and open the pen gate');
  assert.equal(unlock.command.state, 'open');
  // 7. A gate shut on the player standing in it never holds them: they walk out either way.
  assert.ok(send(s, unlock.command).ok);
  let mid = placeAt(world, pg.inside[0] + 0.5, fenceZ);
  assert.ok(send(s, { type: 'set_gate', gateId: 'gate:pen', state: 'closed' }).ok);
  assert.ok(settlementHits(world, mid.x, mid.y, mid.z).length > 0, 'standing in the shut gate');
  mid = walk(world, mid, 0, 1, 45);
  assert.ok(mid.z > fenceZ + 0.5, 'walked out of the shut gate into the pen');
  // 8. A building: the farmhouse wall, then its door.
  const door = homesteadGates(h).find((g) => g.id === 'door:farmhouse')!;
  const wallZ = door.z + 1; // front wall face
  residentAround(world, door.x, door.z);
  let p = placeAt(world, door.x - 2.5, wallZ + 2.5);
  p = walk(world, p, 0, -1, 90);
  assert.ok(p.z >= wallZ + CHARACTER_RADIUS - 0.09, `the wall holds (${p.z})`);
  p = placeAt(world, door.x + 0.5, wallZ + 2.5);
  p = walk(world, p, 0, -1, 90);
  assert.ok(p.z >= wallZ + CHARACTER_RADIUS - 0.09, 'the closed door holds');
  assert.equal(nearbyGate(world, p.x, p.z)!.gateId, 'door:farmhouse');
  assert.ok(send(s, nearbyGate(world, p.x, p.z)!.command).ok);
  p = walk(world, p, 0, -1, 90);
  assert.ok(p.z < wallZ && p.z >= door.z + CHARACTER_RADIUS - 0.09, `in the doorway, not through the house (${p.z})`);
  // The door swings shut behind (a villager, say): Use opens it from inside.
  assert.ok(send(s, { type: 'set_gate', gateId: 'door:farmhouse', state: 'closed' }).ok);
  assert.ok(send(s, nearbyGate(world, p.x, p.z)!.command).ok);
  p = walk(world, p, 0, 1, 60);
  assert.ok(p.z > wallZ + 1, 'out of the house');
});

test('the structure layer is the walking grid: fence edges, gates by state and building cells; jumps and banners still work', () => {
  const s = founded();
  const world = s.world, h = world.homestead!;
  const g = homesteadNav(world, h);
  const house = facility(h, 'farmhouse')!.rect;
  const hx = cellOf(house.x0) + 1, hz = cellOf(house.z0) + 1;
  assert.equal(g.solid[g.index(hx, hz)], SOLID.building);
  const trough = facility(h, 'pen')!.trough!;
  assert.equal(g.solid[g.index(cellOf(trough.x), cellOf(trough.z))], SOLID.low);
  // The v3 bed cells are walkable for villagers but stay solid for bodies (the interior is not drawn).
  const bed = bedSpot(h, h.villagers[0]);
  assert.equal(g.block[g.index(cellOf(bed.x), cellOf(bed.z))], 0);
  assert.equal(g.solid[g.index(cellOf(bed.x), cellOf(bed.z))], SOLID.building);
  // Gate edge: counted while closed or locked, not while open.
  const pg = penGate(h, 'pen');
  const y = g.ground[g.index(pg.inside[0], pg.inside[1])];
  const at = (st: 'open' | 'closed' | 'locked') => structureHits(g, () => st, pg.inside[0] + 0.5, y, pg.inside[1], CHARACTER_RADIUS, 1.7).length;
  assert.ok(at('closed') > 0 && at('locked') > 0);
  assert.equal(at('open'), 0);
  // A plain jump does not clear a fence (the fence is 1.15 m, a jump 0.99 m).
  residentAround(world, pg.outside[0], pg.outside[1]);
  let c = placeAt(world, pg.inside[0] - 1.5, pg.inside[1] - 1.2);
  for (let i = 0; i < 60; i++) c = stepCharacter(world, c, { moveX: 0, moveZ: 1, run: false, jump: i === 5 });
  assert.ok(c.z < pg.inside[1], 'a single jump stays outside');
  // Banner safe landing never lands in a fence, gate or building; the real home banner still has one.
  const home = homeBannerFor({ x: -18, z: -18 });
  residentAround(world, home.x, home.z);
  const land = findLanding(world, home.x, home.z, null);
  assert.ok(land.ok);
  if (land.ok) assert.equal(settlementHits(world, land.x, land.y, land.z).length, 0);
  const hy = g.ground[g.index(hx, hz)];
  residentAround(world, hx, hz);
  assert.equal(canStandAt(world, hx + 0.5, hy, hz + 0.5), false, 'never inside the farmhouse');
});

// ---------- the farmhouse door ----------

test('the drawn door and gate leaves follow the simulated state, with no new meshes', async () => {
  const s = founded();
  const h = s.world.homestead!;
  const { HomesteadView } = await import('../src/render/homestead');
  const view = new HomesteadView(s.world, 2);
  const meshes = () => { let n = 0; view.group.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) n++; }); return n; };
  view.update(0.016);
  const n0 = meshes();
  const shapes = new Set<string>();
  for (const st of ['open', 'locked', 'closed'] as const) {
    assert.ok(send(s, { type: 'set_gate', gateId: 'door:farmhouse', state: st }).ok);
    assert.ok(send(s, { type: 'set_gate', gateId: 'gate:pen', state: st }).ok);
    view.update(0.016);
    const m = view.metrics() as { leaves: Record<string, string> };
    assert.deepEqual(m.leaves, Object.fromEntries(h.gates!.map((g) => [g.id, g.state])), `drawn = simulated (${st})`);
    assert.deepEqual(m.leaves, drawnLeaves(h));
    assert.equal(m.leaves['door:farmhouse'], st);
    assert.equal(meshes(), n0, 'the door is part of the existing troughs and gates mesh');
    const troughs = view.group.getObjectByName('homestead_troughs') as unknown as { geometry: { attributes: { position: { array: ArrayLike<number> } } } };
    const pos = troughs.geometry.attributes.position.array;
    let sum = 0; for (let i = 0; i < pos.length; i += 7) sum += pos[i] * ((i % 13) + 1);
    shapes.add(sum.toFixed(2));
  }
  assert.equal(shapes.size, 3, 'open, locked and closed draw three different door shapes');
});

// ---------- save compatibility and determinism ----------

test('old saves: v1 and v2 runs keep their pre-M012 hashes; v2 saves load byte-identical; upgrading to v3 is one journaled command', () => {
  // Hashes measured with the M011 build (commit b1dcdd8) for the same command sequence.
  const run = (rules: 1 | 2) => {
    const s = founded(rules);
    assert.ok(send(s, { type: 'mark_field', ...findFieldSpot(s.world, 5, 4, 'potato')! }).ok);
    ticks(s, 300);
    if (rules === 2) assert.ok(send(s, { type: 'set_gate', gateId: 'gate:pen', state: 'open' }).ok);
    ticks(s, 100);
    return s;
  };
  const v1 = run(1), v2 = run(2);
  assert.equal(v1.stateHash, '16ca4c350d98096f');
  assert.equal(v2.stateHash, '542411888c83bf3a');
  // v2 animals ignore the open gate (legacy rule) and nobody has v3 fields.
  const snap = JSON.stringify(v2.snapshot);
  assert.ok(!/"go"|"wait"/.test(snap));
  assert.ok(v2.world.homestead!.animals.every((a) => inside(v2, a)));
  const restored = GameSession.restore(JSON.parse(snap), JSON.parse(JSON.stringify(v2.journal)));
  assert.equal(restored.stateHash, v2.stateHash);
  assert.equal(JSON.stringify(restored.snapshot), snap, 'byte-identical');
  // Upgrade v2 -> v3 (and v1 -> v3) through the journal.
  for (const s of [v2, v1]) {
    const pre = JSON.stringify(s.snapshot);
    const up = send(s, { type: 'upgrade_homestead', rules: 3 });
    assert.ok(up.ok && up.outcome.type === 'upgrade_homestead' && up.outcome.version === 3, JSON.stringify(up));
    assert.equal(s.world.homestead!.version, 3);
    assert.equal(send(s, { type: 'upgrade_homestead', rules: 3 }).ok, false, 'once');
    assert.ok(s.world.homestead!.gates!.length === 5);
    ticks(s, 200);
    assert.equal(GameSession.replay(JSON.parse(JSON.stringify(s.journal))).stateHash, s.stateHash, 'replays');
    assert.equal(GameSession.restore(JSON.parse(pre), JSON.parse(JSON.stringify(s.journal))).stateHash, s.stateHash, 'old snapshot + journal');
  }
});

test('v3 is deterministic: two runs, replay from genesis, restore mid-run and dropped caches agree, gates and strays included', () => {
  const run = () => {
    const s = founded();
    assert.ok(send(s, { type: 'mark_field', ...findFieldSpot(s.world, 5, 4, 'potato')! }).ok);
    ticks(s, 120);
    assert.ok(send(s, { type: 'set_gate', gateId: 'gate:pen', state: 'open' }).ok);
    assert.ok(send(s, { type: 'set_gate', gateId: 'gate:sty', state: 'open' }).ok);
    ticks(s, 150);
    return s;
  };
  const a = run(), b = run();
  assert.equal(a.stateHash, b.stateHash);
  const h = a.world.homestead!;
  assert.ok(h.animals.some((x) => !inside(a, x)), 'strays exist in the saved state');
  const snap = JSON.parse(JSON.stringify(a.snapshot));
  assert.ok(send(a, { type: 'set_gate', gateId: 'gate:pen', state: 'closed' }).ok);
  assert.ok(send(a, { type: 'set_gate', gateId: 'gate:sty', state: 'closed' }).ok);
  ticks(a, 200);
  assert.equal(GameSession.replay(JSON.parse(JSON.stringify(a.journal))).stateHash, a.stateHash);
  assert.equal(GameSession.restore(snap, JSON.parse(JSON.stringify(a.journal))).stateHash, a.stateHash);
  resetNavCache(b.world);
  assert.ok(send(b, { type: 'set_gate', gateId: 'gate:pen', state: 'closed' }).ok);
  assert.ok(send(b, { type: 'set_gate', gateId: 'gate:sty', state: 'closed' }).ok);
  ticks(b, 200);
  assert.equal(b.stateHash, a.stateHash);
  assert.ok(navStats(a.world).ticks > 0);
});

test('genesis is unchanged; v3 commands and fields are strictly validated', () => {
  assert.equal(GameSession.genesis(1337).stateHash, 'e659504b056654dc');
  const s = founded(2);
  const hash = s.stateHash;
  for (const bad of [{ type: 'upgrade_homestead', rules: 2 }, { type: 'upgrade_homestead', rules: 6 }, { type: 'found_homestead', rules: 6 }]) { // Stage B made rules 4 valid, M013 made 5 valid
    const r = send(s, bad);
    assert.ok(!r.ok && r.code === 'invalid_command', JSON.stringify(bad));
  }
  assert.equal(s.stateHash, hash);
  // v3-only fields are rejected in a v2 snapshot.
  const snap = JSON.parse(JSON.stringify(homesteadSnapshot(s.world.homestead!)));
  snap.animals[0].go = 'out';
  assert.throws(() => validateHomestead(snap, s.world.life!.tick));
  const v3 = founded(3);
  const ok = JSON.parse(JSON.stringify(homesteadSnapshot(v3.world.homestead!)));
  ok.animals[0].go = 'out';
  assert.doesNotThrow(() => validateHomestead(ok, v3.world.life!.tick));
  ok.animals[0].go = 'away';
  assert.throws(() => validateHomestead(ok, v3.world.life!.tick));
});
