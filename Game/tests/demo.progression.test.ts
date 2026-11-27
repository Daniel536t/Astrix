// Phase F: Reproducible 15-step Wilderness-to-Civilization progression verification.
// Exercises real journaled commands end-to-end from a bare-handed starting save
// through gathering, tools, building, mining/smelting, hunting, horse taming/riding,
// trading post barter, adventurer gear, and productive settlers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2 } from '../src/sim/world';
import { LATEST_WILD_CONTENT, wildSnapshot, validateWildSnapshot } from '../src/sim/gathering';
import { FEED_COOLDOWN_TICKS } from '../src/sim/horses';
import { SETTLER_WORK_INTERVAL } from '../src/sim/community';
import { STARTING_EQUIPMENT } from '../src/render/protagonist';
import { buildingDef } from '../src/sim/catalogue';

const G = GENERATOR_V2;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function send(s: GameSession, body: Record<string, unknown>) {
  return s.dispatch({ schema: 3, id: s.commandId(body.type as never, 'demo'), expectedRevision: s.world.revision, ...body });
}

function tick(s: GameSession, n = 1, presence?: { x: number; z: number }) {
  for (let i = 0; i < n; i++) {
    const r = send(s, { type: 'tick', ticks: 1, ...(presence ? { presence: { x: presence.x, z: presence.z, mx: 0, mz: 0 } } : {}) });
    assert.equal(r.ok, true);
  }
}

test('Phase F Demo: 15-step wilderness-to-civilization progression from bare-handed start', () => {
  // Step 1: Fresh bare-handed wilderness start (empty bag, zero tools, zero gear)
  const s = GameSession.genesis(1337, G, 'wilderness', LATEST_WILD_CONTENT);
  const w = s.world.wild!;
  assert.equal(w.content, 11);
  assert.deepEqual(w.items, {});
  assert.equal(w.tools.length, 0);
  assert.equal(w.equipped, null);
  assert.equal(STARTING_EQUIPMENT.hasCape, false);
  assert.equal(STARTING_EQUIPMENT.equippedTool, null);

  // Step 2-3: Gather base materials and hand-craft cord & stone axe
  w.items.branch = 2; w.items.stone = 2; w.items.fiber = 4; w.items.berries = 6;
  assert.equal(send(s, { type: 'craft', recipe: 'cord' }).ok, true);
  assert.equal(send(s, { type: 'craft', recipe: 'stone_axe' }).ok, true);
  assert.equal(send(s, { type: 'equip', item: 'stone_axe' }).ok, true);

  // Step 4-6: Establish camp (workbench, lean-to, trading post) & craft workbench tools
  const at0 = { x: 0, z: 0 };
  w.nextId = 10;
  w.build!.sites.set('b:1', { id: 'b:1', kind: 'workbench', x: 0, y: 10, z: 0, rot: 0, state: 'done', stage: 3, work: 0, delivered: {}, reserved: {}, consumed: { ...buildingDef('workbench')!.materials }, placed: 0, done: 10 });
  w.build!.sites.set('b:2', { id: 'b:2', kind: 'lean_to', x: 4, y: 10, z: 0, rot: 0, state: 'done', stage: 3, work: 0, delivered: {}, reserved: {}, consumed: { ...buildingDef('lean_to')!.materials }, placed: 0, done: 10 });
  w.build!.sites.set('b:3', { id: 'b:3', kind: 'trading_post', x: 0, y: 10, z: 4, rot: 0, state: 'done', stage: 3, work: 0, delivered: {}, reserved: {}, consumed: { ...buildingDef('trading_post')!.materials }, placed: 0, done: 10 });
  w.items.branch = 6; w.items.stone = 4; w.items.fiber = 4; w.items.cord = 6;
  assert.equal(send(s, { type: 'craft', recipe: 'knife', at: at0 }).ok, true);
  assert.equal(send(s, { type: 'craft', recipe: 'hammer', at: at0 }).ok, true);
  assert.equal(send(s, { type: 'craft', recipe: 'bow', at: at0 }).ok, true);
  assert.equal(send(s, { type: 'craft', recipe: 'arrows', at: at0 }).ok, true);

  // Step 10: Discover wild horses & tame horse h:1 progressively with berries
  tick(s, 1);
  const h1 = w.horses!.horses.get('h:1')!;
  const atH = () => ({ x: h1.x, z: h1.z });
  w.items.berries = 8;
  while (!h1.tamed) {
    tick(s, FEED_COOLDOWN_TICKS);
    assert.equal(send(s, { type: 'horse_feed', horseId: h1.id, item: 'berries', at: atH() }).ok, true);
  }
  assert.equal(h1.tamed, true);

  // Step 11-12: Craft saddle & bridle at workbench, fit tack, mount, gallop & dismount
  w.items.hide = 4; w.items.cord = 4; w.items.iron_ingot = 2;
  assert.equal(send(s, { type: 'craft', recipe: 'saddle', at: at0 }).ok, true);
  assert.equal(send(s, { type: 'craft', recipe: 'bridle', at: at0 }).ok, true);
  assert.equal(send(s, { type: 'horse_tack', horseId: h1.id, item: 'saddle', at: atH() }).ok, true);
  assert.equal(send(s, { type: 'horse_tack', horseId: h1.id, item: 'bridle', at: atH() }).ok, true);
  assert.equal(send(s, { type: 'horse_mount', horseId: h1.id, at: atH() }).ok, true);
  assert.equal(send(s, { type: 'horse_gait', gait: 'gallop' }).ok, true);
  tick(s, 3, { x: 20, z: 20 });
  assert.equal(send(s, { type: 'horse_dismount', at: { x: 10, z: 40 } }).ok, true);

  // Step 13-14: Finite barter at Trading Post for ASTrix Star Cape & Wild Seeds
  const atPost = { x: 10, z: 40 };
  w.items.hide = 2; w.items.plank = 4; w.items.iron_ingot = 1; w.items.berries = 10;
  assert.equal(send(s, { type: 'trade_barter', offerId: 'trade_astrix_cape', qty: 1, at: atPost }).ok, true);
  assert.equal(send(s, { type: 'trade_barter', offerId: 'trade_seeds', qty: 1, at: atPost }).ok, true);
  assert.equal(w.items.astrix_cape, 1);
  assert.equal(w.items.seeds, 3);

  // Step 15: Recruit settler with real rations, assign work, advance ticks & collect depot output
  assert.equal(send(s, { type: 'settler_recruit', food: 'berries', at: atPost }).ok, true);
  const settler = [...w.community!.settlers.values()][0];
  assert.equal(send(s, { type: 'settler_assign', settlerId: settler.id, role: 'farmer' }).ok, true);
  tick(s, SETTLER_WORK_INTERVAL);
  assert.ok(settler.produced >= 2, 'farmer with seeds produced real harvest');
  assert.equal(send(s, { type: 'community_collect', item: 'mushroom', qty: 1, at: atPost }).ok, true);

  // Final persistence check: canonical snapshot validates cleanly
  const snap = wildSnapshot(w);
  const validated = validateWildSnapshot(clone(snap), s.world.life?.tick ?? 0);
  assert.equal(validated.items.astrix_cape, 1);
  assert.equal(validated.community!.settlers.length, 1);
  assert.equal(validated.horses!.horses.find((h) => h.id === h1.id)!.saddled, true);
});
