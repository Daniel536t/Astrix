// W4: build anywhere in the wilderness (content v4).
// - A data-driven Build catalogue (sim/catalogue.ts): stable ids, categories, materials, prerequisites,
//   footprints, placement rules, stages, work, functions, collision and model references.
// - One scenario-neutral placement core (sim/placement.ts) shared by the settlement's M014 validator
//   (pins unchanged) and the wilderness validator (sim/wild-build.ts `checkWildSite`): slope, water,
//   trees, trunks, piles, overlaps, a reachable entrance, the player never covered or shut in, and the
//   whole material list reservable (the shared ledger, sim/reservation.ts).
// - Construction by the player: place_site (reserves everything), deliver_site (reserved materials),
//   build_work (a finished stage consumes its materials), cancel_site (reservations released, delivered
//   materials back on the ground); finished buildings work: lean-to claim and respawn, campfire fuel and
//   cooking, workbench recipes, storage.
// - Replay, reload mid-construction, and W1/W2/W3 saves keep loading, replaying and upgrading.
//
// Changed with the reservation work (owner decision 1): placing now reserves the whole building, so every
// test that placed a site with an empty bag first funds it (`fund`), and the tests that asserted "placing
// reserves and takes nothing" now assert what is reserved and that nothing moves. Death is now `died` +
// `respawn` (owner requirement: respawn needs a recorded death); the lean-to test uses them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameSession, validateJournal } from '../src/app/session';
import { validateWorldSnapshot } from '../src/sim/snapshot';
import { BrowserSaveStore, KeyValueStorage } from '../src/app/persistence';
import { GENERATOR_V2, WILDERNESS, surfaceAt, waterDepthAt } from '../src/sim/world';
import { WILD_RECIPES } from '../src/sim/gathering';
import { treesNear, trunksNear } from '../src/sim/felling';
import { BUILD_CATALOGUE, BUILD_CATEGORIES, FUTURE_MATERIALS, buildingDef } from '../src/sim/catalogue';
import {
  PLACE_REACH, checkWildSite, findWildSpot, lockReasons, siteCellsOf, siteEntranceOf, siteProgress, siteSpotOf, solidRect, buildingHits, spawnPoint,
} from '../src/sim/wild-build';
import { canStandAt } from '../src/sim/character';
import {
  SPAWN, axe, build, clone, code, deliverAll, dm, fund, gather, load, logPiles, ok, placeAt, send, shore, spot, standBy, swing, takeLogs, tick, unload,
} from './w4-harness';

/** Pinned on this change (W4): wilderness content v4, seed 1337, generator v2. */
let W4_GENESIS = '';

class MemoryStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

// ---------- catalogue ----------

test('the Build catalogue: every definition is complete and consistent; early buildings are open, later ones locked and say why', () => {
  const ids = new Set<string>();
  for (const d of BUILD_CATALOGUE) {
    assert.ok(!ids.has(d.id) && /^[a-z_]+$/.test(d.id), `stable unique id ${d.id}`);
    ids.add(d.id);
    assert.ok(BUILD_CATEGORIES.includes(d.category), d.id);
    assert.ok(d.footprint.w >= 1 && d.footprint.d >= 1 && Number.isInteger(d.footprint.w) && Number.isInteger(d.footprint.d), d.id);
    assert.ok(d.placement.maxStep >= 1 && d.placement.gap >= 0, d.id);
    assert.ok(d.stages.length >= 1 && d.stages.every((s) => s.work >= 1 && s.label), d.id);
    const sum: Record<string, number> = {};
    for (const s of d.stages) for (const [k, n] of Object.entries(s.materials)) sum[k] = (sum[k] ?? 0) + n;
    assert.deepEqual(Object.keys(d.materials).sort(), Object.keys(sum).sort());
    for (const k of Object.keys(sum)) assert.equal(d.materials[k], sum[k], `${d.id} ${k}`);
    assert.equal(d.work, d.stages.reduce((a, s) => a + s.work, 0));
    assert.ok(d.function.summary.length > 10, d.id);
    assert.ok(d.model.id && d.model.stages.length === d.stages.length && d.model.asset.startsWith('render/'), d.id);
    for (const b of d.solids) assert.ok(b.x0 >= 0 && b.z0 >= 0 && b.x1 <= d.footprint.w && b.z1 <= d.footprint.d && b.h > 0, `${d.id} solid inside footprint`);
    for (const p of d.prerequisites.buildings) assert.ok(buildingDef(p), `${d.id} prerequisite ${p}`);
  }
  for (const id of ['lean_to', 'campfire', 'workbench', 'log_store']) {
    const d = buildingDef(id)!;
    assert.equal(d.tier, 'early'); assert.ok(d.implemented);
    assert.deepEqual(d.prerequisites, { buildings: [], tools: [] });
    assert.ok(Object.keys(d.materials).every((k) => !FUTURE_MATERIALS[k]), `${id} needs only W4 materials`);
  }
  assert.deepEqual(buildingDef('lean_to')!.materials, { branch: 6, cord: 2, log: 2 });
  assert.deepEqual(buildingDef('campfire')!.materials, { branch: 3, stone: 6 });
  assert.deepEqual(buildingDef('workbench')!.materials, { log: 3, stone: 2 });
  assert.deepEqual(buildingDef('log_store')!.materials, { branch: 4, log: 2, stone: 2 });
  for (const id of ['cabin', 'timber_house', 'stone_house', 'storage_shed', 'workshop', 'forge', 'barn', 'farm_plot', 'water_well', 'rain_barrel', 'fence', 'gate', 'bridge']) {
    assert.ok(buildingDef(id), id);
    assert.equal(buildingDef(id)!.tier, 'later');
  }
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  for (const d of BUILD_CATALOGUE) {
    const why = lockReasons(s.world, d);
    assert.equal(why.length === 0, d.tier === 'early', `${d.id}: ${why.join('; ')}`);
  }
  assert.match(lockReasons(s.world, buildingDef('stone_house')!).join(';'), /cut stone .*W6/);
  assert.match(lockReasons(s.world, buildingDef('storage_shed')!).join(';'), /finished workbench.*hammer/);
  // Station recipes are data: planks, pickaxe, hammer, knife, chest at the workbench.
  assert.deepEqual(WILD_RECIPES.filter((r) => r.station === 'workbench').map((r) => r.id).sort(), ['hammer', 'knife', 'planks', 'stone_pickaxe', 'wooden_chest']);
});

