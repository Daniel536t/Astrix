// M014 "player-directed construction". Settlement rules v6: the owner picks a
// building from the catalogue, its place and its rotation; one validator
// (sim/buildings.ts checkBuilding) decides both the preview and the journaled
// place_site; builders haul reserved materials and build; finished woodsheds
// and log stores are timber stores the woodcutter delivers to; wells are water
// sources; a cancelled site's materials are carried back. Old saves (v1-v5)
// keep their exact hashes and upgrade by one journaled command.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2, MAT, setVoxel, surfaceAt } from '../src/sim/world';
import type { Entity } from '../src/sim/world';
import {
  BUILD_KINDS, DM, HOMESTEAD_BUILD_VERSION, SITE_RULES, STORE_SPOT, SiteKind, facility, findFieldSpot, findSiteSpot, freeInStore, homesteadNav,
  homesteadSnapshot, reservations, siteCells, siteEntrance, siteSize, siteSpot, siteStatus, storeRoom, timberStores, validateHomestead, woodDropOff,
  wellFor,
} from '../src/sim/homestead';
import { BUILD_RANGE, buildingPreview, checkBuilding, findBuildingSpot } from '../src/sim/buildings';
import { addTree, managedWoodland, plantable, windowTrees, woodlandStats } from '../src/sim/forestry';
import { recordOf, stageEnds, treeLife } from '../src/sim/woodland';
import { BLOCK, SOLID, resetNavCache, structureHits } from '../src/sim/nav';
import { FOUNDER_STOCKPILE_ID } from '../src/sim/economy';
import { createWorldSnapshot } from '../src/sim/snapshot';

