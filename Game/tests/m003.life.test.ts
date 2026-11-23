import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserSaveStore } from '../src/app/persistence';
import { GameSession } from '../src/app/session';
import {
  CARRIED_CAPACITY, CROP_GROWTH_TICKS, FOUNDER_STOCKPILE_ID,
  MAX_PRODUCTION_JOBS, RECIPES, STOCKPILE_CAPACITY, total,
} from '../src/sim/economy';
import { restoreWorldSnapshot, createWorldSnapshot, validateWorldSnapshot } from '../src/sim/snapshot';
import { createM002Fixture, M002_LAYOUT } from '../src/sim/m002';
import { FARM_RULES } from '../src/sim/construction';
import { LocalAuthorizer, prepareSite } from '../src/sim/preparation';

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function send(session: GameSession, command: Record<string, unknown>) {
  return session.dispatch({
    schema: 3, id: `test:${session.nextSequence}`, expectedRevision: session.world.revision,
    ...command,
  });
}
function accepted(session: GameSession, command: Record<string, unknown>) {
  const result = send(session, command);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}
function stock(session: GameSession): Record<string, number> {
  return session.world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory;
}
function build(session: GameSession, projectId: 'house' | 'path' | 'farm') {
  return accepted(session, { type: 'build', projectId, designVersion: 2 });
}
function gatherFiber(session: GameSession): void {
  const entity = session.world.entities.get('hero:styl_shrub:-14:-8')!;
  assert.equal(entity.resource, 'fiber');
  accepted(session, { type: 'harvest', entityId: entity.id });
}
function plantReadyCrop(session: GameSession): void {
  gatherFiber(session);
  gatherFiber(session);
  accepted(session, { type: 'deposit', stockpileId: FOUNDER_STOCKPILE_ID, resources: { fiber: 2 } });
  accepted(session, { type: 'produce', stockpileId: FOUNDER_STOCKPILE_ID, recipe: 'seed' });
  accepted(session, { type: 'tick', ticks: 1 });
  build(session, 'farm');
  accepted(session, { type: 'plant', plotId: 'crop:0' });
  accepted(session, { type: 'tick', ticks: CROP_GROWTH_TICKS });
}
function assertUnchanged(session: GameSession, before: { hash: string; snapshot: unknown; journal: unknown }, result: { ok: boolean }) {
  assert.equal(result.ok, false);
  assert.equal(session.stateHash, before.hash);
  assert.deepEqual(session.snapshot, before.snapshot);
  assert.deepEqual(session.journal, before.journal);
}
function stable(session: GameSession) {
  return { hash: session.stateHash, snapshot: clone(session.snapshot), journal: clone(session.journal) };
}

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

test('complete founder life loop replays exactly from genesis and a snapshot tail', () => {
  const live = GameSession.genesis();
  assert.equal(live.snapshot.schema, 3);
  gatherFiber(live);
  gatherFiber(live);
  accepted(live, { type: 'deposit', stockpileId: FOUNDER_STOCKPILE_ID, resources: { fiber: 2 } });
  accepted(live, { type: 'produce', stockpileId: FOUNDER_STOCKPILE_ID, recipe: 'seed' });
  assert.equal(stock(live).fiber, undefined);
  assert.equal(live.world.life!.jobs.size, 1);
  accepted(live, { type: 'tick', ticks: 1 });
  assert.deepEqual(stock(live), { seed: 3 });
  build(live, 'farm');
  const boundary = clone(live.snapshot);
  accepted(live, { type: 'plant', plotId: 'crop:0' });
  assert.equal(live.world.life!.crops.get('crop:0')!.plantedTick, 1);
  accepted(live, { type: 'tick', ticks: 4 });
  accepted(live, { type: 'harvest_crop', plotId: 'crop:0' });
  assert.equal(live.world.inventory.food, 6);
  assert.equal(live.world.inventory.fiber, 1);
  assert.equal(live.world.life!.crops.size, 0, 'harvest empties the plot');
  accepted(live, { type: 'deposit', stockpileId: FOUNDER_STOCKPILE_ID, resources: { food: 2 } });
  accepted(live, { type: 'produce', stockpileId: FOUNDER_STOCKPILE_ID, recipe: 'rations' });
  accepted(live, { type: 'tick', ticks: 2 });
  assert.equal(stock(live).rations, 3);
  accepted(live, { type: 'withdraw', stockpileId: FOUNDER_STOCKPILE_ID, resources: { rations: 2 } });
  assert.equal(stock(live).rations, 1);
  assert.equal(live.world.inventory.rations, 2);
  assert.equal(live.world.life!.tick, 7);
  assert.equal(GameSession.replay(clone(live.journal)).stateHash, live.stateHash);
  const tail = GameSession.restore(boundary, clone(live.journal));
  assert.equal(tail.stateHash, live.stateHash);
  assert.deepEqual(tail.snapshot, live.snapshot);
  assert.deepEqual(tail.journal, live.journal);
  for (const [index, entry] of live.journal.entries.entries()) {
    assert.equal(entry.sequence, index);
    assert.equal(live.entry(index)!.hash, entry.hash);
  }
  const replay = GameSession.replay(clone(live.journal));
  assert.deepEqual(replay.snapshot, live.snapshot);
  assert.deepEqual(replay.journal, live.journal);
});

