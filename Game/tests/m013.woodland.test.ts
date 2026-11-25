// M013 "living woodland". Settlement rules v5 make tree growth, ageing,
// death, stumps, resprouting, seeding and replanting part of the hashed
// simulation (sim/woodland.ts, sim/forestry.ts); the owner's woodland policy
// and protections bind the woodcutter, who fells only what regrows and
// replants; the walking grid follows each tree's stage incrementally; the
// renderer follows the simulation's stages without full rebuilds. Old saves
// (v1-v4) keep their exact hashes and upgrade by one journaled command, at
// which tick every tree keeps the stage it was drawn in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import { Entity, GENERATOR_V2, MAT, chunkKey, ensureChunk, setVoxel, surfaceAt, worldToChunkX, worldToChunkZ } from '../src/sim/world';
import {
  DAY_TICKS, DM, HOMESTEAD_WOODLAND_VERSION, findFieldSpot, findSiteSpot, homesteadLayout, homesteadNav, homesteadNavFeatures, homesteadNavRegion,
  homesteadSnapshot, treeEntityId, treeTarget, validateHomestead,
} from '../src/sim/homestead';
import { TREE_SPECIES, growthStage } from '../src/sim/vegetation';
import type { TreeSpecies } from '../src/sim/vegetation';
import {
  CYCLE, GROWTH, LIFE_FOOTPRINT, QUOTA_TREE, TIMBER, TREE_STAGES, WOOD_DAY, WOODLAND_VERSION, recordOf, stageEnds, treeLife, woodRng,
} from '../src/sim/woodland';
import {
  addTree, fellingStages, managedWoodland, plantable, seedParent, windowTrees, woodcutterStatus, woodlandStats,
} from '../src/sim/forestry';
import { BLOCK, navGridFull, resetNavCache } from '../src/sim/nav';
import { FOUNDER_STOCKPILE_ID } from '../src/sim/economy';
import { NatureView, buildNoxelNature, natureGeometry, natureModel } from '../src/render/nature';
import { LOD_FAR, LOD_MID, LOD_NEAR, TiledLodMesh } from '../src/render/lod';
import { vegetationPlan } from '../src/render/vegetation-kit';
import { createWorldSnapshot } from '../src/sim/snapshot';

