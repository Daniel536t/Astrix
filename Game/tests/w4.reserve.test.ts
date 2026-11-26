// W4 completion (owner requirements on the uncommitted W4 work):
// - Resource reservation (owner decision 1, option A): placing reserves the whole building from free
//   materials in the bag, nearby piles and storage, through the shared ledger M014 uses
//   (sim/reservation.ts); reserved items are refused to crafting, dropping, storing, fuel, plain pickups
//   and withdrawals and to other sites; they move only on purpose (for the site, or with a death) and keep
//   their reservation; delivery, consumption by stage, cancellation releasing them.
// - The player is never covered or shut in by a footprint, in every rotation.
// - Construction history: a snapshot's sites must be proven by their materials (reserved + delivered +
//   consumed), and a finished building by exactly its consumed materials.
// - Respawn needs a recorded, plausible death and a claimed, finished, intact lean-to (or the spawn).
// - Command authorization: one wilderness allow-list, no bypass, no catalogue id shared with the settlement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession, validateJournal } from '../src/app/session';
import { validateWorldSnapshot } from '../src/sim/snapshot';
import { GENERATOR_V2, waterDepthAt } from '../src/sim/world';
import { emptyFeatures, navGridFull } from '../src/sim/nav';
import { footprintCells } from '../src/sim/placement';
import { BUILD_CATALOGUE, buildingDef } from '../src/sim/catalogue';
import { SITE_RULES } from '../src/sim/homestead';
import { WILDERNESS_COMMANDS } from '../src/sim/wilderness';
import { SHARED_COMMAND_TYPES, WILD_COMMAND_TYPES } from '../src/app/wild-commands';
import { planReservation, reservedTotal, reservedTotals } from '../src/sim/reservation';
import {
  SITE_REACH, checkWildSite, freeIn, freeInBag, rectDistance, reservedIn, siteCellsOf, siteSpotOf, spawnPoint, trapsPlayer,
} from '../src/sim/wild-build';
import {
  SPAWN, axe, build, clone, code, deliverAll, dm, fund, gather, load, ok, placeAt, reasons, send, shore, spot, tick, wild, workAll,
} from './w4-harness';

const sites = (s: GameSession) => s.world.wild!.build!.sites;

// ---------- the shared ledger ----------

test('the shared reservation ledger: totals, free amounts and deterministic plans (settlement and wilderness use the same functions)', () => {
  assert.equal(reservedTotal([{ log: 2 }, { log: 3, stone: 1 }, {}], 'log'), 5);
  assert.deepEqual(reservedTotals([{ stone: 1, log: 2 }, { log: 3, cord: 0 }]), { log: 5, stone: 1 });
  const free: Record<string, Record<string, number>> = { bag: { log: 1, branch: 6 }, 'd:9': { log: 4 }, 'b:3': { log: 9 } };
  const src = ['bag', 'd:9', 'b:3'].map((id) => ({ id, free: (k: string) => free[id][k] ?? 0 }));
  assert.deepEqual(planReservation({ log: 3, branch: 2 }, src), { take: { bag: { branch: 2, log: 1 }, 'd:9': { log: 2 } }, short: {} }, 'sources in order, items in key order');
  assert.deepEqual(planReservation({ cord: 2, log: 20 }, src).short, { cord: 2, log: 6 }, 'what nothing covers is reported');
});

// ---------- reservations in the wilderness ----------

