// FINAL-MAP (owner decision 4): full-world map visibility.
// - The map's data (app/map-survey.ts) holds every generated deposit (real type, position, quantity) and every
//   generated named place from the start, with no discovery at all; computing it does not touch the world.
// - Discovery records are unchanged by the map (and still recorded by explore reports); replays are unchanged.
// - A deposit seen on the map is not mined remotely: the player must walk there (discovery by an explore report
//   within 24 m, then within 3 m, with a pickaxe); after walking there it is mined.
// - Tapping the map (app/map-nav.ts) plans a route and makes the single navigation waypoint (journaled); a second
//   tap replaces it; an impossible tap gives the reason and keeps the previous route and waypoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2, CHUNKS_PER_SIDE, HALF } from '../src/sim/world';
import { LATEST_WILD_CONTENT } from '../src/sim/gathering';
import { DEPOSIT_SIGHT, mapSnapshot } from '../src/sim/map';
import { depositOf, depositsInChunk } from '../src/sim/deposits';
import { allPlaces } from '../src/sim/places';
import { siteSpotOf } from '../src/sim/wild-build';
import { MapSurvey, OVERVIEW_M, OVERVIEW_PX, STRIP_ROWS, SURVEY_CHUNKS, clusterDeposits, memoizeColumns, overviewStrip, surveyChunk } from '../src/app/map-survey';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { MapNavigator, NAV_WAYPOINT, Receipt } from '../src/app/map-nav';
import type { RoutePoint } from '../src/sim/route';
import { SPAWN, axe, build, clone, code, dm, gather, load, ok, send, swing, tick } from './w4-harness';

const G = GENERATOR_V2;
const explore = (s: GameSession, p: { x: number; z: number }) => send(s, { type: 'explore', at: dm(p) });
function walk(s: GameSession, a: { x: number; z: number }, b: { x: number; z: number }): void {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 16));
  for (let k = 1; k <= n; k++) { tick(s); ok(explore(s, { x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n }), `report ${k}/${n}`); }
}
const IRON = 'e:31,16:6';
// Chunks the memo check compares: around the spawn, the lake, the northern massif (rivers, cliffs, ore), the coast.
const MEMO_CHUNKS = [[29, 26], [30, 26], [29, 27], [28, 27], [25, 23], [24, 23], [31, 16], [32, 16], [25, 15], [17, 26], [40, 40], [5, 60]].map(([x, z]) => z * CHUNKS_PER_SIDE + x);

