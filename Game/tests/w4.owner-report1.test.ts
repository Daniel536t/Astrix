// W4 owner phone report 1 (wilderness content v5): "I had more than 6 branches, but I couldn't complete the
// campfire" and "Increase the bag storage".
// - The stuck campfire: a v4 save made by the W4 candidate code (c01c774, temporary worktree) in the owner's
//   state (stone ring built, its 3 branches reserved in 3 one-branch piles 7.5-12.5 m from the site, 8 free
//   branches and a log in a 29/30 bag) loads, replays byte-identically, is still stuck under the v4 rules, and
//   after the journaled upgrade_wilderness to v5 is finished from the site panel.
// - v5 rules: free bag units may be delivered in place of a site's reservations elsewhere (`swap`, explicit,
//   journaled, the remote reservations released where the items lie); units reserved for another site never
//   are; v4 worlds refuse it; nothing teleports.
// - The bag holds 60 from v5 (30 before): the early loop fits, logs stay heavy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GameSession, validateJournal } from '../src/app/session';
import { BrowserSaveStore, KeyValueStorage } from '../src/app/persistence';
import { validateWorldSnapshot } from '../src/sim/snapshot';
import { GENERATOR_V2, WILDERNESS } from '../src/sim/world';
import { CARRY_CAPACITY, CARRY_CAPACITY_V5, ITEM_WEIGHT, carriedWeight, carryCapacity } from '../src/sim/gathering';
import { deliverable, freeIn, freeInBag, reservedIn, siteSpotOf } from '../src/sim/wild-build';
import { WildBuildUI } from '../src/app/wild-build-ui';
import {
  SPAWN, axe, clone, code, dm, gather, load, logPiles, ok, placeAt, reasons, send, spot, takeLogs, tick, workAll,
} from './w4-harness';

class MemoryStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
}
type Fx = { key: string; hash: string; record: string; compacted?: boolean };
const FX = JSON.parse(readFileSync('tests/fixtures/w4-wilderness-save.json', 'utf8')) as { made: string; site: string; short: Fx; long: Fx };
const PILES = ['d:10', 'd:8', 'd:9'];

function open(f: Fx) {
  const storage = new MemoryStorage();
  storage.setItem(f.key, f.record);
  const store = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w1' });
  const loaded = store.load();
  assert.equal(loaded.status, 'restored', loaded.message);
  return { storage, store, s: loaded.session };
}
const pileState = (s: GameSession) => PILES.map((id) => { const p = s.world.wild!.piles.get(id); return p ? { id, item: p.item, qty: p.qty, x: p.x, y: p.y, z: p.z } : null; });