test('two projects never claim the same materials; reserved items are refused to crafting, dropping and other sites; refusals change nothing', () => {
  const s = wild();
  load(s);
  fund(s, 'campfire', SPAWN);
  gather(s, 'fiber_plant', 2);
  const a = placeAt(s, 'campfire', spot(s, 'campfire', SPAWN), 0, SPAWN);
  assert.deepEqual(sites(s).get(a)!.reserved, { bag: { branch: 3, stone: 6 } });
  assert.equal(freeInBag(s.world, 'stone'), 0);
  const h = s.stateHash;
  // A second campfire: everything it would use is the first one's.
  const p2 = spot(s, 'campfire', SPAWN);
  const r2 = send(s, { type: 'place_site', kind: 'campfire', x: p2.x, z: p2.z, rot: 0, at: dm(SPAWN) });
  assert.equal(code(r2), 'unfunded');
  assert.match(reasons(r2).join(';'), /3 branch, 6 stone more needed/);
  const preview = checkWildSite(s.world, 'campfire', p2.x, p2.z, 0, dm(SPAWN));
  assert.deepEqual(preview.reasons, reasons(r2), 'the preview says the same');
  assert.deepEqual(preview.funding!.short, { branch: 3, stone: 6 });
  // Crafting an axe would eat a reserved branch and stone.
  const c = send(s, { type: 'craft', recipe: 'stone_axe' });
  assert.equal(code(c), 'reserved');
  assert.match(reasons(c).join(';'), /reserved for your campfire site: they cannot be used to craft stone axe/);
  assert.equal(code(send(s, { type: 'drop', item: 'stone', n: 1, at: dm(SPAWN) })), 'reserved');
  assert.equal(s.stateHash, h, 'every refusal leaves the world as it was');
  // Free units beside reserved ones can be used; the reservation stays fully backed.
  gather(s, 'branch', 1); gather(s, 'loose_stone', 1);
  ok(send(s, { type: 'craft', recipe: 'stone_axe' }), 'axe from free units');
  assert.deepEqual([reservedIn(s.world, 'bag', 'branch'), reservedIn(s.world, 'bag', 'stone')], [3, 6]);
  assert.ok(s.world.wild!.items.branch! >= 3 && s.world.wild!.items.stone! >= 6, 'still backed by what the bag holds');
  // With a second set of materials (put down beside the player: the bag is too full for both) the second campfire
  // reserves its own, never the first's.
  const stash = { x: SPAWN.x + 1.5, z: SPAWN.z + 2.5 };
  for (const [kind, item, n] of [['branch', 'branch', 3], ['loose_stone', 'stone', 3], ['loose_stone', 'stone', 3]] as const) {
    gather(s, kind, n);
    ok(send(s, { type: 'drop', item, n: freeInBag(s.world, item), at: dm(stash) }), `stash ${item}`);
  }
  const b = placeAt(s, 'campfire', spot(s, 'campfire', SPAWN), 0, SPAWN);
  assert.deepEqual(reservedTotals(Object.values(sites(s).get(b)!.reserved)), { branch: 3, stone: 6 });
  assert.ok(!sites(s).get(b)!.reserved.bag?.stone, 'none of the first campfire\'s stones');
  assert.deepEqual(reservedTotals([...sites(s).values()].flatMap((x) => Object.values(x.reserved))), { branch: 6, stone: 12 });
  for (const src of ['bag', ...s.world.wild!.piles.keys()]) for (const k of ['branch', 'stone']) {
    const held = src === 'bag' ? s.world.wild!.items[k] ?? 0 : (s.world.wild!.piles.get(src)!.item === k ? s.world.wild!.piles.get(src)!.qty : 0);
    assert.ok(reservedIn(s.world, src, k) <= held, `${src} ${k}: never more reserved than held`);
  }
  // A snapshot claiming more than the bag holds is refused.
  const snap = clone(s.snapshot) as unknown as { wild: { items: Record<string, number> } };
  snap.wild.items.stone = 5;
  assert.throws(() => validateWorldSnapshot(snap), /more reserved than the source holds/);
});