test('life-loop command ids are idempotent and stale or conflicting reuse cannot mutate state', () => {
  const session = GameSession.genesis();
  const deposit = {
    schema: 3, id: 'same-id', type: 'deposit', stockpileId: FOUNDER_STOCKPILE_ID,
    expectedRevision: 0, resources: { stone: 2 },
  };
  const first = session.dispatch(deposit);
  const before = stable(session);
  const duplicate = session.dispatch(deposit);
  assert.equal(duplicate.ok, true);
  assert.equal((duplicate as { duplicate: boolean }).duplicate, true);
  assert.deepEqual(duplicate, { ...first, duplicate: true });
  assert.equal(session.stateHash, before.hash);
  assertUnchanged(session, before, session.dispatch({ ...deposit, resources: { wood: 3 }, expectedRevision: 1 }));
  assertUnchanged(session, before, session.dispatch({
    schema: 3, id: 'stale-life', type: 'withdraw', stockpileId: FOUNDER_STOCKPILE_ID,
    expectedRevision: session.world.revision + 1, resources: { wood: 1 },
  }));
});

test('invalid, multi-resource, unknown-resource and stale life commands reject atomically', () => {
  const session = GameSession.genesis();
  const invalid = [
    { type: 'deposit', stockpileId: FOUNDER_STOCKPILE_ID, resources: { wood: 0 } },
    { type: 'deposit', stockpileId: FOUNDER_STOCKPILE_ID, resources: { wood: -1 } },
    { type: 'deposit', stockpileId: FOUNDER_STOCKPILE_ID, resources: { wood: 1.5 } },
    { type: 'deposit', stockpileId: FOUNDER_STOCKPILE_ID, resources: { wood: 1, stone: 1 } },
    { type: 'deposit', stockpileId: FOUNDER_STOCKPILE_ID, resources: { iron: 1 } },
    { type: 'withdraw', stockpileId: FOUNDER_STOCKPILE_ID, resources: {} },
    { type: 'produce', stockpileId: FOUNDER_STOCKPILE_ID, recipe: 'bread' },
    { type: 'tick', ticks: 0 },
    { type: 'tick', ticks: 65 },
    { type: 'tick', ticks: 1.2 },
    { type: 'plant', plotId: 'crop:9' },
  ];
  for (const command of invalid) {
    const before = stable(session);
    const result = send(session, command);
    assert.equal(result.ok, false);
    assert.equal(((result as { code: string }).code === 'invalid_command'
      || (result as { code: string }).code === 'invalid_transfer'), true,
    'malformed or semantically invalid commands must reject without mutation');
    assertUnchanged(session, before, result);
  }
  const before = stable(session);
  const unknown = { type: 'tick', ticks: 1, extra: true };
  assert.equal(send(session, unknown).code, 'invalid_command');
  assert.deepEqual(session.snapshot, before.snapshot);
  const stale = session.dispatch({
    schema: 3, id: 'stale-revision', type: 'deposit', stockpileId: FOUNDER_STOCKPILE_ID,
    expectedRevision: session.world.revision + 1, resources: { wood: 1 },
  });
  assert.equal(stale.code, 'stale_revision');
  assertUnchanged(session, before, stale);
});

