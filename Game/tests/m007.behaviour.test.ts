import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2, ensureChunk } from '../src/sim/world';
import { spawnChunkFauna, stepCreature } from '../src/sim/fauna';
import { SPECIES_RULES, HUNGER_MEAL, stepHomestead, homesteadSnapshot } from '../src/sim/homestead';

function send(s: GameSession, c: Record<string, unknown>) {
  return s.dispatch({ schema: 3, id: `test:${s.nextSequence}:${String(c.type)}`, expectedRevision: s.world.revision, ...c });
}
const founded = () => {
  const s = GameSession.genesis(1337, GENERATOR_V2);
  assert.ok(send(s, { type: 'found_homestead' }).ok);
  return s;
};

test('feeding: a hungry animal eats pasture first, then trough feed, and not without water', () => {
  const s = founded();
  const w = s.world, h = w.homestead!;
  h.villagers = [];
  const sheep = h.animals.find((a) => a.species === 'sheep')!;
  const encl = h.enclosures.find((e) => e.id === 'pen')!;
  const rule = SPECIES_RULES.sheep;
  // Pasture available: grazes, hunger falls by one meal, grass falls.
  for (const a of h.animals) if (a !== sheep) a.hunger = 0;
  sheep.hunger = HUNGER_MEAL; encl.grass = 100; encl.water = 10; encl.feed = 5;
  stepHomestead(w, ++w.life!.tick);
  assert.ok(sheep.hunger < HUNGER_MEAL, 'ate');
  assert.ok(encl.grass < 100 && encl.water < 10);
  assert.equal(encl.feed, 5, 'pasture was used, not the trough');
  // Bare pasture: walks to the trough and eats feed.
  sheep.hunger = HUNGER_MEAL; encl.grass = 0; encl.water = 10; encl.feed = 5;
  for (let i = 0; i < 40 && sheep.hunger >= HUNGER_MEAL; i++) { encl.grass = 0; stepHomestead(w, ++w.life!.tick); }
  assert.ok(sheep.hunger < HUNGER_MEAL, 'ate from the trough');
  assert.equal(encl.feed, 5 - rule.feed);
  // No water: it does not eat, and keeps getting hungrier.
  sheep.hunger = HUNGER_MEAL; encl.grass = 100; encl.water = 0;
  const before = sheep.hunger;
  for (let i = 0; i < 6; i++) { encl.water = 0; encl.grass = 100; stepHomestead(w, ++w.life!.tick); }
  assert.ok(sheep.hunger > before, 'no meal without water');
});

test('reproduction: a fed adult female with an adult male gives birth after gestation, once', () => {
  const s = founded();
  const w = s.world, h = w.homestead!;
  h.villagers = [];
  h.animals = h.animals.filter((a) => a.species === 'pig');
  const rule = SPECIES_RULES.pig;
  const tick = w.life!.tick = 1000;
  h.animals = [
    { id: 'animal:900', species: 'pig', sex: 'f', born: 0, x: 0, z: 0, tx: 0, tz: 0, hunger: 0, starving: 0, product: 0, pregnantUntil: tick },
    { id: 'animal:901', species: 'pig', sex: 'm', born: 0, x: 0, z: 0, tx: 0, tz: 0, hunger: 0, starving: 0, product: 0, pregnantUntil: 0 },
  ];
  for (const e of h.enclosures) { e.grass = 100; e.water = 30; e.feed = 30; }
  const first = h.nextId;
  stepHomestead(w, tick);
  assert.equal(h.animals.length, 2 + rule.litter, 'a litter was born');
  const kids = h.animals.filter((a) => a.born === tick);
  assert.equal(kids.length, rule.litter);
  assert.deepEqual(kids.map((k) => k.id), Array.from({ length: rule.litter }, (_, i) => `animal:${String(first + i).padStart(3, '0')}`));
  assert.ok(kids.every((k) => k.pregnantUntil === 0));
  stepHomestead(w, tick + 1);
  assert.equal(h.animals.length, 2 + rule.litter, 'no second litter next tick');
});

test('ambient fauna is not part of the saved or hashed world', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2);
  for (let i = 0; i < 5; i++) assert.ok(send(s, { type: 'tick', ticks: 1 }).ok);
  const world = s.world;
  for (let cz = 29; cz <= 31; cz++) for (let cx = 29; cx <= 31; cx++) ensureChunk(world, cx, cz);
  const hashBefore = s.stateHash;
  const snapshotBefore = JSON.stringify(s.snapshot);
  const creatures = [];
  for (let cz = 29; cz <= 31; cz++) for (let cx = 29; cx <= 31; cx++) creatures.push(...spawnChunkFauna(world, cx, cz));
  assert.ok(creatures.length > 0, 'wildlife exists');
  for (let i = 0; i < 200; i++) for (const c of creatures) stepCreature(world, c, { threats: [], night: false });
  assert.equal(s.stateHash, hashBefore, 'stepping wildlife leaves the state hash alone');
  assert.equal(JSON.stringify(s.snapshot), snapshotBefore, 'and the saved snapshot');
  assert.ok(!/"(fox|wolf|rabbit|deer)"/.test(snapshotBefore), 'no wildlife species in the save');
  // An older save (journal made before wildlife existed) replays to the same hash.
  const replay = GameSession.replay(JSON.parse(JSON.stringify(s.journal)));
  assert.equal(replay.stateHash, hashBefore);
});

test('a homestead save replays to the same hash and animals regardless of wildlife', () => {
  const s = founded();
  for (let i = 0; i < 300; i++) assert.ok(send(s, { type: 'tick', ticks: 1 }).ok);
  const world = s.world;
  for (let cz = 29; cz <= 31; cz++) for (let cx = 29; cx <= 31; cx++) ensureChunk(world, cx, cz);
  const creatures = spawnChunkFauna(world, 30, 30);
  for (const c of creatures) stepCreature(world, c, { threats: [], night: false });
  const again = GameSession.replay(JSON.parse(JSON.stringify(s.journal)));
  assert.equal(again.stateHash, s.stateHash);
  assert.deepEqual(homesteadSnapshot(again.world.homestead!), homesteadSnapshot(s.world.homestead!));
});