test('content v4 genesis is pinned; v3 and settlement pins unchanged; the settlement refuses wilderness building', () => {
  // A new world now starts at content v5 (W4 owner report 1: bag capacity and reservation swap); v4 keeps its pin.
  const w = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  assert.equal(w.journal.wildContent, 5);
  assert.equal(w.stateHash, W5_PIN, 'v5 genesis');
  const w4 = GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 4);
  assert.equal(w4.journal.wildContent, 4);
  W4_GENESIS = w4.stateHash;
  assert.equal(W4_GENESIS, W4_PIN);
  assert.equal(GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 3).stateHash, '158e989e4c10cf13', 'W3 (v3) genesis unchanged');
  assert.equal(GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 2).stateHash, '3c3a0c8e4090efcf', 'W2 (v2) genesis unchanged');
  const s = GameSession.genesis(1337);
  assert.equal(s.stateHash, 'e659504b056654dc');
  for (const c of [{ type: 'place_site', kind: 'lean_to', x: 0, z: 0, rot: 0, at: { x: 0, z: 0 } }, { type: 'build_work', siteId: 'b:1', at: { x: 0, z: 0 } },
    { type: 'cancel_site', siteId: 'b:1', at: { x: 0, z: 0 } }, { type: 'died', cause: 'drowned', at: { x: 0, z: 0 } }, { type: 'respawn', to: 'spawn' }]) {
    assert.equal(code(send(s, c)), 'not_wilderness', c.type);
  }
  // The M014 command of the same name is still the settlement's (refused here only because nothing is founded).
  assert.notEqual(code(send(s, { type: 'place_site', kind: 'woodshed', x: 0, z: 0, rot: 0 })), 'not_wilderness');
  assert.equal(s.stateHash, 'e659504b056654dc');
  // A wilderness world refuses the settlement's own building commands, and a v3 world refuses W4 ones until upgraded.
  assert.equal(code(send(w, { type: 'place_site', kind: 'woodshed', x: 0, z: 0, rot: 0 })), 'wilderness');
  const v3 = GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 3);
  assert.equal(code(send(v3, { type: 'place_site', kind: 'campfire', x: -84, z: -175, rot: 0, at: dm(SPAWN) })), 'wilderness');
  assert.equal(code(send(v3, { type: 'craft', recipe: 'planks', at: dm(SPAWN) })), 'wilderness');
});
const W4_PIN = '6d50f19f01f39eec';
const W5_PIN = '9ddf941c10692096';

// ---------- placement ----------

/** The first cells (min corner of a 2x2) near spawn where `pred` holds. */
function findCells(s: GameSession, pred: (x: number, z: number) => boolean, r = 160): { x: number; z: number } {
  for (let d = 4; d < r; d += 1) for (let a = 0; a < 32; a++) {
    const x = Math.round(SPAWN.x + Math.cos(a / 32 * Math.PI * 2) * d), z = Math.round(SPAWN.z + Math.sin(a / 32 * Math.PI * 2) * d);
    if (pred(x, z)) return { x, z };
  }
  throw new Error('no such cells');
}

