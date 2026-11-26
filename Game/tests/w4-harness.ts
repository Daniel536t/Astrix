// W4 test harness (not a test file): sessions, gathering, felling, funding,
// delivery and construction helpers shared by the W4 tests. Every change goes
// through journaled commands (`send`); nothing here edits the world directly.
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2, surfaceAt, waterDepthAt } from '../src/sim/world';
import { CARRY_CAPACITY, ITEM_WEIGHT, carriedWeight, pickupsNear } from '../src/sim/gathering';
import { NearTree, treesNear, trunkDistance } from '../src/sim/felling';
import { buildingDef } from '../src/sim/catalogue';
import { SITE_REACH, findWildSpot, freeIn, freeInBag, rectDistance, siteCellsOf, siteSpotOf } from '../src/sim/wild-build';

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
let seq = 0;
export type R = ReturnType<GameSession['dispatch']>;
export const send = (s: GameSession, c: Record<string, unknown>): R => s.dispatch({ schema: 3, id: `w4:${seq++}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never);
export const ok = (r: R, what = ''): R => { assert.ok(r.ok, `${what} ${JSON.stringify(r)}`); return r; };
export const code = (r: R) => (r as { code?: string }).code;
export const reasons = (r: R) => (r as { reasons?: string[] }).reasons ?? [];
export const tick = (s: GameSession, n = 1) => { for (let i = 0; i < n; i++) ok(send(s, { type: 'tick', ticks: 1 }), 'tick'); };
export const dm = (p: { x: number; z: number }) => ({ x: Math.round(p.x * 10), z: Math.round(p.z * 10) });
export const SPAWN = { x: -81.5, z: -171.5 };
export const wild = () => GameSession.genesis(1337, GENERATOR_V2, 'wilderness');

export function load(s: GameSession, x = SPAWN.x, z = SPAWN.z): void {
  for (let dz = -64; dz <= 64; dz += 32) for (let dx = -64; dx <= 64; dx += 32) surfaceAt(s.world, x + dx, z + dz);
}
const ITEM_OF: Record<string, string> = { branch: 'branch', loose_stone: 'stone', fiber_plant: 'fiber', grass_tuft: 'grass', mushroom: 'mushroom', berry_bush: 'berries' };
/** Pick up generated pickups of a kind until `n` more free units of their item are carried. */
export function gather(s: GameSession, kind: string, n: number, from = SPAWN): void {
  const item = ITEM_OF[kind];
  const goal = freeInBag(s.world, item) + n;
  for (const p of pickupsNear(s.world, from.x, from.z, 120)) {
    if (freeInBag(s.world, item) >= goal) return;
    if (p.kind !== kind) continue;
    ok(send(s, { type: 'pickup', entityId: p.id, at: dm(p) }), kind);
  }
  assert.ok(freeInBag(s.world, item) >= goal, `found ${kind} x${n}`);
}
export function axe(s: GameSession): void {
  gather(s, 'branch', 1); gather(s, 'loose_stone', 1); gather(s, 'fiber_plant', 2);
  ok(send(s, { type: 'craft', recipe: 'stone_axe' }), 'axe');
  ok(send(s, { type: 'equip', item: 'stone_axe' }), 'equip');
}
export function swing(s: GameSession, c: Record<string, unknown>): R {
  for (let i = 0; i < 3; i++) {
    const r = send(s, c);
    if (r.ok || code(r) !== 'too_fast') return r;
    tick(s);
  }
  throw new Error('rate limit never cleared');
}
export function standBy(t: NearTree, from = SPAWN): { x: number; z: number } {
  const dx = from.x - t.e.x, dz = from.z - t.e.z, l = Math.hypot(dx, dz) || 1;
  return { x: t.e.x + dx / l * 1.4, z: t.e.z + dz / l * 1.4 };
}
const logPilesOf = (s: GameSession) => [...s.world.wild!.piles.values()].filter((p) => p.item === 'log');
/** Fell trees and cut them until at least `n` log units lie in piles on the ground. */
export function logPiles(s: GameSession, n: number): string[] {
  let guard = 0;
  while (logPilesOf(s).reduce((a, p) => a + p.qty, 0) < n && guard++ < 10) {
    const held = s.world.wild!.tools.find((t) => t.id === s.world.wild!.equipped);
    if (!held || held.durability < 25) axe(s);
    const t = treesNear(s.world, SPAWN.x, SPAWN.z, 60).find((x) => x.stage === 'mature' || x.stage === 'old')!;
    const at = standBy(t);
    let trunkId: string | undefined;
    for (let i = 0; i < 100 && !trunkId; i++) {
      const r = ok(swing(s, { type: 'chop', entityId: t.e.id, at: dm(at) }), 'chop');
      if (r.ok && r.outcome.type === 'chop' && r.outcome.trunkId) trunkId = r.outcome.trunkId;
    }
    for (let i = 0; i < 100 && s.world.wild!.fell!.trunks.has(trunkId!); i++) {
      const tr = s.world.wild!.fell!.trunks.get(trunkId!)!;
      const c = trunkDistance(tr, at.x, at.z);
      ok(swing(s, { type: 'cut_log', trunkId, at: dm({ x: c.px + 0.8, z: c.pz }) }), 'cut');
    }
  }
  return logPilesOf(s).map((p) => p.id);
}
/** Carry up to `n` free logs from piles (not within 2 m of `keepAt`) into the bag. */
export function takeLogs(s: GameSession, n: number, keepAt?: { x: number; z: number }): number {
  let got = 0;
  for (const p of logPilesOf(s)) {
    if (keepAt && Math.hypot(p.x - keepAt.x, p.z - keepAt.z) < 2) continue;
    while (got < n && s.world.wild!.piles.has(p.id) && freeIn(s.world, p.id, 'log') > 0 && carriedWeight(s.world.wild!) + ITEM_WEIGHT.log <= CARRY_CAPACITY) {
      const before = s.world.wild!.items.log ?? 0;
      ok(send(s, { type: 'pickup', entityId: p.id, at: dm(p) }), 'log');
      got += (s.world.wild!.items.log ?? 0) - before;
      if ((s.world.wild!.items.log ?? 0) - before >= 1) break;
    }
  }
  return got;
}
/** Put down every free carried item except `keep` (far from the building area). */
export function unload(s: GameSession, keep: string[] = []): void {
  for (const k of Object.keys(s.world.wild!.items)) {
    const n = freeInBag(s.world, k);
    if (!keep.includes(k) && n > 0) ok(send(s, { type: 'drop', item: k, n, at: dm({ x: SPAWN.x - 40, z: SPAWN.z + 30 }) }), `unload ${k}`);
  }
}
/** Free logs lying within 2 m of `where`. */
export function logsAt(s: GameSession, where: { x: number; z: number }): number {
  return logPilesOf(s).filter((p) => Math.hypot(p.x - where.x, p.z - where.z) < 2).reduce((a, p) => a + freeIn(s.world, p.id, 'log'), 0);
}
/** Make sure `n` free logs lie in piles at `where`: fell, cut, carry them there and drop them (one trip per log that fits). */
export function stashLogs(s: GameSession, n: number, where: { x: number; z: number }): void {
  let guard = 0;
  while (logsAt(s, where) < n && guard++ < 30) {
    if (!takeLogs(s, Math.min(2, n - logsAt(s, where)), where)) {
      logPiles(s, logPilesOf(s).reduce((a, p) => a + p.qty, 0) + n - logsAt(s, where));
      continue;
    }
    ok(send(s, { type: 'drop', item: 'log', n: freeInBag(s.world, 'log'), at: dm(where) }), 'stash logs');
  }
  assert.ok(logsAt(s, where) >= n, `stashed ${n} logs`);
}
/** A good spot (terrain and rules; materials not checked) near `from`, the player standing at `from`. */
export function spot(s: GameSession, kind: string, from: { x: number; z: number }, rot = 0) {
  const p = findWildSpot(s.world, kind, rot, dm(from));
  assert.ok(p, `a spot for ${kind} near ${from.x},${from.z}`);
  return p!;
}
/** Free materials for a whole building: logs in piles where the player stands, the rest in the bag. */
export function fund(s: GameSession, kind: string, from: { x: number; z: number }): void {
  const need = buildingDef(kind)!.materials;
  if (need.log) stashLogs(s, need.log, from);
  for (const [k, n] of Object.entries(need)) {
    const left = n - freeInBag(s.world, k);
    if (left <= 0 || k === 'log') continue;
    if (k === 'branch') gather(s, 'branch', left);
    else if (k === 'stone') gather(s, 'loose_stone', left);
    else if (k === 'cord') for (let i = 0; i < left; i++) { gather(s, 'fiber_plant', 2); ok(send(s, { type: 'craft', recipe: 'cord' }), 'cord'); }
    // planks and chests: the caller carries them.
  }
}
export function placeAt(s: GameSession, kind: string, p: { x: number; z: number }, rot: number, from: { x: number; z: number }): string {
  const r = ok(send(s, { type: 'place_site', kind, x: p.x, z: p.z, rot, at: dm(from) }), `place ${kind}`);
  return r.ok && r.outcome.type === 'place_site' ? r.outcome.siteId : '';
}
/** Deliver everything reserved for a site: from the bag; piles within reach directly; others carried (picked up for the site). */
export function deliverAll(s: GameSession, siteId: string): void {
  for (let guard = 0; guard < 40; guard++) {
    const site = s.world.wild!.build!.sites.get(siteId)!;
    const at = dm(siteSpotOf(site));
    const order = Object.keys(site.reserved).sort((a, b) => (a === 'bag' ? -1 : b === 'bag' ? 1 : a.localeCompare(b)));
    if (!order.length) return;
    const src = order[0];
    for (const [item, n] of Object.entries(site.reserved[src])) {
      if (src === 'bag') { ok(send(s, { type: 'deliver_site', siteId, item, n, at }), `deliver ${item}`); continue; }
      const p = s.world.wild!.piles.get(src);
      const near = p ? rectDistance(siteCellsOf(site), p.x, p.z) <= SITE_REACH : false;
      if (near) ok(send(s, { type: 'deliver_site', siteId, item, n, at, from: src }), `deliver ${item} from ${src}`);
      else if (p) ok(send(s, { type: 'pickup', entityId: src, at: dm(p), forSite: siteId }), `carry ${item} for the site`);
      else {
        const st = s.world.wild!.build!.sites.get(src)!;
        ok(send(s, { type: 'take_items', siteId: src, item, n: 1, at: dm(siteSpotOf(st)), forSite: siteId }), `take ${item} for the site`);
      }
    }
  }
  throw new Error('delivery never finished');
}
/** Work a site until it is finished (or a refusal other than the rate limit). */
export function workAll(s: GameSession, siteId: string): R {
  const site = s.world.wild!.build!.sites.get(siteId)!;
  const at = dm(siteSpotOf(site));
  let r: R = send(s, { type: 'tick', ticks: 1 });
  for (let i = 0; i < 200; i++) {
    r = swing(s, { type: 'build_work', siteId, at });
    if (!r.ok || site.state === 'done') return r;
  }
  return r;
}
/** Build one finished building of a kind: fund it, place it (reserving everything), deliver, work. */
export function build(s: GameSession, kind: string, from: { x: number; z: number }, rot = 0): string {
  fund(s, kind, from);
  const p = spot(s, kind, from, rot);
  const siteId = placeAt(s, kind, p, rot, from);
  deliverAll(s, siteId);
  const w = workAll(s, siteId);
  assert.ok(w.ok, `work ${kind}: ${JSON.stringify(w)}`);
  return siteId;
}

/** A dry spot (cell centre, m) near `from` with water within 2 m: where a drowning can be recorded. */
export function shore(s: GameSession, from = SPAWN, minD = 0): { x: number; z: number } {
  for (let d = Math.max(1, minD); d < 200; d++) for (let a = 0; a < 48; a++) {
    const x = Math.floor(from.x + Math.cos(a / 48 * Math.PI * 2) * d), z = Math.floor(from.z + Math.sin(a / 48 * Math.PI * 2) * d);
    if (waterDepthAt(s.world, x, z) > 0) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2]].some(([dx, dz]) => waterDepthAt(s.world, x + dx, z + dz) > 0)) return { x: x + 0.5, z: z + 0.5 };
  }
  throw new Error('no shore');
}