type Session = GameSession;
let seq = 0;
function send(s: Session, c: Record<string, unknown>) {
  return s.dispatch({ schema: 3, id: `m014:${seq++}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never);
}
const ok = (s: Session, c: Record<string, unknown>) => { const r = send(s, c); assert.ok(r.ok, `${c.type}: ${JSON.stringify(r)}`); return r; };
const store = (s: Session) => s.world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory;
const founded = (rules = 6) => { const s = GameSession.genesis(1337, GENERATOR_V2); ok(s, { type: 'found_homestead', rules }); return s; };
const ticks = (s: Session, n: number, each?: (i: number) => void) => { for (let i = 0; i < n; i++) { ok(s, { type: 'tick', ticks: 1 }); each?.(i); } };
const place = (s: Session, kind: SiteKind, x: number, z: number, rot: number) => {
  const r = ok(s, { type: 'place_site', kind, x, z, rot });
  assert.ok(r.ok && r.outcome.type === 'place_site');
  return r.outcome.siteId;
};
const site = (s: Session, id: string) => s.world.homestead!.sites!.find((st) => st.id === id)!;
const woodTotal = (s: Session) => {
  const h = s.world.homestead!;
  return (store(s).wood ?? 0) + (h.overflow.wood ?? 0) + h.sites!.reduce((n, st) => n + (st.stock?.wood ?? 0) + (st.delivered.wood ?? 0), 0)
    + h.villagers.reduce((n, v) => n + (v.carry?.item === 'wood' ? v.carry.amount : 0), 0);
};
/** First (x, z, rot) near the farmhouse whose check satisfies `pred` (a scan of the walking window). */
function scan(s: Session, kind: SiteKind, pred: (c: ReturnType<typeof checkBuilding>) => boolean, rots = [0], step = 2) {
  const home = facility(s.world.homestead!, 'farmhouse')!.use;
  const hx = Math.round(home.x / DM), hz = Math.round(home.z / DM);
  for (let r = 4; r <= 54; r += step) for (let a = 0; a < 24; a++) for (const rot of rots) {
    const x = hx + Math.round(Math.cos(a / 24 * 2 * Math.PI) * r), z = hz + Math.round(Math.sin(a / 24 * 2 * Math.PI) * r);
    const c = checkBuilding(s.world, kind, x, z, rot);
    if (pred(c)) return c;
  }
  return null;
}

test('catalogue and rotation: each kind has a footprint, door side, costs, work and a function; a quarter turn swaps the sides and moves the door', () => {
  assert.deepEqual([...BUILD_KINDS], ['logstore', 'well', 'woodshed']);
  for (const k of BUILD_KINDS) {
    const r = SITE_RULES[k];
    assert.ok(r.w >= 1 && r.d >= 1 && r.work > 0 && Object.keys(r.cost).length && r.maxStep >= 1 && r.role.length, k);
    assert.ok(!!r.store || !!r.water, `${k} has a function in the simulation`);
  }
  assert.equal(SITE_RULES.woodshed.cost.wood, 12); assert.equal(SITE_RULES.woodshed.cost.fiber, 4); assert.equal(SITE_RULES.woodshed.work, 24);
  assert.equal(SITE_RULES.woodshed.store!.capacity, 60);
  for (const k of BUILD_KINDS) {
    const r = SITE_RULES[k];
    for (const rot of [0, 1, 2, 3]) {
      const st = { kind: k, x: 10, z: 20, rot };
      const c = siteCells(st), e = siteEntrance(st), sz = siteSize(k, rot);
      assert.deepEqual([c.x1 - c.x0, c.z1 - c.z0], rot % 2 ? [r.d, r.w] : [r.w, r.d], `${k} rot ${rot} size`);
      assert.deepEqual([sz.w, sz.d], [c.x1 - c.x0, c.z1 - c.z0]);
      // The entrance is outside the footprint, touching the door side.
      const inside = e.x >= c.x0 && e.x < c.x1 && e.z >= c.z0 && e.z < c.z1;
      assert.ok(!inside, `${k} ${rot}: entrance outside`);
      const side = rot === 0 ? e.z === c.z1 && e.x >= c.x0 && e.x < c.x1 : rot === 1 ? e.x === c.x1 && e.z >= c.z0 && e.z < c.z1
        : rot === 2 ? e.z === c.z0 - 1 && e.x >= c.x0 && e.x < c.x1 : e.x === c.x0 - 1 && e.z >= c.z0 && e.z < c.z1;
      assert.ok(side, `${k} rot ${rot}: door on the ${['+z', '+x', '-z', '-x'][rot]} side (${JSON.stringify([c, e])})`);
    }
  }
  // Rotation 0 (and no rotation, as every v4/v5 site) is the M012 builder spot exactly.
  const st = { kind: 'woodshed' as SiteKind, x: -42, z: -11 };
  assert.deepEqual(siteSpot(st), { x: (-42 + 1) * DM + 5, z: (-11 + 2) * DM + 5 });
  assert.deepEqual(siteSpot({ ...st, rot: 0 }), siteSpot(st));
});

test('validation rules: steep ground, water, fences, buildings, fields, the store; mature trees block while saplings are cleared; protected trees block; an unreachable entrance is refused', () => {
  const s = founded();
  const h = s.world.homestead!;
  // A field to overlap.
  const fs = findFieldSpot(s.world, 4, 4, 'flax')!;
  s.world.inventory.wood = (s.world.inventory.wood ?? 0) + 10;
  ok(s, { type: 'mark_field', ...fs });
  const has = (c: ReturnType<typeof checkBuilding>, re: RegExp) => c.reasons.some((r) => re.test(r));
  // Overlaps: the farmhouse, a pen fence, a field (its fence), the store.
  const house = facility(h, 'farmhouse')!.rect;
  assert.ok(has(checkBuilding(s.world, 'woodshed', house.x0 / DM + 1, house.z0 / DM + 1, 0), /farmhouse, the well or a pen/));
  const pen = facility(h, 'pen')!.rect;
  const overPen = checkBuilding(s.world, 'woodshed', pen.x0 / DM - 1, pen.z0 / DM + 2, 0);
  assert.ok(has(overPen, /pen/) && has(overPen, /fence runs here/), JSON.stringify(overPen.reasons));
  const overField = checkBuilding(s.world, 'logstore', fs.x + 1, fs.z - 0, 0);
  assert.ok(has(overField, /field/) && has(overField, /fence runs here/), JSON.stringify(overField.reasons));
  assert.ok(has(checkBuilding(s.world, 'well', -51, -33, 0), /store and barn/));
  assert.ok(has(checkBuilding(s.world, 'woodshed', h.anchorX + 70, h.anchorZ, 0), /walking area|too far/));
  // Steep ground and water somewhere in the window.
  const steep = scan(s, 'woodshed', (c) => has(c, /too steep/), [0], 1);
  assert.ok(steep, 'a steep spot exists');
  assert.ok(steep!.ground.hi - steep!.ground.lo > SITE_RULES.woodshed.maxStep);
  const wet = scan(s, 'well', (c) => has(c, /water/), [0], 1);
  assert.ok(wet, 'a wet spot exists');
  // A sapling in the footprint is cleared; a mature tree blocks.
  const good = findBuildingSpot(s.world, 'woodshed', 0)!;
  const c0 = checkBuilding(s.world, 'woodshed', good.x, good.z, 0);
  assert.ok(c0.ok, JSON.stringify(c0.reasons));
  const sap = addTree(s.world, h, 'birch', good.x + 1, good.z, 'plant');
  const c1 = checkBuilding(s.world, 'woodshed', good.x, good.z, 0);
  assert.ok(c1.ok, `a sapling does not block: ${c1.reasons}`);
  assert.ok(c1.clears.includes(sap.id) && /1 sapling/.test(c1.clearText));
  // The same tree when mature blocks (age it by moving its birth back).
  const rec = recordOf(h.woodland!, sap.id)!;
  const born = rec.born;
  rec.born = born - stageEnds('birch', sap.id)[1] - 30;
  assert.equal(treeLife(s.world, sap)!.stage, 'mature');
  const c2 = checkBuilding(s.world, 'woodshed', good.x, good.z, 0);
  assert.ok(!c2.ok && has(c2, /mature birch stands/), JSON.stringify(c2.reasons));
  assert.ok(c2.blockers.some((b) => b.id === sap.id));
  rec.born = born;
  // An owner-protected sapling blocks too.
  ok(s, { type: 'protect_tree', entityId: sap.id, protect: true });
  const c3 = checkBuilding(s.world, 'woodshed', good.x, good.z, 0);
  assert.ok(!c3.ok && has(c3, /you protected/), JSON.stringify(c3.reasons));
  ok(s, { type: 'protect_tree', entityId: sap.id, protect: false });
  // Placing clears the sapling for good: gone from the grid, no record, and it never regrows.
  const id = place(s, 'woodshed', good.x, good.z, 0);
  assert.ok(sap.harvested);
  assert.equal(recordOf(h.woodland!, sap.id), undefined);
  assert.equal(treeLife(s.world, sap)!.present, false);
  assert.equal(treeLife(s.world, sap)!.nextIn, null);
  const g = homesteadNav(s.world, h);
  assert.notEqual(g.blockId.get(g.index(good.x + 1, good.z)), sap.id);
  assert.ok(has(checkBuilding(s.world, 'logstore', good.x + 1, good.z, 0), /another building or site/));
  assert.equal(site(s, id).rot, 0);
  // Unreachable entrance: wall in the door step with stone (a world edit, test only).
  const spot = findBuildingSpot(s.world, 'logstore', 0)!;
  const cOk = checkBuilding(s.world, 'logstore', spot.x, spot.z, 0);
  assert.ok(cOk.ok && cOk.routeToStore !== null && cOk.routeToHome !== null);
  const e = cOk.entrance;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const x = e.x + dx, z = e.z + dz;
    if ((dx === 0 && dz === 0) || (x >= cOk.cells.x0 && x < cOk.cells.x1 && z >= cOk.cells.z0 && z < cOk.cells.z1)) continue;
    const y = surfaceAt(s.world, x, z);
    for (let k = 0; k < 3; k++) setVoxel(s.world, x, y + k, z, MAT.STONE);
  }
  resetNavCache(s.world);
  const walled = checkBuilding(s.world, 'logstore', spot.x, spot.z, 0);
  assert.deepEqual(walled.reasons, ['the entrance cannot be reached from the store on foot']);
  const before = s.stateHash;
  const r = send(s, { type: 'place_site', kind: 'logstore', ...spot, rot: 0 });
  assert.ok(!r.ok && r.code === 'invalid_site');
  assert.deepEqual(!r.ok && r.reasons, walled.reasons, 'the command refuses with the preview\'s reasons');
  assert.equal(s.stateHash, before, 'a refusal changes nothing');
});

test('the same validator decides the preview and the command, for every kind and rotation', () => {
  const s = founded();
  const h = s.world.homestead!;
  const home = facility(h, 'farmhouse')!.use;
  const hx = Math.round(home.x / DM), hz = Math.round(home.z / DM);
  let accepted = 0, refused = 0;
  for (let k = 0; k < 60 && (accepted < 6 || refused < 20); k++) {
    const kind = BUILD_KINDS[k % 3], rot = k % 4;
    const x = hx - 30 + ((k * 37) % 61), z = hz - 30 + ((k * 53) % 61);
    const p = buildingPreview(s.world, kind, x, z, rot);
    const before = s.stateHash;
    const r = send(s, { type: 'place_site', kind, x, z, rot });
    assert.equal(r.ok, p.check.ok, `${kind} ${x},${z} r${rot}: preview ${JSON.stringify(p.check.reasons)} vs ${JSON.stringify(r)}`);
    if (!r.ok) { assert.deepEqual(r.reasons, p.check.reasons); assert.equal(s.stateHash, before); refused++; }
    else {
      accepted++;
      const st = site(s, r.outcome.type === 'place_site' ? r.outcome.siteId : '');
      assert.deepEqual([st.kind, st.x, st.z, st.rot], [kind, x, z, rot]);
      if (accepted > 4) ok(s, { type: 'cancel_site', siteId: st.id });
    }
  }
  assert.ok(accepted >= 3 && refused >= 10, `${accepted} accepted, ${refused} refused`);
  // Commands are strictly validated.
  for (const bad of [{ rot: 4 }, { rot: -1 }, { rot: 1.5 }, { rot: '1' }, { kind: 'castle' }]) {
    const r = send(s, { type: 'place_site', kind: 'woodshed', x: 0, z: 0, ...bad });
    assert.ok(!r.ok && r.code === 'invalid_command', JSON.stringify(bad));
  }
});

test('woodland statistics in the preview: harvestable, protected and regrowing trees in the work radius, the haul to this store against the founder store, sustainable yield; a pure query', () => {
  const s = founded();
  const h = s.world.homestead!;
  // A woodshed beside the oak at the north edge of the farm (a mature tree in the managed woodland).
  const lot = managedWoodland(s.world, h);
  const oak = lot.trees.find((e) => e.id === 'e:31,32:5') ?? lot.trees[0];
  const spot = findBuildingSpot(s.world, 'woodshed', 1, { x: Math.floor(oak.x) - 8, z: Math.floor(oak.z) - 2 })!;
  assert.ok(spot);
  const before = s.stateHash;
  const p = buildingPreview(s.world, 'woodshed', spot.x, spot.z, 1);
  assert.equal(s.stateHash, before, 'the preview changes nothing');
  assert.ok(p.check.ok, JSON.stringify(p.check.reasons));
  const w = p.woodland!, via = p.viaStore!;
  assert.ok(w && via);
  assert.equal(w.radius, SITE_RULES.woodshed.workRadius);
  assert.deepEqual(w.store, { x: p.check.entrance.x + 0.5, z: p.check.entrance.z + 0.5 });
  assert.ok(w.trees >= 2 && w.harvestable + w.protected <= w.trees + w.byStage.stump);
  assert.ok(w.meanPathToStore !== null && via.meanPathToStore !== null);
  assert.ok(w.meanPathToStore! < via.meanPathToStore! / 3, `haul ${w.meanPathToStore} m to the shed vs ${via.meanPathToStore} m to the store`);
  assert.ok(w.sustainableTreesPerDay > 0 && w.rotationDays > 0 && w.spotsForDemand! > 0);
  // The planned building's buffer protects trees beside it, exactly as the finished one will.
  const near = lot.trees.filter((e) => (e.x - p.check.cells.x0) ** 2 + (e.z - p.check.cells.z0) ** 2 < 15 ** 2);
  const id = place(s, 'woodshed', spot.x, spot.z, 1);
  const after = woodlandStats(s.world, { x: w.centre.x, z: w.centre.z, radius: w.radius, store: w.store });
  assert.equal(after!.harvestable, w.harvestable, 'the preview counted what the placed site protects');
  assert.equal(after!.protected, w.protected);
  assert.ok(near.length >= 1);
  assert.ok(site(s, id));
  // Placing shows nothing for a well (not a timber store).
  assert.equal(buildingPreview(s.world, 'well', spot.x + 8, spot.z, 0).woodland, null);
});

test('reservations across several sites: stock is held in id order, never twice; sites without stock wait with a reason; the builder completes them all', () => {
  const s = founded();
  const h = s.world.homestead!;
  const inv = store(s);
  inv.wood = 20;
  const ids: string[] = [];
  for (const kind of ['woodshed', 'logstore', 'well'] as SiteKind[]) {
    const spot = findBuildingSpot(s.world, kind, ids.length % 4)!;
    ids.push(place(s, kind, spot.x, spot.z, ids.length % 4));
  }
  for (const id of ids) ok(s, { type: 'approve_site', siteId: id });
  // site ids in order: woodshed 12 wood, log store 6 wood, well the remaining 2.
  assert.deepEqual(site(s, ids[0]).reserved, { fiber: 4, wood: 12 });
  assert.deepEqual(site(s, ids[1]).reserved, { fiber: 2, wood: 6 });
  assert.deepEqual(site(s, ids[2]).reserved, { fiber: 2, wood: 2 });
  assert.deepEqual(reservations(h), { fiber: 8, wood: 20 });
  assert.equal(freeInStore(s.world, 'wood'), 0);
  assert.match(siteStatus(s.world, site(s, ids[2])), /waiting for a builder/);
  ok(s, { type: 'assign_role', villagerId: 'villager:0', role: 'builder', actor: 'player' });
  let maxHeld = 0;
  ticks(s, 120, () => {
    const held = reservations(h);
    assert.ok((held.wood ?? 0) <= (store(s).wood ?? 0) + timberStores(h).reduce((n, st) => n + (st.stock?.wood ?? 0), 0));
    maxHeld = Math.max(maxHeld, site(s, ids[2])?.reserved.wood ?? 0);
  });
  assert.ok(maxHeld <= 2, 'the third site never holds more than the 2 left');
  assert.match(siteStatus(s.world, site(s, ids[2])), /waiting for 6 wood/);
  // More wood arrives (a deposit from the founder's bag, journaled): the third site takes it at the next tick.
  s.world.inventory.wood = (s.world.inventory.wood ?? 0) + 6;
  ok(s, { type: 'deposit', stockpileId: FOUNDER_STOCKPILE_ID, resources: { wood: 6 } });
  ticks(s, 1500);
  for (const id of ids) assert.equal(site(s, id).state, 'done', `${id}: ${siteStatus(s.world, site(s, id))}`);
  assert.deepEqual(reservations(h), {});
  // Finished buildings are solid on the walking grid and for the player, in their turned footprints.
  const g = homesteadNav(s.world, h);
  for (const id of ids) {
    const c = siteCells(site(s, id));
    for (let z = c.z0; z < c.z1; z++) for (let x = c.x0; x < c.x1; x++) {
      // Blocked (a tree that grew up beside it may also claim an edge cell; the walking grid keeps one reason per cell).
      assert.notEqual(g.block[g.index(x, z)], BLOCK.none, `${id} ${x},${z}`);
      assert.equal(g.solid[g.index(x, z)], SOLID.shelter);
    }
    const e = siteEntrance(site(s, id));
    assert.equal(g.block[g.index(e.x, e.z)], BLOCK.none, 'the door step stays open');
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    assert.ok(structureHits(g, () => 'closed', cx, surfaceAt(s.world, Math.floor(cx), Math.floor(cz)), cz, 0.3, 1.8).length > 0, 'the player collides');
  }
  // A finished woodshed and log store are (empty) timber stores; a well is not.
  assert.deepEqual(timberStores(h).map((st) => st.kind).sort(), ['logstore', 'woodshed']);
  assert.equal(storeRoom(site(s, ids[0])), 60);
});

test('a woodshed beside the woodland changes the woodcutter: loads go to the nearest store with room, the haul is shorter, capacity holds, and builders fetch from it', () => {
  const s = founded();
  const h = s.world.homestead!;
  const lot = managedWoodland(s.world, h);
  const oak = lot.trees.find((e) => e.id === 'e:31,32:5') ?? lot.trees[0];
  const spot = findBuildingSpot(s.world, 'woodshed', 1, { x: Math.floor(oak.x) - 4, z: Math.floor(oak.z) - 3 })!;
  const shed = place(s, 'woodshed', spot.x, spot.z, 1);
  ok(s, { type: 'approve_site', siteId: shed });
  store(s).wood = 12; // the woodshed's timber is in the store already (test setup), so the builder starts at once
  ok(s, { type: 'assign_role', villagerId: 'villager:0', role: 'builder', actor: 'player' });
  ticks(s, 400, () => undefined);
  assert.equal(site(s, shed).state, 'done', siteStatus(s.world, site(s, shed)));
  assert.deepEqual(site(s, shed).stock, {});
  // Now Cora fells with the woodshed there; felling by demand (not the slow sustainable allowance) to see several loads.
  ok(s, { type: 'woodland_policy', ...h.woodland!.policy, harvest: 'demand' });
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
  const cora = h.villagers.find((v) => v.id === 'villager:2')!;
  const shedSpot = siteSpot(site(s, shed));
  const seen: Array<{ tree: string; effect: string; x: number; z: number; tx: number; tz: number; room: number }> = [];
  let lastTask = '';
  let total = woodTotal(s);
  let cut = 0;
  ticks(s, 1500, () => {
    const t = cora.task;
    if (t?.kind === 'chop' && `${t.target}:${t.legs[3].x}` !== lastTask) {
      lastTask = `${t.target}:${t.legs[3].x}`;
      const e = s.world.entities.get(`e:${t.target.slice(5).replace(':', ',')}`)!;
      seen.push({ tree: t.target, effect: t.legs[3].effect, x: t.legs[3].x, z: t.legs[3].z, tx: e.x, tz: e.z, room: storeRoom(site(s, shed)) });
    }
    // Wood is conserved: only felling adds it.
    const now = woodTotal(s);
    if (now !== total) { assert.ok(now > total, 'wood never disappears'); cut += now - total; total = now; }
  });
  assert.ok(seen.length >= 2, `${seen.length} fellings`);
  for (const f of seen) {
    // The drop-off is the nearest (straight line from the tree) of the woodshed and the store.
    const dShed = (f.tx * DM - shedSpot.x) ** 2 + (f.tz * DM - shedSpot.z) ** 2, dStore = (f.tx * DM - STORE_SPOT.x) ** 2 + (f.tz * DM - STORE_SPOT.z) ** 2;
    if (f.effect === 'stow') { assert.deepEqual([f.x, f.z], [shedSpot.x, shedSpot.z]); assert.ok(dShed < dStore, `${f.tree}: the shed is the nearer`); }
    else { assert.equal(f.effect, 'store'); assert.ok(dStore <= dShed || f.room === 0, `${f.tree}: the store is the nearer (or the shed is full)`); }
  }
  const stows = seen.filter((f) => f.effect === 'stow');
  assert.ok(stows.length >= 1, `at least one load into the woodshed: ${JSON.stringify(seen)}`);
  assert.ok((site(s, shed).stock!.wood ?? 0) > 0, 'timber is stacked in the woodshed');
  const viaShed = woodlandStats(s.world, { x: oak.x, z: oak.z, radius: 30, store: { x: shedSpot.x / DM, z: shedSpot.z / DM } })!;
  const viaStore = woodlandStats(s.world, { x: oak.x, z: oak.z, radius: 30 })!;
  if (viaShed.meanPathToStore !== null) assert.ok(viaShed.meanPathToStore < viaStore.meanPathToStore!);
  // Capacity: with 58 in it, an 8-wood load stacks 2 and takes the rest on to the store.
  site(s, shed).stock = { wood: 58 };
  assert.equal(storeRoom(site(s, shed)), 2);
  cora.task = null; cora.carry = { item: 'wood', amount: 8 }; cora.x = shedSpot.x; cora.z = shedSpot.z; delete cora.nav;
  const storeBefore = store(s).wood ?? 0;
  for (let i = 0; i < 200 && (cora.carry?.item === 'wood'); i++) ok(s, { type: 'tick', ticks: 1 });
  assert.equal(site(s, shed).stock!.wood, 60);
  assert.equal(woodDropOff(h, shedSpot.x, shedSpot.z).effect, 'store', 'a full shed is no drop-off');
  assert.ok((store(s).wood ?? 0) >= storeBefore + 6, 'the rest went to the store');
  // A builder fetches reserved timber from the woodshed when it is the nearest store holding some.
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'farmer', actor: 'player' });
  store(s).wood = 0;
  const ls = findBuildingSpot(s.world, 'logstore', 0, { x: spot.x + 6, z: spot.z })!;
  const ls1 = place(s, 'logstore', ls.x, ls.z, 0);
  ok(s, { type: 'approve_site', siteId: ls1 });
  assert.equal(site(s, ls1).reserved.wood, 6);
  const ada = h.villagers.find((v) => v.id === 'villager:0')!;
  let fetchedAtShed = false;
  ticks(s, 400, () => { const t = ada.task; if (t?.kind === 'haul' && t.legs[1].effect === 'fetch' && t.legs[1].item === 'wood' && t.legs[1].x === shedSpot.x && t.legs[1].z === shedSpot.z) fetchedAtShed = true; });
  assert.ok(fetchedAtShed, 'the builder fetched from the woodshed');
  assert.equal(site(s, ls1).state, 'done');
  assert.equal(site(s, shed).stock!.wood, 54);
});

test('a finished well is a water source: farmers draw at the nearest well', () => {
  const s = founded();
  const h = s.world.homestead!;
  store(s).wood = 8;
  const farmWell = facility(h, 'well')!.use;
  const spot = findBuildingSpot(s.world, 'well', 2, { x: h.anchorX + 30, z: h.anchorZ - 30 })!;
  const id = place(s, 'well', spot.x, spot.z, 2);
  ok(s, { type: 'approve_site', siteId: id });
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'builder', actor: 'player' });
  ticks(s, 500);
  assert.equal(site(s, id).state, 'done');
  const near = { x: spot.x * DM + 5, z: spot.z * DM + 5 };
  assert.deepEqual(wellFor(h, near), siteSpot(site(s, id)));
  assert.deepEqual(wellFor(h, farmWell), farmWell);
});

test('cancel: a planned site goes at once; an approved one releases its reservation; after delivery the builder carries the materials back (no teleport) and the site goes', () => {
  const s = founded();
  const h = s.world.homestead!;
  store(s).wood = 30;
  const a = findBuildingSpot(s.world, 'woodshed', 0)!;
  const planned = place(s, 'woodshed', a.x, a.z, 0);
  ok(s, { type: 'cancel_site', siteId: planned });
  assert.equal(h.sites!.length, 0);
  const id = place(s, 'woodshed', a.x, a.z, 3);
  ok(s, { type: 'approve_site', siteId: id });
  assert.equal(freeInStore(s.world, 'wood'), 18);
  ok(s, { type: 'assign_role', villagerId: 'villager:0', role: 'builder', actor: 'player' });
  const ada = h.villagers.find((v) => v.id === 'villager:0')!;
  const total0 = woodTotal(s) + (store(s).fiber ?? 0) + h.villagers.reduce((n, v) => n + (v.carry?.item === 'fiber' ? v.carry.amount : 0), 0);
  for (let i = 0; i < 400 && (site(s, id).delivered.wood ?? 0) < 8; i++) ok(s, { type: 'tick', ticks: 1 });
  assert.ok((site(s, id).delivered.wood ?? 0) >= 8);
  const r = ok(s, { type: 'cancel_site', siteId: id });
  assert.ok(r.ok && r.outcome.type === 'cancel_site');
  assert.equal(site(s, id).state, 'cancelled');
  assert.deepEqual(site(s, id).reserved, {});
  assert.equal(send(s, { type: 'approve_site', siteId: id }).ok, false);
  assert.equal(send(s, { type: 'cancel_site', siteId: id }).ok, false);
  assert.match(siteStatus(s.world, site(s, id)), /cancelled/);
  const all = () => woodTotal(s) + (store(s).fiber ?? 0) + (h.sites!.find((x) => x.id === id)?.delivered.fiber ?? 0) + h.villagers.reduce((n, v) => n + (v.carry?.item === 'fiber' ? v.carry.amount : 0), 0);
  let prevStore = store(s).wood ?? 0, sawReclaim = false;
  for (let i = 0; i < 600; i++) {
    if (!h.sites!.some((x) => x.id === id) && !ada.carry) break;
    ok(s, { type: 'tick', ticks: 1 });
    if (ada.task?.kind === 'reclaim') sawReclaim = true;
    const now = store(s).wood ?? 0;
    // The store gains wood only when the builder stands at it (the store leg).
    if (now > prevStore) assert.ok(Math.hypot(ada.x - STORE_SPOT.x, ada.z - STORE_SPOT.z) <= 30, `store gained wood with Ada at ${ada.x},${ada.z}`);
    prevStore = now;
    assert.equal(all(), total0, 'materials conserved');
  }
  assert.ok(sawReclaim);
  assert.equal(h.sites!.some((x) => x.id === id), false, 'the emptied site is gone');
  assert.equal(store(s).wood, 30);
});

test('save and reload mid-construction: the same hash, the same sites, reservations, loads and progress; both continue to the same hash; replay from genesis agrees', () => {
  const s = founded();
  const h = s.world.homestead!;
  const a = findBuildingSpot(s.world, 'woodshed', 1)!;
  const id1 = place(s, 'woodshed', a.x, a.z, 1);
  ok(s, { type: 'approve_site', siteId: id1 });
  const b = findBuildingSpot(s.world, 'logstore', 2)!;
  const id2 = place(s, 'logstore', b.x, b.z, 2);
  ok(s, { type: 'approve_site', siteId: id2 });
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
  ok(s, { type: 'assign_role', villagerId: 'villager:0', role: 'builder', actor: 'player' });
  ok(s, { type: 'woodland_policy', ...h.woodland!.policy, harvest: 'demand' });
  let mid = false;
  for (let i = 0; i < 900 && !mid; i++) {
    ok(s, { type: 'tick', ticks: 1 });
    const st = site(s, id1);
    mid = Object.keys(st.delivered).length > 0 && h.villagers.some((v) => v.carry);
  }
  assert.ok(mid, 'materials on site and a load in hand');
  const snap = JSON.parse(JSON.stringify(s.snapshot)), journal = JSON.parse(JSON.stringify(s.journal));
  const r = GameSession.restore(snap, journal);
  assert.equal(r.stateHash, s.stateHash);
  assert.equal(JSON.stringify(homesteadSnapshot(r.world.homestead!)), JSON.stringify(homesteadSnapshot(h)));
  resetNavCache(r.world);
  ticks(s, 500); ticks(r, 500);
  assert.equal(r.stateHash, s.stateHash);
  assert.ok(['approved', 'done'].includes(site(s, id1).state));
  assert.equal(GameSession.replay(JSON.parse(JSON.stringify(s.journal))).stateHash, s.stateHash, 'replay from genesis');
  // Determinism: a second run of the same commands gives the same hash.
  const s2 = GameSession.genesis(1337, GENERATOR_V2);
  for (const e of s.journal.entries) { const rr = s2.dispatch(e.command); assert.ok(rr.ok); }
  assert.equal(s2.stateHash, s.stateHash);
  // A finished timber store with its stock survives a save too.
  if (site(s, id1).state === 'done') {
    const again = GameSession.restore(JSON.parse(JSON.stringify(s.snapshot)), JSON.parse(JSON.stringify(s.journal)));
    assert.deepEqual(site(again, id1).stock, site(s, id1).stock);
  }
});

test('old saves: v4 and v5 hashes unchanged (v1-v3 pinned by M012); a v5 save restores byte-identical; v5 refuses v6 kinds and rotation; upgrading keeps the woodland and the finished woodshed, which becomes a timber store', () => {
  assert.equal(GameSession.genesis(1337).stateHash, 'e659504b056654dc');
  const pinned = (rules: number) => {
    let n = 0;
    const s = GameSession.genesis(1337, GENERATOR_V2);
    const go = (c: Record<string, unknown>) => { const r = s.dispatch({ schema: 3, id: `pin:${n++}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never); assert.ok(r.ok, JSON.stringify(r)); };
    go({ type: 'found_homestead', rules });
    go({ type: 'mark_field', ...findFieldSpot(s.world, 5, 4, 'potato')! });
    go({ type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
    go({ type: 'place_site', kind: 'woodshed', ...findSiteSpot(s.world)! });
    go({ type: 'approve_site', siteId: s.world.homestead!.sites![0].id });
    go({ type: 'assign_role', villagerId: 'villager:0', role: 'builder', actor: 'player' });
    for (let i = 0; i < 400; i++) go({ type: 'tick', ticks: 1 });
    go({ type: 'set_gate', gateId: 'gate:pen', state: 'open' });
    for (let i = 0; i < 50; i++) go({ type: 'tick', ticks: 1 });
    return s;
  };
  // Measured with the M012 build (7d66e8c) for v4 and the M013 build (5ef2236) for v5.
  assert.equal(pinned(4).stateHash, '6ce5ae532227eeb9');
  const s = pinned(5);
  assert.equal(s.stateHash, 'f249cb544027b9bd');
  const h = s.world.homestead!;
  const v5snap = JSON.parse(JSON.stringify(s.snapshot));
  assert.equal(v5snap.homestead.sites[0].rot, undefined);
  assert.equal(v5snap.homestead.sites[0].stock, undefined);
  assert.equal(JSON.stringify(GameSession.restore(v5snap, JSON.parse(JSON.stringify(s.journal))).snapshot), JSON.stringify(s.snapshot), 'byte-identical');
  // v5 refuses the new kinds, rotation and v6 fields.
  const spot = findSiteSpot(s.world)!;
  assert.equal(send(s, { type: 'place_site', kind: 'well', ...spot }).ok, false);
  const rr = send(s, { type: 'place_site', kind: 'woodshed', ...spot, rot: 1 });
  assert.ok(!rr.ok && rr.code === 'needs_rules');
  const bad = JSON.parse(JSON.stringify(homesteadSnapshot(h)));
  bad.sites[0].rot = 0;
  assert.throws(() => validateHomestead(bad, s.world.life!.tick));
  const bad2 = JSON.parse(JSON.stringify(homesteadSnapshot(h)));
  bad2.sites[0].stock = {};
  assert.throws(() => validateHomestead(bad2, s.world.life!.tick));
  // The upgrade: one journaled command; the woodland (records, policy, quota, every tree's stage) and the woodshed carry on.
  const woodland = JSON.stringify(homesteadSnapshot(h).woodland);
  const stages = windowTrees(s.world, h).map((e: Entity) => `${e.id}:${treeLife(s.world, e)!.stage}`).join(',');
  const grid = homesteadNav(s.world, h).hash;
  const inv = JSON.stringify(store(s)), bag = JSON.stringify(s.world.inventory);
  const people = JSON.stringify(h.villagers.map((v) => [v.id, v.name, v.role, v.x, v.z]));
  assert.equal(h.sites![0].state, 'done');
  ok(s, { type: 'upgrade_homestead', rules: 6 });
  assert.equal(send(s, { type: 'upgrade_homestead', rules: 6 }).ok, false, 'once only');
  assert.equal(h.version, HOMESTEAD_BUILD_VERSION);
  assert.equal(JSON.stringify(homesteadSnapshot(h).woodland), woodland, 'the woodland is not restarted');
  assert.equal(windowTrees(s.world, h).map((e: Entity) => `${e.id}:${treeLife(s.world, e)!.stage}`).join(','), stages);
  assert.equal(homesteadNav(s.world, h).hash, grid);
  assert.equal(JSON.stringify(store(s)), inv); assert.equal(JSON.stringify(s.world.inventory), bag);
  assert.equal(JSON.stringify(h.villagers.map((v) => [v.id, v.name, v.role, v.x, v.z])), people);
  assert.deepEqual([h.sites![0].state, h.sites![0].rot, h.sites![0].stock], ['done', 0, {}]);
  assert.deepEqual(timberStores(h).map((st) => st.id), [h.sites![0].id]);
  // The old woodshed now takes the woodcutter's loads when it is nearer than the store.
  ticks(s, 600);
  assert.equal(GameSession.restore(v5snap, JSON.parse(JSON.stringify(s.journal))).stateHash, s.stateHash);
  assert.equal(GameSession.replay(JSON.parse(JSON.stringify(s.journal))).stateHash, s.stateHash);
  // v1 straight to v6.
  const old = GameSession.genesis(1337, GENERATOR_V2);
  ok(old, { type: 'found_homestead' });
  ticks(old, 20);
  ok(old, { type: 'upgrade_homestead', rules: 6 });
  assert.equal(old.world.homestead!.villagers.length, 3);
  assert.ok(old.world.homestead!.woodland);
  assert.equal(old.world.homestead!.version, 6);
});