test('the wilderness validator: reach, slope, water, trees, trunks, piles, other sites, locks and a reachable entrance; the preview is the command', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  load(s);
  const at = dm(SPAWN);
  // A good spot, then the same spot from too far away (the campfire's materials are carried: the verdict includes reserving them).
  fund(s, 'campfire', SPAWN);
  const p = spot(s, 'campfire', SPAWN);
  const good = checkWildSite(s.world, 'campfire', p.x, p.z, 0, at);
  assert.ok(good.ok, good.reasons.join('; '));
  assert.ok(good.routeToPlayer !== null && good.routeToPlayer < 20);
  const far = checkWildSite(s.world, 'campfire', p.x, p.z, 0, dm({ x: SPAWN.x + 30, z: SPAWN.z }));
  assert.match(far.reasons.join(';'), new RegExp(`within ${PLACE_REACH} m`));
  const r0 = send(s, { type: 'place_site', kind: 'campfire', x: p.x, z: p.z, rot: 0, at: dm({ x: SPAWN.x + 30, z: SPAWN.z }) });
  assert.equal(code(r0), 'invalid_site');
  assert.deepEqual((r0 as { reasons: string[] }).reasons, far.reasons, 'the command refuses with the preview\'s reasons');
  // Water: a footprint over a wet cell.
  const wet = findCells(s, (x, z) => waterDepthAt(s.world, x, z) > 0 && waterDepthAt(s.world, x + 1, z + 1) > 0, 400);
  const cw = checkWildSite(s.world, 'campfire', wet.x, wet.z, 0, dm({ x: wet.x + 3, z: wet.z + 3 }));
  assert.ok(cw.reasons.includes('there is water here'), cw.reasons.join('; '));
  // Slope: a 2x2 footprint whose ground spans more than 1 m.
  const steep = findCells(s, (x, z) => { const ys = [surfaceAt(s.world, x, z), surfaceAt(s.world, x + 1, z), surfaceAt(s.world, x, z + 1), surfaceAt(s.world, x + 1, z + 1)];
    return Math.max(...ys) - Math.min(...ys) > 1 && waterDepthAt(s.world, x, z) === 0; }, 400);
  const cs = checkWildSite(s.world, 'campfire', steep.x, steep.z, 0, dm({ x: steep.x + 1, z: steep.z + 3 }));
  assert.match(cs.reasons.join(';'), /too steep/);
  // A mature tree in the footprint blocks (fell it first); the verdict names it.
  const big = treesNear(s.world, SPAWN.x, SPAWN.z, 40).find((t) => t.stage === 'mature' || t.stage === 'old')!;
  const ct = checkWildSite(s.world, 'campfire', Math.floor(big.e.x) - 1, Math.floor(big.e.z) - 1, 0, dm(standBy(big)));
  assert.ok(ct.blockers.some((b) => b.id === big.e.id), JSON.stringify(ct.blockers));
  assert.match(ct.reasons.join(';'), /fell it first/);
  // A sapling is cleared by the construction.
  const sap = treesNear(s.world, SPAWN.x, SPAWN.z, 120).find((t) => t.stage === 'sapling');
  if (sap) {
    let cleared = false;
    for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const c = checkWildSite(s.world, 'campfire', Math.floor(sap.e.x) + dx, Math.floor(sap.e.z) + dz, 0, dm({ x: sap.e.x + 3, z: sap.e.z + 3 }));
      if (c.clears.includes(sap.e.id)) { cleared = true; assert.ok(!c.blockers.some((b) => b.id === sap.e.id)); break; }
    }
    assert.ok(cleared, 'a sapling in the footprint is cleared, not a blocker');
  }
  // A pile the player dropped is in the way.
  gather(s, 'branch', 1);
  ok(send(s, { type: 'drop', item: 'branch', n: 1, at: dm({ x: p.x + 1, z: p.z + 1 }) }), 'drop');
  const cp = checkWildSite(s.world, 'campfire', p.x, p.z, 0, at);
  assert.match(cp.reasons.join(';'), /pile lies here \(pick it up first\)/);
  ok(send(s, { type: 'pickup', entityId: [...s.world.wild!.piles.keys()][0], at: dm({ x: p.x + 1, z: p.z + 1 }) }), 'pick up');
  // Reachable entrance: a player standing inside an old tree's trunk zone cannot reach the door.
  const old = treesNear(s.world, SPAWN.x, SPAWN.z, 80).find((t) => t.stage === 'old' || t.stage === 'mature')!;
  const nearOld = findWildSpot(s.world, 'campfire', 0, dm(standBy(old)), 3);
  assert.ok(nearOld, 'a good spot beside the tree');
  const blocked = checkWildSite(s.world, 'campfire', nearOld!.x, nearOld!.z, 0, dm({ x: old.e.x, z: old.e.z }));
  assert.deepEqual(blocked.reasons, ['the entrance cannot be reached on foot from where you stand']);
  // Another site: too close.
  const placed = ok(send(s, { type: 'place_site', kind: 'campfire', x: p.x, z: p.z, rot: 0, at }), 'place');
  assert.ok(placed.ok && placed.outcome.type === 'place_site' && placed.outcome.events[0] === 'SITE_PLACED');
  const co = checkWildSite(s.world, 'workbench', p.x + 1, p.z, 0, at);
  assert.ok(co.reasons.includes('too close to another building or site'), co.reasons.join('; '));
  // Locked: the storage shed needs a finished workbench and a hammer; the cabin W6 materials.
  const shed = spot(s, 'workbench', SPAWN);
  const r1 = send(s, { type: 'place_site', kind: 'storage_shed', x: shed.x, z: shed.z, rot: 0, at });
  assert.equal(code(r1), 'locked');
  assert.match((r1 as { reasons: string[] }).reasons.join(';'), /finished workbench/);
  assert.equal(code(send(s, { type: 'place_site', kind: 'cabin', x: shed.x, z: shed.z, rot: 0, at })), 'locked');
  // A thick fallen trunk lies in the way.
  axe(s);
  const tree = treesNear(s.world, SPAWN.x, SPAWN.z, 40).find((t) => t.stage === 'mature' || t.stage === 'old')!;
  for (let i = 0; i < 40; i++) { const r = swing(s, { type: 'chop', entityId: tree.e.id, at: dm(standBy(tree)) }); if (r.ok && r.outcome.type === 'chop' && r.outcome.trunkId) break; }
  const tr = trunksNear(s.world, tree.e.x, tree.e.z, 2)[0].t;
  let trunkHit = false;
  for (let k = 1; k < tr.len / 10; k += 1) {
    const qx = tr.x + [1, 0.9239, 0.7071, 0.3827, 0, -0.3827, -0.7071, -0.9239, -1, -0.9239, -0.7071, -0.3827, 0, 0.3827, 0.7071, 0.9239][tr.dir] * k;
    const qz = tr.z + [0, 0.3827, 0.7071, 0.9239, 1, 0.9239, 0.7071, 0.3827, 0, -0.3827, -0.7071, -0.9239, -1, -0.9239, -0.7071, -0.3827][tr.dir] * k;
    const c = checkWildSite(s.world, 'campfire', Math.floor(qx) - 1, Math.floor(qz) - 1, 0, dm({ x: qx + 2, z: qz + 2 }));
    if (c.reasons.some((r) => /fallen trunk/.test(r))) { trunkHit = true; break; }
  }
  assert.ok(trunkHit, 'a footprint over the trunk is refused');
});