test('transfers conserve resources and enforce both capacities', () => {
  const session = GameSession.genesis();
  const beforeTotal = total(session.world.inventory) + total(stock(session));
  accepted(session, { type: 'deposit', stockpileId: FOUNDER_STOCKPILE_ID, resources: { wood: 2 } });
  assert.equal(total(session.world.inventory) + total(stock(session)), beforeTotal);
  accepted(session, { type: 'withdraw', stockpileId: FOUNDER_STOCKPILE_ID, resources: { wood: 2 } });
  assert.equal(total(session.world.inventory) + total(stock(session)), beforeTotal);
  assertUnchanged(session, stable(session), send(session, {
    type: 'deposit', stockpileId: FOUNDER_STOCKPILE_ID,
    resources: { stone: STOCKPILE_CAPACITY + 1 },
  }));
  stock(session).wood = 100;
  assertUnchanged(session, stable(session), send(session, {
    type: 'deposit', stockpileId: FOUNDER_STOCKPILE_ID, resources: { wood: 101 },
  }));

  const carried = GameSession.genesis();
  carried.world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory = { food: 140 };
  const carriedBefore = clone(carried.world.inventory);
  assertUnchanged(carried, stable(carried), send(carried, {
    type: 'withdraw', stockpileId: FOUNDER_STOCKPILE_ID, resources: { food: 60 },
  }));
  assert.deepEqual(carried.world.inventory, carriedBefore);
  accepted(carried, { type: 'withdraw', stockpileId: FOUNDER_STOCKPILE_ID, resources: { food: 48 } });
  assert.equal(total(carried.world.inventory), CARRIED_CAPACITY);
});

test('production uses stored inputs, reserves output space and completes on fixed ticks', () => {
  const session = GameSession.genesis();
  const inventory = session.world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory;
  inventory.fiber = 2;
  accepted(session, { type: 'produce', stockpileId: FOUNDER_STOCKPILE_ID, recipe: 'seed' });
  assert.deepEqual(inventory, {});
  assert.equal(session.world.life!.tick, 0);
  assertUnchanged(session, stable(session), send(session, {
    type: 'produce', stockpileId: FOUNDER_STOCKPILE_ID, recipe: 'seed',
  }));
  const tick = accepted(session, { type: 'tick', ticks: 1 });
  assert.equal(tick.outcome.type, 'tick');
  assert.deepEqual((tick.outcome as { completedJobs: unknown[] }).completedJobs,
    [{ id: 'test:0', recipe: 'seed', output: { seed: 3 } }]);
  assert.deepEqual(inventory, { seed: 3 });
  const limited = GameSession.genesis();
  const limitedStock = limited.world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory;
  limitedStock.fiber = MAX_PRODUCTION_JOBS * RECIPES.seed.input.fiber!;
  for (let i = 0; i < MAX_PRODUCTION_JOBS; i++) {
    send(limited, { type: 'produce', stockpileId: FOUNDER_STOCKPILE_ID, recipe: 'seed' });
  }
  assert.equal(limited.world.life!.jobs.size, MAX_PRODUCTION_JOBS);
  const reserved = GameSession.genesis();
  const reservedStock = reserved.world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory;
  reservedStock.fiber = 2;
  reservedStock.food = STOCKPILE_CAPACITY - 2;
  const before = stable(reserved);
  assertUnchanged(reserved, before, send(reserved, {
    type: 'produce', stockpileId: FOUNDER_STOCKPILE_ID, recipe: 'seed',
  }));
});

test('crop growth ignores wall-clock time and premature harvest preserves the crop and seed', () => {
  const session = GameSession.genesis();
  assertUnchanged(session, stable(session), send(session, { type: 'plant', plotId: 'crop:0' }));
  plantReadyCrop(session);
  accepted(session, { type: 'harvest_crop', plotId: 'crop:0' });
  gatherFiber(session);
  accepted(session, { type: 'deposit', stockpileId: FOUNDER_STOCKPILE_ID, resources: { fiber: 2 } });
  accepted(session, { type: 'produce', stockpileId: FOUNDER_STOCKPILE_ID, recipe: 'seed' });
  accepted(session, { type: 'tick', ticks: 1 });
  accepted(session, { type: 'plant', plotId: 'crop:0' });
  accepted(session, { type: 'plant', plotId: 'crop:1' });
  const replantBoundary = clone(session.snapshot);
  assert.equal(session.world.life!.tick, 6);
  assert.equal(session.world.life!.crops.size, 2);
  for (let i = 0; i < 4; i++) {
    const pending = stable(session);
    assertUnchanged(session, pending, send(session, { type: 'harvest_crop', plotId: 'crop:0' }));
    accepted(session, { type: 'tick', ticks: 1 });
  }
  assert.equal(session.world.life!.crops.size, 2);
  const originalDateNow = Date.now;
  Date.now = () => originalDateNow() + 1_000_000_000;
  try { assert.equal(session.world.life!.tick, 10); } finally { Date.now = originalDateNow; }
  accepted(session, { type: 'harvest_crop', plotId: 'crop:0' });
  assert.equal(session.world.life!.crops.has('crop:0'), false);
  restoreWorldSnapshot(session.world, replantBoundary);
  session.world.inventory = { food: CARRIED_CAPACITY };
  const full = stable(session);
  assertUnchanged(session, full, send(session, { type: 'harvest_crop', plotId: 'crop:1' }));
  assert.equal(session.world.life!.crops.has('crop:1'), true);
});