if (!isMainThread) {
  // The survey worker's path, in its own realm: the column memo installed, then the same deposits computed.
  const st = memoizeColumns(1337);
  parentPort!.postMessage({ chunks: (workerData as number[]).map((i) => surveyChunk(1337, G, i)), st });
} else {

test('the map survey: every generated deposit and place, nearest first, with no discovery; the world is not touched', () => {
  const s = GameSession.genesis(1337, G, 'wilderness');
  assert.equal(s.world.wild!.content, LATEST_WILD_CONTENT);
  const m = s.world.wild!.map!;
  const hash = s.stateHash, snap = JSON.stringify(mapSnapshot(m)), journal = s.journal.entries.length;
  assert.equal(m.deposits.size, 0, 'nothing discovered in a fresh world');
  assert.equal(m.places.size, 0);
  const survey = new MapSurvey(1337, G);
  let pumps = 0;
  while (survey.chunksDone < 64) { survey.pump(SPAWN, 40); pumps++; }
  // Places and the overview come first; then deposit chunks, nearest the focus first.
  assert.deepEqual(survey.places, allPlaces(1337, G), 'every generated place');
  assert.ok(survey.places!.length >= 30, `${survey.places!.length} places`);
  assert.equal(survey.strips[Math.floor((SPAWN.z + HALF) / OVERVIEW_M / STRIP_ROWS)], 1, 'the overview under the player first');
  const done = [...Array(SURVEY_CHUNKS).keys()].filter((i) => survey.chunks[i]);
  const cdist = (i: number) => Math.hypot(-HALF + (i % CHUNKS_PER_SIDE) * 32 + 16 - SPAWN.x, -HALF + Math.floor(i / CHUNKS_PER_SIDE) * 32 + 16 - SPAWN.z);
  const maxDone = Math.max(...done.map(cdist));
  const nearestUndone = Math.min(...[...Array(SURVEY_CHUNKS).keys()].filter((i) => !survey.chunks[i]).map(cdist));
  assert.ok(maxDone <= nearestUndone + 1e-9, `nearest first (${maxDone.toFixed(1)} <= ${nearestUndone.toFixed(1)})`);
  // Exactly the generated deposits of those chunks: ids, types, positions, quantities.
  for (const i of done) {
    const want = depositsInChunk(1337, G, i % CHUNKS_PER_SIDE, Math.floor(i / CHUNKS_PER_SIDE)).map((d) => [d.id, d.type, d.x, d.z, d.qty]);
    assert.deepEqual(survey.chunks[i]!.map((d) => [d.id, d.type, d.x, d.z, d.qty]), want, `chunk ${i}`);
  }
  const shown = [...survey.deposits()];
  assert.ok(shown.length > 20, `${shown.length} deposits surveyed`);
  const types = new Set(shown.map((d) => d.type));
  assert.ok(types.size >= 3, `types ${[...types]}`);
  const far = shown.filter((d) => Math.hypot(d.x - SPAWN.x, d.z - SPAWN.z) > DEPOSIT_SIGHT);
  assert.ok(far.length > 10, `${far.length} deposits farther than ${DEPOSIT_SIGHT} m are on the map without being approached`);
  // A rectangle query returns the deposits inside it.
  const box = survey.depositsIn(SPAWN.x - 100, SPAWN.z - 100, SPAWN.x + 100, SPAWN.z + 100);
  assert.deepEqual(box.map((d) => d.id).sort(), shown.filter((d) => Math.abs(d.x - SPAWN.x) <= 100 && Math.abs(d.z - SPAWN.z) <= 100).map((d) => d.id).sort());
  while (!survey.overviewComplete) survey.pump(SPAWN, 200);
  assert.ok(survey.overviewComplete, 'the whole terrain overview');
  // Nothing in the world changed: no discovery, no journal entry, the same hash.
  assert.equal(s.stateHash, hash);
  assert.equal(JSON.stringify(mapSnapshot(m)), snap, 'discovery records untouched');
  assert.equal(s.journal.entries.length, journal);
  assert.ok(pumps > 0);
});

test('the overview: the whole world, every pixel opaque terrain (no fog), lakes drawn as deep water', () => {
  const lake = allPlaces(1337, G).find((p) => p.id === 'pl:lake')!;
  const row = Math.floor((lake.z + HALF) / OVERVIEW_M), strip = Math.floor(row / STRIP_ROWS);
  const rgba = overviewStrip(1337, G, strip);
  assert.equal(rgba.length, STRIP_ROWS * OVERVIEW_PX * 4);
  for (let p = 3; p < rgba.length; p += 4) assert.equal(rgba[p], 255);
  const k = ((row - strip * STRIP_ROWS) * OVERVIEW_PX + Math.floor((lake.x + HALF) / OVERVIEW_M)) * 4;
  assert.ok(rgba[k + 2] > rgba[k] && rgba[k + 2] > rgba[k + 1], `Mirror Lake is blue (${rgba[k]},${rgba[k + 1]},${rgba[k + 2]})`);
});

test('the survey cache: a strict round trip; anything odd is ignored', () => {
  const ds = [...surveyChunk(1337, G, 16 * 64 + 31), ...surveyChunk(1337, G, 26 * 64 + 17)];
  assert.ok(ds.some((d) => d.id === IRON));
  const text = JSON.stringify({ v: 1, seed: 1337, gen: G, d: ds.map((d) => [d.id, ['iron', 'copper', 'coal', 'clay', 'sand', 'gravel'].indexOf(d.type), d.x, d.z, d.qty]), p: allPlaces(1337, G) });
  const a = new MapSurvey(1337, G);
  assert.equal(a.restore(text), true);
  assert.ok(a.depositsComplete && a.stats.fromCache);
  assert.deepEqual([...a.deposits()].map((d) => d.id).sort(), ds.map((d) => d.id).sort());
  const iron = depositOf(1337, G, IRON)!;
  assert.deepEqual(a.depositsIn(iron.x - 1, iron.z - 1, iron.x + 1, iron.z + 1).map((d) => [d.id, d.type, d.qty]), [[IRON, iron.type, iron.qty]]);
  assert.equal(new MapSurvey(1337, G).restore(text.replace(IRON, 'e:99,99:1x')), false, 'a bad id');
  assert.equal(new MapSurvey(4242, G).restore(text), false, 'another seed');
  assert.equal(new MapSurvey(1337, G).restore('{'), false, 'not JSON');
  // Clusters at low zoom keep every deposit counted.
  const pts = ds.map((d) => ({ ...d, sx: 1000 + d.x * 0.01, sy: 1000 + d.z * 0.01 }));
  const cs = clusterDeposits(pts, 26);
  assert.equal(cs.reduce((n, c) => n + c.n, 0), pts.length);
  assert.ok(pts.length >= 2 && cs.length < pts.length, `${cs.length} clusters of ${pts.length}`);
});

/** A latest-content world with a stone pickaxe in hand, standing at the spawn. */
function miner(): GameSession {
  const s = GameSession.genesis(1337, G, 'wilderness');
  load(s);
  tick(s, 2);
  ok(explore(s, SPAWN), 'first report');
  axe(s);
  const bench = build(s, 'workbench', { x: SPAWN.x - 10, z: SPAWN.z + 2 });
  gather(s, 'branch', 1); gather(s, 'loose_stone', 2); gather(s, 'fiber_plant', 2);
  ok(send(s, { type: 'craft', recipe: 'cord' }), 'cord');
  ok(send(s, { type: 'craft', recipe: 'stone_pickaxe', at: dm(siteSpotOf(s.world.wild!.build!.sites.get(bench)!)) }), 'pickaxe');
  ok(send(s, { type: 'equip', item: 'stone_pickaxe' }), 'equip');
  for (const [k, n] of Object.entries(s.world.wild!.items)) ok(send(s, { type: 'drop', item: k, n, at: dm({ x: SPAWN.x - 30, z: SPAWN.z + 30 }) }), `drop ${k}`);
  return s;
}

test('a deposit seen on the map is not mined remotely; walked to, it is; walked away, it is out of reach', () => {
  const s = miner();
  const iron = depositOf(1337, G, IRON)!;
  const survey = new MapSurvey(1337, G);
  survey.restore(JSON.stringify({ v: 1, seed: 1337, gen: G, d: surveyChunk(1337, G, 16 * 64 + 31).map((d) => [d.id, ['iron', 'copper', 'coal', 'clay', 'sand', 'gravel'].indexOf(d.type), d.x, d.z, d.qty]), p: [] }));
  assert.ok(survey.depositsIn(iron.x - 1, iron.z - 1, iron.x + 1, iron.z + 1).some((d) => d.id === IRON && d.type === 'iron'), 'on the map: an iron deposit, at its real place');
  const m = s.world.wild!.map!;
  assert.equal(m.deposits.has(IRON), false, 'not discovered');
  const at = (p: { x: number; z: number }) => send(s, { type: 'mine', depositId: IRON, at: dm(p) });
  const by = { x: iron.x + 1, z: iron.z };
  const h0 = s.stateHash;
  assert.equal(code(at(SPAWN)), 'undiscovered', 'from the spawn, about 315 m away');
  assert.equal(code(at(by)), 'undiscovered', 'claiming to stand by it without having walked there');
  assert.equal(code(explore(s, by)), 'implausible', 'a jump there is refused');
  assert.equal(s.stateHash, h0, 'refusals change nothing');
  walk(s, SPAWN, by);
  assert.equal(m.deposits.has(IRON), true, 'discovered by walking there');
  const r = ok(swing(s, { type: 'mine', depositId: IRON, at: dm(by) }), 'a swing by the deposit');
  assert.equal(r.ok && r.outcome.type, 'mine');
  const back = { x: iron.x + 60, z: iron.z + 60 };
  walk(s, by, back);
  assert.equal(code(at(back)), 'out_of_reach', 'found, but too far to mine');
  ok(send(s, { type: 'equip', item: 'hands' }));
  walk(s, back, by);
  assert.equal(code(at(by)), 'no_pickaxe', 'by it, the tool rule still holds');
  assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'the journal replays');
});