// ---------- construction ----------

test('place, deliver, work, cancel: placing reserves the whole building; stages need their materials and consume them; cancelled materials go back on the ground', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  load(s);
  const at = dm(SPAWN);
  const p = spot(s, 'campfire', SPAWN);
  // Nothing carried: placement is refused clearly and nothing is created.
  const h0 = s.stateHash;
  const r0 = send(s, { type: 'place_site', kind: 'campfire', x: p.x, z: p.z, rot: 0, at });
  assert.equal(code(r0), 'unfunded');
  assert.match((r0 as { reasons: string[] }).reasons.join(';'), /not enough free materials to reserve: 3 branch, 6 stone more needed/);
  assert.equal(s.stateHash, h0, 'no underfunded site');
  fund(s, 'campfire', SPAWN);
  const bag0 = clone(s.world.wild!.items);
  const r = ok(send(s, { type: 'place_site', kind: 'campfire', x: p.x, z: p.z, rot: 0, at }));
  const id = r.ok && r.outcome.type === 'place_site' ? r.outcome.siteId : '';
  assert.match(id, /^b:\d+$/);
  assert.ok(r.ok && r.outcome.type === 'place_site');
  assert.deepEqual((r as { outcome: { reserved: unknown } }).outcome.reserved, { bag: { branch: 3, stone: 6 } }, 'the outcome records what is reserved, and where');
  const site = s.world.wild!.build!.sites.get(id)!;
  const door = dm(siteSpotOf(site));
  assert.equal(site.state, 'planned');
  assert.deepEqual(s.world.wild!.items, bag0, 'reserving moves nothing: the items stay in the bag');
  assert.deepEqual(site.reserved, { bag: { branch: 3, stone: 6 } });
  assert.equal(code(send(s, { type: 'build_work', siteId: id, at: door })), 'materials', 'no work before the stone ring is delivered');
  assert.equal(code(send(s, { type: 'deliver_site', siteId: id, item: 'stone', n: 6, at: dm({ x: SPAWN.x + 40, z: SPAWN.z }) })), 'out_of_reach');
  assert.equal(code(send(s, { type: 'deliver_site', siteId: id, item: 'stone', n: 7, at: door })), 'too_many');
  assert.equal(code(send(s, { type: 'deliver_site', siteId: id, item: 'log', n: 1, at: door })), 'not_needed');
  const d = ok(send(s, { type: 'deliver_site', siteId: id, item: 'stone', n: 6, at: door }));
  assert.ok(d.ok && d.outcome.type === 'deliver_site' && d.outcome.events[0] === 'MATERIALS_DELIVERED');
  assert.equal(s.world.wild!.items.stone ?? 0, (bag0.stone ?? 0) - 6);
  assert.deepEqual([site.state, site.reserved, site.delivered, site.consumed], ['building', { bag: { branch: 3 } }, { stone: 6 }, {}]);
  tick(s);
  for (let i = 0; i < 2; i++) {
    const w = ok(send(s, { type: 'build_work', siteId: id, at: door }), 'ring work');
    assert.ok(w.ok && w.outcome.type === 'build_work' && w.outcome.events.includes('CONSTRUCTION_PROGRESS'));
  }
  assert.equal(site.stage, 1, 'the stone ring is done');
  assert.deepEqual([site.delivered, site.consumed], [{}, { stone: 6 }], 'the finished stage consumed its stones');
  assert.equal(code(send(s, { type: 'build_work', siteId: id, at: door })), 'materials', 'the kindling stack needs its branches');
  ok(send(s, { type: 'deliver_site', siteId: id, item: 'branch', n: 3, at: door }));
  const w1 = ok(send(s, { type: 'build_work', siteId: id, at: door }));
  assert.ok(w1.ok);
  const w2 = ok(send(s, { type: 'build_work', siteId: id, at: door }));
  assert.ok(w2.ok && w2.outcome.type === 'build_work' && w2.outcome.events.includes('BUILDING_COMPLETED'));
  assert.equal(site.state, 'done');
  assert.deepEqual([site.reserved, site.delivered, site.consumed], [{}, {}, { branch: 3, stone: 6 }], 'finished: exactly its materials consumed');
  assert.deepEqual(siteProgress(site), { done: 4, total: 4, stage: 'finished' });
  assert.equal(code(send(s, { type: 'build_work', siteId: id, at: door })), 'done');
  assert.equal(code(send(s, { type: 'cancel_site', siteId: id, at: door })), 'done');
  // Cancel an unfinished campfire: the reservation is released where the items lie; the delivered stones lie at its door, not in the bag.
  fund(s, 'campfire', SPAWN);
  const q = spot(s, 'campfire', SPAWN);
  const lid = placeAt(s, 'campfire', q, 0, SPAWN);
  const lean = s.world.wild!.build!.sites.get(lid)!;
  ok(send(s, { type: 'deliver_site', siteId: lid, item: 'stone', n: 6, at: dm(siteSpotOf(lean)) }));
  assert.equal(code(send(s, { type: 'drop', item: 'branch', n: 3, at })), 'reserved', 'the reserved branches cannot be dropped');
  const bag = clone(s.world.wild!.items);
  const c = ok(send(s, { type: 'cancel_site', siteId: lid, at: dm(siteSpotOf(lean)) }));
  assert.ok(c.ok && c.outcome.type === 'cancel_site' && c.outcome.piles.length === 1 && c.outcome.events[0] === 'SITE_CANCELLED');
  assert.deepEqual((c as { outcome: { released: unknown } }).outcome.released, { branch: 3 }, 'the undelivered reservation is released');
  assert.deepEqual(s.world.wild!.items, bag, 'nothing returns to the bag and nothing leaves it');
  const pile = s.world.wild!.piles.get((c as { outcome: { piles: string[] } }).outcome.piles[0])!;
  assert.deepEqual([pile.item, pile.qty], ['stone', 6]);
  assert.ok(Math.hypot(pile.x - siteSpotOf(lean).x, pile.z - siteSpotOf(lean).z) < 1.5, 'at the site');
  assert.equal(s.world.wild!.build!.sites.has(lid), false);
  ok(send(s, { type: 'drop', item: 'branch', n: 3, at }), 'released: the branches are free again');
  // Tools: the workbench's work needs an axe in the bag. (A world without one: the axe is taken out of the
  // state directly, since an axe cannot be dropped; the refusal is the simulation's own.)
  fund(s, 'workbench', SPAWN);
  const wb = spot(s, 'workbench', SPAWN, 1);
  const wid = placeAt(s, 'workbench', wb, 1, SPAWN);
  deliverAll(s, wid);
  tick(s);
  const tools = s.world.wild!.tools, eq = s.world.wild!.equipped;
  s.world.wild!.tools = []; s.world.wild!.equipped = null;
  assert.equal(code(send(s, { type: 'build_work', siteId: wid, at: dm(siteSpotOf(s.world.wild!.build!.sites.get(wid)!)) })), 'no_tool');
  s.world.wild!.tools = tools; s.world.wild!.equipped = eq;
});

