// W4 follow-up: the storage shed, built for real from W4 materials (no W6
// material is involved): a finished workbench, a hammer crafted at it, planks
// split from logs, a wooden chest, stones and logs. Then real storage: deposit,
// withdraw, the 300-weight capacity, reservations held in the shed, and the
// stock surviving replay, snapshot restore and a browser-store reload.
// Every change is a journaled command (tests/w4-harness.ts `send`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import { validateWorldSnapshot } from '../src/sim/snapshot';
import { BrowserSaveStore, KeyValueStorage } from '../src/app/persistence';
import { GENERATOR_V2, WILDERNESS } from '../src/sim/world';
import { CARRY_CAPACITY, ITEM_WEIGHT, carriedWeight } from '../src/sim/gathering';
import { buildingDef } from '../src/sim/catalogue';
import { freeIn, freeInBag, lockReasons, siteSpotOf, stockWeight } from '../src/sim/wild-build';
import {
  SPAWN, axe, build, clone, code, deliverAll, dm, gather, load, logPiles, ok, placeAt, reasons, send, spot, stashLogs, takeLogs, unload, wild, workAll,
} from './w4-harness';

class MemoryStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

const SHED = buildingDef('storage_shed')!;
/** Where the shed's planks and chest are put down before placing (within the 24 m funding reach of a shed by SPAWN). */
const STASH = { x: SPAWN.x + 2.5, z: SPAWN.z - 4.5 };

/** A world with a finished workbench, a hammer, and the shed's planks and chest lying by the camp. */
function shedReady(): { s: GameSession; bench: string; at: { x: number; z: number } } {
  const s = wild();
  load(s);
  axe(s);
  // Locked before the bench and the hammer, and it says why; it is a W4 building (no W6 material).
  assert.match(lockReasons(s.world, SHED).join('; '), /needs a finished workbench.*needs a hammer/);
  assert.deepEqual(Object.keys(SHED.materials).sort(), ['chest', 'log', 'plank', 'stone']);
  assert.equal(code(send(s, { type: 'place_site', kind: 'storage_shed', x: Math.floor(SPAWN.x) + 3, z: Math.floor(SPAWN.z) + 3, rot: 0, at: dm(SPAWN) })), 'locked');
  const bench = build(s, 'workbench', SPAWN);
  const at = dm(siteSpotOf(s.world.wild!.build!.sites.get(bench)!));
  unload(s);
  assert.match(lockReasons(s.world, SHED).join('; '), /hammer/, 'the bench alone is not enough');
  gather(s, 'branch', 1); gather(s, 'loose_stone', 1); gather(s, 'fiber_plant', 2);
  ok(send(s, { type: 'craft', recipe: 'cord' }), 'cord');
  ok(send(s, { type: 'craft', recipe: 'hammer', at }), 'hammer');
  assert.deepEqual(lockReasons(s.world, SHED), [], 'unlocked: a finished workbench and a hammer');
  // Ten planks (five logs split at the bench, one at a time: a log weighs 9) and a chest from four of them.
  let planks = 0;
  for (let i = 0; i < 5; i++) {
    if (!takeLogs(s, 1, STASH)) { logPiles(s, 2); assert.equal(takeLogs(s, 1, STASH), 1, 'a log to split'); }
    ok(send(s, { type: 'craft', recipe: 'planks', at }), 'planks');
    planks += 2;
    if (i === 1) {
      gather(s, 'fiber_plant', 2); ok(send(s, { type: 'craft', recipe: 'cord' }), 'cord');
      ok(send(s, { type: 'craft', recipe: 'wooden_chest', at }), 'chest');
      planks -= 4;
      ok(send(s, { type: 'drop', item: 'chest', n: 1, at: dm(STASH) }), 'put the chest down');
    }
    if (i > 0 && freeInBag(s.world, 'plank')) ok(send(s, { type: 'drop', item: 'plank', n: freeInBag(s.world, 'plank'), at: dm(STASH) }), 'put the planks down');
  }
  assert.equal(planks, 6);
  unload(s);
  return { s, bench, at };
}