for (const which of ['short', 'long'] as const) {
  test(`the owner's stuck campfire (v4 save from c01c774, ${which}): loads and replays byte-identically, stays stuck under v4, upgrades to v5 and is finished`, () => {
    const f = FX[which];
    const { storage, store, s } = open(f);
    assert.equal(s.stateHash, f.hash);
    assert.equal(JSON.stringify({ schema: 3, seed: 1337, snapshot: s.snapshot, journal: s.journal }), f.record, 'byte-identical record');
    if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, f.hash, 'replays from genesis under the v4 rules');
    const w = s.world.wild!;
    const site = w.build!.sites.get(FX.site)!;
    // The owner's panel: Stage 2/2 Kindling stack, 2/4 swings, branch 0/3 reserved 1 + 1 + 1 in piles, stone 6/6.
    assert.equal(w.content, 4);
    assert.equal(site.kind, 'campfire');
    assert.equal(site.stage, 1);
    assert.deepEqual(site.consumed, { stone: 6 });
    assert.deepEqual(site.delivered, {});
    assert.deepEqual(site.reserved, { 'd:10': { branch: 1 }, 'd:8': { branch: 1 }, 'd:9': { branch: 1 } });
    assert.equal(w.items.branch, 8, 'more than 6 branches in the bag');
    assert.equal(carriedWeight(w), 29);
    assert.equal(carryCapacity(w), CARRY_CAPACITY);
    const at = dm(siteSpotOf(site));
    assert.deepEqual(deliverable(s.world, site, at), [], 'v4: nothing deliverable at the site');
    // Why it was stuck (v4 rules, unchanged): bag branches are not the reserved ones; the piles are out of the
    // site's reach; picking a reserved pile up for the site does not fit a 29/30 bag.
    const h0 = s.stateHash;
    assert.equal(code(send(s, { type: 'deliver_site', siteId: site.id, item: 'branch', n: 3, at })), 'not_reserved');
    assert.equal(code(send(s, { type: 'deliver_site', siteId: site.id, item: 'branch', n: 1, at, from: 'd:8' })), 'source_out_of_reach');
    assert.equal(code(send(s, { type: 'deliver_site', siteId: site.id, item: 'branch', n: 3, at, swap: true })), 'not_supported');
    const p8 = w.piles.get('d:8')!;
    const full = send(s, { type: 'pickup', entityId: 'd:8', at: dm(p8), forSite: site.id });
    assert.equal(code(full), 'capacity');
    assert.match(reasons(full).join(';'), /29\/30/);
    assert.equal(code(send(s, { type: 'build_work', siteId: site.id, at })), 'materials');
    assert.equal(s.stateHash, h0, 'refusals change nothing');
    // The journaled upgrade to v5 (what the game sends on load).
    ok(send(s, { type: 'upgrade_wilderness', content: 5 }), 'upgrade to v5');
    assert.equal(code(send(s, { type: 'upgrade_wilderness', content: 5 })), 'already_current');
    assert.equal(w.content, 5);
    assert.equal(carryCapacity(w), CARRY_CAPACITY_V5);
    assert.deepEqual(site.reserved, { 'd:10': { branch: 1 }, 'd:8': { branch: 1 }, 'd:9': { branch: 1 } }, 'the upgrade moves no reservation');
    // The panel's Deliver: 3 free branches from the bag in place of the three remote piles.
    assert.deepEqual(deliverable(s.world, site, at), [{ from: 'bag', item: 'branch', n: 3, swap: 3 }]);
    const before = pileState(s);
    const r = ok(send(s, { type: 'deliver_site', siteId: site.id, item: 'branch', n: 3, at, swap: true }), 'deliver in place');
    assert.ok(r.ok && r.outcome.type === 'deliver_site');
    assert.deepEqual(r.ok && r.outcome.type === 'deliver_site' ? r.outcome.swapped : null, { 'd:10': 1, 'd:8': 1, 'd:9': 1 }, 'journaled: which reservations were released');
    assert.deepEqual(site.reserved, {});
    assert.deepEqual(site.delivered, { branch: 3 });
    assert.equal(w.items.branch, 5, 'the 3 delivered branches left the bag');
    assert.deepEqual(pileState(s), before, 'nothing teleports: the piles stay where they lie, whole');
    for (const id of PILES) { assert.equal(reservedIn(s.world, id, 'branch'), 0, `${id} released`); assert.equal(freeIn(s.world, id, 'branch'), 1, `${id} free`); }
    const done = workAll(s, site.id);
    assert.ok(done.ok, JSON.stringify(done));
    assert.equal(site.state, 'done');
    assert.deepEqual(site.consumed, { branch: 3, stone: 6 }, 'consumed exactly its materials');
    // Saved and reloaded; the upgraded journal replays.
    assert.ok(store.save(s).ok);
    const again = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w1' }).load();
    assert.equal(again.status, 'restored');
    assert.equal(again.session.stateHash, s.stateHash);
    if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'upgraded journal replays');
  });
}

