import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2 } from '../src/sim/world';
import {
  CROP_RULES, FOUNDING_SUPPLIES, SPECIES, WITHER_TICKS, NIGHT_END, DAY_TICKS, fenceCost,
  homesteadLayout, stepHomestead, validateHomestead, homesteadSnapshot, findFieldSpot, checkField, unitsOf,
} from '../src/sim/homestead';

function session() {
  const s = GameSession.genesis(1337, GENERATOR_V2);
  return s;
}
function send(s: GameSession, c: Record<string, unknown>) {
  return s.dispatch({ schema: 3, id: `test:${s.nextSequence}:${String(c.type)}`, expectedRevision: s.world.revision, ...c });
}
function ticks(s: GameSession, n: number) {
  for (let i = 0; i < n; i++) {
    const r = send(s, { type: 'tick', ticks: 1 });
    assert.ok(r.ok, JSON.stringify(r));
  }
}
const stock = (s: GameSession) => s.world.life!.stockpiles.get('stockpile:founder')!.inventory;
const founded = () => { const s = session(); assert.ok(send(s, { type: 'found_homestead' }).ok); return s; };
/** The player marks a field at the first good spot; returns its id. */
function field(s: GameSession, w = 4, d = 4, crop: 'wheat' | 'potato' | 'flax' = 'wheat'): string {
  const spot = findFieldSpot(s.world, w, d, crop);
  assert.ok(spot, 'a valid field spot exists');
  const r = send(s, { type: 'mark_field', ...spot });
  assert.ok(r.ok && r.outcome.type === 'mark_field', JSON.stringify(r));
  return (r.outcome as { fieldId: string }).fieldId;
}

test('founding creates villagers with jobs, six domestic species and real supplies; fields are left to the player', () => {
  const s = session();
  const before = { ...stock(s) };
  const r = send(s, { type: 'found_homestead' });
  assert.ok(r.ok);
  const h = s.world.homestead!;
  assert.deepEqual(h.villagers.map((v) => v.role), ['farmer', 'herder']);
  assert.equal(h.plots.length, 0, 'the player decides where the fields go');
  assert.deepEqual([...new Set(h.animals.map((a) => a.species))].sort(), [...SPECIES].sort());
  for (const [item, n] of Object.entries(FOUNDING_SUPPLIES)) assert.equal(stock(s)[item], (before[item] ?? 0) + n);
  assert.equal(send(s, { type: 'found_homestead' }).ok, false, 'a world has one homestead');
  // Every facility has a real function and a footprint the renderer draws.
  for (const f of homesteadLayout(h)) assert.ok(f.function.length > 10 && f.rect.x1 > f.rect.x0 && f.rect.z1 > f.rect.z0, f.id);
});

test('the player decides where, how big and what to plant; placement rules explain rejections', () => {
  const s = founded();
  const wood0 = s.world.inventory.wood!;
  const spot = findFieldSpot(s.world, 6, 4, 'potato')!;
  const r = send(s, { type: 'mark_field', ...spot });
  assert.ok(r.ok && r.outcome.type === 'mark_field');
  assert.equal((r.outcome as { units: number }).units, 3, '24 m² is three 9 m² units');
  assert.equal(s.world.inventory.wood, wood0 - fenceCost(6, 4), 'the fence is paid from the bag');
  const p = s.world.homestead!.plots[0];
  assert.deepEqual([p.x, p.z, p.w, p.d, p.crop], [spot.x, spot.z, 6, 4, 'potato']);
  const overlap = send(s, { type: 'mark_field', ...spot });
  assert.ok(!overlap.ok && overlap.code === 'invalid_site' && overlap.reasons.includes('overlaps another field'));
  const far = checkField(s.world, { ...spot, x: spot.x + 300 });
  assert.ok(far.some((x) => x.startsWith('too far')), far.join('; '));
  assert.equal(send(s, { type: 'mark_field', ...spot, w: 11 }).ok, false, 'size limit is part of command validation');
  assert.ok(send(s, { type: 'set_crop', fieldId: p.id, crop: 'flax' }).ok);
  assert.equal(s.world.homestead!.plots[0].crop, 'flax');
  assert.ok(send(s, { type: 'remove_field', fieldId: p.id }).ok);
  assert.equal(s.world.homestead!.plots.length, 0);
});