function navigator(s: GameSession, p: { x: number; z: number }) {
  const toasts: string[] = [];
  let trail: RoutePoint[] | null = null;
  const dispatch = (c: Record<string, unknown>): Receipt => {
    const r = send(s, c);
    return r.ok ? { ok: true, outcome: r.outcome as never } : { ok: false, code: (r as { code: string }).code, reasons: (r as { reasons: string[] }).reasons };
  };
  const nav = new MapNavigator({ world: () => s.world, dispatch, toast: (t) => toasts.push(t), player: () => p, trail: (pts) => { trail = pts; } });
  const settle = () => { for (let i = 0; i < 5000 && (nav.search || i === 0); i++) nav.step(p); };
  return { nav, toasts, trail: () => trail, settle };
}

test('tap to navigate: a route, the navigation waypoint and the trail; another tap replaces it; an impossible tap keeps the previous one', () => {
  const s = GameSession.genesis(1337, G, 'wilderness');
  load(s);
  tick(s);
  ok(explore(s, SPAWN));
  ok(send(s, { type: 'set_waypoint', x: -100, z: -150, name: 'Camp' }), 'a saved waypoint');
  const p = { ...SPAWN };
  const { nav, toasts, trail, settle } = navigator(s, p);
  const m = s.world.wild!.map!;
  const navWps = () => [...m.waypoints.values()].filter((w) => w.name === NAV_WAYPOINT);
  // Tap 1: a reachable spot.
  nav.go({ x: -40, z: -300, label: 'the marked spot' });
  settle();
  assert.ok(nav.routeInfo, `routed: ${toasts.join(' | ')}`);
  assert.equal(navWps().length, 1, 'one navigation waypoint');
  const first = navWps()[0];
  assert.deepEqual([first.x, first.z], [-40, -300]);
  assert.equal(nav.dest?.waypointId, first.id);
  assert.ok((trail()?.length ?? 0) >= 2, 'the trail is laid');
  // Tap 2: another place replaces it (old removed, new set; journaled).
  const j0 = s.journal.entries.length;
  nav.go({ x: -248, z: -104, label: 'Fertile Meadow' });
  assert.equal(nav.dest?.waypointId, first.id, 'while planning, the previous route stays');
  settle();
  assert.equal(nav.dest?.label, 'Fertile Meadow');
  assert.equal(navWps().length, 1);
  const second = navWps()[0];
  assert.notEqual(second.id, first.id);
  assert.equal(m.waypoints.has(first.id), false, 'the previous navigation waypoint is gone');
  assert.deepEqual(s.journal.entries.slice(j0).map((e) => e.command.type), ['remove_waypoint', 'set_waypoint']);
  assert.ok(m.waypoints.size === 2 && [...m.waypoints.values()].some((w) => w.name === 'Camp'), 'the saved waypoint is kept');
  const route = clone(nav.route), j1 = s.journal.entries.length, hash = s.stateHash;
  // Tap 3: the middle of Mirror Lake (deep water): refused with the reason; nothing changes.
  nav.go({ x: -265, z: -286, label: 'Mirror Lake' });
  settle();
  assert.match(nav.rejected?.reason ?? '', /deep water/);
  assert.match(toasts.at(-1)!, /No route to Mirror Lake: .*deep water.*Still heading to Fertile Meadow/);
  assert.equal(nav.dest?.waypointId, second.id);
  assert.deepEqual(nav.route, route, 'the previous route is kept');
  assert.equal(s.journal.entries.length, j1, 'no journal entry');
  assert.equal(s.stateHash, hash);
  // Outside the world: refused too.
  nav.go({ x: HALF + 20, z: 0, label: 'the marked spot' });
  settle();
  assert.match(nav.rejected?.reason ?? '', /outside the world/);
  assert.equal(nav.dest?.waypointId, second.id);
  // Routing to the saved waypoint: no navigation waypoint is made; the old one goes.
  const camp = [...m.waypoints.values()].find((w) => w.name === 'Camp')!;
  nav.go({ x: camp.x, z: camp.z, label: 'Camp', waypointId: camp.id });
  settle();
  assert.equal(nav.dest?.waypointId, camp.id);
  assert.equal(navWps().length, 0);
  // Back to a spot, then a reload: the navigation waypoint is the destination again, with no new journal entry.
  nav.go({ x: -40, z: -300, label: 'the marked spot' });
  settle();
  const j2 = s.journal.entries.length;
  const again = navigator(s, p);
  again.settle();
  assert.equal(again.nav.dest?.waypointId, navWps()[0].id);
  assert.ok(again.nav.routeInfo);
  assert.equal(s.journal.entries.length, j2);
  // Arrival: the navigation waypoint is removed and the trail cleared.
  p.x = -40; p.z = -300;
  nav.step(p);
  assert.equal(nav.dest, null);
  assert.equal(navWps().length, 0);
  assert.equal(trail(), null);
  assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'the journal replays');
});

test('the survey workers\' column memo gives exactly the generated deposits (compared across realms)', async () => {
  // The fixed chunks, and the chunks with deposits on the way north to the massif (rows 14-19).
  const list = [...MEMO_CHUNKS];
  for (let cz = 14; cz < 20; cz++) for (let cx = 24; cx < 34; cx++) if (surveyChunk(1337, G, cz * CHUNKS_PER_SIDE + cx).length) list.push(cz * CHUNKS_PER_SIDE + cx);
  const want = list.map((i) => surveyChunk(1337, G, i));
  const got = await new Promise<{ chunks: unknown[]; st: { hits: number; misses: number } }>((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: list });
    w.once('message', resolve); w.once('error', reject);
  });
  assert.deepEqual(got.chunks, want);
  assert.ok(want.flat().length >= 30 && new Set(want.flat().map((d) => d.type)).size >= 4, `${want.flat().length} deposits of ${new Set(want.flat().map((d) => d.type)).size} types compared`);
  assert.ok(got.st.hits > got.st.misses, `memo used (${got.st.hits} hits, ${got.st.misses} misses)`);
});
}