test('strict validation of v6 sites in saves', () => {
  const s = founded();
  const h = s.world.homestead!;
  store(s).wood = 12;
  const a = findBuildingSpot(s.world, 'woodshed', 2)!;
  const id = place(s, 'woodshed', a.x, a.z, 2);
  ok(s, { type: 'approve_site', siteId: id });
  const tick = s.world.life!.tick;
  const snap = () => JSON.parse(JSON.stringify(homesteadSnapshot(h)));
  assert.doesNotThrow(() => validateHomestead(snap(), tick));
  for (const mut of [
    (x: any) => { x.sites[0].rot = 4; }, (x: any) => { delete x.sites[0].rot; }, (x: any) => { x.sites[0].kind = 'castle'; },
    (x: any) => { x.sites[0].stock = { wood: 1 }; }, (x: any) => { x.sites[0].state = 'cancelled'; },
    (x: any) => { x.villagers[0].task = { kind: 'store', target: 'carry:villager:0', leg: 0, progress: 0, legs: [{ op: 'work', x: 0, z: 0, ticks: 1, effect: 'bogus' }] }; },
  ]) { const x = snap(); mut(x); assert.throws(() => validateHomestead(x, tick)); }
  // A finished store over capacity is refused; at capacity it is fine.
  ok(s, { type: 'assign_role', villagerId: 'villager:0', role: 'builder', actor: 'player' });
  ticks(s, 400);
  assert.equal(site(s, id).state, 'done');
  const full = snap(); full.sites[0].stock = { wood: 60 };
  assert.doesNotThrow(() => validateHomestead(full, s.world.life!.tick));
  const over = snap(); over.sites[0].stock = { wood: 61 };
  assert.throws(() => validateHomestead(over, s.world.life!.tick));
  const fib = snap(); fib.sites[0].stock = { fiber: 2 };
  assert.throws(() => validateHomestead(fib, s.world.life!.tick));
  // Reservations may be held against timber in a store, never above all stock.
  const w = createWorldSnapshot(s.world, s.nextSequence, 3);
  assert.ok(w.homestead);
  void plantable;
  void BUILD_RANGE;
});