test('piles fund a site and keep their identity; reserved units are picked up only for their site, delivered from within reach, and follow the items through a death', () => {
  const s = wild();
  load(s);
  gather(s, 'loose_stone', 6);
  const p = spot(s, 'campfire', SPAWN);
  const cells = footprintCells(2, 2, p.x, p.z, 0);
  // Two branches dropped right by the site, one further off (both within reach of the funding, 24 m).
  const near = { x: p.x + 1, z: p.z - 1.6 }, far = { x: p.x + 1, z: p.z - 9 };
  gather(s, 'branch', 3);
  const d1 = ok(send(s, { type: 'drop', item: 'branch', n: 2, at: dm(near) }));
  const d2 = ok(send(s, { type: 'drop', item: 'branch', n: 1, at: dm(far) }));
  const nearId = (d1 as { outcome: { pileId: string } }).outcome.pileId, farId = (d2 as { outcome: { pileId: string } }).outcome.pileId;
  const piles0 = clone([...s.world.wild!.piles.values()]);
  const id = placeAt(s, 'campfire', p, 0, SPAWN);
  const site = sites(s).get(id)!;
  assert.deepEqual(site.reserved, { bag: { stone: 6 }, [nearId]: { branch: 2 }, [farId]: { branch: 1 } }, 'the bag first, then the piles nearest the site');
  assert.deepEqual([...s.world.wild!.piles.values()], piles0, 'reserving moves nothing: same piles, counts and places');
  // A plain pickup of a reserved pile is refused; a pickup for the site takes it, still reserved.
  assert.equal(code(send(s, { type: 'pickup', entityId: farId, at: dm(far) })), 'reserved');
  ok(send(s, { type: 'pickup', entityId: farId, at: dm(far), forSite: id }));
  assert.deepEqual(site.reserved, { bag: { branch: 1, stone: 6 }, [nearId]: { branch: 2 } });
  assert.equal(freeInBag(s.world, 'branch'), 0);
  // The near pile is delivered straight from where it lies; a pile out of the site's reach is not.
  const door = dm(siteSpotOf(site));
  assert.ok(rectDistance(cells, near.x, near.z) <= SITE_REACH);
  ok(send(s, { type: 'deliver_site', siteId: id, item: 'branch', n: 2, at: door, from: nearId }), 'from the pile at the site');
  assert.equal(s.world.wild!.piles.has(nearId), false, 'the pile went into the site');
  assert.equal(code(send(s, { type: 'deliver_site', siteId: id, item: 'branch', n: 1, at: door, from: nearId })), 'not_reserved');
  ok(send(s, { type: 'deliver_site', siteId: id, item: 'stone', n: 6, at: door }));
  // Drown carrying the last reserved branch: it drops with the rest, and its reservation follows it.
  const wet = shore(s);
  const died = ok(send(s, { type: 'died', cause: 'drowned', at: dm(wet) }));
  const pileOf = (died as { outcome: { piles: string[] } }).outcome.piles[0];
  assert.deepEqual(site.reserved, { [pileOf]: { branch: 1 } }, 'still reserved for the campfire, in the pile where it fell');
  ok(send(s, { type: 'respawn', to: 'spawn' }));
  assert.equal(code(send(s, { type: 'pickup', entityId: pileOf, at: dm(wet) })), 'reserved');
  ok(send(s, { type: 'pickup', entityId: pileOf, at: dm(wet), forSite: id }));
  deliverAll(s, id);
  ok(workAll(s, id), 'built');
  assert.deepEqual([site.state, site.reserved, site.delivered, site.consumed], ['done', {}, {}, { branch: 3, stone: 6 }]);
  assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'replays from genesis');
});

test('storage funds a site; reserved stock is taken out only for its site; cancelling releases every reservation where the items lie', () => {
  const s = wild();
  load(s);
  axe(s);
  const store = build(s, 'log_store', SPAWN);
  const sat = dm(siteSpotOf(sites(s).get(store)!));
  gather(s, 'loose_stone', 6);
  ok(send(s, { type: 'store_items', siteId: store, item: 'stone', n: 6, at: sat }));
  gather(s, 'branch', 3);
  const id = placeAt(s, 'campfire', spot(s, 'campfire', SPAWN), 0, SPAWN);
  const site = sites(s).get(id)!;
  assert.deepEqual(site.reserved, { [store]: { stone: 6 }, bag: { branch: 3 } });
  assert.equal(freeIn(s.world, store, 'stone'), 0);
  const t = send(s, { type: 'take_items', siteId: store, item: 'stone', n: 1, at: sat });
  assert.equal(code(t), 'reserved');
  assert.match(reasons(t).join(';'), /reserved for your building sites/);
  ok(send(s, { type: 'take_items', siteId: store, item: 'stone', n: 2, at: sat, forSite: id }), 'taken for the campfire');
  assert.deepEqual(site.reserved, { [store]: { stone: 4 }, bag: { branch: 3, stone: 2 } });
  assert.equal(code(send(s, { type: 'store_items', siteId: store, item: 'stone', n: 1, at: sat })), 'reserved', 'a reserved stone cannot be put away as free stock');
  // Cancel: nothing moves; the stone in the store and the bag is free again.
  const door = dm(siteSpotOf(site));
  const c = ok(send(s, { type: 'cancel_site', siteId: id, at: door }));
  assert.deepEqual((c as { outcome: { released: unknown; piles: string[] } }).outcome, { type: 'cancel_site', siteId: id, piles: [], released: { branch: 3, stone: 6 }, events: ['SITE_CANCELLED'] });
  assert.equal(freeIn(s.world, store, 'stone'), 4);
  ok(send(s, { type: 'take_items', siteId: store, item: 'stone', n: 4, at: sat }), 'free again');
  ok(send(s, { type: 'drop', item: 'branch', n: 3, at: dm(SPAWN) }), 'free again');
});