test('a completed building is solid where its model is: the workbench blocks standing, the lean-to front stays open', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  load(s);
  axe(s);
  const wid = build(s, 'workbench', SPAWN);
  const site = s.world.wild!.build!.sites.get(wid)!;
  assert.equal(site.state, 'done');
  const c = siteCellsOf(site);
  const box = solidRect(site, buildingDef('workbench')!.solids[0]);
  assert.deepEqual([box.x0, box.z0, box.x1, box.z1], [c.x0, c.z0, c.x1, c.z1]);
  const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
  assert.ok(buildingHits(s.world, cx, site.y, cz, 0.3, 1.7).includes(wid));
  assert.equal(canStandAt(s.world, cx, site.y, cz), false, 'cannot stand inside the bench');
  const e = siteEntranceOf(site);
  assert.equal(buildingHits(s.world, e.x + 0.5, surfaceAt(s.world, e.x, e.z), e.z + 0.5, 0.3, 1.7).length, 0, 'the door step is free');
});

// ---------- functions ----------

test('lean-to: built by hand, claimed as home; a recorded drowning drops the bag where you last stood (recoverable), keeps tools, restores nothing; you wake at the lean-to', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  load(s);
  // Without a claimed lean-to the respawn point is the spawn banner's spot.
  gather(s, 'branch', 1);
  const wet = shore(s);
  const d0 = ok(send(s, { type: 'died', cause: 'drowned', at: dm(wet) }));
  assert.ok(d0.ok && d0.outcome.type === 'died' && d0.outcome.events[0] === 'DIED');
  const r0 = ok(send(s, { type: 'respawn', to: 'spawn' }));
  assert.ok(r0.ok && r0.outcome.type === 'respawn' && r0.outcome.point === 'spawn');
  assert.deepEqual([(r0 as { outcome: { x: number } }).outcome.x, (r0 as { outcome: { z: number } }).outcome.z], [spawnPoint(s.world).x, spawnPoint(s.world).z]);
  ok(send(s, { type: 'pickup', entityId: (d0 as { outcome: { piles: string[] } }).outcome.piles[0], at: dm(wet) }), 'recover');
  axe(s);
  const lid = build(s, 'lean_to', SPAWN);
  const lean = s.world.wild!.build!.sites.get(lid)!;
  assert.equal(lean.state, 'done');
  const door = dm(siteSpotOf(lean));
  assert.equal(code(send(s, { type: 'claim_shelter', siteId: lid, at: dm({ x: SPAWN.x + 40, z: SPAWN.z }) })), 'out_of_reach');
  const c = ok(send(s, { type: 'claim_shelter', siteId: lid, at: door }));
  assert.ok(c.ok && c.outcome.type === 'claim_shelter' && c.outcome.events[0] === 'SHELTER_CLAIMED');
  assert.equal(s.world.wild!.build!.home, lid);
  assert.equal(code(send(s, { type: 'claim_shelter', siteId: lid, at: door })), 'already_claimed');
  // Carry something, then drown somewhere else.
  gather(s, 'loose_stone', 2); gather(s, 'mushroom', 1);
  const bag = clone(s.world.wild!.items), tools = clone(s.world.wild!.tools), hunger = s.world.wild!.hunger;
  const died = shore(s, SPAWN, 10);
  const r = ok(send(s, { type: 'died', cause: 'drowned', at: dm(died) }));
  assert.ok(r.ok && r.outcome.type === 'died');
  const o = (r as { outcome: { dropped: Record<string, number>; piles: string[]; events: string[] } }).outcome;
  assert.deepEqual(o.dropped, bag);
  assert.deepEqual(s.world.wild!.items, {}, 'the bag is empty: nothing restored');
  assert.deepEqual(s.world.wild!.tools, tools, 'tools stay with you');
  assert.equal(s.world.wild!.hunger, hunger, 'hunger is not reset');
  assert.deepEqual(o.events, ['DIED']);
  const w = ok(send(s, { type: 'respawn', to: lid }));
  assert.ok(w.ok && w.outcome.type === 'respawn');
  const wo = (w as { outcome: { point: string; x: number; z: number; events: string[] } }).outcome;
  assert.equal(wo.point, lid, 'you wake at the claimed lean-to');
  assert.deepEqual([wo.x, wo.z], [door.x, door.z], 'exactly at its door step');
  assert.deepEqual(wo.events, ['RESPAWNED']);
  for (const id of o.piles) {
    const p = s.world.wild!.piles.get(id)!;
    assert.ok(Math.hypot(p.x - died.x, p.z - died.z) < 1.5, 'the piles lie where you last stood');
    ok(send(s, { type: 'pickup', entityId: id, at: dm(p) }), 'recoverable');
  }
  assert.deepEqual(s.world.wild!.items, bag);
  // The lean-to's rate limit: 4 swings a tick, like chopping.
  fund(s, 'lean_to', SPAWN);
  const q = spot(s, 'lean_to', SPAWN, 2);
  const id2 = placeAt(s, 'lean_to', q, 2, SPAWN);
  const door2 = dm(siteSpotOf(s.world.wild!.build!.sites.get(id2)!));
  ok(send(s, { type: 'deliver_site', siteId: id2, item: 'branch', n: 2, at: door2 }));
  // Construction swings share the axe's rate limit: 3 chops and 1 work swing fill a tick.
  if (!s.world.wild!.equipped || s.world.wild!.tools.find((t) => t.id === s.world.wild!.equipped)!.durability < 5) axe(s);
  const tree = treesNear(s.world, SPAWN.x, SPAWN.z, 60).find((t) => t.stage === 'old')!;
  tick(s);
  for (let i = 0; i < 3; i++) ok(send(s, { type: 'chop', entityId: tree.e.id, at: dm(standBy(tree)) }), 'chop');
  ok(send(s, { type: 'build_work', siteId: id2, at: door2 }), 'the 4th swing');
  const h = s.stateHash;
  assert.equal(code(send(s, { type: 'build_work', siteId: id2, at: door2 })), 'too_fast');
  assert.equal(s.stateHash, h, 'a refused swing changes nothing');
  tick(s);
  ok(send(s, { type: 'build_work', siteId: id2, at: door2 }), 'foundation');
  assert.equal(code(send(s, { type: 'build_work', siteId: id2, at: door2 })), 'materials', 'the frame needs its logs first');
  assert.equal(s.world.wild!.build!.sites.get(id2)!.stage, 1);
});