test('the farmer runs the whole farming loop: till, sow seed from the store, water, grow, harvest, deliver', () => {
  const s = founded();
  field(s, 4, 4, 'wheat');
  const seed0 = stock(s).seed!, food0 = stock(s).food ?? 0;
  const seen = new Set<string>();
  let harvestedAt = -1, minSeed = seed0;
  for (let i = 0; i < 900 && harvestedAt < 0; i++) {
    ticks(s, 1);
    minSeed = Math.min(minSeed, stock(s).seed ?? 0);
    for (const p of s.world.homestead!.plots) seen.add(p.state);
    if ((stock(s).food ?? 0) >= food0 + CROP_RULES.wheat.yield.food * 2) harvestedAt = i;
  }
  assert.deepEqual([...seen].sort(), ['growing', 'ripe', 'tilled', 'wild']);
  assert.ok(harvestedAt > CROP_RULES.wheat.growTicks, `food delivered after ${harvestedAt} ticks`);
  assert.equal(minSeed, seed0 - 2, 'sowing the 2-unit field took 2 seed from the store');
  assert.ok(s.journal.entries.length > 0 && GameSession.replay(JSON.parse(JSON.stringify(s.journal))).stateHash === s.stateHash);
});

test('crops need water: a dry crop does not grow and withers, losing its seed', () => {
  const s = founded();
  field(s); field(s);
  const w = s.world, h = w.homestead!;
  h.villagers = []; // nobody tends the farm in this test
  // A sprouted crop left dry stops growing and then withers.
  Object.assign(h.plots[0], { state: 'growing', growth: 5, moisture: 0, dry: 0 });
  // Daylight only, so the night pause does not mask the rule.
  w.life!.tick = NIGHT_END;
  for (let i = 0; i < WITHER_TICKS - 1; i++) stepHomestead(w, ++w.life!.tick);
  assert.equal(h.plots[0].growth, 5);
  assert.equal(h.plots[0].state, 'growing');
  stepHomestead(w, ++w.life!.tick);
  assert.equal(h.plots[0].state, 'tilled', 'withered back to bare soil');
  // Seed in dry soil that never sprouted lies dormant instead.
  Object.assign(h.plots[0], { state: 'growing', growth: 0, moisture: 0, dry: 0 });
  for (let i = 0; i < WITHER_TICKS * 2; i++) stepHomestead(w, ++w.life!.tick);
  assert.equal(h.plots[0].state, 'growing');
  Object.assign(h.plots[1], { state: 'growing', growth: 0, moisture: 12, dry: 0 });
  for (let i = 0; i < 20; i++) stepHomestead(w, ++w.life!.tick);
  assert.equal(h.plots[1].growth, 20, 'a watered crop grows every daylight tick');
});

test('the herder keeps animals fed and watered and delivers eggs, milk and wool to the store', () => {
  const s = founded();
  field(s, 6, 6, 'flax'); // straw for the troughs
  ticks(s, 900);
  const h = s.world.homestead!;
  const store = { ...stock(s), ...Object.fromEntries(Object.entries(h.overflow).map(([k, v]) => [k, v + (stock(s)[k] ?? 0)])) };
  assert.ok((store.eggs ?? 0) + (store.milk ?? 0) > 0, `eggs or milk stored: ${JSON.stringify(store)}`);
  assert.ok((store.wool ?? 0) > 0, 'wool stored');
  assert.ok(h.animals.every((a) => a.starving === 0), 'no animal is starving');
  assert.ok(h.animals.length >= 15, 'no animal died');
});

test('neglect has consequences: without care, animals starve and die', () => {
  const s = founded();
  const w = s.world, h = w.homestead!;
  h.villagers = [];
  for (const e of h.enclosures) { e.water = 0; e.feed = 0; e.grass = 0; }
  for (let i = 0; i < 700; i++) {
    for (const e of h.enclosures) e.grass = 0;
    stepHomestead(w, ++w.life!.tick);
  }
  assert.equal(h.animals.length, 0);
});

test('animals breed: births get deterministic ids and respect enclosure capacity', () => {
  const s = founded();
  ticks(s, 2400);
  const h = s.world.homestead!;
  const born = h.animals.filter((a) => a.born > 0);
  assert.ok(born.length > 0, 'at least one birth in eight days');
  for (const f of homesteadLayout(h).filter((x) => x.capacity)) {
    const n = h.animals.filter((a) => f.species!.includes(a.species)).length;
    assert.ok(n <= f.capacity!, `${f.id} holds ${n} of ${f.capacity}`);
  }
  const again = GameSession.replay(JSON.parse(JSON.stringify(s.journal)));
  assert.deepEqual(homesteadSnapshot(again.world.homestead!), homesteadSnapshot(h));
});