// ---------- the player is never covered or shut in ----------

test('placement never covers the player: every early building, every rotation, every footprint position over the player is refused', () => {
  const s = wild();
  load(s);
  for (const kind of ['lean_to', 'campfire', 'workbench', 'log_store']) {
    // Nothing carried: covering the player is refused for that reason alone (the material check is separate).
    const d = buildingDef(kind)!;
    for (let rot = 0; rot < 4; rot++) {
      const w = rot % 2 ? d.footprint.d : d.footprint.w, dd = rot % 2 ? d.footprint.w : d.footprint.d;
      let tried = 0;
      for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < dd; dz++) {
        const x = Math.floor(SPAWN.x) - dx, z = Math.floor(SPAWN.z) - dz;
        const c = checkWildSite(s.world, kind, x, z, rot, dm(SPAWN));
        assert.equal(c.ok, false, `${kind} rot ${rot} at ${x},${z}`);
        assert.ok(c.traps && c.reasons.includes('you are standing where it would go: step out of the footprint'), `${kind} rot ${rot}: ${c.reasons.join('; ')}`);
        const r = send(s, { type: 'place_site', kind, x, z, rot, at: dm(SPAWN) });
        assert.equal(code(r), 'traps_player');
        tried++;
      }
      assert.equal(tried, w * dd);
    }
  }
  assert.equal(s.world.wild!.build!.sites.size, 0);
});

test('placement never shuts the player in: a footprint closing the only way out is refused, in all four orientations; one that cuts nothing off is not', () => {
  const s = wild();
  load(s);
  // A local walking grid on open ground at the spawn, with walls (as building blocks) around the player.
  const px = Math.floor(SPAWN.x), pz = Math.floor(SPAWN.z), at = dm(SPAWN);
  const region = { ox: px - 24, oz: pz - 24, w: 48, h: 48 };
  const grid = (walls: Array<{ x0: number; z0: number; x1: number; z1: number }>) => {
    const f = emptyFeatures(`test:${JSON.stringify(walls)}`);
    walls.forEach((w, i) => f.blocks.push({ ...w, reason: 'building', id: `wall${i}` }));
    return navGridFull(s.world, region, f);
  };
  const open = grid([]);
  assert.equal(trapsPlayer(open, { x0: px + 3, z0: pz + 3, x1: px + 5, z1: pz + 4 }, at), false, 'open ground: nothing traps');
  // A pocket 5 x 5 around the player, walls 1 m thick, with a 2-cell gap in one side; the closing footprint fills the gap.
  const box = { x0: px - 3, z0: pz - 3, x1: px + 4, z1: pz + 4 };
  const sides = {
    '+z': { gap: { x0: px, z0: box.z1 - 1, x1: px + 2, z1: box.z1 }, rot: 0 },
    '-z': { gap: { x0: px, z0: box.z0, x1: px + 2, z1: box.z0 + 1 }, rot: 2 },
    '+x': { gap: { x0: box.x1 - 1, z0: pz, x1: box.x1, z1: pz + 2 }, rot: 1 },
    '-x': { gap: { x0: box.x0, z0: pz, x1: box.x0 + 1, z1: pz + 2 }, rot: 3 },
  } as const;
  const ring = (gap: { x0: number; z0: number; x1: number; z1: number } | null) => {
    const walls = [];
    for (let z = box.z0; z < box.z1; z++) for (let x = box.x0; x < box.x1; x++) {
      const edge = x === box.x0 || z === box.z0 || x === box.x1 - 1 || z === box.z1 - 1;
      const inGap = gap && x >= gap.x0 && x < gap.x1 && z >= gap.z0 && z < gap.z1;
      if (edge && !inGap) walls.push({ x0: x, z0: z, x1: x + 1, z1: z + 1 });
    }
    return walls;
  };
  for (const [side, { gap, rot }] of Object.entries(sides)) {
    const g = grid(ring(gap));
    const fp = footprintCells(2, 1, gap.x0, gap.z0, rot);
    assert.deepEqual(fp, gap, `${side}: a 2 x 1 footprint turned ${rot} covers the gap`);
    assert.equal(trapsPlayer(g, fp, at), true, `${side}: closing the gap shuts the player in`);
    assert.equal(trapsPlayer(g, footprintCells(2, 1, px - 1, pz - 1, rot), at), false, `${side}: inside the pocket, the gap stays open`);
    assert.equal(trapsPlayer(g, footprintCells(2, 1, box.x1 + 3, box.z1 + 3, rot), at), false, `${side}: outside the pocket`);
  }
  // Closed in by the terrain already (no gap at all): a footprint may not cut off part of what the player can reach.
  const closed = grid(ring(null));
  assert.equal(trapsPlayer(closed, { x0: px + 1, z0: box.z0 + 1, x1: px + 2, z1: box.z1 - 1 }, at), true, 'a wall across the pocket cuts its far side off');
  assert.equal(trapsPlayer(closed, { x0: box.x1 - 2, z0: box.z1 - 2, x1: box.x1 - 1, z1: box.z1 - 1 }, at), false, 'a corner cuts nothing off');
});