test('campfire: fuel burns over time; while lit it cooks mushrooms (more food); out of fuel it cannot cook', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  load(s);
  const fid = build(s, 'campfire', SPAWN);
  const fire = s.world.wild!.build!.sites.get(fid)!;
  const at = dm(siteSpotOf(fire));
  assert.equal(fire.fuel, 0);
  gather(s, 'mushroom', 2);
  assert.equal(code(send(s, { type: 'cook', siteId: fid, item: 'mushroom', at })), 'not_lit');
  gather(s, 'loose_stone', 1);
  assert.equal(code(send(s, { type: 'fuel_fire', siteId: fid, item: 'stone', n: 1, at })), 'not_fuel');
  gather(s, 'branch', 1);
  const f = ok(send(s, { type: 'fuel_fire', siteId: fid, item: 'branch', n: 1, at }));
  assert.ok(f.ok && f.outcome.type === 'fuel_fire' && f.outcome.fuel === 30);
  const c = ok(send(s, { type: 'cook', siteId: fid, item: 'mushroom', at }));
  assert.ok(c.ok && c.outcome.type === 'cook' && c.outcome.made === 'cooked_mushroom' && c.outcome.fuel === 26);
  const h0 = s.world.wild!.hunger;
  ok(send(s, { type: 'eat', item: 'cooked_mushroom' }));
  assert.equal(s.world.wild!.hunger, Math.max(0, h0 - 24), 'cooked: 24 food (raw 10)');
  tick(s, 10);
  assert.equal(fire.fuel, 16, 'one tick of fuel burns per tick');
  tick(s, 20);
  assert.equal(fire.fuel, 0, 'out');
  assert.equal(code(send(s, { type: 'cook', siteId: fid, item: 'mushroom', at })), 'not_lit');
});