test('the storage shed is built from W4 materials: bench, hammer, planks, chest, stone and logs; placing reserves all of them; it takes 12 hammer swings', () => {
  const { s } = shedReady();
  const piles = [...s.world.wild!.piles.values()];
  const near = (p: { x: number; z: number }) => Math.hypot(p.x - STASH.x, p.z - STASH.z) < 2;
  assert.equal(piles.filter((p) => p.item === 'plank' && near(p)).reduce((n, p) => n + p.qty, 0), 6, 'six planks lie by the camp');
  assert.equal(piles.filter((p) => p.item === 'chest' && near(p)).reduce((n, p) => n + p.qty, 0), 1, 'and the chest');
  stashLogs(s, 2, SPAWN);
  gather(s, 'loose_stone', 4);
  const p = spot(s, 'storage_shed', SPAWN);
  const h0 = s.stateHash;
  const id = placeAt(s, 'storage_shed', p, 0, SPAWN);
  assert.notEqual(s.stateHash, h0);
  const site = s.world.wild!.build!.sites.get(id)!;
  const reserved: Record<string, number> = {};
  for (const b of Object.values(site.reserved)) for (const [k, n] of Object.entries(b)) reserved[k] = (reserved[k] ?? 0) + n;
  assert.deepEqual(reserved, SHED.materials, 'the whole material list is reserved');
  assert.deepEqual(site.reserved.bag, { stone: 4 });
  const inPiles = (item: string) => Object.entries(site.reserved).filter(([k]) => k.startsWith('d:')).reduce((n, [, b]) => n + (b[item] ?? 0), 0);
  assert.deepEqual([inPiles('plank'), inPiles('chest'), inPiles('log')], [6, 1, 2], 'planks, chest and logs reserved where they lie');
  deliverAll(s, id);
  assert.deepEqual(site.reserved, {});
  const hammer = s.world.wild!.tools.find((t) => t.kind === 'hammer')!;
  const before = hammer.durability;
  ok(workAll(s, id), 'built');
  assert.equal(site.state, 'done');
  assert.deepEqual(site.consumed, SHED.materials);
  assert.equal(before - hammer.durability, SHED.work, 'every swing wears the hammer');
  assert.equal(SHED.work, 12);
  assert.deepEqual(site.stock, {});
  validateWorldSnapshot(clone(s.snapshot));
});

