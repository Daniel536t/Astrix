// W2: gathering, inventory and hand crafting (stone axe) in the wilderness scenario.
// - Loose pickups are authoritative records from their own random stream and id namespace; generation is
//   pure, deterministic and load-order independent, and does not disturb natural-entity generation.
// - Settlement worlds have no pickups and keep their pins; a W1 (content v1) wilderness save made by the
//   69296e9 code still loads and replays, and gains content v2 only through `upgrade_wilderness`.
// - pickup / drop / craft / equip / eat validate, are journaled and replay; capacity and reach are enforced;
//   there is no axe without its materials; taken pickups stay gone after a reload.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameSession, validateJournal } from '../src/app/session';
import { BrowserSaveStore, KeyValueStorage } from '../src/app/persistence';
import { GENERATOR_V2, MAT, WILDERNESS, baseHeightAt, baseTopMaterialFor, baseWaterLevelAt, forestScore, surfaceAt } from '../src/sim/world';
import { validateWorldSnapshot } from '../src/sim/snapshot';
import {
  CARRY_CAPACITY, LATEST_WILD_CONTENT, LivePickup, PICKUP_REACH, WILD_RECIPES, carriedWeight, livePickup, pickupsInChunk, pickupsNear,
} from '../src/sim/gathering';
import { wildernessSpawn } from '../src/sim/wilderness';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
let seq = 0;
const send = (s: GameSession, c: Record<string, unknown>) => s.dispatch({ schema: 3, id: `w2:${seq++}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never);
const ticks = (s: GameSession, n: number) => { for (let i = 0; i < n; i++) assert.ok(send(s, { type: 'tick', ticks: 1 }).ok); };
const at = (p: { x: number; z: number }) => ({ x: Math.round(p.x * 10), z: Math.round(p.z * 10) });
const take = (s: GameSession, p: LivePickup) => send(s, { type: 'pickup', entityId: p.id, at: at(p) });
const SPAWN = { x: -81.5, z: -171.5 };

class MemoryStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

/** Pinned on this change (W2): wilderness content v2, seed 1337, generator v2. */
const W2_GENESIS = '3c3a0c8e4090efcf';

test('pickup generation is pure, deterministic, load-order independent, and leaves natural entities untouched', () => {
  const chunks: Array<[number, number]> = [];
  for (let cz = 26; cz <= 28; cz++) for (let cx = 28; cx <= 30; cx++) chunks.push([cx, cz]);
  const a = chunks.map(([cx, cz]) => JSON.stringify(pickupsInChunk(1337, 2, cx, cz)));
  // Another seed's chunks in between, then the same chunks in reverse order, all recomputed (other cache keys first).
  for (const [cx, cz] of chunks) pickupsInChunk(4242, 2, cx, cz);
  const b = [...chunks].reverse().map(([cx, cz]) => JSON.stringify(pickupsInChunk(1337, 2, cx, cz))).reverse();
  assert.deepEqual(a, b);
  // Ids are their own namespace and index the chunk's list.
  for (const [cx, cz] of chunks) pickupsInChunk(1337, 2, cx, cz).forEach((p, i) => assert.equal(p.id, `p:${cx},${cz}:${i}`));
  // Natural entities and the state hash do not depend on whether pickups were generated first.
  const g1 = GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 2);
  const g2 = GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 2);
  pickupsNear(g1.world, SPAWN.x, SPAWN.z, 90);
  for (const s of [g1, g2]) for (let dz = -64; dz <= 64; dz += 32) for (let dx = -64; dx <= 64; dx += 32) surfaceAt(s.world, SPAWN.x + dx, SPAWN.z + dz);
  const ents = (s: GameSession) => JSON.stringify([...s.world.entities.values()].sort((x, y) => x.id.localeCompare(y.id)));
  assert.equal(ents(g1), ents(g2));
  assert.equal(g1.stateHash, g2.stateHash);
  assert.equal(g1.stateHash, W2_GENESIS);
  // And the natural entities match a settlement-free W1 (content v1) world of the same seed.
  const v1 = GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 1);
  for (let dz = -64; dz <= 64; dz += 32) for (let dx = -64; dx <= 64; dx += 32) surfaceAt(v1.world, SPAWN.x + dx, SPAWN.z + dz);
  assert.equal(ents(v1), ents(g1));
});

test('placement follows geography: dry land only, stones on rock, gravel and banks, branches under trees', () => {
  const all: LivePickup[] = pickupsNear(GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 2).world, SPAWN.x, SPAWN.z, 200);
  assert.ok(all.length > 500, `${all.length} pickups within 200 m`);
  let branchesInWoods = 0, branches = 0;
  for (const p of all) {
    const x = Math.floor(p.x), z = Math.floor(p.z), h = baseHeightAt(1337, 2, x, z);
    assert.ok(baseWaterLevelAt(1337, 2, x, z) <= h, `${p.id} is not in water`);
    assert.equal(p.y, h);
    const top = baseTopMaterialFor(1337, 2, x, z, h, 0);
    if (p.kind !== 'loose_stone') assert.notEqual(top, MAT.SAND, `${p.kind} on sand`);
    if (p.kind === 'branch') { branches++; if (forestScore(x, z, 1337) > 0.25) branchesInWoods++; }
    if (p.kind === 'mushroom') assert.ok(forestScore(x, z, 1337) > 0.4, 'mushrooms in the woods');
  }
  assert.ok(branchesInWoods / branches > 0.85, `${branchesInWoods}/${branches} branches under trees`);
  const kinds = new Set(all.map((p) => p.kind));
  for (const k of ['branch', 'loose_stone', 'fiber_plant', 'grass_tuft', 'berry_bush', 'mushroom']) assert.ok(kinds.has(k as never), k);
});

test('settlement worlds have no pickups, refuse the wilderness commands, and keep their pins', () => {
  const s = GameSession.genesis(1337);
  assert.equal(s.stateHash, 'e659504b056654dc');
  assert.equal(s.world.wild, undefined);
  assert.equal(JSON.stringify(s.journal), '{"schema":3,"seed":1337,"starterInventory":{"stone":48,"wood":24},"entries":[]}');
  assert.ok(!('wild' in s.snapshot));
  assert.deepEqual(pickupsNear(s.world, -42, -40, 80), []);
  const p = pickupsInChunk(1337, 1, 30, 30)[0];
  for (const c of [{ type: 'pickup', entityId: p?.id ?? 'p:30,30:0', at: at(p ?? { x: 0, z: 0 }) }, { type: 'craft', recipe: 'stone_axe' }, { type: 'upgrade_wilderness', content: 2 }]) {
    const r = send(s, c);
    assert.equal(r.ok, false);
    assert.equal((r as { code: string }).code, 'not_wilderness');
  }
  assert.equal(s.stateHash, 'e659504b056654dc');
  // A wilderness state block is refused in a settlement snapshot.
  const w = GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 2);
  const bad = clone(GameSession.genesis(1337, GENERATOR_V2).snapshot) as unknown as Record<string, unknown>;
  bad.wild = clone((w.snapshot as unknown as Record<string, unknown>).wild);
  assert.throws(() => validateWorldSnapshot(bad), /life-loop fields/);
  // A settlement journal cannot carry a pickup.
  const t = GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 2);
  const near = pickupsNear(t.world, SPAWN.x, SPAWN.z, 20)[0];
  assert.ok(take(t, near).ok);
  const j = clone(GameSession.genesis(1337, GENERATOR_V2).journal) as unknown as { entries: unknown[] };
  j.entries = clone(t.journal.entries);
  assert.throws(() => validateJournal(j), /settlement journal cannot contain pickup/);
});

test('a W1 wilderness save made by the 69296e9 code loads, replays and keeps playing; it gains pickups only by upgrade_wilderness', () => {
  const fx = JSON.parse(readFileSync('tests/fixtures/w1-wilderness-save.json', 'utf8')) as Record<string, { key: string; hash: string; replayHash?: string; record: string; compacted?: boolean }>;
  for (const which of ['short', 'long'] as const) {
    const f = fx[which];
    const storage = new MemoryStorage();
    storage.setItem(f.key, f.record);
    const store = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w1' });
    const loaded = store.load();
    assert.equal(loaded.status, 'restored', `${which}: ${loaded.message}`);
    const s = loaded.session;
    assert.equal(s.stateHash, f.hash, which);
    assert.equal(s.world.wild, undefined, 'content v1: no wilderness state');
    assert.ok(!('wildContent' in s.journal));
    assert.equal(JSON.stringify({ schema: 3, seed: 1337, snapshot: s.snapshot, journal: s.journal }), f.record, `${which}: byte-identical record`);
    if (which === 'short') assert.equal(GameSession.replay(clone(s.journal)).stateHash, f.replayHash);
    // Content v1: nothing to pick up, no crafting, until the upgrade.
    const r = send(s, { type: 'craft', recipe: 'stone_axe' });
    assert.equal(r.ok, false);
    assert.equal((r as { code: string }).code, 'wilderness');
    assert.deepEqual(pickupsNear(s.world, SPAWN.x, SPAWN.z, 30), []);
    ticks(s, 5);
    assert.ok(send(s, { type: 'upgrade_wilderness', content: 2 }).ok);
    assert.equal(send(s, { type: 'upgrade_wilderness', content: 2 }).ok, false, 'once only');
    const p = pickupsNear(s.world, SPAWN.x, SPAWN.z, 30)[0];
    assert.ok(take(s, p).ok);
    assert.ok(store.save(s).ok);
    const again = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w1' }).load();
    assert.equal(again.status, 'restored');
    assert.equal(again.session.stateHash, s.stateHash);
    assert.equal(livePickup(again.session.world, p.id), null);
    if (which === 'short') assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'upgraded W1 journal replays from genesis');
  }
});

test('the first stone axe is reachable fast from the seed-1337 spawn: branch, stone and 2 fibre within 40 m', () => {
  assert.deepEqual((({ x, z }) => ({ x, z }))(wildernessSpawn(1337, 2)), { x: -82, z: -172 });
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 2);
  const near = pickupsNear(s.world, SPAWN.x, SPAWN.z, 40);
  const count = (k: string) => near.filter((p) => p.kind === k).reduce((n, p) => n + p.qty, 0);
  assert.ok(count('branch') >= 3 && count('loose_stone') >= 3 && count('fiber_plant') >= 4, JSON.stringify({ b: count('branch'), s: count('loose_stone'), f: count('fiber_plant') }));
  // Walk greedily from the spawn to the nearest branch, stone and fibre plant; collect; craft; equip.
  let pos = { ...SPAWN }, walked = 0;
  for (const kind of ['branch', 'loose_stone', 'fiber_plant']) {
    const p = pickupsNear(s.world, pos.x, pos.z, 60).find((q) => q.kind === kind)!;
    walked += Math.hypot(p.x - pos.x, p.z - pos.z);
    pos = { x: p.x, z: p.z };
    const r = take(s, p);
    assert.ok(r.ok, JSON.stringify(r));
  }
  assert.ok(walked < 60, `walked ${walked.toFixed(1)} m (about ${(walked / 4.5).toFixed(0)} s on foot)`);
  const made = send(s, { type: 'craft', recipe: 'stone_axe' });
  assert.ok(made.ok, JSON.stringify(made));
  assert.deepEqual(made.ok && made.outcome, { type: 'craft', recipe: 'stone_axe', spent: { branch: 1, fiber: 2, stone: 1 }, made: { stone_axe: 1 }, toolId: 'tool:1' });
  assert.ok(send(s, { type: 'equip', item: 'stone_axe' }).ok);
  assert.equal(s.world.wild!.equipped, 'tool:1');
  assert.equal(s.world.wild!.tools[0].durability, 60);
  // One-step harvest stays refused (W3: trees are felled swing by swing with `chop`), even with the axe in hand.
  const tree = [...s.world.entities.values()].find((e) => e.kind.startsWith('styl_tree'))!;
  const h = send(s, { type: 'harvest', entityId: tree.id });
  assert.equal(h.ok, false);
  assert.match((h as { reasons: string[] }).reasons[0], /W3/);
});

test('no axe without its materials: crafting refuses missing inputs and changes nothing', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 2);
  const before = s.stateHash;
  // W4: the hand recipes (workbench recipes need a v4 world and a workbench; tests/w4.build.test.ts).
  for (const recipe of WILD_RECIPES.filter((r) => r.station === 'hand').map((r) => r.id)) {
    const r = send(s, { type: 'craft', recipe });
    assert.equal(r.ok, false, recipe);
    assert.equal((r as { code: string }).code, 'missing');
  }
  // One branch and one stone are not enough without a binding.
  const near = pickupsNear(s.world, SPAWN.x, SPAWN.z, 60);
  assert.ok(take(s, near.find((p) => p.kind === 'branch')!).ok);
  assert.ok(take(s, near.find((p) => p.kind === 'loose_stone')!).ok);
  const mid = s.stateHash, entries = s.journal.entries.length;
  const r = send(s, { type: 'craft', recipe: 'stone_axe' });
  assert.equal(r.ok, false);
  assert.match((r as { reasons: string[] }).reasons[0], /missing 2 plant fibre/);
  assert.equal(s.stateHash, mid);
  assert.equal(s.journal.entries.length, entries);
  assert.equal(s.world.wild!.tools.length, 0);
  assert.notEqual(before, mid);
  // Unknown recipes and malformed commands never validate.
  assert.equal(send(s, { type: 'craft', recipe: 'iron_axe' }).ok, false);
  assert.equal(send(s, { type: 'pickup', entityId: 'e:1,1:1', at: { x: 0, z: 0 } }).ok, false);
  assert.equal(send(s, { type: 'pickup', entityId: near[0].id, at: { x: 0.5, z: 0 } }).ok, false);
  assert.equal(send(s, { type: 'drop', item: 'gold', n: 1, at: { x: 0, z: 0 } }).ok, false);
});

test('reach and carry capacity are enforced; a multi-unit pickup is partly taken and keeps the rest', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 2);
  const stone = pickupsNear(s.world, SPAWN.x, SPAWN.z, 60).find((p) => p.kind === 'loose_stone')!;
  const far = send(s, { type: 'pickup', entityId: stone.id, at: at({ x: stone.x + PICKUP_REACH + 0.5, z: stone.z }) });
  assert.equal((far as { code: string }).code, 'out_of_reach');
  // Fill the bag with stones (2 kg each) until it refuses.
  let full: { code?: string } | null = null;
  for (const p of pickupsNear(s.world, SPAWN.x, SPAWN.z, 120).filter((q) => q.kind === 'loose_stone')) {
    const r = take(s, p);
    if (!r.ok) { full = r; break; }
  }
  assert.equal(full?.code, 'capacity');
  assert.equal(carriedWeight(s.world.wild!), CARRY_CAPACITY);
  // Drop one stone (2 kg free), then a 3-unit plant gives 2 and keeps 1.
  assert.ok(send(s, { type: 'drop', item: 'stone', n: 1, at: at(SPAWN) }).ok);
  const plant = pickupsNear(s.world, SPAWN.x, SPAWN.z, 120).find((p) => p.kind === 'fiber_plant' && p.qty === 3)!;
  const r = take(s, plant);
  assert.ok(r.ok && r.outcome.type === 'pickup' && r.outcome.amount === 2);
  assert.equal(livePickup(s.world, plant.id)!.qty, 1);
  assert.equal(s.world.wild!.left.get(plant.id), 1);
  // The dropped stone is a real pile that can be picked up again (after making room).
  const pile = pickupsNear(s.world, SPAWN.x, SPAWN.z, 1).find((p) => p.kind === 'pile')!;
  assert.equal(pile.item, 'stone');
  assert.equal((take(s, pile) as { code: string }).code, 'capacity');
  assert.ok(send(s, { type: 'drop', item: 'fiber', n: 2, at: at({ x: SPAWN.x + 1, z: SPAWN.z }) }).ok);
  assert.ok(take(s, pile).ok);
  assert.equal(s.world.wild!.piles.has(pile.id), false);
});

test('pickup, drop, craft, equip and eat are journaled and replay; saves restore exactly; taken pickups stay gone after reload', () => {
  const storage = new MemoryStorage();
  const store = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w3' });
  const loaded = store.load();
  assert.equal(loaded.status, 'new');
  const s = loaded.session;
  // W3: a new world now starts with the latest content (v7 since W6, deposits and mining); the W2 commands are unchanged there.
  assert.equal(s.journal.wildContent, LATEST_WILD_CONTENT);
  assert.equal(LATEST_WILD_CONTENT, 7);
  ticks(s, 3);
  const taken: string[] = [];
  for (const kind of ['branch', 'loose_stone', 'fiber_plant', 'fiber_plant', 'grass_tuft', 'grass_tuft', 'berry_bush']) {
    const p = pickupsNear(s.world, SPAWN.x, SPAWN.z, 60).find((q) => q.kind === kind)!;
    assert.ok(take(s, p).ok, kind);
    if (!livePickup(s.world, p.id)) taken.push(p.id);
  }
  const mid = { snapshot: clone(s.snapshot), journal: clone(s.journal) };
  assert.ok(send(s, { type: 'craft', recipe: 'grass_cord' }).ok);
  assert.ok(send(s, { type: 'craft', recipe: 'stone_axe_cord' }).ok, 'the cord binding works too');
  assert.ok(send(s, { type: 'equip', item: 'stone_axe' }).ok);
  const hunger = s.world.wild!.hunger;
  const ate = send(s, { type: 'eat', item: 'berries' });
  assert.ok(ate.ok && ate.outcome.type === 'eat' && ate.outcome.hunger === hunger - 6);
  assert.equal((send(s, { type: 'eat', item: 'stone' }) as { code: string }).code, 'not_food');
  assert.ok(send(s, { type: 'drop', item: 'fiber', n: 1, at: at(SPAWN) }).ok);
  ticks(s, 30);
  assert.equal(s.world.wild!.hunger, hunger - 6 + 2, 'hunger rises 1 per 15 ticks');
  const hash = s.stateHash;
  // Replay from genesis, restore from a mid-run save, restore after compaction.
  assert.equal(GameSession.replay(clone(s.journal)).stateHash, hash);
  const restored = GameSession.restore(mid.snapshot as never, clone(s.journal));
  assert.equal(restored.stateHash, hash);
  assert.ok(store.save(s).ok);
  const reloaded = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w3' }).load();
  assert.equal(reloaded.status, 'restored');
  const w = reloaded.session.world.wild!;
  assert.equal(reloaded.session.stateHash, hash);
  assert.equal(w.equipped, 'tool:1');
  assert.deepEqual(w.tools, [{ id: 'tool:1', kind: 'stone_axe', durability: 60 }]);
  for (const id of taken) {
    assert.equal(livePickup(reloaded.session.world, id), null, `${id} stays gone`);
    assert.ok(!pickupsNear(reloaded.session.world, SPAWN.x, SPAWN.z, 60).some((p) => p.id === id));
    const again = send(reloaded.session, { type: 'pickup', entityId: id, at: at(SPAWN) });
    assert.equal((again as { code: string }).code, 'not_found');
  }
  s.compact();
  assert.equal(s.journal.wildContent, LATEST_WILD_CONTENT);
  assert.equal(GameSession.restore(clone(s.snapshot), clone(s.journal)).stateHash, hash);
  // Tampering: a recorded outcome that disagrees, an item that does not exist, an overweight bag.
  const j = clone(s.journal.entries.length ? s.journal : mid.journal) as unknown as { entries: Array<{ command: Record<string, unknown>; outcome: Record<string, unknown> }> };
  const pick = j.entries.find((e) => e.command.type === 'pickup')!;
  pick.outcome.entityId = 'p:0,0:0';
  assert.throws(() => validateJournal(j), /disagree/);
  const snap = clone(s.snapshot) as unknown as { wild: { items: Record<string, number> } };
  snap.wild.items.gold = 1;
  assert.throws(() => validateWorldSnapshot(snap), /wilderness state/);
  const heavy = clone(s.snapshot) as unknown as { wild: { items: Record<string, number> } };
  heavy.wild.items.stone = 40;
  assert.throws(() => validateWorldSnapshot(heavy), /carried weight/);
});