// ---------- construction history ----------

test('construction history: a snapshot site must be proven by its materials; a finished lean-to is never accepted on its status alone', () => {
  const s = wild();
  load(s);
  fund(s, 'lean_to', SPAWN);
  const id = placeAt(s, 'lean_to', spot(s, 'lean_to', SPAWN), 0, SPAWN);
  validateWorldSnapshot(clone(s.snapshot));
  type Snap = { wild: { items: Record<string, number>; build: { sites: Array<Record<string, unknown>> } } };
  const tamper = (f: (site: Record<string, unknown>, snap: Snap) => void) => {
    const snap = clone(s.snapshot) as unknown as Snap;
    f(snap.wild.build.sites[0], snap);
    return () => validateWorldSnapshot(snap);
  };
  // The audit's probe 3: marked finished with nothing delivered or consumed.
  assert.throws(tamper((x) => { x.state = 'done'; x.stage = 3; x.work = 0; x.done = x.placed; }), /construction history/);
  // Finished and "paid" out of thin air: consumed set, but the reservation is still on the books.
  assert.throws(tamper((x) => { x.state = 'done'; x.stage = 3; x.work = 0; x.done = x.placed; x.consumed = { branch: 6, cord: 2, log: 2 }; }), /construction history/);
  // Finished with exactly its materials consumed, no reservation, but in no time at all.
  assert.throws(tamper((x) => { x.state = 'done'; x.stage = 3; x.work = 0; x.done = x.placed; x.reserved = {}; x.consumed = { branch: 6, cord: 2, log: 2 }; }), /more work than the time/);
  // Work in a stage whose materials were never delivered.
  assert.throws(tamper((x) => { x.state = 'building'; x.work = 1; }), /construction history/);
  // A stage marked done without its materials consumed.
  assert.throws(tamper((x) => { x.state = 'building'; x.stage = 1; }), /construction history/);
  // A reservation in a pile that does not exist.
  assert.throws(tamper((x) => {
    const r = x.reserved as Record<string, Record<string, number>>;
    const logs = Object.entries(r).filter(([k]) => k.startsWith('d:')).reduce((n, [, v]) => n + (v.log ?? 0), 0);
    x.reserved = { bag: r.bag, 'd:1': { log: logs } };
  }), /reservation source \(no such pile\)/);
  // Now the real thing: built, every stage consumed; the finished snapshot validates.
  deliverAll(s, id);
  ok(workAll(s, id));
  const site = sites(s).get(id)!;
  assert.deepEqual([site.state, site.consumed], ['done', { branch: 6, cord: 2, log: 2 }]);
  validateWorldSnapshot(clone(s.snapshot));
  assert.throws(tamper((x) => { x.consumed = { branch: 6, cord: 2, log: 1 }; }), /construction history/);
  assert.throws(tamper((x) => { x.delivered = { log: 1 }; }), /construction history/);
});

// ---------- respawn ----------