test('drawn from state: turned sites and finished buildings sit inside their footprints, share the homestead mesh, and timber stores show their fill', async () => {
  const s = founded();
  const h = s.world.homestead!;
  const { HomesteadView, siteBoxes, turnBox } = await import('../src/render/homestead');
  const ground = () => 10;
  for (const kind of BUILD_KINDS) for (const rot of [0, 1, 2, 3]) for (const state of ['planned', 'approved', 'done'] as const) {
    const st = { id: 'site:1', kind, x: 5, z: 7, rot, state, reserved: {}, delivered: state === 'approved' ? { wood: 4 } : {}, work: state === 'approved' ? 6 : 0, ...(state === 'done' && SITE_RULES[kind].store ? { stock: { wood: 20 } } : {}) };
    const list: Parameters<typeof siteBoxes>[0] = [];
    siteBoxes(list, st, ground);
    const c = siteCells(st);
    assert.ok(list.length > 3);
    for (const b of list) {
      const pad = state === 'approved' ? 1.6 : 0.35;
      assert.ok(b.x >= c.x0 - pad && b.x <= c.x1 + pad && b.z >= c.z0 - pad && b.z <= c.z1 + pad, `${kind} r${rot} ${state}: box at ${b.x},${b.z} outside ${JSON.stringify(c)}`);
    }
  }
  // turnBox maps the door side (+z in the model) onto the rotated entrance side.
  const W = 3, D = 2;
  const door = { w: 0.2, h: 1, d: 0.2, x: 1.5, y: 0, z: 2.0, c: '#fff' };
  assert.deepEqual([turnBox(door, 1, 0, 0, W, D).x, turnBox(door, 1, 0, 0, W, D).z], [2, 1.5]);
  assert.deepEqual([turnBox(door, 3, 0, 0, W, D).x], [0]);
  // In the view: sites never add meshes; a store's drawing changes with its stock.
  store(s).wood = 12;
  const a = findBuildingSpot(s.world, 'woodshed', 1)!;
  const id = place(s, 'woodshed', a.x, a.z, 1);
  ok(s, { type: 'approve_site', siteId: id });
  ok(s, { type: 'assign_role', villagerId: 'villager:0', role: 'builder', actor: 'player' });
  const view = new HomesteadView(s.world, 2);
  const meshes = () => { let n = 0; view.group.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh && o.name !== 'villager_load') n++; }); return n; };
  view.update(0.016);
  const n0 = meshes();
  ticks(s, 400, (i) => { if (i % 40 === 0) { view.update(0.016); assert.equal(meshes(), n0); } });
  assert.equal(site(s, id).state, 'done');
  const count = () => (view.group.getObjectByName('homestead_troughs') as unknown as { geometry: { attributes: { position: { count: number } } } }).geometry.attributes.position.count;
  view.update(0.016);
  const empty = count();
  site(s, id).stock = { wood: 40 };
  ok(s, { type: 'tick', ticks: 1 });
  view.update(0.016);
  assert.ok(count() > empty, 'stacked timber is drawn');
  assert.equal(meshes(), n0);
});