test('the player works the homestead with their own bag: water, till, feed', () => {
  const s = founded();
  const id = field(s, 3, 3);
  const h = s.world.homestead!;
  h.villagers = []; // keep villagers out of the way
  assert.equal(send(s, { type: 'homestead_act', action: 'water', target: id }).ok, false, 'needs a bucket');
  const draw = send(s, { type: 'homestead_act', action: 'draw_water', target: 'well' });
  assert.ok(draw.ok && draw.outcome.type === 'homestead_act' && draw.outcome.gained.water === 1);
  for (let i = 0; i < 2; i++) assert.ok(send(s, { type: 'homestead_act', action: 'till', target: id }).ok);
  assert.equal(h.plots[0].state, 'tilled', 'a 9 m² field takes two digs');
  assert.equal(unitsOf(h.plots[0]), 1);
  const water = send(s, { type: 'homestead_act', action: 'water', target: id });
  assert.ok(water.ok && water.outcome.type === 'homestead_act' && water.outcome.spent.water === 1);
  assert.equal(h.plots[0].moisture, 12);
  assert.equal(send(s, { type: 'homestead_act', action: 'feed', target: 'pen' }).ok, false, 'no straw in the bag');
  assert.equal(send(s, { type: 'homestead_act', action: 'sow', target: id }).ok, false, 'no seed in the bag');
  assert.equal(send(s, { type: 'homestead_act', action: 'till', target: 'mammoth' }).ok, false, 'unknown targets are invalid commands');
});

test('the steward acts only within its permissions; approval-gated actions need the owner', () => {
  const s = founded();
  const assign = send(s, { type: 'assign_role', villagerId: 'villager:1', role: 'farmer', actor: 'steward' });
  assert.ok(assign.ok, 'assigning roles is an auto-approved steward action');
  assert.equal(s.world.homestead!.villagers[1].role, 'farmer');
  const expand = send(s, { type: 'expand_field', actor: 'steward' });
  assert.ok(!expand.ok && expand.code === 'approval_required');
  stock(s).wood = fenceCost(4, 4); // shared resources for the allocation
  const proposal = send(s, { type: 'steward_propose', action: 'expand_field', reason: 'all plots are busy' });
  assert.ok(proposal.ok && proposal.outcome.type === 'steward_propose');
  const id = (proposal.outcome as { proposalId: string }).proposalId;
  const approved = send(s, { type: 'resolve_proposal', proposalId: id, approve: true });
  assert.ok(approved.ok);
  assert.equal(s.world.homestead!.plots.length, 1, 'the steward chose a valid spot for the field');
  assert.equal(stock(s).wood ?? 0, 0, 'the approved allocation spent the wood');
  assert.ok(send(s, { type: 'steward_policy', enabled: true, assign_role: 'off', expand_field: 'approve' }).ok);
  const blocked = send(s, { type: 'assign_role', villagerId: 'villager:1', role: 'herder', actor: 'steward' });
  assert.ok(!blocked.ok && blocked.code === 'not_permitted');
  assert.ok(send(s, { type: 'assign_role', villagerId: 'villager:1', role: 'herder', actor: 'player' }).ok, 'the owner is never blocked');
});

test('seed reserved for replanting cannot be withdrawn from the store', () => {
  const s = founded();
  field(s, 6, 6); field(s, 4, 4); // 4 + 2 units waiting for 6 seed
  const r = send(s, { type: 'withdraw', stockpileId: 'stockpile:founder', resources: { seed: 1 } });
  assert.ok(!r.ok && r.code === 'reserved', JSON.stringify(r));
});

test('homestead state survives save and reload, and tampering is rejected', () => {
  const s = founded();
  field(s, 5, 4, 'potato');
  ticks(s, 400);
  send(s, { type: 'assign_role', villagerId: 'villager:0', role: 'herder', actor: 'player' });
  ticks(s, 50);
  const snapshot = JSON.parse(JSON.stringify(s.snapshot));
  const restored = GameSession.restore(snapshot, JSON.parse(JSON.stringify(s.journal)));
  assert.equal(restored.stateHash, s.stateHash);
  assert.deepEqual(homesteadSnapshot(restored.world.homestead!), homesteadSnapshot(s.world.homestead!));
  const bad = JSON.parse(JSON.stringify(snapshot.homestead));
  bad.animals[0].species = 'mammoth';
  assert.throws(() => validateHomestead(bad, snapshot.tick));
  const extra = JSON.parse(JSON.stringify(snapshot.homestead));
  extra.villagers[0].gold = 1000;
  assert.throws(() => validateHomestead(extra, snapshot.tick));
});

test('worlds without a homestead keep their exact bytes and hashes', () => {
  const s = session();
  ticks(s, 5);
  assert.equal('homestead' in s.snapshot, false);
  const replay = GameSession.replay(JSON.parse(JSON.stringify(s.journal)));
  assert.equal(replay.stateHash, s.stateHash);
});

test('villagers rest at home at night', () => {
  const s = founded();
  field(s);
  const h = s.world.homestead!;
  ticks(s, DAY_TICKS * 0 + 230); // well into the first night
  const home = homesteadLayout(h).find((f) => f.id === 'farmhouse')!.use;
  for (const v of h.villagers) {
    assert.equal(v.task?.kind, 'rest', `${v.name} is ${v.task?.kind}`);
    assert.ok(Math.hypot(v.x - home.x, v.z - home.z) < 5, `${v.name} is at home`);
  }
});