test('respawn needs a recorded, plausible death and a claimed, finished, intact lean-to; refusals are distinct and change nothing', () => {
  const s = wild();
  load(s);
  // The audit's probe 2: a respawn with no death behind it.
  const h0 = s.stateHash;
  assert.equal(code(send(s, { type: 'respawn', to: 'spawn' })), 'no_death');
  assert.equal(s.stateHash, h0);
  // A drowning is recorded only on dry ground with water close by.
  const dry = [...Array(200).keys()].map((i) => ({ x: SPAWN.x + (i % 20) - 10, z: SPAWN.z + Math.floor(i / 20) - 10 }))
    .find((p) => { for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) if (waterDepthAt(s.world, Math.floor(p.x) + dx, Math.floor(p.z) + dz) > 0) return false; return true; })!;
  assert.ok(dry, 'a spot with no water within 7 m');
  assert.equal(code(send(s, { type: 'died', cause: 'drowned', at: dm(dry) })), 'implausible');
  const wet = shore(s);
  // A spot in open water (every cell within a metre is wet) is no last dry spot; one on the shore edge is (the body stands beside it).
  let inWater: { x: number; z: number } | null = null;
  for (let r = 1; r < 40 && !inWater; r++) for (let a = 0; a < 32 && !inWater; a++) {
    const x = Math.floor(wet.x + Math.cos(a / 16 * Math.PI) * r), z = Math.floor(wet.z + Math.sin(a / 16 * Math.PI) * r);
    if ([-1, 0, 1].every((dx) => [-1, 0, 1].every((dz) => waterDepthAt(s.world, x + dx, z + dz) > 0))) inWater = { x: x + 0.5, z: z + 0.5 };
  }
  assert.ok(inWater, 'open water near the shore');
  assert.equal(code(send(s, { type: 'died', cause: 'drowned', at: dm(inWater!) })), 'implausible', 'the last dry spot is on dry ground');
  assert.equal(s.stateHash, h0, 'implausible deaths change nothing');
  let edge: { x: number; z: number } | null = null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!edge && waterDepthAt(s.world, Math.floor(wet.x) + dx, Math.floor(wet.z) + dz) > 0) edge = { x: wet.x + dx * 0.6, z: wet.z + dz * 0.6 };
  assert.ok(edge && waterDepthAt(s.world, Math.floor(edge.x), Math.floor(edge.z)) > 0, 'a centre just over the waterline');
  const hEdge = s.stateHash;
  const de = send(s, { type: 'died', cause: 'drowned', at: dm(edge!) });
  assert.ok(de.ok, `a centre just over the waterline, beside dry ground, is accepted (as the browser run reported): ${JSON.stringify(de)}`);
  assert.notEqual(s.stateHash, hEdge);
  ok(send(s, { type: 'respawn', to: 'spawn' }));
  assert.equal(code(send(s, { type: 'died', cause: 'fell', at: dm(wet) })), 'invalid_command', 'drowning is the only death there is');
  // Build a lean-to but do not claim it yet; build a campfire too.
  axe(s);
  const lid = build(s, 'lean_to', SPAWN);
  const fid = build(s, 'campfire', SPAWN);
  ok(send(s, { type: 'died', cause: 'drowned', at: dm(wet) }));
  assert.equal(code(send(s, { type: 'died', cause: 'drowned', at: dm(wet) })), 'already_dead');
  assert.equal(code(send(s, { type: 'pickup', entityId: [...s.world.wild!.piles.keys()][0], at: dm(wet) })), 'dead', 'a dead character does nothing');
  assert.equal(code(send(s, { type: 'craft', recipe: 'cord' })), 'dead');
  const h1 = s.stateHash;
  assert.equal(code(send(s, { type: 'respawn', to: lid })), 'not_claimed', 'an unclaimed lean-to');
  assert.equal(code(send(s, { type: 'respawn', to: fid })), 'no_shelter', 'a campfire is no shelter');
  assert.equal(code(send(s, { type: 'respawn', to: 'b:9999' })), 'no_shelter', 'no such building');
  assert.equal(s.stateHash, h1, 'refused respawns change nothing');
  const sp = ok(send(s, { type: 'respawn', to: 'spawn' }), 'the spawn fallback');
  assert.deepEqual((sp as { outcome: unknown }).outcome, { type: 'respawn', point: 'spawn', x: spawnPoint(s.world).x, z: spawnPoint(s.world).z, events: ['RESPAWNED'] });
  assert.equal(code(send(s, { type: 'respawn', to: 'spawn' })), 'no_death', 'one death, one respawn');
  // Claim it, then die again: unavailable shelters are refused with their reason.
  const lean = sites(s).get(lid)!;
  ok(send(s, { type: 'claim_shelter', siteId: lid, at: dm(siteSpotOf(lean)) }));
  ok(send(s, { type: 'died', cause: 'drowned', at: dm(wet) }));
  // Damaged: something solid stands in its door step. (No damage exists in W4; the state is edited directly
  // to stand for it, and put back. The refusal is the simulation's own.)
  const door = siteSpotOf(lean);
  sites(s).set('b:9998', { id: 'b:9998', kind: 'workbench', x: Math.floor(door.x) - 1, z: Math.floor(door.z), rot: 0, y: lean.y, state: 'done', reserved: {}, delivered: {},
    consumed: { ...buildingDef('workbench')!.materials }, stage: 3, work: 0, placed: 0, done: 0 });
  assert.equal(code(send(s, { type: 'respawn', to: lid })), 'shelter_damaged');
  sites(s).delete('b:9998');
  // Unfinished (standing for a ruined one): refused.
  lean.state = 'building';
  assert.equal(code(send(s, { type: 'respawn', to: lid })), 'shelter_unfinished');
  lean.state = 'done';
  const w = ok(send(s, { type: 'respawn', to: lid }));
  assert.deepEqual((w as { outcome: unknown }).outcome, { type: 'respawn', point: lid, x: Math.round(door.x * 10), z: Math.round(door.z * 10), events: ['RESPAWNED'] });
  // The journal: the recorded outcome must agree with the command, and the whole thing replays.
  assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash);
  const j = clone(s.journal) as unknown as { entries: Array<{ command: Record<string, unknown>; outcome: Record<string, unknown> }> };
  j.entries.filter((e) => e.command.type === 'respawn').at(-1)!.outcome.point = 'spawn';
  assert.throws(() => validateJournal(j), /disagree/);
  // A snapshot with a death pending keeps it (a reload during the death screen still has to respawn).
  ok(send(s, { type: 'died', cause: 'drowned', at: dm(wet) }));
  const snap = clone(s.snapshot) as unknown as { wild: { build: { death: unknown } } };
  assert.deepEqual(validateWorldSnapshot(clone(snap)).wild!.build!.death, snap.wild.build.death);
  (snap.wild.build.death as { cause: string }).cause = 'fell';
  assert.throws(() => validateWorldSnapshot(snap), /death/);
});