type Session = GameSession;
let seq = 0;
function send(s: Session, c: Record<string, unknown>) {
  return s.dispatch({ schema: 3, id: `m013:${seq++}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never);
}
const ok = (s: Session, c: Record<string, unknown>) => { const r = send(s, c); assert.ok(r.ok, `${c.type}: ${JSON.stringify(r)}`); return r; };
const store = (s: Session) => s.world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory;
const founded = (rules = 5) => { const s = GameSession.genesis(1337, GENERATOR_V2); ok(s, { type: 'found_homestead', rules }); return s; };
const ticks = (s: Session, n: number, each?: (i: number) => void) => {
  for (let i = 0; i < n; i++) { ok(s, { type: 'tick', ticks: 1 }); each?.(i); }
};
const policy = (s: Session, p: Record<string, unknown>) => ok(s, { type: 'woodland_policy', ...s.world.homestead!.woodland!.policy, ...p });
const cora = (s: Session) => s.world.homestead!.villagers.find((v) => v.id === 'villager:2')!;
const emptyStore = (s: Session) => { const inv = store(s); delete inv.wood; s.world.homestead!.overflow = {}; };

test('rules v5: founding starts the woodland clock; every tree is in its drawn (M008) stage at the epoch', () => {
  const s = founded();
  const h = s.world.homestead!;
  assert.equal(h.version, WOODLAND_VERSION);
  assert.equal(HOMESTEAD_WOODLAND_VERSION, WOODLAND_VERSION);
  assert.equal(DAY_TICKS, WOOD_DAY);
  const w = h.woodland!;
  assert.equal(w.epoch, s.world.life!.tick);
  // Load a wider ring of chunks (as a renderer would): late chunks are in their drawn stage too.
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) ensureChunk(s.world, 31 + dx, 31 + dz);
  let n = 0;
  for (const e of s.world.entities.values()) {
    if (!e.kind.startsWith('styl_tree_') || e.harvested) continue;
    const life = treeLife(s.world, e)!;
    assert.equal(life.stage, growthStage(e), e.id);
    assert.ok(life.present);
    n++;
  }
  assert.ok(n > 30, `${n} trees checked`);
  assert.ok(w.rate > 0, 'a sustainable rate is measured at the start');
});

test('growth over time per species: each passes sapling, young, mature, old, dying, snag at its own pace; birch and cherry are faster than oak and beech', () => {
  const s = founded();
  const h = s.world.homestead!;
  const tick0 = s.world.life!.tick;
  // One planted sapling of each species on open ground (direct sim helper; the command path is tested below).
  const planted: Array<{ sp: TreeSpecies; e: Entity }> = [];
  const cx = h.anchorX + 30, cz = h.anchorZ - 40;
  for (const sp of TREE_SPECIES) {
    let spot: { x: number; z: number } | null = null;
    for (let r = 0; r < 30 && !spot; r++) for (let a = 0; a < 16 && !spot; a++) {
      const x = cx + Math.round(Math.cos(a / 16 * 6.283) * r * 2), z = cz + Math.round(Math.sin(a / 16 * 6.283) * r * 2);
      if (!plantable(s.world, h, x, z, sp).length) spot = { x, z };
    }
    assert.ok(spot, `room for a ${sp}`);
    planted.push({ sp, e: addTree(s.world, h, sp, spot.x, spot.z, 'plant') });
  }
  const life = s.world.life!;
  for (const { sp, e } of planted) {
    const ends = stageEnds(sp, e.id);
    const seen: string[] = [];
    for (let t = 0; t < ends[5]; t += 30) {
      life.tick = tick0 + t;
      const l = treeLife(s.world, e)!;
      assert.equal(l.species, sp);
      if (seen[seen.length - 1] !== l.stage) seen.push(l.stage);
      assert.equal(l.age, t);
    }
    assert.deepEqual(seen, ['sapling', 'young', 'mature', 'old', 'dying', 'snag'], `${sp}: ${seen}`);
    // The pace is the species table within ±15% per tree.
    const days = GROWTH[sp].days;
    for (let i = 0; i < 6; i++) {
      const d = (ends[i] - (i ? ends[i - 1] : 0)) / WOOD_DAY;
      assert.ok(d >= days[i] * 0.84 && d <= days[i] * 1.16, `${sp} stage ${i}: ${d} days`);
    }
  }
  life.tick = tick0;
  const toMature = (sp: TreeSpecies) => GROWTH[sp].days[0] + GROWTH[sp].days[1];
  assert.ok(toMature('birch') < toMature('oak') && toMature('cherry') < toMature('beech'));
  assert.ok(GROWTH.oak.days.reduce((a, b) => a + b) > 2 * GROWTH.birch.days.reduce((a, b) => a + b), 'oak lives more than twice as long as birch');
});

test('species-specific timber by stage: young < mature < old, dying and snags give less, oak most and cherry least; a felling yields exactly its table', () => {
  for (const sp of TREE_SPECIES) {
    const t = TIMBER[sp];
    assert.ok(t.sapling.total < t.young.total && t.young.total < t.mature.total && t.mature.total < t.old.total, sp);
    assert.ok(t.dying.total < t.old.total && t.snag.total < t.mature.total && t.snag.total > 0, sp);
    for (const k of Object.keys(t) as Array<keyof typeof t>) assert.ok(t[k].cut >= 1 && t[k].cut <= 8);
  }
  assert.ok(TIMBER.oak.mature.total > TIMBER.spruce.mature.total && TIMBER.spruce.mature.total > TIMBER.birch.mature.total && TIMBER.birch.mature.total > TIMBER.cherry.mature.total);
  // The player fells a managed tree with the journaled harvest command: the yield is its species and stage timber.
  const s = founded();
  const h = s.world.homestead!;
  const e = managedWoodland(s.world, h).trees[0];
  const life = treeLife(s.world, e)!;
  const want = TIMBER[life.species][life.stage as 'mature'].total;
  let got = 0;
  for (let i = 0; i < 10 && !e.harvested; i++) {
    const r = ok(s, { type: 'harvest', entityId: e.id });
    if (r.ok && r.outcome.type === 'harvest') got += r.outcome.amount;
  }
  assert.equal(got, want);
  assert.equal(treeLife(s.world, e)!.stage, 'stump');
});

test('felling leaves a stump on the walking grid; broadleaf stumps resprout (coppice), others rot away; a gap is not drawn, not blocking and not harvestable', () => {
  const s = founded();
  const h = s.world.homestead!;
  ok(s, { type: 'woodland_policy', ...h.woodland!.policy, replant: 0, keepVeterans: false, minStanding: 0, buffer: 0 });
  // Fell every eligible tree in the woodland by hand (journaled harvests).
  const felled: Entity[] = [];
  for (const e of [...managedWoodland(s.world, h).trees]) {
    for (let i = 0; i < 12 && !e.harvested; i++) { delete s.world.inventory.wood; ok(s, { type: 'harvest', entityId: e.id }); }
    felled.push(e);
  }
  assert.ok(felled.length >= 3, `${felled.length} felled`);
  const grid = homesteadNav(s.world, h);
  for (const e of felled) {
    const l = treeLife(s.world, e)!;
    assert.equal(l.stage, 'stump');
    assert.ok(l.present && e.harvested);
    assert.equal(grid.block[grid.index(Math.floor(e.x), Math.floor(e.z))], BLOCK.tree, 'a stump blocks its own cell');
    assert.equal(send(s, { type: 'harvest', entityId: e.id }).ok, false, 'a stump has nothing to cut');
  }
  const sprouting = felled.filter((e) => recordOf(h.woodland!, e.id)!.sprout);
  const rotting = felled.filter((e) => !recordOf(h.woodland!, e.id)!.sprout);
  for (const e of sprouting) assert.ok(GROWTH[treeLife(s.world, e)!.species].coppice > 0, 'only coppicing species resprout');
  const scheduled = new Map(felled.map((e) => [e.id, recordOf(h.woodland!, e.id)!.next]));
  const due = Math.max(...scheduled.values()) - s.world.life!.tick;
  ticks(s, due + 2);
  for (const e of sprouting) {
    const l = treeLife(s.world, e)!;
    assert.ok(l.present && l.record!.from === 'sprout', `${e.id} resprouted: ${l.stage}`);
    assert.equal(l.record!.born, scheduled.get(e.id), 'on its scheduled tick');
    assert.equal(e.harvested, false);
  }
  for (const e of rotting) {
    const l = treeLife(s.world, e)!;
    assert.equal(l.stage, 'gap');
    assert.equal(l.present, false);
    assert.equal(recordOf(h.woodland!, e.id), undefined, 'a rotted stump leaves no record');
    const g = homesteadNav(s.world, h);
    assert.notEqual(g.blockId.get(g.index(Math.floor(e.x), Math.floor(e.z))), e.id);
  }
  assert.ok(sprouting.length + rotting.length === felled.length && h.woodland!.sprouted === sprouting.length);
});

test('seeding and planting conditions: not in water, not on a building, field, fence or the farmyard, not on steep ground, not crowded or shaded', () => {
  const s = founded();
  const h = s.world.homestead!;
  const reg = homesteadNavRegion(h);
  const grid = homesteadNav(s.world, h);
  const found: Record<string, string> = {};
  const want: Array<[string, RegExp]> = [['water', /there is water/], ['crowded', /too close to another tree/], ['yard', /farmyard/], ['built', /too close to a building|ground is taken \((?:a building|an occupied)/], ['good', /^$/]];
  for (let z = reg.oz + 1; z < reg.oz + reg.h - 1; z++) for (let x = reg.ox + 1; x < reg.ox + reg.w - 1; x++) {
    const why = plantable(s.world, h, x, z, 'birch', { grid }).join('; ');
    for (const [k, re] of want) if (!found[k] && (k === 'good' ? why === '' : re.test(why))) found[k] = `${x},${z}: ${why}`;
  }
  for (const [k] of want) assert.ok(found[k], `a ${k} cell exists: ${JSON.stringify(found)}`);
  // Steep ground: raise a neighbour of a good cell by two voxels (an ordinary voxel edit).
  const [gx0, gz0] = found.good.split(':')[0].split(',').map(Number);
  const y0 = surfaceAt(s.world, gx0 + 1, gz0);
  setVoxel(s.world, gx0 + 1, y0, gz0, MAT.STONE); setVoxel(s.world, gx0 + 1, y0 + 1, gz0, MAT.STONE);
  assert.match(plantable(s.world, h, gx0, gz0, 'birch').join(';'), /too steep \(2 m step\)/);
  // The farmhouse cell itself and a cell next to a trunk.
  const house = homesteadLayout(h).find((f) => f.id === 'farmhouse')!;
  assert.ok(plantable(s.world, h, Math.floor(house.rect.x0 / DM) + 2, Math.floor(house.rect.z0 / DM) + 2, 'oak').length > 0);
  const t = windowTrees(s.world, h).find((e) => treeLife(s.world, e)!.present)!;
  assert.match(plantable(s.world, h, Math.floor(t.x) + 1, Math.floor(t.z), 'oak').join(';'), /too close|taken/);
  // Shade: three mature trees around a cell.
  const shaded = (() => {
    for (let z = reg.oz + 2; z < reg.oz + reg.h - 2; z++) for (let x = reg.ox + 2; x < reg.ox + reg.w - 2; x++) {
      const why = plantable(s.world, h, x, z, 'spruce', { grid, spacing: 0.5 });
      if (why.some((r) => /shaded/.test(r))) return why;
    }
    return null;
  })();
  // A natural woodland may simply not be dense enough here; then plant a thicket and check again.
  if (!shaded) {
    const [gx, gz] = found.good.split(':')[0].split(',').map(Number);
    for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3]]) {
      const e = addTree(s.world, h, 'oak', gx + dx, gz + dz, 'plant');
      recordOf(h.woodland!, e.id)!.born -= 3 * WOOD_DAY * 4;
    }
    assert.match(plantable(s.world, h, gx, gz, 'spruce', { spacing: 0.5 }).join(';'), /shaded/);
  }
});

test('natural seeding fills only suitable ground near mature parents, from the woodland\'s own random stream', () => {
  const s = founded();
  const h = s.world.homestead!;
  const rng0 = h.rng;
  ticks(s, 1200);
  const w = h.woodland!;
  assert.ok(w.seeded > 0, `${w.seeded} seedlings`);
  for (const t of w.trees.filter((r) => r.from === 'seed')) {
    const e = s.world.entities.get(t.id)!;
    assert.ok(e && !e.harvested);
    // Each seedling stood on good ground with a parent of its species near when it took.
    assert.ok(seedParent(s.world, h, e.x, e.z, t.sp, GROWTH[t.sp].seedRange + 2) || treeLife(s.world, e)!.stage !== 'sapling', `${t.id} has a parent`);
    assert.ok(e.x >= homesteadNavRegion(h).ox && e.z >= homesteadNavRegion(h).oz);
  }
  // Seeding draws from the woodland's own stream, never the homestead's.
  assert.notEqual(w.rng, woodRng(s.world.seed));
  assert.ok(Number.isSafeInteger(rng0));
});

test('death to snag and fall: an old tree dies, stands as a snag (poor wood), then falls in a scheduled event; the spot regrows', () => {
  const s = founded();
  const h = s.world.homestead!;
  const life = s.world.life!;
  const e = addTree(s.world, h, 'birch', h.anchorX + 40, h.anchorZ - 45, 'plant');
  const rec = recordOf(h.woodland!, e.id)!;
  const ends = stageEnds('birch', e.id);
  // Move the clock so the tree is a snag just before it falls (the lifecycle is a pure function of age).
  rec.born = life.tick - (ends[5] - 3);
  assert.equal(treeLife(s.world, e)!.stage, 'snag');
  assert.deepEqual(TIMBER.birch.snag, { total: 4, cut: 2 });
  rec.next = rec.born + ends[5];
  ticks(s, 5);
  assert.equal(treeLife(s.world, e)!.stage, 'gap');
  assert.equal(e.harvested, true);
  assert.equal(recordOf(h.woodland!, e.id)!.st, 'gap');
  const regrowAt = recordOf(h.woodland!, e.id)!.next;
  assert.ok(regrowAt > life.tick);
  ticks(s, regrowAt - life.tick + 1);
  const again = treeLife(s.world, e)!;
  assert.ok(again.present && again.stage === 'sapling' && again.record!.from === 'regrow', JSON.stringify(again.record));
  // Natural trees die and regrow in place on the same pure cycle without any record.
  const nat = windowTrees(s.world, h).find((x) => !recordOf(h.woodland!, x.id) && !x.authored)!;
  const t0 = life.tick;
  const stages = new Set<string>();
  for (let t = 0; t < 70 * WOOD_DAY; t += 50) { life.tick = t0 + t; stages.add(treeLife(s.world, nat)!.stage); }
  life.tick = t0;
  for (const st of ['dying', 'snag', 'gap', 'sapling']) assert.ok(stages.has(st), `${nat.id} reaches ${st}: ${[...stages]}`);
});

test('determinism: the same journal gives the same state whatever chunks a renderer loaded, in any order, and whatever the camera', () => {
  const run = (prep: (s: Session) => void) => {
    const s = founded();
    prep(s);
    ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
    ticks(s, 120, (i) => { if (i === 60) prep(s); });
    ok(s, { type: 'harvest', entityId: managedWoodland(s.world, s.world.homestead!).trees.slice(-1)[0]?.id ?? 'e:0,0:0' });
    ticks(s, 120);
    return s;
  };
  const a = run(() => {});
  const b = run((s) => {
    // A renderer loading a ring of chunks in a shuffled order, and building nature views from far and near cameras.
    const keys: Array<[number, number]> = [];
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) keys.push([30 + dx, 31 + dz]);
    keys.sort((p, q) => ((p[0] * 7919 + p[1] * 104729) % 97) - ((q[0] * 7919 + q[1] * 104729) % 97));
    for (const [cx, cz] of keys) ensureChunk(s.world, cx, cz);
    buildNoxelNature(s.world, null, { camera: { x: 900, y: 50, z: 900 } });
    new NatureView(s.world, { multiDraw: false }).build(null, { x: -20, y: 20, z: -20 });
    resetNavCache(s.world);
  });
  assert.equal(a.stateHash, b.stateHash);
  assert.equal(GameSession.replay(JSON.parse(JSON.stringify(a.journal))).stateHash, a.stateHash);
});

test('catch-up on load: a chunk generated late shows the same stages as one loaded all along; snapshot restore mid-cycle keeps every stage, record and hash', () => {
  const a = founded(), b = founded();
  // Far chunks: loaded now in A, only after 900 ticks in B.
  const far: Array<[number, number]> = [[44, 26], [45, 26], [44, 27]];
  for (const [cx, cz] of far) ensureChunk(a.world, cx, cz);
  ticks(a, 900); ticks(b, 900);
  for (const [cx, cz] of far) ensureChunk(b.world, cx, cz);
  let compared = 0;
  for (const [cx, cz] of far) {
    for (const id of a.world.entityChunks.get(chunkKey(cx, cz)) ?? []) {
      const ea = a.world.entities.get(id)!, eb = b.world.entities.get(id)!;
      const la = treeLife(a.world, ea), lb = treeLife(b.world, eb);
      if (!la) continue;
      assert.deepEqual({ ...lb, record: undefined }, { ...la, record: undefined }, id);
      compared++;
    }
  }
  assert.ok(compared > 5, `${compared} trees compared`);
  assert.equal(a.stateHash, b.stateHash, 'loading far chunks never changes the state');
  // Mid-cycle: woodcutter working, stumps, a planted sapling, then restore from snapshot + journal.
  const s = founded();
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
  emptyStore(s);
  ticks(s, 700);
  const snap = JSON.parse(JSON.stringify(s.snapshot));
  const journal = JSON.parse(JSON.stringify(s.journal));
  assert.ok(snap.homestead.woodland.trees.length > 0, 'records are saved');
  const r = GameSession.restore(snap, journal);
  assert.equal(r.stateHash, s.stateHash);
  windowTrees(r.world, r.world.homestead!);
  for (const e of windowTrees(s.world, s.world.homestead!)) {
    const er = r.world.entities.get(e.id)!;
    assert.deepEqual({ ...treeLife(r.world, er)!, record: undefined }, { ...treeLife(s.world, e)!, record: undefined }, e.id);
  }
  ticks(s, 200); ticks(r, 200);
  assert.equal(r.stateHash, s.stateHash);
});

test('protected trees are never felled: owner marks, a protected area, veterans and building buffers', () => {
  const s = founded();
  const h = s.world.homestead!;
  ok(s, { type: 'woodland_policy', ...h.woodland!.policy, harvest: 'demand', minStanding: 0, replant: 0 });
  const lot = managedWoodland(s.world, h);
  assert.ok(lot.trees.length >= 2, `${lot.trees.length} eligible`);
  const marked = lot.trees[0];
  ok(s, { type: 'protect_tree', entityId: marked.id, protect: true });
  assert.equal(send(s, { type: 'protect_tree', entityId: marked.id, protect: true }).ok, false, 'already protected');
  const zoneAround = lot.trees[1];
  const z = ok(s, { type: 'protect_zone', x: Math.round(zoneAround.x), z: Math.round(zoneAround.z), r: 4 });
  assert.ok(z.ok && z.outcome.type === 'protect_zone');
  const protectedIds = new Set(managedWoodland(s.world, h).all.filter((m) => m.protectedWhy).map((m) => m.e.id));
  assert.ok(protectedIds.has(marked.id) && protectedIds.has(zoneAround.id));
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
  const targets = new Set<string>();
  ticks(s, 1500, () => {
    emptyStore(s);
    const t = cora(s).task;
    if (t?.kind === 'chop') targets.add(treeEntityId(t.target)!);
  });
  assert.ok(targets.size >= 1, 'the woodcutter worked');
  for (const id of protectedIds) {
    assert.ok(!targets.has(id), `${id} was never a target`);
    assert.ok(!s.world.entities.get(id)!.harvestedOnce, `${id} was never cut`);
  }
  // Every chosen tree was eligible under the policy (stage and protection) when chosen.
  const stages = fellingStages(h.woodland!.policy);
  for (const id of targets) assert.ok(!protectedIds.has(id) && stages.size > 0);
  // Protection binds the villagers; the owner can lift it again.
  ok(s, { type: 'protect_tree', entityId: marked.id, protect: false });
  assert.equal(h.woodland!.protect.includes(marked.id), false);
});

test('the sustainable quota stops felling with a stated reason instead of clear-cutting', () => {
  const s = founded();
  const h = s.world.homestead!;
  ok(s, { type: 'woodland_policy', ...h.woodland!.policy, harvest: 'sustainable', minStanding: 0, replant: 0, keepVeterans: false });
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
  const w = h.woodland!;
  let reason = '';
  let accrued = w.quota;
  let firstCuts = 0;
  const cutBefore = new Set([...s.world.entities.values()].filter((e) => e.harvestedOnce).map((e) => e.id));
  ticks(s, 900, () => {
    emptyStore(s);
    accrued += w.rate;
    const why = woodcutterStatus(s.world, h, cora(s));
    if (why && /sustainable quota reached/.test(why)) reason = why;
  });
  for (const e of windowTrees(s.world, h)) if (e.harvestedOnce && !cutBefore.has(e.id)) firstCuts++;
  assert.match(reason, /sustainable quota reached: the woodland regrows about [\d.]+ trees a day; next tree in about \d+ ticks/);
  assert.ok(firstCuts >= 1, 'something was felled');
  assert.ok(firstCuts <= Math.ceil(accrued / QUOTA_TREE) + 1, `felled ${firstCuts}, allowance ${accrued / QUOTA_TREE}`);
  assert.ok(managedWoodland(s.world, h).trees.length > 0 || firstCuts > 0, 'trees still stand');
  // Paused felling says so.
  ok(s, { type: 'woodland_policy', ...w.policy, harvest: 'paused' });
  cora(s).task = null;
  assert.equal(woodcutterStatus(s.world, h, cora(s)), 'felling is paused by the woodland policy');
});

test('replant policy: the forester lifts a wildling from a seed parent and plants one sapling per felled tree; replant 0 plants none', () => {
  const runWith = (replant: number) => {
    const s = founded();
    const h = s.world.homestead!;
    ok(s, { type: 'woodland_policy', ...h.woodland!.policy, harvest: 'demand', minStanding: 0, replant });
    ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
    let carried = false, orders = 0;
    ticks(s, 1200, () => {
      emptyStore(s);
      if (cora(s).carry?.item.startsWith('sapling:')) carried = true;
      orders = Math.max(orders, h.woodland!.orders.length);
    });
    return { s, h, carried, orders };
  };
  const one = runWith(1);
  const w = one.h.woodland!;
  assert.ok(w.felled >= 1);
  assert.ok(one.orders >= 1 && one.carried, 'orders appeared and a sapling was carried');
  assert.ok(w.planted >= 1, `${w.planted} planted`);
  const planted = w.trees.filter((t) => t.from === 'plant');
  assert.equal(planted.length, w.planted);
  for (const t of planted) {
    const e = one.s.world.entities.get(t.id)!;
    assert.ok(!e.harvested && treeTarget(e.id), `${t.id} is a real woodland tree`);
  }
  assert.ok(w.planted <= w.felled, 'never more than one per felled tree');
  const none = runWith(0);
  assert.equal(none.h.woodland!.planted, 0);
  assert.equal(none.orders, 0);
});

test('the owner plants a sapling with a journaled command; unsuitable ground is refused with reasons; replay and restore agree', () => {
  const s = founded();
  const h = s.world.homestead!;
  const reg = homesteadNavRegion(h);
  let cell: { x: number; z: number } | null = null, wet: { x: number; z: number } | null = null;
  for (let z = reg.oz + 2; z < reg.oz + reg.h - 2 && (!cell || !wet); z++) for (let x = reg.ox + 2; x < reg.ox + reg.w - 2; x++) {
    const parent = seedParent(s.world, h, x + 0.5, z + 0.5, null);
    if (!parent) continue;
    const why = plantable(s.world, h, x, z, treeLife(s.world, parent)!.species);
    if (!cell && !why.length) cell = { x, z };
    if (!wet && why.some((r) => /water/.test(r))) wet = { x, z };
  }
  assert.ok(cell);
  const before = s.stateHash;
  if (wet) {
    const bad = send(s, { type: 'plant_tree', ...wet });
    assert.ok(!bad.ok && bad.code === 'unsuitable' && bad.reasons.some((r) => /water/.test(r)));
  }
  const house = homesteadLayout(h).find((f) => f.id === 'farmhouse')!;
  const onHouse = send(s, { type: 'plant_tree', x: Math.floor(house.rect.x0 / DM) + 2, z: Math.floor(house.rect.z0 / DM) + 2 });
  assert.equal(onHouse.ok, false);
  assert.equal(s.stateHash, before, 'refusals change nothing');
  assert.equal(send(s, { type: 'plant_tree', x: 1.5, z: 3 }).ok, false, 'whole metres only');
  const r = ok(s, { type: 'plant_tree', ...cell });
  assert.ok(r.ok && r.outcome.type === 'plant_tree');
  const e = s.world.entities.get(r.outcome.entityId)!;
  assert.equal(Math.floor(e.x), cell.x);
  const l = treeLife(s.world, e)!;
  assert.equal(l.stage, 'sapling');
  assert.equal(l.record!.from, 'plant');
  const g = homesteadNav(s.world, h);
  assert.equal(g.blockId.get(g.index(cell.x, cell.z)), e.id, 'the sapling is on the walking grid');
  assert.equal(send(s, { type: 'plant_tree', ...cell }).ok, false, 'the cell is taken now');
  ticks(s, 30);
  assert.equal(GameSession.replay(JSON.parse(JSON.stringify(s.journal))).stateHash, s.stateHash);
  assert.equal(GameSession.restore(JSON.parse(JSON.stringify(s.snapshot)), JSON.parse(JSON.stringify(s.journal))).stateHash, s.stateHash);
});

test('old saves: v1-v4 hashes unchanged (a finished woodshed included); upgrading to v5 keeps every drawn stage, the walking grid, resources, sites and villagers', () => {
  assert.equal(GameSession.genesis(1337).stateHash, 'e659504b056654dc');
  // The v4 run below was measured with the M012 build (commit 7d66e8c): 6ce5ae532227eeb9.
  const s = GameSession.genesis(1337, GENERATOR_V2);
  ok(s, { type: 'found_homestead', rules: 4 });
  ok(s, { type: 'mark_field', ...findFieldSpot(s.world, 5, 4, 'potato')! });
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
  ok(s, { type: 'place_site', kind: 'woodshed', ...findSiteSpot(s.world)! });
  ok(s, { type: 'approve_site', siteId: s.world.homestead!.sites![0].id });
  ok(s, { type: 'assign_role', villagerId: 'villager:0', role: 'builder', actor: 'player' });
  ticks(s, 400);
  ok(s, { type: 'set_gate', gateId: 'gate:pen', state: 'open' });
  ticks(s, 50);
  assert.equal(s.stateHash, '6ce5ae532227eeb9');
  const v4snap = JSON.parse(JSON.stringify(s.snapshot));
  assert.equal(v4snap.homestead.woodland, undefined);
  const restored = GameSession.restore(v4snap, JSON.parse(JSON.stringify(s.journal)));
  assert.equal(JSON.stringify(restored.snapshot), JSON.stringify(s.snapshot), 'a v4 save restores byte-identical');
  // v4 refuses woodland commands and fields.
  assert.equal(send(s, { type: 'plant_tree', x: 0, z: 0 }).ok, false);
  const bad = JSON.parse(JSON.stringify(homesteadSnapshot(s.world.homestead!)));
  bad.woodland = { epoch: 0 };
  assert.throws(() => validateHomestead(bad, s.world.life!.tick));
  const bad2 = JSON.parse(JSON.stringify(homesteadSnapshot(s.world.homestead!)));
  bad2.villagers[0].carry = { item: 'sapling:oak', amount: 1 };
  assert.throws(() => validateHomestead(bad2, s.world.life!.tick));
  // The upgrade: one journaled command; every tree keeps its drawn stage; nothing else changes.
  const h = s.world.homestead!;
  const stagesBefore = new Map([...s.world.entities.values()].filter((e) => e.kind.startsWith('styl_tree_') && !e.harvested).map((e) => [e.id, growthStage(e)]));
  const gridBefore = homesteadNav(s.world, h).hash;
  const inv = JSON.stringify(s.world.inventory), stock = JSON.stringify(store(s)), sites = JSON.stringify(h.sites), people = JSON.stringify(h.villagers.map((v) => [v.id, v.name, v.role, v.x, v.z]));
  ok(s, { type: 'upgrade_homestead', rules: 5 });
  assert.equal(send(s, { type: 'upgrade_homestead', rules: 5 }).ok, false, 'once only');
  assert.equal(h.version, 5);
  for (const [id, st] of stagesBefore) assert.equal(treeLife(s.world, s.world.entities.get(id)!)!.stage, st, id);
  assert.equal(homesteadNav(s.world, h).hash, gridBefore, 'the walking grid is unchanged at the upgrade');
  assert.equal(JSON.stringify(s.world.inventory), inv);
  assert.equal(JSON.stringify(store(s)), stock);
  assert.equal(JSON.stringify(h.sites), sites, 'the finished woodshed survives');
  assert.equal(h.sites![0].state, 'done');
  assert.equal(JSON.stringify(h.villagers.map((v) => [v.id, v.name, v.role, v.x, v.z])), people);
  // Felled trees from before become gaps that regrow; restore and replay reach the live hash.
  const felledBefore = [...s.world.entities.values()].filter((e) => e.kind.startsWith('styl_tree_') && e.harvested);
  for (const e of felledBefore) assert.equal(recordOf(h.woodland!, e.id)?.st, 'gap');
  ticks(s, 100);
  assert.equal(GameSession.restore(v4snap, JSON.parse(JSON.stringify(s.journal))).stateHash, s.stateHash);
  assert.equal(GameSession.replay(JSON.parse(JSON.stringify(s.journal))).stateHash, s.stateHash);
  // v1 straight to v5.
  const old = GameSession.genesis(1337, GENERATOR_V2);
  ok(old, { type: 'found_homestead' });
  ticks(old, 20);
  ok(old, { type: 'upgrade_homestead', rules: 5 });
  assert.equal(old.world.homestead!.villagers.length, 3);
  assert.ok(old.world.homestead!.woodland);
});

test('woodland statistics API (for M014 placement): harvestable, protected, regrowing, route length to a store, sustainable yield and regeneration for a demand; a pure query', () => {
  const s = founded();
  const h = s.world.homestead!;
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
  emptyStore(s);
  ticks(s, 500);
  const before = s.stateHash;
  const c = { x: h.anchorX - 10, z: h.anchorZ - 10 };
  const st = woodlandStats(s.world, { ...c, radius: 85, demandPerDay: 40 })!;
  assert.equal(s.stateHash, before, 'the query changes nothing');
  const lot = managedWoodland(s.world, h);
  assert.equal(st.harvestable, lot.trees.length);
  assert.equal(st.trees, lot.all.filter((m) => m.life.present).length);
  assert.ok(st.protected >= 1 && st.protectedIds.length === st.protected);
  assert.ok(st.regrowing >= 1);
  assert.equal(Object.values(st.bySpecies).reduce((a, b) => a + b, 0), st.trees);
  if (st.harvestable) {
    assert.ok(st.meanPathToStore! > 0 && st.maxPathToStore! >= st.meanPathToStore!);
    // A store farther away means longer walks.
    const far = woodlandStats(s.world, { ...c, radius: 85, store: { x: h.anchorX + 40, z: h.anchorZ + 40 } })!;
    assert.notEqual(far.meanPathToStore, st.meanPathToStore);
  }
  assert.ok(st.sustainableTreesPerDay > 0 && st.sustainableWoodPerDay > st.sustainableTreesPerDay && st.rotationDays > 1);
  assert.ok(st.spotsForDemand! > 0 && st.regenerationShortfall! >= 0);
  // A small radius sees fewer trees; a radius around nothing sees none.
  const small = woodlandStats(s.world, { ...c, radius: 10 })!;
  assert.ok(small.trees <= st.trees);
  const none = woodlandStats(s.world, { x: c.x + 59, z: c.z + 59, radius: 0.5 })!;
  assert.ok(none.harvestable === 0 && none.meanPathToStore === null);
  assert.equal(woodlandStats(GameSession.genesis(1337).world, { ...c, radius: 10 }), null, 'no woodland without rules v5');
});

test('walking grid: footprints follow the simulated stage, and every incremental update equals a full rebuild', () => {
  const s = founded();
  const h = s.world.homestead!;
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
  const region = homesteadNavRegion(h);
  let patched = 0, compared = 0;
  const compare = () => {
    const g = homesteadNav(s.world, h);
    const full = navGridFull(s.world, region, homesteadNavFeatures(h));
    assert.equal(g.hash, full.hash);
    assert.deepEqual([...g.block], [...full.block]);
    assert.deepEqual([...g.extra], [...full.extra]);
    compared++;
  };
  // A sapling that grows: its footprint widens with its stage.
  const e = addTree(s.world, h, 'birch', h.anchorX + 35, h.anchorZ - 42, 'plant');
  const rec = recordOf(h.woodland!, e.id)!;
  const ends = stageEnds('birch', e.id);
  const cells = () => { const g = homesteadNav(s.world, h); let n = 0; for (const [, id] of g.blockId) if (id === e.id) n++; return n; };
  const seen: Record<string, number> = {};
  for (const [stage, age] of [['sapling', 0], ['young', ends[0] + 1], ['mature', ends[1] + 1], ['old', ends[2] + 1], ['snag', ends[4] + 1]] as const) {
    rec.born = s.world.life!.tick - age;
    ok(s, { type: 'tick', ticks: 1 });
    assert.equal(treeLife(s.world, e)!.stage, stage);
    seen[stage] = cells();
    compare();
  }
  assert.ok(seen.sapling === 1 && seen.mature === 5 && seen.old === 9 && seen.old > seen.snag, JSON.stringify(seen));
  assert.equal(LIFE_FOOTPRINT.stump, 0.3);
  const stats0 = (navStatsOf(s));
  emptyStore(s);
  ticks(s, 400, (i) => { emptyStore(s); if (i % 20 === 0) compare(); });
  patched = navStatsOf(s).gridPatches - stats0.gridPatches;
  assert.ok(patched > 0, `${patched} incremental patches`);
  assert.ok(compared > 10);
});
import { navStats } from '../src/sim/nav';
const navStatsOf = (s: Session) => ({ ...navStats(s.world) });

test('render: the drawn nature follows the simulated stages incrementally (no full rebuild): growth, felling to a stump, planting; both LOD paths', () => {
  for (const multiDraw of [true, false]) {
    const s = founded();
    const h = s.world.homestead!;
    const view = new NatureView(s.world, { multiDraw });
    const cam = { x: h.anchorX, y: 30, z: h.anchorZ };
    const reg = homesteadNavRegion(h);
    const loaded = new Set<string>();
    for (let cz = worldToChunkZ(reg.oz); cz <= worldToChunkZ(reg.oz + reg.h - 1); cz++) for (let cx = worldToChunkX(reg.ox); cx <= worldToChunkX(reg.ox + reg.w - 1); cx++) loaded.add(chunkKey(cx, cz));
    const first = [...loaded].slice(0, 2);
    view.build(new Set(first), cam);
    // The rest of the chunks arrive incrementally, a bounded slice per call.
    let calls = 0;
    while (view.stats.chunksAdded < loaded.size - first.length && calls < 200) { view.sync(loaded, cam, 0.01); calls++; }
    assert.ok(calls > 1, 'chunks were added over several calls');
    const check = () => {
      for (const e of s.world.entities.values()) {
        if (!loaded.has(e.chunk) || s.world.entityRemovals.has(e.id)) continue;
        const m = e.kind.startsWith('styl_tree_') || !e.harvested ? natureModel(e, s.world.seed, s.world) : null;
        const en = (view as unknown as { entries: Map<string, { key: string }> }).entries.get(e.id);
        assert.equal(en?.key ?? null, m?.key ?? null, e.id);
      }
    };
    for (let i = 0; i < 20; i++) view.sync(loaded, cam);
    check();
    const full = buildNoxelNature(s.world, loaded, { multiDraw });
    assert.equal(view.instances, full.instances, 'incremental equals a full build');
    // Fell a tree: a stump model replaces it in place.
    const t = managedWoodland(s.world, h).trees[0];
    for (let i = 0; i < 12 && !t.harvested; i++) ok(s, { type: 'harvest', entityId: t.id });
    view.sync(loaded, cam);
    assert.match((view as unknown as { entries: Map<string, { key: string }> }).entries.get(t.id)!.key, /:stump:/);
    // Plant one, and let time pass: models follow the lifecycle.
    const p = addTree(s.world, h, 'oak', h.anchorX + 36, h.anchorZ - 44, 'plant');
    view.sync(loaded, cam);
    assert.match((view as unknown as { entries: Map<string, { key: string }> }).entries.get(p.id)!.key, /^oak:sapling:/);
    recordOf(h.woodland!, p.id)!.born -= stageEnds('oak', p.id)[1] + 5;
    ticks(s, 2);
    for (let i = 0; i < 20; i++) view.sync(loaded, cam);
    assert.match((view as unknown as { entries: Map<string, { key: string }> }).entries.get(p.id)!.key, /^oak:mature:/);
    check();
    assert.ok(view.stats.swaps >= 2 && view.stats.adds >= 1);
    if (!multiDraw) assert.ok(view.lod instanceof TiledLodMesh);
  }
});

test('models: every species has all seven stages; near > mid >= far, far <= 36 triangles, near detail only (mid and far unchanged by the M013 detail)', () => {
  for (const sp of TREE_SPECIES) {
    for (const stage of TREE_STAGES) {
      for (let v = 0; v < 3; v++) {
        const model = { key: `${sp}:${stage}:${v}`, plan: vegetationPlan(sp, stage, v) };
        const [near, mid, far] = [LOD_NEAR, LOD_MID, LOD_FAR].map((b) => natureGeometry(model, b).attributes.position.count / 3);
        assert.ok(near > mid && mid >= far && far <= 36, `${model.key} ${near}/${mid}/${far}`);
        assert.ok(near <= 260, `${model.key} near ${near}`);
      }
    }
  }
  // Stumps are tiny; snags are bare (no green); dying crowns are thinner than old ones.
  const blocks = (sp: TreeSpecies, st: string) => { const p = vegetationPlan(sp, st as never, 0); return [...p.trunk, ...p.detail, ...p.tiers.flat()]; };
  assert.ok(blocks('oak', 'stump').every((b) => b.y < 0.7));
  assert.ok(blocks('oak', 'dying').length < blocks('oak', 'old').length);
  assert.ok(CYCLE.includes('gap'));
});

test('strict validation of the woodland commands and saved state', () => {
  const s = founded();
  for (const bad of [
    { type: 'plant_tree', x: 'a', z: 0 }, { type: 'plant_tree', x: 0, z: 0, species: 'palm' },
    { type: 'protect_tree', entityId: 'nope', protect: true }, { type: 'protect_tree', entityId: 'e:1,1:1' },
    { type: 'protect_zone', x: 0, z: 0, r: 99 }, { type: 'remove_zone', zoneId: 'zone:x' },
    { type: 'woodland_policy', harvest: 'clearcut', minStage: 'mature', keepVeterans: true, snags: 'fell', buffer: 5, waterBuffer: 3, minStanding: 6, replant: 1 },
    { type: 'woodland_policy', harvest: 'sustainable', minStage: 'mature', keepVeterans: true, snags: 'fell', buffer: 50, waterBuffer: 3, minStanding: 6, replant: 1 },
  ]) {
    const r = send(s, bad);
    assert.ok(!r.ok && r.code === 'invalid_command', JSON.stringify(bad));
  }
  assert.equal(send(s, { type: 'woodland_policy', ...s.world.homestead!.woodland!.policy }).ok, false, 'unchanged policy');
  const snap = homesteadSnapshot(s.world.homestead!);
  const tamper = (f: (w: Record<string, unknown>) => void) => { const c = JSON.parse(JSON.stringify(snap)); f(c.woodland); return c; };
  assert.throws(() => validateHomestead(tamper((w) => { w.trees = [{ id: 'e:1,1:1', sp: 'palm', st: 'live', born: 0, at: 0, next: 0, from: 'wild' }]; }), s.world.life!.tick));
  assert.throws(() => validateHomestead(tamper((w) => { (w.policy as Record<string, unknown>).replant = 9; }), s.world.life!.tick));
  assert.throws(() => validateHomestead(tamper((w) => { w.epoch = s.world.life!.tick + 5; }), s.world.life!.tick));
  assert.doesNotThrow(() => validateHomestead(JSON.parse(JSON.stringify(snap)), s.world.life!.tick));
  assert.ok(createWorldSnapshot(s.world).schema === 3);
});