test('schema-3 snapshots strictly decode and in-place legacy restore clears life state', () => {
  const session = GameSession.genesis();
  plantReadyCrop(session);
  const saved = clone(session.snapshot);
  assert.equal(saved.schema, 3);
  assert.equal(saved.crops.length, 1);
  const legacy = GameSession.legacyGenesis();
  restoreWorldSnapshot(session.world, legacy.snapshot);
  assert.equal(session.world.life, undefined);
  const legacySession = GameSession.legacyGenesis();
  const malformed: Array<(value: Record<string, unknown>) => void> = [
    (value) => { value.tick = -1; },
    (value) => { value.stockpiles = []; },
    (value) => { value.crops = [{ id: 'crop:9', plantedTick: 0, growthTicks: 4 }]; },
    (value) => { value.jobs = [{ id: 'job', stockpileId: FOUNDER_STOCKPILE_ID, recipe: 'seed', remainingTicks: 2 }]; },
    (value) => { value.carriedExtra = 1; },
  ];
  for (const mutate of malformed) {
    const invalid = clone(saved) as unknown as Record<string, unknown>;
    mutate(invalid);
    const before = stable(legacySession);
    assert.throws(() => validateWorldSnapshot(invalid));
    assert.throws(() => restoreWorldSnapshot(legacySession.world, invalid as never));
    assert.equal(legacySession.stateHash, before.hash);
  }
});

test('corrupt current browser saves never silently fall back to older playable records', () => {
  const storage = new MemoryStorage();
  assert.equal(new BrowserSaveStore(storage, 1337).save(GameSession.legacyGenesis(1337, 2)).ok, true);
  const older = storage.getItem('astrix:m002:v2:seed:1337');
  storage.setItem('astrix:m002:v3:seed:1337', '{broken');
  const store = new BrowserSaveStore(storage, 1337);
  const loaded = store.load();
  assert.equal(loaded.status, 'corrupt');
  assert.equal(loaded.session.nextSequence, 0);
  assert.equal(loaded.session.snapshot.schema, 3);
  assert.equal(storage.getItem('astrix:m002:v2:seed:1337'), older);
  assert.equal(storage.getItem('astrix:m002:v3:seed:1337'), null);
  assert.equal(storage.getItem('astrix:m002:v3:seed:1337:corrupt'), '{broken');
});

test('schema-3 site clearing rejects atomically when recovered resources exceed carried capacity', () => {
  const { world } = createM002Fixture();
  // Use the real bounded preparation pipeline and the fixture's authorized
  // farm obstructions, rather than bypassing capacity validation in a build command.
  const live = GameSession.genesis();
  Object.assign(world, { inventory: live.world.inventory, life: live.world.life });
  world.inventory.stone = CARRIED_CAPACITY;
  assert.ok(world.entities.get('hero:styl_ore:-38:-42')!.remaining > 0);
  const before = {
    snapshot: createWorldSnapshot(world),
    inventory: clone(world.inventory),
    entities: [...world.entities.keys()],
    edits: clone([...world.edits]),
  };
  const result = prepareSite(world, new LocalAuthorizer({ envelope: M002_LAYOUT.envelope }), {
    siteId: M002_LAYOUT.farm.id, rect: M002_LAYOUT.farm.rect,
    floorY: 15, rules: FARM_RULES,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'unauthorized_edits');
    assert.ok(result.reasons.some(reason => reason.includes('carried capacity 120')));
  }
  assert.deepEqual(world.inventory, before.inventory);
  assert.deepEqual([...world.entities.keys()], before.entities);
  assert.deepEqual([...world.edits], before.edits);
  assert.deepEqual(createWorldSnapshot(world), before.snapshot);
});

test('the full life loop survives a browser save and exact snapshot-tail reload', () => {
  const storage = new MemoryStorage();
  const store = new BrowserSaveStore(storage, 1337);
  const live = GameSession.genesis();
  plantReadyCrop(live);
  accepted(live, { type: 'harvest_crop', plotId: 'crop:0' });
  assert.equal(store.save(live).ok, true);
  const loaded = store.load();
  assert.equal(loaded.status, 'restored');
  assert.equal(loaded.session.stateHash, live.stateHash);
  assert.deepEqual(loaded.session.snapshot, live.snapshot);
});