test('the stuck campfire finished the other way: after the upgrade the reserved piles fit the bag and are carried for the site', () => {
  const { s } = open(FX.short);
  ok(send(s, { type: 'upgrade_wilderness', content: 5 }));
  const w = s.world.wild!;
  const site = w.build!.sites.get(FX.site)!;
  for (const id of PILES) {
    const p = w.piles.get(id)!;
    // A plain pickup of a reserved pile is still refused (it is the site's); for the site it is taken.
    assert.equal(code(send(s, { type: 'pickup', entityId: id, at: dm(p) })), 'reserved');
    const r = ok(send(s, { type: 'pickup', entityId: id, at: dm(p), forSite: site.id }), `carry ${id} for the site`);
    assert.ok(r.ok && r.outcome.type === 'pickup' && r.outcome.amount === 1);
    assert.equal(w.piles.has(id), false);
  }
  assert.deepEqual(site.reserved, { bag: { branch: 3 } }, 'the reservations followed the branches into the bag');
  assert.equal(freeInBag(s.world, 'branch'), 8, 'the 8 free branches stay free');
  assert.equal(carriedWeight(w), 29 + 3 * ITEM_WEIGHT.branch);
  const at = dm(siteSpotOf(site));
  assert.deepEqual(deliverable(s.world, site, at), [{ from: 'bag', item: 'branch', n: 3 }]);
  ok(send(s, { type: 'deliver_site', siteId: site.id, item: 'branch', n: 3, at }));
  assert.ok(workAll(s, site.id).ok);
  assert.equal(site.state, 'done');
  assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash);
});

// ---------- v5 rules on a new world ----------

/** A campfire whose branches are reserved in three one-branch piles ~10 m away; the bag then empty of branches. */
function remoteCampfire(s: GameSession): string {
  gather(s, 'branch', 3);
  const drops = [{ x: SPAWN.x + 11, z: SPAWN.z + 2 }, { x: SPAWN.x - 9, z: SPAWN.z + 8 }, { x: SPAWN.x + 3, z: SPAWN.z - 13 }];
  for (const d of drops) ok(send(s, { type: 'drop', item: 'branch', n: 1, at: dm(d) }));
  const rest = freeInBag(s.world, 'branch');
  if (rest) ok(send(s, { type: 'drop', item: 'branch', n: rest, at: dm({ x: SPAWN.x - 60, z: SPAWN.z + 40 }) }));
  gather(s, 'loose_stone', 6);
  return placeAt(s, 'campfire', spot(s, 'campfire', SPAWN), 0, SPAWN);
}

