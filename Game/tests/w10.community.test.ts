// W10 (wilderness content v11): trading post, finite merchant barter, legitimate settler recruitment,
// productive settler work on ticks, depot collection, persistence & replay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2 } from '../src/sim/world';
import { LATEST_WILD_CONTENT, WILD_CONTENT_V10, WILD_CONTENT_V11, wildSnapshot, validateWildSnapshot } from '../src/sim/gathering';
import { buildingDef } from '../src/sim/catalogue';
import { MERCHANT_OFFERS, SETTLER_WORK_INTERVAL } from '../src/sim/community';
import { siteTriangles, BUILDINGS_BUDGET } from '../src/render/wild-buildings';

const G = GENERATOR_V2;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function send(s: GameSession, body: Record<string, unknown>) {
  return s.dispatch({ schema: 3, id: s.commandId(body.type as never, 'c'), expectedRevision: s.world.revision, ...body });
}

function tick(s: GameSession, n = 1) {
  for (let i = 0; i < n; i++) {
    const r = send(s, { type: 'tick', ticks: 1 });
    assert.equal(r.ok, true);
  }
}

test('W10: trading_post catalogue definition and render triangle budget', () => {
  const def = buildingDef('trading_post');
  assert.ok(def, 'trading_post exists in catalogue');
  assert.equal(def!.implemented, true);
  assert.equal(def!.minContent, 11);
  assert.equal(def!.function.kind, 'trade');
  const tris = siteTriangles({
    id: 'b:1', kind: 'trading_post', x: 0, y: 10, z: 0, rot: 0, state: 'done', stage: 3, work: 0, delivered: {},
  });
  assert.ok(tris > 0 && tris <= BUILDINGS_BUDGET.trianglesPerBuilding, `trading_post tris=${tris} within budget`);
});

test('W10: v10 world refuses community commands until upgraded to v11', () => {
  const s10 = GameSession.genesis(1337, G, 'wilderness', WILD_CONTENT_V10);
  const r = send(s10, { type: 'trade_barter', offerId: 'trade_seeds', qty: 1, at: { x: 0, z: 0 } });
  assert.equal(r.ok, false);
  assert.match(r.ok ? '' : r.reasons[0], /predates trade and settlers/);
  assert.equal(send(s10, { type: 'upgrade_wilderness', content: WILD_CONTENT_V11 }).ok, true);
  assert.equal(s10.world.wild!.content, 11);
});

test('W10: finite merchant barter (no resource fabrication), settler recruitment gates, productive work & snapshot round-trip', () => {
  const s = GameSession.genesis(1337, G, 'wilderness', LATEST_WILD_CONTENT);
  const w = s.world.wild!;
  const postPos = { x: 0, z: 0 };

  // Without a finished trading_post, barter and recruitment are refused
  w.items.berries = 10;
  const noPostTrade = send(s, { type: 'trade_barter', offerId: 'trade_seeds', qty: 1, at: postPos });
  assert.equal(noPostTrade.ok, false);
  assert.equal(noPostTrade.ok ? '' : noPostTrade.code, 'no_trading_post');

  const noPostRecruit = send(s, { type: 'settler_recruit', food: 'berries', at: postPos });
  assert.equal(noPostRecruit.ok, false);
  assert.equal(noPostRecruit.ok ? '' : noPostRecruit.code, 'no_trading_post');

  // Add a finished trading_post at (0, 0) (simulating completed construction)
  w.nextId = 10;
  w.build!.sites.set('b:1', {
    id: 'b:1', kind: 'trading_post', x: 0, y: 10, z: 0, rot: 0, state: 'done', stage: 3, work: 0, delivered: {}, reserved: {},
    consumed: { ...buildingDef('trading_post')!.materials }, placed: 0, done: 10,
  });

  // Barter seeds: costs 2 berries, gives 3 seeds, decrements finite stock
  const seedsOffer = MERCHANT_OFFERS.find((o) => o.id === 'trade_seeds')!;
  const t1 = send(s, { type: 'trade_barter', offerId: 'trade_seeds', qty: 1, at: postPos });
  assert.equal(t1.ok, true);
  assert.equal(w.items.berries, 8);
  assert.equal(w.items.seeds, 3);
  assert.equal(w.community!.stock.trade_seeds, seedsOffer.initialStock - 1);
  assert.equal(w.community!.tradesCompleted, 1);

  // Exhaust finite stock for trade_astrix_cape (stock = 1)
  w.items.hide = 4;
  w.items.plank = 8;
  w.items.iron_ingot = 2;
  const capeTrade = send(s, { type: 'trade_barter', offerId: 'trade_astrix_cape', qty: 1, at: postPos });
  assert.equal(capeTrade.ok, true);
  assert.equal(w.items.astrix_cape, 1);
  assert.equal(w.community!.stock.trade_astrix_cape, 0);
  const capeAgain = send(s, { type: 'trade_barter', offerId: 'trade_astrix_cape', qty: 1, at: postPos });
  assert.equal(capeAgain.ok, false);
  assert.equal(capeAgain.ok ? '' : capeAgain.code, 'out_of_stock');

  // Settler recruitment refused without shelter
  const noShelter = send(s, { type: 'settler_recruit', food: 'berries', at: postPos });
  assert.equal(noShelter.ok, false);
  assert.equal(noShelter.ok ? '' : noShelter.code, 'no_shelter');

  // Add a finished lean-to shelter (capacity 1) -> recruit succeeds and consumes 8 berries
  w.build!.sites.set('b:2', {
    id: 'b:2', kind: 'lean_to', x: 4, y: 10, z: 0, rot: 0, state: 'done', stage: 3, work: 0, delivered: {}, reserved: {},
    consumed: { ...buildingDef('lean_to')!.materials }, placed: 0, done: 10,
  });
  const rec = send(s, { type: 'settler_recruit', food: 'berries', at: postPos });
  assert.equal(rec.ok, true);
  assert.equal(w.items.berries, undefined, '8 berries consumed as arrival rations');
  assert.equal(w.community!.settlers.size, 1);

  // Second settler refused because shelter capacity is 1
  w.items.berries = 8;
  const capFull = send(s, { type: 'settler_recruit', food: 'berries', at: postPos });
  assert.equal(capFull.ok, false);
  assert.equal(capFull.ok ? '' : capFull.code, 'no_shelter');

  // Assign settler to woodcutter and advance world ticks -> produces real items into depot
  const settler = [...w.community!.settlers.values()][0];
  assert.equal(send(s, { type: 'settler_assign', settlerId: settler.id, role: 'woodcutter' }).ok, true);
  tick(s, SETTLER_WORK_INTERVAL * 2);
  assert.equal(settler.produced, 2);
  assert.equal(w.community!.depot.branch, 1);
  assert.equal(w.community!.depot.log, 1);

  // Collect real output from settlement depot into bag
  const col = send(s, { type: 'community_collect', item: 'branch', qty: 1, at: postPos });
  assert.equal(col.ok, true);
  assert.equal(w.items.branch, 1);
  assert.equal(w.community!.depot.branch, undefined);

  // Canonical snapshot round-trip preserves finite stock, settlers, roles, and depot
  const snap = wildSnapshot(w);
  const validated = validateWildSnapshot(clone(snap), s.world.life?.tick ?? 0);
  assert.equal(validated.community!.stock.trade_astrix_cape, 0);
  assert.equal(validated.community!.settlers.length, 1);
  assert.equal(validated.community!.settlers[0].role, 'woodcutter');
  assert.equal(validated.community!.depot.log, 1);
});