test('the storage shed stores and returns items, holds exactly 300 weight, keeps reserved stock for its site, and survives replay, restore and reload', () => {
  const { s } = shedReady();
  stashLogs(s, 2, SPAWN);
  gather(s, 'loose_stone', 4);
  const id = placeAt(s, 'storage_shed', spot(s, 'storage_shed', SPAWN), 0, SPAWN);
  deliverAll(s, id);
  ok(workAll(s, id));
  const shed = s.world.wild!.build!.sites.get(id)!;
  const sat = dm(siteSpotOf(shed));
  const cap = (SHED.function as { capacity: number }).capacity;
  assert.equal(cap, 300);
  // Deposit and withdraw.
  gather(s, 'loose_stone', 5);
  const bagBefore = s.world.wild!.items.stone;
  ok(send(s, { type: 'store_items', siteId: id, item: 'stone', n: 5, at: sat }), 'store 5 stones');
  assert.deepEqual(shed.stock, { stone: 5 });
  assert.equal(s.world.wild!.items.stone ?? 0, bagBefore - 5);
  ok(send(s, { type: 'take_items', siteId: id, item: 'stone', n: 2, at: sat }), 'take 2 back');
  assert.deepEqual(shed.stock, { stone: 3 });
  assert.equal(s.world.wild!.items.stone, bagBefore - 3);
  assert.equal(code(send(s, { type: 'take_items', siteId: id, item: 'stone', n: 4, at: sat })), 'missing');
  assert.equal(code(send(s, { type: 'store_items', siteId: id, item: 'stone', n: 1, at: dm({ x: SPAWN.x + 40, z: SPAWN.z }) })), 'out_of_reach');
  ok(send(s, { type: 'store_items', siteId: id, item: 'stone', n: 2, at: sat }));
  // Fill it with stones and branches (2 weight each), a bag at a time, up to the capacity.
  let guard = 0;
  while (stockWeight(shed.stock) < cap - 1 && guard++ < 40) {
    const room = Math.floor((CARRY_CAPACITY - carriedWeight(s.world.wild!)) / 2);
    const left = Math.floor((cap - stockWeight(shed.stock)) / 2);
    const n = Math.min(room, left);
    const kind = guard % 2 ? 'loose_stone' : 'branch', item = kind === 'branch' ? 'branch' : 'stone';
    gather(s, kind, n);
    ok(send(s, { type: 'store_items', siteId: id, item, n: Math.min(freeInBag(s.world, item), left), at: sat }), `fill with ${item}`);
  }
  assert.equal(stockWeight(shed.stock), cap, 'exactly full');
  gather(s, 'loose_stone', 1);
  const full = send(s, { type: 'store_items', siteId: id, item: 'stone', n: 1, at: sat });
  assert.equal(code(full), 'full');
  assert.match(reasons(full).join(';'), /storage shed is full \(300\/300\)/);
  assert.ok(stockWeight(shed.stock) <= cap);
  // The bag's own limit applies to withdrawals.
  for (let i = 0; i < 20 && carriedWeight(s.world.wild!) + ITEM_WEIGHT.stone <= CARRY_CAPACITY; i++) gather(s, 'loose_stone', 1);
  assert.equal(code(send(s, { type: 'take_items', siteId: id, item: 'stone', n: 1, at: sat })), 'capacity');
  unload(s);
  // Reservations held in the shed: a campfire placed by it reserves its 6 stones there (the bag is empty; no stone pile is near).
  const stoneIn = shed.stock!.stone, branchIn = shed.stock!.branch;
  const fire = placeAt(s, 'campfire', spot(s, 'campfire', SPAWN), 0, SPAWN);
  const fs = s.world.wild!.build!.sites.get(fire)!;
  assert.equal(fs.reserved[id]?.stone, 6, JSON.stringify(fs.reserved));
  assert.equal(fs.reserved.bag, undefined);
  assert.equal(freeIn(s.world, id, 'stone'), stoneIn - 6);
  // Take every free stone; then a plain withdrawal of a reserved one is refused (it cannot be used for anything else).
  let taken = 0;
  while (freeIn(s.world, id, 'stone') > 0 && carriedWeight(s.world.wild!) + 2 <= CARRY_CAPACITY) { ok(send(s, { type: 'take_items', siteId: id, item: 'stone', n: 1, at: sat })); taken++; }
  unload(s);
  while (freeIn(s.world, id, 'stone') > 0) { ok(send(s, { type: 'take_items', siteId: id, item: 'stone', n: 1, at: sat })); taken++; if (carriedWeight(s.world.wild!) + 2 > CARRY_CAPACITY) unload(s); }
  assert.equal(taken, stoneIn - 6);
  assert.deepEqual([shed.stock!.stone, freeIn(s.world, id, 'stone')], [6, 0]);
  const h1 = s.stateHash;
  const refused = send(s, { type: 'take_items', siteId: id, item: 'stone', n: 1, at: sat });
  assert.equal(code(refused), 'reserved');
  assert.match(reasons(refused).join(';'), /reserved for your building sites/);
  assert.equal(s.stateHash, h1, 'a refusal changes nothing');
  // Taken for its site, a reserved stone stays reserved, now in the bag, and cannot be crafted with or stored back as free stock.
  unload(s);
  ok(send(s, { type: 'take_items', siteId: id, item: 'stone', n: 1, at: sat, forSite: fire }), 'take for the campfire');
  assert.deepEqual([fs.reserved[id].stone, fs.reserved.bag], [5, { stone: 1 }]);
  assert.equal(freeInBag(s.world, 'stone'), 0);
  assert.equal(code(send(s, { type: 'store_items', siteId: id, item: 'stone', n: 1, at: sat })), 'reserved');
  assert.equal(code(send(s, { type: 'drop', item: 'stone', n: 1, at: sat })), 'reserved');
  assert.equal(shed.stock!.branch, branchIn, 'reserving moves nothing: the branches stay in the shed');
  // Persistence: replay from genesis, snapshot restore, and the browser store reload keep the stock and the reservations.
  const stock = clone(shed.stock), res = clone(fs.reserved);
  assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'replays from genesis');
  validateWorldSnapshot(clone(s.snapshot));
  const r = GameSession.restore(clone(s.snapshot), clone(s.journal));
  assert.equal(r.stateHash, s.stateHash);
  const storage = new MemoryStorage();
  assert.ok(new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w1' }).save(s).ok);
  const again = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w1' }).load();
  assert.equal(again.status, 'restored', again.message);
  assert.equal(again.session.stateHash, s.stateHash);
  const back = again.session.world.wild!.build!.sites;
  assert.deepEqual([back.get(id)!.stock, back.get(fire)!.reserved], [stock, res]);
  assert.equal(code(send(again.session, { type: 'take_items', siteId: id, item: 'stone', n: 1, at: sat })), 'reserved', 'still reserved after the reload');
  // A stock over the capacity is refused in a snapshot.
  const snap = clone(s.snapshot) as unknown as { wild: { build: { sites: Array<{ id: string; stock?: Record<string, number> }> } } };
  snap.wild.build.sites.find((x) => x.id === id)!.stock = { stone: 151 };
  assert.throws(() => validateWorldSnapshot(snap as never), /stock weight/);
});