test('v5 swap: explicit and journaled; never takes units reserved for another site; refused when short or malformed; tampering refused', () => {
  // Under the v5 rules exactly (W5 made v6 the default for new worlds; v6 keeps these rules, tested in w5.map.test.ts).
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 5);
  assert.equal(s.world.wild!.content, 5);
  load(s);
  const a = remoteCampfire(s);
  const A = s.world.wild!.build!.sites.get(a)!;
  assert.equal(Object.keys(A.reserved).filter((k) => k.startsWith('d:')).length, 3, JSON.stringify(A.reserved));
  assert.equal(A.reserved.bag?.branch, undefined);
  // A second campfire reserves branches in the bag (bag first).
  gather(s, 'branch', 3); gather(s, 'loose_stone', 6);
  const b = placeAt(s, 'campfire', spot(s, 'campfire', { x: SPAWN.x, z: SPAWN.z + 6 }), 0, { x: SPAWN.x, z: SPAWN.z + 6 });
  const B = s.world.wild!.build!.sites.get(b)!;
  assert.equal(B.reserved.bag?.branch, 3, JSON.stringify(B.reserved));
  const at = dm(siteSpotOf(A));
  ok(send(s, { type: 'deliver_site', siteId: a, item: 'stone', n: 6, at }));
  // B's branches are not free: A cannot have them, in any form.
  const h = s.stateHash;
  assert.ok(!deliverable(s.world, A, at).some((d) => d.swap), 'no swap offered from units reserved for another site');
  const short = send(s, { type: 'deliver_site', siteId: a, item: 'branch', n: 3, at, swap: true });
  assert.equal(code(short), 'missing');
  assert.match(reasons(short).join(';'), /you carry 0 free branch/);
  assert.equal(code(send(s, { type: 'deliver_site', siteId: a, item: 'branch', n: 4, at, swap: true })), 'too_many');
  assert.equal(s.stateHash, h, 'refusals change nothing');
  // Malformed: swap with a source, or not `true`.
  assert.equal(send(s, { type: 'deliver_site', siteId: a, item: 'branch', n: 1, at, swap: true, from: 'd:3' }).ok, false);
  assert.equal(send(s, { type: 'deliver_site', siteId: a, item: 'branch', n: 1, at, swap: false }).ok, false);
  // Two free branches: a partial swap releases the farthest piles first.
  gather(s, 'branch', 2);
  const far = Object.keys(A.reserved).filter((k) => k.startsWith('d:'));
  const r = ok(send(s, { type: 'deliver_site', siteId: a, item: 'branch', n: 2, at, swap: true }));
  const swapped = r.ok && r.outcome.type === 'deliver_site' ? r.outcome.swapped! : {};
  assert.equal(Object.values(swapped).reduce((x, y) => x + y, 0), 2);
  assert.equal(Object.keys(A.reserved).filter((k) => k.startsWith('d:')).length, 1, 'one pile still reserved');
  assert.ok(far.includes(Object.keys(A.reserved).find((k) => k.startsWith('d:'))!));
  assert.equal(B.reserved.bag?.branch, 3, 'B keeps its branches');
  assert.equal(freeInBag(s.world, 'branch'), 0);
  // Journal tampering: an outcome that names other released piles, or a swap outcome without the swap flag.
  const j = clone(s.journal) as unknown as { entries: Array<{ command: Record<string, unknown>; outcome: Record<string, unknown> }> };
  const e = j.entries.find((x) => x.command.swap === true)!;
  e.outcome.swapped = { 'd:999': 2 };
  assert.throws(() => GameSession.replay(j as never));
  const j2 = clone(s.journal) as unknown as { entries: Array<{ command: Record<string, unknown>; outcome: Record<string, unknown> }> };
  delete j2.entries.find((x) => x.command.swap === true)!.command.swap;
  assert.throws(() => validateJournal(j2));
  assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'replays from genesis');
});

test('v5 bag capacity is 60: the early loop fits (axe, 2 logs, stones, branches, fibre); logs stay heavy; snapshots are checked against their content', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness');
  load(s);
  const w = s.world.wild!;
  assert.equal(carryCapacity(w), 60);
  axe(s);
  logPiles(s, 2);
  assert.equal(takeLogs(s, 2), 2);
  gather(s, 'loose_stone', 6); gather(s, 'branch', 6); gather(s, 'fiber_plant', 4);
  const want = ITEM_WEIGHT.stone_axe + 2 * ITEM_WEIGHT.log + 6 * ITEM_WEIGHT.stone + 6 * ITEM_WEIGHT.branch + 4 * ITEM_WEIGHT.fiber;
  assert.equal(want, 49);
  assert.ok(carriedWeight(w) >= want && carriedWeight(w) <= 60, `carried ${carriedWeight(w)}`);
  assert.ok(want > CARRY_CAPACITY, 'the same loop overflows the v4 bag');
  // Logs: with the axe, at most 6 (6 x 9 + 3 = 57).
  assert.equal(Math.floor((60 - ITEM_WEIGHT.stone_axe) / ITEM_WEIGHT.log), 6);
  while (carriedWeight(w) + ITEM_WEIGHT.stone <= 60) gather(s, 'loose_stone', 1);
  let log = [...w.piles.values()].find((p) => p.item === 'log');
  if (!log) { logPiles(s, 1); log = [...w.piles.values()].find((p) => p.item === 'log'); }
  assert.ok(log, 'a log lies on the ground');
  const r = send(s, { type: 'pickup', entityId: log!.id, at: dm(log!) });
  assert.equal(code(r), 'capacity');
  assert.match(reasons(r).join(';'), /\/60; a log weighs 9/);
  // Snapshots: 60 is allowed at v5 and over 60 is not; a v4 snapshot over 30 is refused.
  const snap = clone(s.snapshot) as unknown as { wild: { items: Record<string, number>; content: number } };
  const extra = 60 - carriedWeight(w);
  if (extra >= 1) snap.wild.items.berries = (snap.wild.items.berries ?? 0) + extra;
  snap.wild.items = Object.fromEntries(Object.entries(snap.wild.items).sort(([x], [y]) => x.localeCompare(y)));
  validateWorldSnapshot(clone(snap));
  snap.wild.items.berries = (snap.wild.items.berries ?? 0) + 1;
  snap.wild.items = Object.fromEntries(Object.entries(snap.wild.items).sort(([x], [y]) => x.localeCompare(y)));
  assert.throws(() => validateWorldSnapshot(snap), /carried weight/);
  const v4 = GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 4);
  const s4 = clone(v4.snapshot) as unknown as { wild: { items: Record<string, number> } };
  s4.wild.items = { stone: 16 };
  assert.throws(() => validateWorldSnapshot(s4), /carried weight/);
  s4.wild.items = { stone: 15 };
  validateWorldSnapshot(s4);
});