// ---------- command authorization ----------

test('one wilderness allow-list, no bypass: every wilderness command is on it, settlement-shaped commands are refused, no catalogue id is a settlement kind', () => {
  assert.deepEqual([...WILDERNESS_COMMANDS].sort(), ['tick', ...WILD_COMMAND_TYPES, ...SHARED_COMMAND_TYPES].sort());
  const settlementKinds = Object.keys(SITE_RULES);
  for (const d of BUILD_CATALOGUE) assert.ok(!settlementKinds.includes(d.id), `${d.id} is not a settlement site kind`);
  const s = wild();
  load(s);
  // The settlement's place_site (no `at`, a settlement kind) is refused like any settlement command.
  const h = s.stateHash;
  for (const c of [{ type: 'place_site', kind: 'woodshed', x: 0, z: 0, rot: 0 }, { type: 'approve_site', siteId: 'site:1' }, { type: 'found_homestead' }]) {
    assert.equal(code(send(s, c)), 'wilderness', c.type);
  }
  assert.equal(s.stateHash, h);
  // The session consults the list itself: take a command off it and it is refused before the simulation sees it.
  fund(s, 'campfire', SPAWN);
  const list = WILDERNESS_COMMANDS as string[];
  const i = list.indexOf('place_site');
  list.splice(i, 1);
  try {
    const p = spot(s, 'campfire', SPAWN);
    assert.equal(code(send(s, { type: 'place_site', kind: 'campfire', x: p.x, z: p.z, rot: 0, at: dm(SPAWN) })), 'wilderness', 'off the list: refused');
  } finally { list.splice(i, 0, 'place_site'); }
  const p = spot(s, 'campfire', SPAWN);
  ok(send(s, { type: 'place_site', kind: 'campfire', x: p.x, z: p.z, rot: 0, at: dm(SPAWN) }), 'on the list again');
  // A forged wilderness journal carrying a settlement command is refused on load.
  const j = clone(s.journal) as unknown as { entries: Array<{ command: Record<string, unknown>; outcome: Record<string, unknown> }> };
  const e = j.entries.find((x) => x.command.type === 'place_site')!;
  e.command = { ...e.command, kind: 'woodshed' };
  delete e.command.at;
  assert.throws(() => validateJournal(j));
  tick(s);
});