test('workbench recipes at the bench (planks, pickaxe, hammer, knife, chest); storage holds items (LOGS_DELIVERED); the storage shed unlocks', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  load(s);
  axe(s);
  const wid = build(s, 'workbench', SPAWN);
  const bench = s.world.wild!.build!.sites.get(wid)!;
  const at = dm(siteSpotOf(bench));
  unload(s);
  logPiles(s, 2); takeLogs(s, 1);
  assert.equal(code(send(s, { type: 'craft', recipe: 'planks' })), 'station', 'not without standing at a workbench');
  assert.equal(code(send(s, { type: 'craft', recipe: 'planks', at: dm({ x: SPAWN.x + 50, z: SPAWN.z }) })), 'station');
  const axeBefore = s.world.wild!.tools.find((t) => t.kind === 'stone_axe')!.durability;
  const p = ok(send(s, { type: 'craft', recipe: 'planks', at }));
  assert.ok(p.ok && p.outcome.type === 'craft' && p.outcome.made.plank === 2);
  assert.equal(s.world.wild!.tools.find((t) => t.kind === 'stone_axe')!.durability, axeBefore - 1, 'splitting wears the axe');
  gather(s, 'branch', 3); gather(s, 'loose_stone', 4);
  for (let i = 0; i < 3; i++) { gather(s, 'fiber_plant', 2); ok(send(s, { type: 'craft', recipe: 'cord' })); }
  ok(send(s, { type: 'craft', recipe: 'stone_pickaxe', at }));
  assert.equal(code(send(s, { type: 'craft', recipe: 'wooden_chest', at })), 'no_tool', 'the chest needs a hammer');
  ok(send(s, { type: 'craft', recipe: 'hammer', at }));
  gather(s, 'fiber_plant', 1);
  ok(send(s, { type: 'craft', recipe: 'knife', at }));
  assert.deepEqual(s.world.wild!.tools.map((t) => t.kind).sort(), ['hammer', 'knife', 'stone_axe', 'stone_pickaxe']);
  assert.equal(code(send(s, { type: 'craft', recipe: 'wooden_chest', at })), 'missing', 'four planks');
  unload(s, ['plank', 'cord']);
  takeLogs(s, 1);
  ok(send(s, { type: 'craft', recipe: 'planks', at }));
  ok(send(s, { type: 'craft', recipe: 'wooden_chest', at }));
  assert.equal(s.world.wild!.items.chest, 1);
  // The storage shed is now unlocked (workbench finished, a hammer carried).
  assert.deepEqual(lockReasons(s.world, buildingDef('storage_shed')!), []);
  // A log store: logs put in are delivered.
  // Funding reserves the whole store at once, so the bag must hold its stones and branches together: put the rest down first.
  unload(s);
  const sid = build(s, 'log_store', SPAWN);
  const store = s.world.wild!.build!.sites.get(sid)!;
  const sat = dm(siteSpotOf(store));
  unload(s);
  logPiles(s, 2); const n = takeLogs(s, 2);
  assert.ok(n >= 1);
  const st = ok(send(s, { type: 'store_items', siteId: sid, item: 'log', n, at: sat }));
  assert.ok(st.ok && st.outcome.type === 'store_items' && st.outcome.events.includes('LOGS_DELIVERED') && st.outcome.events.includes('ITEMS_STORED'));
  assert.deepEqual(store.stock, { log: n });
  assert.ok(s.world.wild!.fell!.events.some((e) => e.type === 'LOGS_DELIVERED' && e.ref === sid));
  assert.equal(code(send(s, { type: 'take_items', siteId: sid, item: 'log', n: n + 1, at: sat })), 'missing');
  ok(send(s, { type: 'take_items', siteId: sid, item: 'log', n: 1, at: sat }));
  assert.equal(store.stock!.log ?? 0, n - 1);
  assert.equal(code(send(s, { type: 'store_items', siteId: wid, item: 'log', n: 1, at })), 'wrong_building');
});