// ---------- the site panel (a minimal DOM stand-in, as tests/w4.ui.test.ts) ----------

type Handler = (e: unknown) => void;
class FakeEl {
  id = ''; className = ''; hidden = false; innerHTML = ''; textContent = '';
  readonly dataset: Record<string, string> = {};
  readonly attrs = new Map<string, string>();
  readonly children: FakeEl[] = [];
  readonly handlers = new Map<string, Handler[]>();
  readonly classList = { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false };
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
  appendChild(c: FakeEl) { this.children.push(c); return c; }
  addEventListener(t: string, h: Handler) { this.handlers.set(t, [...(this.handlers.get(t) ?? []), h]); }
  click(match: RegExp): void {
    const tag = [...this.innerHTML.matchAll(/<button\b([^>]*)>/g)].map((x) => x[1]).find((a) => match.test(a));
    assert.ok(tag !== undefined, `a button matching ${match} in ${this.id}: ${this.innerHTML}`);
    const dataset: Record<string, string> = {};
    for (const [, k, v] of tag!.matchAll(/data-([\w-]+)(?:="([^"]*)")?/g)) dataset[k.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = v ?? '';
    const button = { disabled: /\bdisabled\b/.test(tag!), dataset };
    for (const h of this.handlers.get('click') ?? []) h({ target: { closest: () => button } });
  }
}

test('the site panel names where each reserved pile is, offers "Pick up for this site" by it and a Deliver from the bag in place of the rest', () => {
  const g = globalThis as unknown as { document?: unknown };
  const had = g.document;
  g.document = { body: new FakeEl(), createElement: () => new FakeEl(), getElementById: () => null };
  try {
    const { s } = open(FX.short);
    const toasts: string[] = [];
    let pos = { x: 0, z: 0 };
    const ui = new WildBuildUI({
      world: () => s.world, send: (c) => { const r = send(s, c); return r.ok ? { ok: true, outcome: r.outcome as never } : null; },
      toast: (m) => { toasts.push(m); }, at: () => dm(pos), player: () => ({ ...pos, heading: 0 }), scene: new THREE.Scene(),
    });
    const panel = ui.site as unknown as FakeEl;
    const site = s.world.wild!.build!.sites.get(FX.site)!;
    pos = siteSpotOf(site);
    // v4 (as loaded, before the game's upgrade): where the piles are and what to do; nothing to deliver.
    ui.update(0);
    assert.equal(ui.near?.id, site.id);
    assert.match(panel.innerHTML, /Stage 2\/2: Kindling stack/);
    assert.equal((panel.innerHTML.match(/data-reserved-at="d:\d+">1 in a pile \d+ m (north|south|east|west|north-east|north-west|south-east|south-west) of you/g) ?? []).length, 3, panel.innerHTML);
    assert.match(panel.innerHTML, /data-far-help>Walk to each pile/);
    assert.doesNotMatch(panel.innerHTML, /data-deliver="branch"/);
    ok(send(s, { type: 'upgrade_wilderness', content: 5 }));
    // By a reserved pile, away from the site: the site's panel shows with "Pick up for this site".
    const p8 = s.world.wild!.piles.get('d:8')!;
    pos = { x: p8.x + 0.5, z: p8.z };
    ui.update(0);
    assert.equal(ui.near?.id, site.id);
    assert.equal(ui.nearPile, 'd:8');
    assert.match(panel.innerHTML, /You are by 1 branch reserved for this campfire/);
    assert.doesNotMatch(panel.innerHTML, /data-work/, 'no Work button away from the site');
    panel.click(/data-pickup="d:8"/);
    assert.deepEqual(site.reserved.bag, { branch: 1 });
    assert.equal(s.world.wild!.piles.has('d:8'), false);
    assert.match(toasts.at(-1)!, /for the campfire \(still reserved for it\)/);
    // Back at the site: one in the bag, two in piles, and one Deliver of 3 from the bag (2 in place of the piles).
    pos = siteSpotOf(site);
    ui.update(0);
    assert.match(panel.innerHTML, /reserved: <span class="where" data-reserved-at="bag">1 in your bag<\/span><span class="where" data-reserved-at="d:/);
    assert.match(panel.innerHTML, /data-deliver="branch" data-n="3" data-from="bag" data-swap="2">Deliver 3 from bag/);
    assert.match(panel.innerHTML, /data-swap-help>Your bag has free branch/);
    panel.click(/data-deliver="branch"/);
    assert.deepEqual(site.delivered, { branch: 3 });
    assert.deepEqual(site.reserved, {});
    assert.match(toasts.at(-1)!, /delivered 3 branch \(2 in place of reserved ones elsewhere: those are free again\)/);
    ui.update(0);
    assert.doesNotMatch(panel.innerHTML, /data-work disabled/, 'Work is open');
    assert.ok(workAll(s, site.id).ok);
    assert.equal(site.state, 'done');
  } finally { g.document = had; }
});

for (const [name, file, from] of [
  ['W1 (content v1, 69296e9)', 'tests/fixtures/w1-wilderness-save.json', 1], ['W2 (content v2, 6b0c06d)', 'tests/fixtures/w2-wilderness-save.json', 2],
  ['W3 (content v3, 0dba839)', 'tests/fixtures/w3-wilderness-save.json', 3], ['W4 (content v4, c01c774)', 'tests/fixtures/w4-wilderness-save.json', 4],
] as const) {
  test(`a ${name} save loads, replays and upgrades straight to v5 (bag 60) by one upgrade_wilderness`, () => {
    const fx = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Fx>;
    for (const which of ['short', 'long'] as const) {
      const f = fx[which];
      const { storage, store, s } = open(f);
      assert.equal(s.stateHash, f.hash, which);
      assert.equal(JSON.stringify({ schema: 3, seed: 1337, snapshot: s.snapshot, journal: s.journal }), f.record, `${which}: byte-identical`);
      if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, f.hash, 'replays from genesis');
      assert.equal(s.world.wild?.content ?? 1, from);
      ok(send(s, { type: 'upgrade_wilderness', content: 5 }), 'upgrade to v5');
      assert.equal(code(send(s, { type: 'upgrade_wilderness', content: 5 })), 'already_current');
      const w = s.world.wild!;
      assert.equal(w.content, 5);
      assert.ok(w.fell && w.build, 'felling and building');
      assert.equal(carryCapacity(w), 60);
      assert.ok(store.save(s).ok);
      const again = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w1' }).load();
      assert.equal(again.session.stateHash, s.stateHash);
      if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'upgraded journal replays');
    }
  });
}
