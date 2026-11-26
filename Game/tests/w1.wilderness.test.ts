// W1: wilderness scenario and world list.
// - Settlement worlds, journals, snapshots and hashes are byte-identical (pins made on b86c9c0, before W1).
// - A wilderness world carries `scenario: 'wilderness'`, starts with an empty bag and no stockpile,
//   refuses founding, upgrades and every settlement command, and replays deterministically.
// - Each world has its own save slot; the settlement key is unchanged and never touched by a wilderness world.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameSession, createJournal, validateJournal } from '../src/app/session';
import { BrowserSaveStore, KeyValueStorage, settlementSaveKey, wildernessSaveKey } from '../src/app/persistence';
import { ACTIVE_WORLD_KEY, WORLDS_KEY, WorldRegistry, openWorld } from '../src/app/worlds';
import { bannerKey } from '../src/app/banners';
import { GENERATOR_V2, MAT, baseTopMaterialFor, baseHeightAt, createWorld, worldManifest, WILDERNESS } from '../src/sim/world';
import { validateWorldSnapshot } from '../src/sim/snapshot';
import { SETTLEMENT_ZONE, wildernessSpawn } from '../src/sim/wilderness';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
let seq = 0;
const send = (s: GameSession, c: Record<string, unknown>) => s.dispatch({ schema: 3, id: `w1:${seq++}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never);
const ticks = (s: GameSession, n: number) => { for (let i = 0; i < n; i++) assert.ok(send(s, { type: 'tick', ticks: 1 }).ok); };

class MemoryStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

/** Recorded on b86c9c0 (before W1) with the same calls. */
const PRE_W1 = {
  v1: { genesis: 'e659504b056654dc', params: '2ce2f06e', journal: '{"schema":3,"seed":1337,"starterInventory":{"stone":48,"wood":24},"entries":[]}', ticks20: 'c76f5d556384c19e', founded: '485398a70a67be5d', ticks50: 'a64a1ebd3bee1a46' },
  v2: { genesis: '75bf55316843348f', params: '2ce52f05', journal: '{"schema":3,"seed":1337,"generatorVersion":2,"starterInventory":{"stone":48,"wood":24},"entries":[]}', ticks20: 'f9a43303f5acb2fa', founded: '4990dd1d8c6984e4', ticks50: 'fe3b1ee36bb53bb9' },
};

test('settlement worlds are byte-identical to before W1: journal bytes, params hash, genesis and played hashes', () => {
  for (const [g, pin] of [[1, PRE_W1.v1], [2, PRE_W1.v2]] as const) {
    const s = GameSession.genesis(1337, g);
    assert.equal(s.scenario, 'settlement');
    assert.equal(JSON.stringify(s.journal), pin.journal);
    assert.equal(JSON.stringify(createJournal(1337, 3, g)), pin.journal);
    assert.equal(s.stateHash, pin.genesis);
    const m = worldManifest(createWorld(1337, g));
    assert.equal(m.paramsHash, pin.params);
    assert.ok(!('scenario' in m) && !('scenario' in s.snapshot.manifest) && !('scenario' in s.world.params));
    ticks(s, 20);
    assert.equal(s.stateHash, pin.ticks20);
    assert.ok(send(s, { type: 'found_homestead', rules: 8 }).ok);
    assert.equal(s.stateHash, pin.founded);
    ticks(s, 30);
    assert.equal(s.stateHash, pin.ticks50);
    // Round trips keep the bytes.
    assert.equal(JSON.stringify(validateJournal(clone(s.journal))), JSON.stringify(s.journal));
    assert.equal(JSON.stringify(validateWorldSnapshot(clone(s.snapshot))), JSON.stringify(s.snapshot));
    assert.equal(GameSession.replay(clone(s.journal)).stateHash, pin.ticks50);
  }
});

test('the v6 and v7 save fixtures restore byte-identical as settlement worlds', () => {
  for (const [file, hash] of [['stab002-v6-save.json', '037429c4ffbcf710'], ['stab002-v7-s3-save.json', '75eaf4d14533a811']] as const) {
    const f = JSON.parse(readFileSync(`tests/fixtures/${file}`, 'utf8')) as { snapshot: unknown; journal: unknown };
    const s = GameSession.restore(clone(f.snapshot) as never, clone(f.journal));
    assert.equal(s.stateHash, hash);
    assert.equal(s.scenario, 'settlement');
    assert.equal(JSON.stringify(s.snapshot), JSON.stringify(f.snapshot));
    assert.equal(JSON.stringify(s.journal), JSON.stringify(f.journal));
  }
});

test('a wilderness world: scenario in journal and manifest, empty bag, no stockpile, no homestead, no human-made sites', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  assert.equal(s.scenario, 'wilderness');
  assert.equal(JSON.stringify(s.journal), '{"schema":3,"seed":1337,"generatorVersion":2,"scenario":"wilderness","starterInventory":{},"entries":[]}');
  assert.deepEqual(s.world.inventory, {});
  assert.equal(s.world.life!.stockpiles.size, 0);
  assert.equal(s.world.homestead, undefined);
  const snap = s.snapshot;
  assert.equal(snap.manifest.scenario, 'wilderness');
  assert.notEqual(snap.manifest.paramsHash, PRE_W1.v2.params, 'the params hash includes the non-default scenario');
  assert.ok(snap.schema === 3 && snap.stockpiles.length === 0 && !('homestead' in snap));
  assert.equal(s.world.sites.length, 0, 'no waystone or marker');
  const kinds = [...s.world.entities.values()].map((e) => e.kind);
  assert.ok(!kinds.includes('styl_cairn'), 'no cairn');
  assert.ok(kinds.filter((k) => k.startsWith('styl_tree')).length > 0 && kinds.includes('styl_ore') && kinds.includes('styl_shrub'), 'natural features stay');
  assert.notEqual(s.stateHash, PRE_W1.v2.genesis);
  // A wilderness genesis is not a settlement in disguise: a settlement snapshot never validates as one.
  assert.throws(() => createJournal(1337, 2, 1, 'wilderness'), /current journal schema/);
});

test('found_homestead, upgrade_homestead and every settlement command are rejected in a wilderness world, with no state change', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  ticks(s, 3);
  const before = s.stateHash, entries = s.journal.entries.length;
  const tree = [...s.world.entities.values()].find((e) => e.kind.startsWith('styl_tree'))!;
  for (const c of [
    { type: 'found_homestead', rules: 8 }, { type: 'found_homestead' }, { type: 'upgrade_homestead', rules: 8 },
    { type: 'harvest', entityId: tree.id }, { type: 'deposit', stockpileId: 'stockpile:founder', resources: { wood: 1 } },
    { type: 'produce', stockpileId: 'stockpile:founder', recipe: 'seed' }, { type: 'plant', plotId: 'crop:0' },
    { type: 'mark_field', x: -80, z: -170, w: 4, d: 4, crop: 'wheat' }, { type: 'place_site', kind: 'woodshed', x: -80, z: -170 },
  ]) {
    const r = send(s, c);
    assert.equal(r.ok, false, String(c.type));
    assert.equal((r as { code: string }).code, 'wilderness', String(c.type));
  }
  const build = s.dispatch({ schema: 3, id: 'w1:build', type: 'build', projectId: 'house', expectedRevision: s.world.revision, designVersion: 2 } as never);
  assert.equal(build.ok, false);
  assert.equal(s.stateHash, before);
  assert.equal(s.journal.entries.length, entries);
  assert.equal(s.world.homestead, undefined);
});

/** Pinned on this change: wilderness seed 1337, generator v2, 120 one-tick commands. */
const WILD_120 = 'cac927319fa86807';

test('a wilderness journal replays deterministically from genesis and restores from a mid-run save', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  ticks(s, 60);
  const mid = { snapshot: clone(s.snapshot), journal: clone(s.journal) };
  ticks(s, 60);
  assert.equal(s.stateHash, WILD_120);
  const replayed = GameSession.replay(clone(s.journal));
  assert.equal(replayed.stateHash, WILD_120);
  assert.equal(replayed.scenario, 'wilderness');
  assert.equal(JSON.stringify(replayed.snapshot), JSON.stringify(s.snapshot));
  const restored = GameSession.restore(mid.snapshot as never, mid.journal);
  ticks(restored, 60);
  assert.equal(restored.stateHash, WILD_120);
  // After compaction the snapshot is the authority, and the scenario survives it.
  s.compact();
  assert.equal(s.journal.scenario, 'wilderness');
  const again = GameSession.restore(clone(s.snapshot), clone(s.journal));
  assert.equal(again.stateHash, WILD_120);
});

test('snapshot and journal scenario mismatches are rejected, and tampered wilderness journals do not validate', () => {
  const w = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  const t = GameSession.genesis(1337, GENERATOR_V2);
  ticks(w, 2); ticks(t, 2);
  assert.throws(() => GameSession.restore(clone(w.snapshot), clone(t.journal)), /scenarios differ/);
  assert.throws(() => GameSession.restore(clone(t.snapshot), clone(w.journal)), /scenarios differ/);
  // Dropping the scenario key leaves an empty starter grant, which the settlement does not have.
  const stripped = clone(w.journal) as unknown as Record<string, unknown>;
  delete stripped.scenario;
  assert.throws(() => validateJournal(stripped), /starter inventory/);
  // A settlement grant under a wilderness journal is refused.
  const granted = clone(w.journal) as unknown as Record<string, unknown>;
  granted.starterInventory = { stone: 48, wood: 24 };
  assert.throws(() => validateJournal(granted), /starter inventory/);
  // A wilderness journal cannot carry a founding.
  const founded = clone(t.journal) as unknown as { entries: Array<{ command: { type: string } }> };
  const withFound = { ...clone(w.journal), entries: [] as unknown[] };
  const f = GameSession.genesis(1337, GENERATOR_V2);
  assert.ok(send(f, { type: 'found_homestead', rules: 8 }).ok);
  withFound.entries = clone(f.journal.entries);
  assert.ok(founded.entries.length === 2);
  assert.throws(() => validateJournal(withFound), /cannot contain found_homestead/);
  // Only "wilderness" is a valid scenario value, and only on the current schema.
  assert.throws(() => validateJournal({ ...clone(t.journal), scenario: 'settlement' }), /invalid command journal/);
  const snap = clone(w.snapshot) as unknown as { manifest: Record<string, unknown>; stockpiles: unknown[] };
  snap.manifest.scenario = 'farm';
  assert.throws(() => validateWorldSnapshot(snap), /generator configuration/);
  const stocked = clone(w.snapshot) as unknown as { stockpiles: unknown[] };
  stocked.stockpiles = clone((t.snapshot as unknown as { stockpiles: unknown[] }).stockpiles);
  assert.throws(() => validateWorldSnapshot(stocked), /life-loop fields/);
  const unmarked = clone(w.snapshot) as unknown as { manifest: Record<string, unknown> };
  delete unmarked.manifest.scenario;
  assert.throws(() => validateWorldSnapshot(unmarked), /manifest hash mismatch/);
});

test('save keys: the settlement key is unchanged; a wilderness world has its own slot and never touches the settlement key', () => {
  assert.equal(settlementSaveKey(1337), 'astrix:m002:v3:seed:1337');
  assert.equal(wildernessSaveKey('w1', 1337), 'astrix:wild:v3:w1:seed:1337');
  assert.equal(bannerKey(1337, 2), 'astrix:banners:v1:seed:1337:gen:2');
  assert.equal(bannerKey(1337, 2, 'w1'), 'astrix:banners:v1:seed:1337:gen:2:world:w1');
  const storage = new MemoryStorage();
  // The owner's farm: founded and played, saved under its old key.
  const farmStore = new BrowserSaveStore(storage, 1337, GENERATOR_V2);
  const farm = farmStore.load().session;
  assert.ok(send(farm, { type: 'found_homestead', rules: 8 }).ok);
  ticks(farm, 30);
  assert.ok(farmStore.save(farm).ok);
  assert.equal(farmStore.metrics().key, 'astrix:m002:v3:seed:1337');
  const farmBytes = storage.getItem('astrix:m002:v3:seed:1337')!;
  const farmHash = farm.stateHash;

  // The world list makes a wilderness world and opens it.
  const registry = new WorldRegistry(storage);
  assert.ok(registry.hasSettlement(1337));
  let reloads = 0;
  assert.equal(openWorld('new-wilderness', { registry, settlementSeed: 1337, current: 'settlement' }, () => { reloads++; }), true);
  assert.equal(reloads, 1);
  const rec = registry.active()!;
  assert.equal(rec.id, 'w1');
  assert.equal(storage.getItem(ACTIVE_WORLD_KEY), 'w1');
  assert.deepEqual({ x: rec.spawn.x, z: rec.spawn.z }, (({ x, z }) => ({ x, z }))(wildernessSpawn(rec.seed, rec.generatorVersion)));

  const wildStore = new BrowserSaveStore(storage, rec.seed, rec.generatorVersion, { scenario: WILDERNESS, id: rec.id });
  const loaded = wildStore.load();
  assert.equal(loaded.status, 'new');
  const wild = loaded.session;
  assert.equal(wild.scenario, 'wilderness');
  assert.deepEqual(wild.world.inventory, {});
  ticks(wild, 10);
  assert.ok(wildStore.save(wild).ok);
  assert.equal(wildStore.metrics().key, 'astrix:wild:v3:w1:seed:1337');
  // The settlement bytes are untouched, and a slot refuses the other scenario.
  assert.equal(storage.getItem('astrix:m002:v3:seed:1337'), farmBytes);
  assert.equal(wildStore.save(farm).ok, false);
  assert.equal(farmStore.save(wild).ok, false);
  assert.equal(storage.getItem('astrix:m002:v3:seed:1337'), farmBytes);
  // Reload: Continue wilderness restores it; switching back loads the farm with its hash.
  const wildAgain = new BrowserSaveStore(storage, rec.seed, rec.generatorVersion, { scenario: WILDERNESS, id: rec.id }).load();
  assert.equal(wildAgain.status, 'restored');
  assert.equal(wildAgain.session.stateHash, wild.stateHash);
  assert.ok(registry.hasSave(rec));
  assert.equal(openWorld('settlement', { registry, settlementSeed: 1337, current: 'w1' }, () => { reloads++; }), true);
  assert.equal(storage.getItem(ACTIVE_WORLD_KEY), 'settlement');
  assert.equal(registry.active(), null);
  const farmAgain = new BrowserSaveStore(storage, 1337, GENERATOR_V2).load();
  assert.equal(farmAgain.status, 'restored');
  assert.equal(farmAgain.session.stateHash, farmHash);
  assert.ok(farmAgain.session.world.homestead);
  assert.equal(storage.getItem('astrix:m002:v3:seed:1337'), farmBytes);
  // A second wilderness world gets a new slot; nothing is removed.
  const keysBefore = [...storage.map.keys()];
  const rec2 = registry.create(2);
  assert.equal(rec2.id, 'w2');
  assert.ok(keysBefore.every((k) => storage.map.has(k)));
  assert.equal(registry.list().length, 2);
  // Opening the world already open changes nothing.
  assert.equal(openWorld('w2', { registry, settlementSeed: 1337, current: 'w2' }, () => { reloads++; }), false);
  // A wilderness record placed under the settlement key is refused (and quarantined, not loaded as a farm).
  const other = new MemoryStorage();
  other.setItem('astrix:m002:v3:seed:1337', JSON.stringify({ schema: 3, seed: 1337, snapshot: wild.snapshot, journal: wild.journal }));
  assert.equal(new BrowserSaveStore(other, 1337, GENERATOR_V2).load().status, 'corrupt');
  assert.ok(storage.getItem(WORLDS_KEY));
});

test('the wilderness spawn is a deterministic natural spot: dry grass at a forest edge near water, outside the settlement ground', () => {
  for (const [seed, g] of [[1337, 2], [1337, 1], [42, 2], [2024, 2]] as const) {
    const a = wildernessSpawn(seed, g), b = wildernessSpawn(seed, g);
    assert.deepEqual(a, b);
    assert.ok(!(a.x >= SETTLEMENT_ZONE.x0 && a.x <= SETTLEMENT_ZONE.x1 && a.z >= SETTLEMENT_ZONE.z0 && a.z <= SETTLEMENT_ZONE.z1), `${seed}: outside the settlement zone`);
    const h = baseHeightAt(seed, g, a.x, a.z);
    assert.equal(baseTopMaterialFor(seed, g, a.x, a.z, h, 0), MAT.GRASS);
    assert.ok(a.trees >= 8 && a.nearestTree >= 3 && a.nearestTree <= 12, `${seed}: forest edge (${a.trees} trees, nearest ${a.nearestTree} m)`);
    assert.ok(a.water <= 44, `${seed}: water ${a.water} m`);
  }
  assert.deepEqual((({ x, z }) => ({ x, z }))(wildernessSpawn(1337, 2)), { x: -82, z: -172 });
});