// ---------- determinism and saves ----------

test('construction is journaled and deterministic: replay, reload mid-construction, tampering refused', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  load(s);
  fund(s, 'lean_to', SPAWN);
  const p = spot(s, 'lean_to', SPAWN, 3);
  const r = ok(send(s, { type: 'place_site', kind: 'lean_to', x: p.x, z: p.z, rot: 3, at: dm(SPAWN) }));
  const id = r.ok && r.outcome.type === 'place_site' ? r.outcome.siteId : '';
  const site = s.world.wild!.build!.sites.get(id)!;
  const door = dm(siteSpotOf(site));
  ok(send(s, { type: 'deliver_site', siteId: id, item: 'branch', n: 2, at: door }));
  tick(s);
  ok(send(s, { type: 'build_work', siteId: id, at: door }));
  assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'replays from genesis');
  const storage = new MemoryStorage();
  const store = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w1' });
  assert.ok(store.save(s).ok);
  const again = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w1' }).load();
  assert.equal(again.status, 'restored', again.message);
  const t = again.session;
  assert.equal(t.stateHash, s.stateHash);
  const ts = t.world.wild!.build!.sites.get(id)!;
  assert.deepEqual([ts.state, ts.stage, ts.work, ts.delivered], ['building', 0, 1, { branch: 2 }], 'mid-construction state survives the reload');
  // Both sessions continue identically.
  for (const x of [s, t]) { ok(send(x, { type: 'build_work', siteId: id, at: door })); }
  assert.equal(t.stateHash, s.stateHash);
  // Tampered snapshots and outcomes are refused.
  const snap = clone(s.snapshot) as unknown as { wild: { build: { sites: Array<{ work: number }> }; content: number } };
  snap.wild.build.sites[0].work = 99;
  assert.throws(() => validateWorldSnapshot(snap), /building/);
  const snap2 = clone(s.snapshot) as unknown as { wild: { content: number } };
  snap2.wild.content = 3;
  assert.throws(() => validateWorldSnapshot(snap2), /building block/);
  const j = clone(s.journal) as unknown as { entries: Array<{ command: Record<string, unknown>; outcome: Record<string, unknown> }> };
  j.entries.find((e) => e.command.type === 'deliver_site')!.outcome.n = 1;
  assert.throws(() => validateJournal(j), /disagree/);
});

const FIXTURES = [
  ['W1 (content v1, 69296e9)', 'tests/fixtures/w1-wilderness-save.json', [2, 4]],
  ['W2 (content v2, 6b0c06d)', 'tests/fixtures/w2-wilderness-save.json', [4]],
  ['W3 (content v3, 0dba839)', 'tests/fixtures/w3-wilderness-save.json', [4]],
] as const;
for (const [name, file, upgrades] of FIXTURES) {
  test(`a ${name} save loads, replays and upgrades to building by upgrade_wilderness`, () => {
    const fx = JSON.parse(readFileSync(file, 'utf8')) as Record<string, { key: string; hash: string; record: string; compacted?: boolean }>;
    for (const which of ['short', 'long'] as const) {
      const f = fx[which];
      const storage = new MemoryStorage();
      storage.setItem(f.key, f.record);
      const store = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w1' });
      const loaded = store.load();
      assert.equal(loaded.status, 'restored', `${which}: ${loaded.message}`);
      const s = loaded.session;
      assert.equal(s.stateHash, f.hash, which);
      assert.equal(JSON.stringify({ schema: 3, seed: 1337, snapshot: s.snapshot, journal: s.journal }), f.record, `${which}: byte-identical record`);
      if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, f.hash, 'replays from genesis');
      assert.equal(s.world.wild?.build, undefined, 'no building before the upgrade');
      for (const c of upgrades) ok(send(s, { type: 'upgrade_wilderness', content: c }), `upgrade to v${c}`);
      assert.equal(code(send(s, { type: 'upgrade_wilderness', content: 4 })), 'already_current');
      assert.equal(s.world.wild!.content, 4);
      assert.ok(s.world.wild!.fell && s.world.wild!.build);
      load(s);
      fund(s, 'campfire', SPAWN);
      const p = spot(s, 'campfire', SPAWN);
      ok(send(s, { type: 'place_site', kind: 'campfire', x: p.x, z: p.z, rot: 0, at: dm(SPAWN) }), 'place after the upgrade');
      assert.ok(store.save(s).ok);
      const again = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w1' }).load();
      assert.equal(again.status, 'restored');
      assert.equal(again.session.stateHash, s.stateHash);
      if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'upgraded journal replays');
    }
  });
}
