// W3: physical tree felling in the wilderness (content v3).
// - Tree hit points from species and stage; one journaled `chop` per swing, validated (axe in hand with
//   durability, reach, a standing tree, at most SWINGS_PER_TICK per world tick); each swing costs 1 HP and 1 durability.
// - At 0 HP the tree becomes an M013 stump (same id and species, a lifecycle record) and a trunk lies away
//   from the player; no wood or logs enter the bag. `cut_log` swings turn the trunk into log piles, as many
//   as the M013 timber rule gives in cuts. Logs weigh 9 (1-3 carried), are picked up (LOGS_COLLECTED) and
//   delivered by dropping them at a marked stockpile (LOGS_DELIVERED).
// - Replay, reload mid-felling, compaction, stump regrowth under the M013 lifecycle; W1 and W2 saves keep
//   loading and replaying, then upgrade to v3; settlement pins unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameSession, validateJournal } from '../src/app/session';
import { BrowserSaveStore, KeyValueStorage } from '../src/app/persistence';
import { GENERATOR_V2, WILDERNESS, surfaceAt } from '../src/sim/world';
import { validateWorldSnapshot } from '../src/sim/snapshot';
import { CARRY_CAPACITY, ITEM_WEIGHT, LivePickup, carriedWeight, pickupsNear } from '../src/sim/gathering';
import {
  CHOP_REACH, DIRS16, STANDING, SWINGS_PER_TICK, cutSwings, treeHp, treesNear, trunkLogs, trunkDistance, NearTree,
} from '../src/sim/felling';
import { TIMBER, recordOf, treeLife } from '../src/sim/woodland';
import { TREE_SPECIES } from '../src/sim/vegetation';
import { canStandAt } from '../src/sim/character';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
let seq = 0;
const send = (s: GameSession, c: Record<string, unknown>) => s.dispatch({ schema: 3, id: `w3:${seq++}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never);
const tick = (s: GameSession, n = 1) => { for (let i = 0; i < n; i++) assert.ok(send(s, { type: 'tick', ticks: 1 }).ok); };
const dm = (p: { x: number; z: number }) => ({ x: Math.round(p.x * 10), z: Math.round(p.z * 10) });
const SPAWN = { x: -81.5, z: -171.5 };
/** Pinned on this change (W3): wilderness content v3, seed 1337, generator v2. */
const W3_GENESIS = '158e989e4c10cf13';

class MemoryStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

function load(s: GameSession, x = SPAWN.x, z = SPAWN.z): void {
  for (let dz = -64; dz <= 64; dz += 32) for (let dx = -64; dx <= 64; dx += 32) surfaceAt(s.world, x + dx, z + dz);
}
/** Gather and craft a stone axe, and hold it. */
function axe(s: GameSession): void {
  for (const kind of ['branch', 'loose_stone', 'fiber_plant', 'fiber_plant']) {
    const p = pickupsNear(s.world, SPAWN.x, SPAWN.z, 60).find((q) => q.kind === kind)!;
    assert.ok(send(s, { type: 'pickup', entityId: p.id, at: dm(p) }).ok, kind);
  }
  assert.ok(send(s, { type: 'craft', recipe: 'stone_axe' }).ok);
  assert.ok(send(s, { type: 'equip', item: 'stone_axe' }).ok);
  // Put the spare fibre down, so only the axe weighs in the bag.
  for (const [k, n] of Object.entries(s.world.wild!.items)) assert.ok(send(s, { type: 'drop', item: k, n, at: dm({ x: SPAWN.x + 2, z: SPAWN.z + 2 }) }).ok);
}
/** Where the player stands to chop: 1 m out from the trunk on the side facing (x0, z0). */
function standBy(t: NearTree, from = SPAWN): { x: number; z: number } {
  const dx = from.x - t.e.x, dz = from.z - t.e.z, l = Math.hypot(dx, dz) || 1;
  return { x: t.e.x + dx / l * 1.4, z: t.e.z + dz / l * 1.4 };
}
/** Swing until accepted, letting time pass when the rate limit refuses. */
function swing(s: GameSession, c: Record<string, unknown>) {
  for (let i = 0; i < 3; i++) {
    const r = send(s, c);
    if (r.ok || (r as { code: string }).code !== 'too_fast') return r;
    tick(s);
  }
  throw new Error('rate limit never cleared');
}
function fell(s: GameSession, t: NearTree, at: { x: number; z: number }) {
  let r;
  for (let i = 0; i < 100; i++) {
    r = swing(s, { type: 'chop', entityId: t.e.id, at: dm(at) });
    assert.ok(r.ok, JSON.stringify(r));
    if (r.ok && r.outcome.type === 'chop' && r.outcome.trunkId) return r.outcome;
  }
  throw new Error('never fell');
}

test('tree hit points come from species and stage; logs from the M013 timber rule', () => {
  for (const sp of TREE_SPECIES) {
    assert.equal(treeHp(sp, 'sapling'), 2, `${sp} sapling: a couple of hits`);
    assert.ok(treeHp(sp, 'young') < treeHp(sp, 'mature') && treeHp(sp, 'mature') < treeHp(sp, 'old'), `${sp} grows harder to fell`);
    assert.ok(treeHp(sp, 'snag') < treeHp(sp, 'dying'), `${sp} dead wood is softer`);
    for (const st of STANDING) assert.equal(trunkLogs(sp, st), Math.ceil(TIMBER[sp][st].total / TIMBER[sp][st].cut));
  }
  assert.deepEqual([treeHp('oak', 'old'), treeHp('oak', 'mature'), treeHp('birch', 'mature'), treeHp('pine', 'old')], [13, 10, 5, 9]);
  assert.deepEqual([trunkLogs('oak', 'old'), trunkLogs('oak', 'sapling'), trunkLogs('birch', 'mature')], [4, 1, 3]);
});

test('content v3 genesis is pinned; settlement worlds keep their pins and refuse felling', () => {
  const w = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  assert.equal(w.journal.wildContent, 3);
  assert.equal(w.stateHash, W3_GENESIS);
  assert.equal(GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 2).stateHash, '3c3a0c8e4090efcf', 'W2 (v2) genesis unchanged');
  const s = GameSession.genesis(1337);
  assert.equal(s.stateHash, 'e659504b056654dc');
  for (const c of [{ type: 'chop', entityId: 'e:30,30:1', at: { x: 0, z: 0 } }, { type: 'cut_log', trunkId: 't:1', at: { x: 0, z: 0 } }, { type: 'mark_stockpile', at: { x: 0, z: 0 } }, { type: 'upgrade_wilderness', content: 3 }]) {
    const r = send(s, c);
    assert.equal((r as { code: string }).code, 'not_wilderness', c.type);
  }
  assert.equal(s.stateHash, 'e659504b056654dc');
  // A v2 world refuses the felling commands until it is upgraded.
  const v2 = GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 2);
  assert.equal((send(v2, { type: 'chop', entityId: 'e:29,26:3', at: dm(SPAWN) }) as { code: string }).code, 'wilderness');
});

test('chop validates the axe, its durability, reach, the tree and the swing rate; each swing costs 1 HP and 1 durability', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  load(s);
  const t = treesNear(s.world, SPAWN.x, SPAWN.z, 40).find((x) => x.stage === 'old')!;
  const at = standBy(t);
  const before = s.stateHash;
  const bare = send(s, { type: 'chop', entityId: t.e.id, at: dm(at) });
  assert.equal((bare as { code: string }).code, 'no_axe');
  assert.equal(s.stateHash, before);
  axe(s);
  const far = send(s, { type: 'chop', entityId: t.e.id, at: dm({ x: t.e.x + CHOP_REACH + 1.5, z: t.e.z }) });
  assert.equal((far as { code: string }).code, 'out_of_reach');
  assert.equal((send(s, { type: 'chop', entityId: 'e:29,26:999', at: dm(at) }) as { code: string }).code, 'not_found');
  const hp = treeHp(t.sp, t.stage);
  tick(s);
  for (let i = 1; i <= SWINGS_PER_TICK; i++) {
    const r = send(s, { type: 'chop', entityId: t.e.id, at: dm(at) });
    assert.ok(r.ok && r.outcome.type === 'chop', JSON.stringify(r));
    if (r.ok && r.outcome.type === 'chop') {
      assert.equal(r.outcome.hp, hp - i);
      assert.equal(r.outcome.durability, 60 - i);
      assert.deepEqual(r.outcome.events, i === 1 ? ['CHOP_STARTED', 'TREE_DAMAGED'] : ['TREE_DAMAGED']);
    }
  }
  const mid = s.stateHash;
  const fast = send(s, { type: 'chop', entityId: t.e.id, at: dm(at) });
  assert.equal((fast as { code: string }).code, 'too_fast', 'rate limited within one tick');
  assert.equal(s.stateHash, mid, 'a refused swing changes nothing');
  tick(s);
  assert.ok(send(s, { type: 'chop', entityId: t.e.id, at: dm(at) }).ok, 'the next tick allows swings again');
  assert.equal(s.world.wild!.fell!.chop.get(t.e.id)!.hp, hp - SWINGS_PER_TICK - 1);
  assert.ok(treeLife(s.world, t.e)!.present && treeLife(s.world, t.e)!.stage === 'old', 'still standing');
  // Wear the axe out on the remaining trees: a broken axe is refused.
  const tool = s.world.wild!.tools[0];
  const trees = treesNear(s.world, SPAWN.x, SPAWN.z, 40);
  let k = 0;
  while (tool.durability > 0) {
    const tr = trees[k];
    if (!treeLife(s.world, tr.e)!.present || treeLife(s.world, tr.e)!.stage === 'stump') { k++; continue; }
    const r = swing(s, { type: 'chop', entityId: tr.e.id, at: dm(standBy(tr)) });
    assert.ok(r.ok, JSON.stringify(r));
  }
  const next = treesNear(s.world, SPAWN.x, SPAWN.z, 40)[0];
  tick(s);
  const broken = send(s, { type: 'chop', entityId: next.e.id, at: dm(standBy(next)) });
  assert.equal((broken as { code: string }).code, 'broken_tool');
  assert.ok(!('wood' in s.world.wild!.items) && !('log' in s.world.wild!.items), 'chopping never puts wood in the bag');
});

test('felling leaves an M013 stump and a trunk lying away from the player; never inventory wood', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  load(s);
  axe(s);
  const t = treesNear(s.world, SPAWN.x, SPAWN.z, 40).find((x) => x.stage === 'old')!;
  const at = standBy(t);
  const bag = JSON.stringify(s.world.wild!.items);
  const o = fell(s, t, at);
  assert.deepEqual(o.events, ['TREE_DAMAGED', 'TREE_FELLED', 'TRUNK_CREATED']);
  assert.equal(o.hp, 0);
  assert.equal(JSON.stringify(s.world.wild!.items), bag, 'nothing entered the bag');
  const life = treeLife(s.world, t.e)!;
  assert.equal(life.stage, 'stump');
  assert.equal(life.species, t.sp, 'species kept');
  assert.ok(life.present, 'the stump stands');
  const rec = recordOf(s.world.wild!.fell!.woodland, t.e.id)!;
  assert.equal(rec.st, 'stump');
  assert.ok(rec.next > (s.world.life!.tick), 'regrowth or rot is scheduled');
  const trunk = s.world.wild!.fell!.trunks.get(o.trunkId!)!;
  assert.equal(trunk.tree, t.e.id);
  assert.equal(trunk.sp, t.sp);
  assert.equal(trunk.stage, 'old');
  assert.equal(trunk.logs, trunkLogs(t.sp, 'old'));
  // Away from the player: the fall direction points from the player through the tree.
  const [dx, dz] = DIRS16[trunk.dir];
  const away = (t.e.x - at.x) * dx + (t.e.z - at.z) * dz;
  assert.ok(away > 0.9 * Math.hypot(t.e.x - at.x, t.e.z - at.z), 'falls away');
  assert.ok(trunk.len >= 50, `a long trunk (${trunk.len} dm)`);
  // Crown branches landed as a pickup pile.
  const branches = s.world.wild!.piles.get(o.branchPile!)!;
  assert.equal(branches.item, 'branch');
  assert.equal(branches.qty, 3);
  // The felled tree cannot be chopped again; harvest stays refused.
  tick(s);
  assert.equal((send(s, { type: 'chop', entityId: t.e.id, at: dm(at) }) as { code: string }).code, 'not_choppable');
  assert.equal(send(s, { type: 'harvest', entityId: t.e.id }).ok, false);
  // A thick trunk blocks walking on its axis; standing well clear is fine.
  const mid = { x: trunk.x + dx * 3, z: trunk.z + dz * 3 };
  const y = surfaceAt(s.world, Math.floor(mid.x), Math.floor(mid.z));
  if (y === trunk.y) assert.equal(canStandAt(s.world, mid.x, y, mid.z), false, 'blocked by the trunk');
  const events = s.world.wild!.fell!.events.map((e) => e.type);
  assert.deepEqual(events.slice(-3), ['TREE_DAMAGED', 'TREE_FELLED', 'TRUNK_CREATED']);
  assert.equal(events[0], 'CHOP_STARTED');
});

test('cut_log turns the trunk into as many log piles as the timber rule gives; logs weigh 9, carried 1-3; delivered at a stockpile', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  load(s);
  axe(s);
  const t = treesNear(s.world, SPAWN.x, SPAWN.z, 40).find((x) => x.stage === 'old')!;
  const at = standBy(t);
  const o = fell(s, t, at);
  const f = s.world.wild!.fell!;
  const trunk = { ...f.trunks.get(o.trunkId!)! };
  // Too far from the trunk is refused.
  const [dx, dz] = DIRS16[trunk.dir];
  const off = { x: trunk.x - dz * 6, z: trunk.z + dx * 6 };
  tick(s);
  assert.equal((send(s, { type: 'cut_log', trunkId: trunk.id, at: dm(off) }) as { code: string }).code, 'out_of_reach');
  const logs: string[] = [];
  let swings = 0;
  while (f.trunks.has(trunk.id)) {
    const cur = f.trunks.get(trunk.id)!;
    const near = trunkDistance(cur, trunk.x + dx * 2 - dz * 1.2, trunk.z + dz * 2 + dx * 1.2);
    const pos = { x: near.px - dz * 1.2, z: near.pz + dx * 1.2 };
    const r = swing(s, { type: 'cut_log', trunkId: trunk.id, at: dm(pos) });
    assert.ok(r.ok && r.outcome.type === 'cut_log', JSON.stringify(r));
    swings++;
    if (r.ok && r.outcome.type === 'cut_log' && r.outcome.pileId) {
      assert.deepEqual(r.outcome.events, ['LOGS_CREATED']);
      logs.push(r.outcome.pileId);
    }
  }
  assert.equal(logs.length, trunkLogs(t.sp, 'old'), 'logs = M013 timber in cuts');
  assert.equal(swings, logs.length * cutSwings(trunk));
  for (const id of logs) assert.deepEqual([s.world.wild!.piles.get(id)!.item, s.world.wild!.piles.get(id)!.qty], ['log', 1]);
  assert.equal(s.world.wild!.items.log, undefined, 'logs lie on the ground; none in the bag');
  // Carry: the axe (3) plus at most 3 logs (27) fills the 30 bag.
  assert.equal(ITEM_WEIGHT.log, 9);
  const piles = (): LivePickup[] => pickupsNear(s.world, trunk.x, trunk.z, 20).filter((p) => p.item === 'log');
  let carried = 0;
  for (const p of piles()) {
    const r = send(s, { type: 'pickup', entityId: p.id, at: dm(p) });
    if (!r.ok) { assert.equal((r as { code: string }).code, 'capacity'); break; }
    assert.deepEqual(r.ok && r.outcome.type === 'pickup' && r.outcome.events, ['LOGS_COLLECTED']);
    carried++;
  }
  assert.equal(carried, 3);
  assert.equal(carriedWeight(s.world.wild!), CARRY_CAPACITY);
  // A stockpile marker; a second one too close is refused.
  const spot = { x: SPAWN.x - 6, z: SPAWN.z + 4 };
  const m = send(s, { type: 'mark_stockpile', at: dm(spot) });
  assert.ok(m.ok && m.outcome.type === 'mark_stockpile', JSON.stringify(m));
  const sid = m.ok && m.outcome.type === 'mark_stockpile' ? m.outcome.stockpileId : '';
  assert.equal((send(s, { type: 'mark_stockpile', at: dm({ x: spot.x + 2, z: spot.z }) }) as { code: string }).code, 'too_close');
  // Dropping logs elsewhere is a plain pile; at the stockpile it is a delivery.
  const plain = send(s, { type: 'drop', item: 'log', n: 1, at: dm({ x: spot.x + 10, z: spot.z }) });
  assert.ok(plain.ok && plain.outcome.type === 'drop' && plain.outcome.stockpileId === undefined);
  const d = send(s, { type: 'drop', item: 'log', n: 2, at: dm({ x: spot.x + 1, z: spot.z + 1 }) });
  assert.ok(d.ok && d.outcome.type === 'drop', JSON.stringify(d));
  assert.deepEqual(d.ok && d.outcome.type === 'drop' && [d.outcome.stockpileId, d.outcome.events], [sid, ['LOGS_DELIVERED']]);
  const pile = s.world.wild!.piles.get(d.ok && d.outcome.type === 'drop' ? d.outcome.pileId : '')!;
  assert.deepEqual([pile.qty, pile.x, pile.z], [2, spot.x, spot.z], 'the logs lie stacked at the stockpile');
  assert.equal(f.stockpiles.get(sid)!.delivered, 2);
  const types = f.events.map((e) => e.type);
  for (const ty of ['CHOP_STARTED', 'TREE_DAMAGED', 'TREE_FELLED', 'TRUNK_CREATED', 'LOGS_CREATED', 'LOGS_COLLECTED', 'LOGS_DELIVERED']) assert.ok(types.includes(ty as never) || ty === 'CHOP_STARTED', ty);
  assert.ok(f.events.length <= 40, 'bounded event list');
  // Everything replays from genesis to the same hash.
  assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash);
});

test('felling is journaled and deterministic: replay, reload mid-felling keeps HP, compaction, tampering refused', () => {
  const storage = new MemoryStorage();
  const store = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w9' });
  const s = store.load().session;
  assert.equal(s.journal.wildContent, 3);
  load(s);
  axe(s);
  const t = treesNear(s.world, SPAWN.x, SPAWN.z, 40).find((x) => x.stage === 'old')!;
  const at = standBy(t);
  for (let i = 0; i < 5; i++) assert.ok(swing(s, { type: 'chop', entityId: t.e.id, at: dm(at) }).ok);
  const hp = s.world.wild!.fell!.chop.get(t.e.id)!.hp;
  assert.equal(hp, treeHp(t.sp, t.stage) - 5);
  assert.ok(store.save(s).ok);
  const back = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w9' }).load();
  assert.equal(back.status, 'restored');
  const r = back.session;
  assert.equal(r.stateHash, s.stateHash);
  assert.equal(r.world.wild!.fell!.chop.get(t.e.id)!.hp, hp, 'reload mid-felling keeps HP');
  assert.equal(r.world.wild!.tools[0].durability, 55);
  // Finish the tree after the reload; both sessions agree swing by swing.
  load(r);
  const a = fell(s, t, at);
  const tb = treesNear(r.world, SPAWN.x, SPAWN.z, 40).find((x) => x.e.id === t.e.id)!;
  const b = fell(r, tb, at);
  assert.deepEqual(a, b);
  assert.equal(r.stateHash, s.stateHash);
  assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash);
  assert.ok(store.save(s).ok);
  const again = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w9' }).load().session;
  assert.equal(again.stateHash, s.stateHash);
  assert.ok(again.world.wild!.fell!.trunks.has(a.trunkId!), 'the trunk persists');
  assert.equal(treeLife(again.world, again.world.entities.get(t.e.id)!)!.stage, 'stump', 'the stump persists');
  s.compact();
  assert.equal(GameSession.restore(clone(s.snapshot), clone(s.journal)).stateHash, s.stateHash);
  // Tampered outcomes and snapshots are refused.
  const j = clone(GameSession.replay(clone(again.journal)).journal) as unknown as { entries: Array<{ command: Record<string, unknown>; outcome: Record<string, unknown> }> };
  const chop = j.entries.find((e) => e.command.type === 'chop')!;
  chop.outcome.entityId = 'e:1,1:1';
  assert.throws(() => validateJournal(j), /disagree/);
  const snap = clone(again.snapshot) as unknown as { wild: { fell: { trunks: Array<{ logs: number; left: number }> } } };
  snap.wild.fell.trunks[0].left = 99;
  assert.throws(() => validateWorldSnapshot(snap), /felling/);
  const snap2 = clone(again.snapshot) as unknown as { wild: { content: number } };
  snap2.wild.content = 2;
  assert.throws(() => validateWorldSnapshot(snap2), /felling block/);
});

test('stumps follow the M013 lifecycle in the wilderness: coppice stumps resprout, others rot and the spot regrows', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  load(s);
  axe(s);
  const trees = treesNear(s.world, SPAWN.x, SPAWN.z, 40);
  const conifer = trees.find((x) => x.sp === 'spruce' || x.sp === 'pine')!;
  const broad = trees.filter((x) => x.sp !== 'spruce' && x.sp !== 'pine' && x.stage === 'young').slice(0, 3);
  const felled = [conifer, ...broad];
  for (const t of felled) fell(s, t, standBy(t));
  const wl = s.world.wild!.fell!.woodland;
  const recs = felled.map((t) => ({ t, rec: { ...recordOf(wl, t.e.id)! } }));
  assert.ok(!recs[0].rec.sprout, 'a conifer stump never resprouts');
  // Run time forward (64 ticks per command) until every stump has its next lifecycle event behind it and the spot stands again.
  const regrown = () => felled.every((t) => { const l = treeLife(s.world, t.e)!; return l.present && recordOf(wl, t.e.id)?.st === 'live' && (l.stage === 'sapling' || l.stage === 'young'); });
  let n = 0;
  while (!regrown() && n < 80) { assert.ok(send(s, { type: 'tick', ticks: 64 }).ok); n++; }
  assert.ok(regrown(), `regrown after ${n * 64} ticks`);
  for (const { t, rec } of recs) {
    const now = recordOf(wl, t.e.id)!;
    assert.equal(now.st, 'live');
    assert.equal(now.sp, t.sp, 'same species');
    assert.equal(now.from, rec.sprout ? 'sprout' : 'regrow');
    assert.equal(s.world.entities.get(t.e.id)!.harvested, false, 'same tree id stands again');
  }
  // The conifer: rot days then the gap time, never sooner.
  const c = recordOf(wl, conifer.e.id)!;
  assert.ok(c.born >= recs[0].rec.next, 'regrew only after the stump rotted');
  assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash);
});

for (const [name, file, upgrades] of [['W1 (content v1, 69296e9)', 'tests/fixtures/w1-wilderness-save.json', [2, 3]], ['W2 (content v2, 6b0c06d)', 'tests/fixtures/w2-wilderness-save.json', [3]]] as const) {
  test(`a ${name} save loads, replays and upgrades to felling by upgrade_wilderness`, () => {
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
      assert.equal(s.world.wild?.fell, undefined, 'no felling before the upgrade');
      for (const c of upgrades) assert.ok(send(s, { type: 'upgrade_wilderness', content: c }).ok, `upgrade to v${c}`);
      assert.equal((send(s, { type: 'upgrade_wilderness', content: 3 }) as { code: string }).code, 'already_current');
      assert.equal(s.world.wild!.content, 3);
      load(s);
      if (!s.world.wild!.tools.length) axe(s);
      if (!s.world.wild!.equipped) assert.ok(send(s, { type: 'equip', item: 'stone_axe' }).ok);
      const t = treesNear(s.world, SPAWN.x, SPAWN.z, 40)[0];
      tick(s);
      assert.ok(send(s, { type: 'chop', entityId: t.e.id, at: dm(standBy(t)) }).ok);
      assert.ok(store.save(s).ok);
      const again = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w1' }).load();
      assert.equal(again.status, 'restored');
      assert.equal(again.session.stateHash, s.stateHash);
      if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'upgraded journal replays');
    }
  });
}
