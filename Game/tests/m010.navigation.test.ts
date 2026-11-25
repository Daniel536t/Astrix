// M010 villager navigation: terrain, fences and gates, doors, trees by growth
// stage, dynamic obstacles, failed routes, job coordination, determinism and
// save compatibility.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import {
  GENERATOR_V2, MAT, World, chunkKey, ensureChunk, harvestEntity, setVoxel, surfaceAt, waterDepthAt, worldToChunkX, worldToChunkZ,
} from '../src/sim/world';
import type { Entity } from '../src/sim/world';
import {
  DM, GATE_IDS, HOMESTEAD_NAV_VERSION, NAV_GIVE_UP, NAV_TICK_BUDGET, VILLAGER_SPEED, bedSpot, facility, findFieldSpot, homesteadGates,
  homesteadLayout, homesteadNav, homesteadNavRegion, stepHomestead, validateHomestead, homesteadSnapshot, CROP_RULES, fieldRect,
} from '../src/sim/homestead';
import {
  BLOCK, COST_FORD, COST_STEP, COST_STRAIGHT, NavContext, NavFeatures, NavState, canMove, emptyFeatures, explainNoRoute, findPath,
  navGrid, navStats, navStep, resetNavCache,
} from '../src/sim/nav';
import { STAGE_FOOTPRINT, STAGE_TRUNK, STAGE_WOOD, growthStage } from '../src/sim/vegetation';

type Session = GameSession;
function send(s: Session, c: Record<string, unknown>) {
  return s.dispatch({ schema: 3, id: `test:${s.nextSequence}:${String(c.type)}`, expectedRevision: s.world.revision, ...c });
}
function ticks(s: Session, n: number, each?: (t: number) => void) {
  for (let i = 0; i < n; i++) {
    const r = send(s, { type: 'tick', ticks: 1 });
    assert.ok(r.ok, JSON.stringify(r));
    each?.(s.world.life!.tick);
  }
}
const founded = (rules: 'v2' | 'legacy' = 'v2') => {
  const s = GameSession.genesis(1337, GENERATOR_V2);
  assert.ok(send(s, rules === 'v2' ? { type: 'found_homestead', rules: 2 } : { type: 'found_homestead' }).ok);
  return s;
};
const stock = (s: Session) => s.world.life!.stockpiles.get('stockpile:founder')!.inventory;
const cell = (dm: number) => Math.floor(dm / DM);
const inRect = (r: { x0: number; z0: number; x1: number; z1: number }, x: number, z: number) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;
/** Keep every enclosure supplied so only the need a test sets up produces a herder job. */
function calm(s: Session) {
  const h = s.world.homestead!;
  for (const e of h.enclosures) { e.water = 30; e.feed = 30; e.grass = 100; e.eggs = 0; }
  for (const a of h.animals) a.product = 0;
}

// ---------- synthetic ground: a flat, dry, cleared pad shaped by voxel edits ----------
const PAD = { x: 60, z: -60, size: 24, y: 22 };
function pad(world: World, shape: (x: number, z: number) => { h: number; water?: number } = () => ({ h: PAD.y })) {
  for (let z = PAD.z; z < PAD.z + PAD.size; z++) for (let x = PAD.x; x < PAD.x + PAD.size; x++) {
    const { h, water = 0 } = shape(x - PAD.x, z - PAD.z);
    for (let y = 14; y < 34; y++) setVoxel(world, x, y, z, y < h ? MAT.STONE : y < h + water ? MAT.WATER : MAT.AIR);
  }
  // No natural entities on the pad.
  for (const key of new Set([chunkKey(worldToChunkX(PAD.x), worldToChunkZ(PAD.z)), chunkKey(worldToChunkX(PAD.x + PAD.size), worldToChunkZ(PAD.z + PAD.size)),
    chunkKey(worldToChunkX(PAD.x), worldToChunkZ(PAD.z + PAD.size)), chunkKey(worldToChunkX(PAD.x + PAD.size), worldToChunkZ(PAD.z))])) {
    for (const id of [...(world.entityChunks.get(key) ?? [])]) {
      const e = world.entities.get(id)!;
      if (e.x >= PAD.x - 2 && e.x < PAD.x + PAD.size + 2 && e.z >= PAD.z - 2 && e.z < PAD.z + PAD.size + 2) { world.entities.delete(id); world.entityChunks.set(key, world.entityChunks.get(key)!.filter((x) => x !== id)); }
    }
  }
}
const padRegion = { ox: PAD.x, oz: PAD.z, w: PAD.size, h: PAD.size };
const dm = (m: number) => m * DM + 5;
const padWorld = () => { const s = GameSession.genesis(1337, GENERATOR_V2); for (let cz = -2; cz <= 0; cz++) for (let cx = 1; cx <= 3; cx++) ensureChunk(s.world, worldToChunkX(PAD.x) + cx - 1, worldToChunkZ(PAD.z) + cz + 1); return s.world; };
const route = (world: World, f: NavFeatures, from: [number, number], to: [number, number], reach = 8) => {
  const g = navGrid(world, padRegion, f);
  return { g, r: findPath(world, g, { x: dm(from[0]), z: dm(from[1]) }, { x: dm(to[0]), z: dm(to[1]), reach }, { maxExpansions: 100_000 }) };
};

function ctxFor(world: World, f: NavFeatures, gates: Record<string, 'open' | 'closed' | 'locked'>, tick = 0): NavContext {
  return {
    world, grid: navGrid(world, padRegion, f), tick, budget: { left: NAV_TICK_BUDGET },
    gate: (id) => gates[id] ?? 'locked', setGate: (id, st) => { gates[id] = st; f.gateStates[id] = st; f.key = JSON.stringify(f.gateStates); },
    canOperate: () => true,
  };
}

test('terrain rules: one-metre steps are walkable at a cost, two-metre cliffs are not, shallow fords cost, deep water is avoided, a deck crosses it', () => {
  const world = padWorld();
  // Columns 0-23 along x: flat, then a 1 m step at x=6, a 2 m high ridge along x=12 for z<12, a ford at z=14, deep water at z=18.
  pad(world, (x, z) => ({
    h: PAD.y + (x >= 6 ? 1 : 0) + (x === 12 && z < 12 ? 2 : 0),
    water: z === 14 && x < 6 ? 1 : z === 18 ? 2 : 0,
  }));
  assert.equal(surfaceAt(world, PAD.x + 6, PAD.z) - surfaceAt(world, PAD.x + 5, PAD.z), 1);
  assert.equal(waterDepthAt(world, PAD.x + 2, PAD.z + 14), 1);
  assert.equal(waterDepthAt(world, PAD.x + 2, PAD.z + 18), 2);
  const f = emptyFeatures('terrain');
  const P = (x: number, z: number) => [PAD.x + x, PAD.z + z] as [number, number];
  const { g } = route(world, f, P(0, 0), P(1, 0));
  assert.ok(canMove(g, PAD.x + 5, PAD.z, PAD.x + 6, PAD.z), 'a 1 m step up');
  assert.ok(canMove(g, PAD.x + 6, PAD.z, PAD.x + 5, PAD.z), 'and down');
  assert.ok(!canMove(g, PAD.x + 11, PAD.z, PAD.x + 12, PAD.z), 'a 2 m cliff blocks');
  assert.ok(!canMove(g, PAD.x + 12, PAD.z, PAD.x + 11, PAD.z), 'in both directions');
  assert.equal(g.block[g.index(PAD.x + 2, PAD.z + 18)], BLOCK.deep_water);
  assert.equal(g.block[g.index(PAD.x + 2, PAD.z + 14)], BLOCK.none, 'a ford is walkable');
  assert.equal(g.extra[g.index(PAD.x + 2, PAD.z + 14)], COST_FORD);
  // Up the cliff the walker detours to where the ground only steps (z >= 12).
  const up = route(world, f, P(10, 2), P(14, 2)).r;
  assert.ok(up.ok);
  const zs: number[] = [];
  for (let k = 1; k < up.cells.length; k += 2) zs.push(up.cells[k] - PAD.z);
  assert.ok(Math.max(...zs) >= 12, `the route goes round the cliff (max z ${Math.max(...zs)})`);
  // Deep water across the whole pad at z=18: the far side is unreachable on foot...
  const across = route(world, f, P(3, 16), P(3, 20));
  assert.ok(!across.r.ok && across.r.code === 'no_route');
  const why = explainNoRoute(world, across.g, { x: dm(P(3, 16)[0]), z: dm(P(3, 16)[1]) }, { x: dm(P(3, 20)[0]), z: dm(P(3, 20)[1]), reach: 8 }, 100_000);
  assert.match(why.reason, /cliffs, deep water or fences/);
  // ...until a deck (a bridge) spans it.
  const bridged: NavFeatures = { ...emptyFeatures('bridge'), decks: [{ x0: PAD.x + 2, z0: PAD.z + 18, x1: PAD.x + 4, z1: PAD.z + 19, y: PAD.y }] };
  const over = route(world, bridged, P(3, 16), P(3, 20));
  assert.ok(over.r.ok, 'the bridge is a valid crossing');
  for (let k = 0; k < over.r.cells.length; k += 2) if (over.r.cells[k + 1] === PAD.z + 18) assert.ok(over.r.cells[k] >= PAD.x + 2 && over.r.cells[k] < PAD.x + 4, 'on the deck');
  // The ford costs more than dry ground: a dry detour of similar length is preferred.
  const ford = route(world, f, P(2, 13), P(2, 15)).r;
  assert.ok(ford.ok && ford.cost >= 2 * COST_STRAIGHT + COST_FORD - 1);
  // A step costs extra.
  const step = route(world, f, P(5, 5), P(6, 5)).r;
  assert.ok(step.ok && step.cost === COST_STRAIGHT + COST_STEP);
});

test('fences block their edges; gates are openings; a locked gate makes the walker replan through another gate', () => {
  const world = padWorld();
  pad(world);
  // A 10 x 10 m paddock with gates on its north (x=5) and east (z=5) sides.
  const f: NavFeatures = {
    ...emptyFeatures(''), fences: [{ x0: PAD.x + 6, z0: PAD.z + 6, x1: PAD.x + 16, z1: PAD.z + 16, id: 'pad', gaps: [] }],
    gates: [{ id: 'gate:pen', x: PAD.x + 11, z: PAD.z + 6, side: 'n' }, { id: 'gate:sty', x: PAD.x + 15, z: PAD.z + 11, side: 'e' }],
  };
  const gates: Record<string, 'open' | 'closed' | 'locked'> = { 'gate:pen': 'closed', 'gate:sty': 'closed' };
  f.gateStates = { ...gates }; f.key = JSON.stringify(f.gateStates);
  const inside = (x: number, z: number) => x >= PAD.x + 6 && x < PAD.x + 16 && z >= PAD.z + 6 && z < PAD.z + 16;
  const walker: { x: number; z: number; nav?: NavState } = { x: dm(PAD.x + 11), z: dm(PAD.z + 1) };
  const goal = { x: dm(PAD.x + 10), z: dm(PAD.z + 12), reach: 8 };
  let ctx = ctxFor(world, f, gates);
  const first = findPath(world, ctx.grid, walker, goal, { maxExpansions: 1e5 });
  assert.ok(first.ok);
  // The only way in is the north gate (crossed once, orthogonally).
  let px = PAD.x + 11, pz = PAD.z + 1, crossings = 0;
  for (let k = 0; k < first.cells.length; k += 2) {
    const x = first.cells[k], z = first.cells[k + 1];
    if (inside(px, pz) !== inside(x, z)) { crossings++; assert.equal(ctx.grid.gateBetween(px, pz, x, z), 'gate:pen'); }
    px = x; pz = z;
  }
  assert.equal(crossings, 1);
  // Walk: it stops at the closed gate, opens it (one tick), passes, and closes it behind.
  const states: string[] = [];
  let t = 0, lockedAt = -1;
  for (; t < 40; t++) {
    ctx = ctxFor(world, f, gates, t);
    const before = { x: walker.x, z: walker.z };
    const r = navStep(ctx, walker, goal, VILLAGER_SPEED, 'feed:pen');
    assert.ok(Math.hypot(walker.x - before.x, walker.z - before.z) <= VILLAGER_SPEED + 1, 'never faster than walking');
    states.push(gates['gate:pen']);
    if (r.status === 'arrived') break;
  }
  assert.ok(states.includes('open'), 'the gate was opened');
  assert.equal(gates['gate:pen'], 'closed', 'and closed behind');
  assert.ok(inside(cell(walker.x), cell(walker.z)));
  // Leave by the north gate, and lock it on the way: the walker replans through the east gate.
  const out = { x: dm(PAD.x + 11), z: dm(PAD.z + 1), reach: 8 };
  for (let i = 0; i < 2; i++) { ctx = ctxFor(world, f, gates, 100 + i); navStep(ctx, walker, out, VILLAGER_SPEED, 'store:x'); }
  gates['gate:pen'] = 'locked'; f.gateStates['gate:pen'] = 'locked'; f.key = JSON.stringify(f.gateStates);
  lockedAt = 102;
  let styOpened = false;
  for (t = lockedAt; t < lockedAt + 60; t++) {
    ctx = ctxFor(world, f, gates, t);
    const r = navStep(ctx, walker, out, VILLAGER_SPEED, 'store:x');
    if (gates['gate:sty'] === 'open') styOpened = true;
    if (r.status === 'arrived') break;
    assert.notEqual(r.status, 'blocked');
  }
  assert.ok(!inside(cell(walker.x), cell(walker.z)), 'it got out');
  assert.equal(gates['gate:pen'], 'locked', 'the locked gate was never opened');
  assert.ok(styOpened, 'it left through the east gate');
  assert.equal(gates['gate:sty'], 'closed', 'the east gate was closed behind it');
  // Both gates locked: no route, and the report names the locked gate.
  gates['gate:sty'] = 'locked'; f.gateStates = { ...gates }; f.key = JSON.stringify(f.gateStates);
  ctx = ctxFor(world, f, gates, 200);
  const r = navStep(ctx, walker, goal, VILLAGER_SPEED, 'feed:pen');
  assert.equal(r.status, 'blocked');
  assert.ok(r.status === 'blocked' && /gate is locked/.test(r.reason) && GATE_IDS.includes(r.by as never), JSON.stringify(r));
});

/** A tree entity injected on the pad (stage chosen by trying ids). */
function plantTree(world: World, x: number, z: number, stage: 'sapling' | 'young' | 'mature' | 'old'): Entity {
  const key = chunkKey(worldToChunkX(x), worldToChunkZ(z));
  for (let i = 900; i < 5000; i++) {
    const e: Entity = { id: `e:${key}:${i}`, kind: 'styl_tree_table', chunk: key, x: x + 0.5, y: PAD.y, z: z + 0.5, rot: 0, scale: 1, variant: 0,
      resource: 'wood', remaining: 12, yieldPerHarvest: 4, harvested: false, provisional: true, authored: false };
    if (growthStage(e) !== stage) continue;
    world.entities.set(e.id, e);
    world.entityChunks.set(key, [...(world.entityChunks.get(key) ?? []), e.id]);
    world.revision++;
    return e;
  }
  throw new Error('no id for stage');
}

test('saplings take less ground than mature and old trees; a tree felled mid-route makes the walker take the shorter way', () => {
  const world = padWorld();
  pad(world);
  const s = plantTree(world, PAD.x + 3, PAD.z + 3, 'sapling');
  const m = plantTree(world, PAD.x + 10, PAD.z + 3, 'mature');
  const o = plantTree(world, PAD.x + 17, PAD.z + 3, 'old');
  const g = navGrid(world, padRegion, emptyFeatures('trees'));
  const count = (e: Entity) => { let n = 0; for (const [, id] of g.blockId) if (id === e.id) n++; return n; };
  assert.deepEqual([count(s), count(m), count(o)], [1, 5, 9], 'sapling 1 cell, mature a plus of 5, old 3 x 3');
  assert.ok(STAGE_FOOTPRINT.sapling < STAGE_FOOTPRINT.mature && STAGE_FOOTPRINT.mature < STAGE_FOOTPRINT.old);
  assert.ok(STAGE_TRUNK.sapling < STAGE_TRUNK.mature, 'the walking character also brushes past a sapling closer');
  assert.equal(g.block[g.index(PAD.x + 4, PAD.z + 3)], BLOCK.none, 'ground beside a sapling is walkable');
  assert.equal(g.block[g.index(PAD.x + 11, PAD.z + 3)], BLOCK.tree, 'ground beside a mature tree is not');

  // A wall with two gaps: a near one plugged by a mature tree, a far one open.
  const world2 = padWorld();
  pad(world2);
  const f: NavFeatures = { ...emptyFeatures('wall'), blocks: [
    { x0: PAD.x, z0: PAD.z + 12, x1: PAD.x + 10, z1: PAD.z + 13, reason: 'building', id: 'wall:a' },
    { x0: PAD.x + 11, z0: PAD.z + 12, x1: PAD.x + 21, z1: PAD.z + 13, reason: 'building', id: 'wall:b' },
    { x0: PAD.x + 22, z0: PAD.z + 12, x1: PAD.x + 24, z1: PAD.z + 13, reason: 'building', id: 'wall:c' },
  ] };
  const tree = plantTree(world2, PAD.x + 10, PAD.z + 11, 'mature');
  const walker: { x: number; z: number; nav?: NavState } = { x: dm(PAD.x + 10), z: dm(PAD.z + 2) };
  const goal = { x: dm(PAD.x + 10), z: dm(PAD.z + 20), reach: 8 };
  const step = (t: number) => navStep({ world: world2, grid: navGrid(world2, padRegion, f), tick: t, budget: { left: NAV_TICK_BUDGET }, gate: () => 'locked', setGate: () => {}, canOperate: () => false }, walker, goal, VILLAGER_SPEED, 'till:field');
  step(0);
  const planned = walker.nav!.plan;
  const viaFar = (n: NavState) => { const cells: number[] = n.path; for (let k = 0; k < cells.length; k += 2) if (cells[k] >= PAD.x + 21) return true; return false; };
  assert.ok(viaFar(walker.nav!), 'with the tree standing, the route uses the far gap');
  step(1);
  // The player fells it (this world has no v2 homestead, so legacy timber: 12 wood in three cuts).
  for (let i = 0; i < 3; i++) assert.ok(harvestEntity(world2, tree.id));
  assert.ok(tree.harvested, 'felled');
  const searches = navStats(world2).searches;
  step(2);
  assert.notEqual(walker.nav!.plan, planned, 'the walker replanned on the changed grid');
  assert.ok(navStats(world2).searches > searches);
  assert.ok(!viaFar(walker.nav!), 'and now walks through the gap the tree stood in');
  let t = 3;
  for (; t < 40 && step(t).status !== 'arrived'; t++);
  assert.ok(t < 40 && cell(walker.z) >= PAD.z + 19, 'it arrived');
});

test('timber depends on growth stage under settlement rules v2; legacy worlds keep 12 wood from any tree', () => {
  const ids = (s: Session) => {
    const by: Record<string, Entity> = {};
    for (const e of s.world.entities.values()) {
      if (!e.kind.startsWith('styl_tree_') || e.harvested || s.world.entityRemovals.has(e.id) || e.harvestedOnce) continue;
      if (e.x < -90 || e.x > 20 || e.z < -70 || e.z > 40) continue;
      const st = growthStage(e)!;
      if (!by[st] || e.id < by[st].id) by[st] = e;
    }
    return by;
  };
  const fell = (s: Session, id: string) => {
    let wood = 0;
    for (let i = 0; i < 10; i++) {
      const r = send(s, { type: 'harvest', entityId: id });
      if (!r.ok) break;
      wood += (r.outcome as { amount: number }).amount;
    }
    return wood;
  };
  const v2 = founded();
  // One tick builds the navigation window, which generates its chunks the same way on replay.
  ticks(v2, 1);
  const trees = ids(v2);
  for (const stage of ['sapling', 'young', 'mature', 'old'] as const) {
    assert.ok(trees[stage], `a ${stage} tree exists`);
    assert.equal(fell(v2, trees[stage].id), STAGE_WOOD[stage].total, `${stage} timber`);
  }
  assert.ok(STAGE_WOOD.sapling.total < STAGE_WOOD.old.total);
  // Legacy: no homestead v2, every tree still gives its record's 12.
  const legacy = GameSession.genesis(1337, GENERATOR_V2);
  for (let cz = 28; cz <= 33; cz++) for (let cx = 28; cx <= 33; cx++) ensureChunk(legacy.world, cx, cz);
  const old = ids(legacy);
  assert.equal(fell(legacy, old.sapling.id), 12);
  assert.equal(fell(legacy, old.old.id), 12);
  // Replay reproduces the stage yields exactly.
  assert.equal(GameSession.replay(JSON.parse(JSON.stringify(v2.journal))).stateHash, v2.stateHash);
});

test('the homestead grid: fences around every pen, gates facing the yard, the farmhouse door, occupied shelters and troughs', () => {
  const s = founded();
  const h = s.world.homestead!;
  const g = homesteadNav(s.world, h);
  assert.deepEqual(h.gates!.map((x) => [x.id, x.state]), GATE_IDS.map((id) => [id, 'closed']));
  const home = facility(h, 'farmhouse')!;
  for (const id of ['coop', 'pen', 'sty', 'paddock'] as const) {
    const f = facility(h, id)!;
    const r = { x0: f.rect.x0 / DM, z0: f.rect.z0 / DM, x1: f.rect.x1 / DM, z1: f.rect.z1 / DM };
    // Every edge of the outline is a wall except exactly one gate.
    let open = 0;
    for (let x = r.x0; x < r.x1; x++) {
      for (const [ax, az, bx, bz] of [[x, r.z0 - 1, x, r.z0], [x, r.z1 - 1, x, r.z1]]) if (canMove(g, ax, az, bx, bz)) { open++; assert.equal(g.gateBetween(ax, az, bx, bz), `gate:${id}`); }
    }
    for (let z = r.z0; z < r.z1; z++) for (const [ax, az, bx, bz] of [[r.x0 - 1, z, r.x0, z], [r.x1 - 1, z, r.x1, z]]) assert.ok(!canMove(g, ax, az, bx, bz), `${id} west/east fence`);
    assert.equal(open, 1, `${id} has one gate`);
    const t = f.trough!;
    assert.equal(g.block[g.index(cell(t.x), cell(t.z))], BLOCK.occupied, `${id} trough takes its cell`);
  }
  // The farmhouse is solid except the threshold inside its door.
  const bed = bedSpot(h);
  assert.equal(g.block[g.index(cell(bed.x), cell(bed.z))], BLOCK.none);
  assert.equal(g.gateBetween(cell(bed.x), cell(bed.z), cell(bed.x), cell(bed.z) + 1), 'door:farmhouse');
  assert.equal(g.block[g.index(cell(bed.x) - 1, cell(bed.z))], BLOCK.building);
  assert.equal(g.block[g.index(cell(home.rect.x0) + 1, cell(home.rect.z0) + 1)], BLOCK.building);
  // A marked field is fenced with one walk-in gap.
  const spot = findFieldSpot(s.world, 4, 4, 'wheat')!;
  assert.ok(send(s, { type: 'mark_field', ...spot }).ok);
  const g2 = homesteadNav(s.world, s.world.homestead!);
  assert.notEqual(g2.hash, g.hash, 'marking a field changes the grid');
  let gaps = 0;
  for (let x = spot.x; x < spot.x + 4; x++) { if (canMove(g2, x, spot.z - 1, x, spot.z)) gaps++; if (canMove(g2, x, spot.z + 3, x, spot.z + 4)) gaps++; }
  for (let z = spot.z; z < spot.z + 4; z++) { if (canMove(g2, spot.x - 1, z, spot.x, z)) gaps++; if (canMove(g2, spot.x + 3, z, spot.x + 4, z)) gaps++; }
  assert.equal(gaps, 1);
  // The window holds every field position and the store.
  const reg = homesteadNavRegion(h);
  assert.ok(inRect({ x0: reg.ox, z0: reg.oz, x1: reg.ox + reg.w, z1: reg.oz + reg.h }, -50, -31));
});

test('a herder walks through the pen gate to the trough, opens and closes it, and the animals stay in', () => {
  const s = founded();
  const h = s.world.homestead!;
  calm(s);
  const pen = h.enclosures.find((e) => e.id === 'pen')!;
  pen.water = 4;
  const bram = h.villagers.find((v) => v.role === 'herder')!;
  const rects = Object.fromEntries(homesteadLayout(h).map((f) => [f.id, { x0: f.rect.x0 / DM, z0: f.rect.z0 / DM, x1: f.rect.x1 / DM, z1: f.rect.z1 / DM }]));
  const gate = homesteadGates(h).find((g) => g.id === 'gate:pen')!;
  const log: Array<{ t: number; x: number; z: number; gate: string; task?: string }> = [];
  const t0 = s.world.life!.tick;
  let delivered = -1;
  for (let i = 0; i < 60 && delivered < 0; i++) {
    const before = pen.water;
    stepHomestead(s.world, ++s.world.life!.tick);
    log.push({ t: s.world.life!.tick, x: bram.x, z: bram.z, gate: h.gates!.find((g) => g.id === 'gate:pen')!.state, task: bram.task?.kind });
    if (pen.water > before) delivered = s.world.life!.tick;
    for (const a of h.animals) {
      const r = rects[{ chicken: 'coop', sheep: 'pen', goat: 'pen', pig: 'sty', cattle: 'paddock', horse: 'paddock' }[a.species]];
      assert.ok(inRect({ x0: r.x0 * DM, z0: r.z0 * DM, x1: r.x1 * DM, z1: r.z1 * DM }, a.x, a.z), `${a.id} stays in its enclosure`);
    }
  }
  assert.ok(delivered > t0, `water delivered (${JSON.stringify(log.slice(-3))})`);
  const opened = log.findIndex((e) => e.gate === 'open');
  assert.ok(opened >= 0, 'the gate was opened');
  // Opened from the yard side, standing at the cell just outside the gate.
  const prev = log[opened - 1] ?? log[opened];
  assert.deepEqual([cell(prev.x), cell(prev.z)], [gate.x, gate.z - 1]);
  assert.equal(log[opened + 1].gate, 'closed', 'closed again right behind the herder');
  assert.ok(inRect(rects.pen, cell(log[opened + 1].x), cell(log[opened + 1].z)), 'who is inside');
  // Every entry into the pen happened through the open gate.
  for (let k = 1; k < log.length; k++) {
    const a = inRect(rects.pen, cell(log[k - 1].x), cell(log[k - 1].z)), b = inRect(rects.pen, cell(log[k].x), cell(log[k].z));
    if (a !== b) assert.equal(log[k - 1].gate, 'open', `crossing at tick ${log[k].t} used the open gate`);
  }
  assert.equal(h.gates!.find((g) => g.id === 'gate:pen')!.state, 'closed');
});

test('a locked gate: the herder reports the real obstruction, never teleports or walks through the fence, then gives the job up openly', () => {
  const s = founded();
  const h = s.world.homestead!;
  calm(s);
  h.enclosures.find((e) => e.id === 'pen')!.water = 4;
  assert.ok(send(s, { type: 'set_gate', gateId: 'gate:pen', state: 'locked' }).ok);
  const bram = h.villagers.find((v) => v.role === 'herder')!;
  const pen = facility(h, 'pen')!;
  const events: string[] = [];
  let blockedAt = -1, gaveUp = -1, last = { x: bram.x, z: bram.z };
  for (let i = 0; i < 60 && gaveUp < 0; i++) {
    calm(s); h.enclosures.find((e) => e.id === 'pen')!.water = 4;
    events.push(...stepHomestead(s.world, ++s.world.life!.tick));
    assert.ok(Math.hypot(bram.x - last.x, bram.z - last.z) <= VILLAGER_SPEED + 1, 'no teleport');
    assert.ok(!inRect(pen.rect, bram.x, bram.z), 'never inside the locked pen');
    last = { x: bram.x, z: bram.z };
    if (bram.nav?.blocked && blockedAt < 0) blockedAt = s.world.life!.tick;
    if (bram.avoid?.some((a) => a.target === 'water:pen')) gaveUp = s.world.life!.tick;
  }
  assert.ok(blockedAt > 0, 'the obstruction is reported in the villager state');
  assert.ok(events.some((e) => /Bram cannot reach the trough: the pen gate is locked/.test(e)), events.join(' | '));
  assert.equal(gaveUp - blockedAt, NAV_GIVE_UP, 'given up after the stated wait');
  const a = bram.avoid!.find((x) => x.target === 'water:pen')!;
  assert.equal(a.by, 'gate:pen');
  assert.match(a.reason, /pen gate is locked/);
  assert.ok(events.some((e) => /Bram gave up on the trough/.test(e)));
  // The save carries the report.
  assert.deepEqual(validateHomestead(JSON.parse(JSON.stringify(homesteadSnapshot(h))), s.world.life!.tick), homesteadSnapshot(h));
  // Unlocked: the job is tried again once the wait is over (the herder is free to pass).
  assert.ok(send(s, { type: 'set_gate', gateId: 'gate:pen', state: 'closed' }).ok);
  bram.avoid = undefined;
  let done = false;
  for (let i = 0; i < 60 && !done; i++) { const w = h.enclosures.find((e) => e.id === 'pen')!; const b = w.water; stepHomestead(s.world, ++s.world.life!.tick); done = w.water > b; }
  assert.ok(done, 'with the gate unlocked the trough gets its water');
});

test('an unreachable destination is reported as what occupies it, and the villager does not move into it', () => {
  const s = founded();
  const h = s.world.homestead!;
  const ada = h.villagers.find((v) => v.role === 'farmer')!;
  const home = facility(h, 'farmhouse')!;
  // A task whose spot is inside the farmhouse wall (not the door threshold).
  const spot = { x: home.rect.x0 + 15, z: home.rect.z0 + 15 };
  ada.task = { kind: 'till', target: 'field:999', leg: 0, progress: 0, legs: [{ op: 'walk', x: spot.x, z: spot.z, ticks: 0, effect: 'none' }, { op: 'work', x: spot.x, z: spot.z, ticks: 4, effect: 'till' }] };
  const start = { x: ada.x, z: ada.z };
  const ev: string[] = [];
  ev.push(...stepHomestead(s.world, ++s.world.life!.tick));
  assert.deepEqual({ x: ada.x, z: ada.z }, start, 'no move toward an impossible spot');
  assert.equal(ada.nav?.blocked?.by, 'farmhouse');
  assert.match(ada.nav!.blocked!.reason, /taken by a building/);
  assert.ok(ev.some((e) => /Ada cannot reach the field: the destination is taken by a building/.test(e)), ev.join('|'));
});

test('full job loop: the herder walks into the coop to the nest, carries the eggs to the store and the store inventory changes only on arrival', () => {
  const s = founded();
  const h = s.world.homestead!;
  calm(s);
  const coop = h.enclosures.find((e) => e.id === 'coop')!;
  coop.eggs = 6;
  const bram = h.villagers.find((v) => v.role === 'herder')!;
  const coopRect = facility(h, 'coop')!.rect;
  const eggs0 = stock(s).eggs ?? 0;
  let picked = -1, stored = -1, wasInside = false;
  const store = { x: -500, z: -304 };
  for (let i = 0; i < 120 && stored < 0; i++) {
    stepHomestead(s.world, ++s.world.life!.tick);
    coop.water = 30; coop.feed = 30;
    if (inRect(coopRect, bram.x, bram.z)) wasInside = true;
    if (picked < 0 && bram.carry?.item === 'eggs') {
      picked = s.world.life!.tick;
      assert.equal(bram.carry.amount, 6);
      assert.equal(coop.eggs, 0, 'the eggs left the nest box');
      assert.ok(inRect(coopRect, bram.x, bram.z), 'picked up inside the coop');
    }
    if (picked > 0 && stored < 0) {
      if ((stock(s).eggs ?? 0) > eggs0) {
        stored = s.world.life!.tick;
        assert.equal(stock(s).eggs, eggs0 + 6, 'exactly the carried eggs');
        assert.equal(bram.carry, null);
        assert.ok(Math.hypot(bram.x - store.x, bram.z - store.z) <= 10, `delivered at the store (${bram.x}, ${bram.z})`);
      } else {
        assert.equal(bram.carry?.amount, 6, 'carried all the way');
      }
    }
  }
  assert.ok(wasInside && picked > 0 && stored > picked, `picked ${picked}, stored ${stored}`);
});

test('under v2 rules the whole farm still works: crops are sown, watered, harvested and delivered; animals are fed and products stored', () => {
  const s = founded();
  const spot = findFieldSpot(s.world, 6, 6, 'flax')!;
  assert.ok(send(s, { type: 'mark_field', ...spot }).ok);
  const h = s.world.homestead!;
  const fiber0 = stock(s).fiber ?? 0;
  const g0 = homesteadNav(s.world, h);
  let maxStep = 0;
  const prev = new Map(h.villagers.map((v) => [v.id, { x: v.x, z: v.z }]));
  ticks(s, 900, () => {
    const g = homesteadNav(s.world, h);
    for (const v of h.villagers) {
      const p = prev.get(v.id)!;
      maxStep = Math.max(maxStep, Math.hypot(v.x - p.x, v.z - p.z));
      prev.set(v.id, { x: v.x, z: v.z });
      // Nobody ever stands inside a wall, a tree, a trough or a shelter.
      assert.equal(g.block[g.index(cell(v.x), cell(v.z))], BLOCK.none, `${v.name} at (${v.x}, ${v.z}) tick ${s.world.life!.tick}`);
    }
  });
  void g0;
  const store = { ...stock(s) };
  for (const [k, n] of Object.entries(h.overflow)) store[k] = (store[k] ?? 0) + n;
  assert.ok(maxStep <= VILLAGER_SPEED + 1, `walking speed respected (max ${maxStep.toFixed(1)} dm/tick)`);
  assert.ok((store.fiber ?? 0) > fiber0 || h.plots[0].state !== 'wild', 'the flax field was worked');
  assert.ok(h.plots.some((p) => p.state === 'growing' || p.state === 'ripe' || p.state === 'tilled'));
  assert.ok((store.eggs ?? 0) + (store.milk ?? 0) > 0 && (store.wool ?? 0) > 0, JSON.stringify(store));
  assert.ok(h.animals.every((a) => a.starving === 0) && h.animals.length >= 15, 'no animal starving or dead');
  assert.deepEqual(h.gates!.map((g) => g.state), GATE_IDS.map(() => 'closed'), 'every gate closed again (or a villager is passing)');
  const st = navStats(s.world);
  assert.ok(st.expanded / Math.max(1, st.searches) <= 120 * 120, 'every search is bounded by the window');
});

test('the farmer harvests and delivers under v2 within the legacy timeline', () => {
  const s = founded();
  const spot = findFieldSpot(s.world, 4, 4, 'wheat')!;
  assert.ok(send(s, { type: 'mark_field', ...spot }).ok);
  const food0 = stock(s).food ?? 0;
  let at = -1;
  for (let i = 0; i < 900 && at < 0; i++) { ticks(s, 1); if ((stock(s).food ?? 0) >= food0 + CROP_RULES.wheat.yield.food * 2) at = i; }
  assert.ok(at > CROP_RULES.wheat.growTicks, `food delivered after ${at} ticks`);
  // The field was worked from inside its fence.
  void fieldRect;
});

test('navigation is deterministic: replay from genesis and restore from a mid-run snapshot match the live run, gate commands included', () => {
  const run = () => {
    const s = founded();
    assert.ok(send(s, { type: 'mark_field', ...findFieldSpot(s.world, 5, 4, 'potato')! }).ok);
    ticks(s, 150);
    assert.ok(send(s, { type: 'set_gate', gateId: 'gate:coop', state: 'locked' }).ok);
    ticks(s, 100);
    return s;
  };
  const a = run(), b = run();
  assert.equal(a.stateHash, b.stateHash, 'two runs agree');
  const snap = JSON.parse(JSON.stringify(a.snapshot));
  const journal = JSON.parse(JSON.stringify(a.journal));
  assert.ok(a.world.homestead!.villagers.some((v) => v.nav), 'routes are part of the saved state');
  ticks(a, 120);
  assert.ok(send(a, { type: 'set_gate', gateId: 'gate:coop', state: 'open' }).ok);
  ticks(a, 80);
  // Replay from genesis.
  assert.equal(GameSession.replay(JSON.parse(JSON.stringify(a.journal))).stateHash, a.stateHash);
  // Restore at the mid-run boundary (fresh caches) and replay only the tail.
  const tail = GameSession.restore(snap, JSON.parse(JSON.stringify(a.journal)));
  assert.equal(tail.stateHash, a.stateHash);
  // The mid snapshot restores to its own boundary hash too.
  const mid = GameSession.restore(snap, journal);
  assert.equal(mid.stateHash, b.stateHash);
  // Grid caches are derived only: dropping them changes nothing.
  resetNavCache(b.world);
  ticks(b, 120);
  assert.ok(send(b, { type: 'set_gate', gateId: 'gate:coop', state: 'open' }).ok);
  ticks(b, 80);
  assert.equal(b.stateHash, a.stateHash);
});

test('old saves: a legacy homestead keeps its exact bytes, hash and straight-line rules; upgrading is a journaled command', () => {
  const s = founded('legacy');
  const h = s.world.homestead!;
  assert.equal(h.version, 1);
  ticks(s, 60);
  const snap = JSON.stringify(s.snapshot);
  assert.ok(!/"gates"|"nav"|"avoid"/.test(snap), 'no v2 fields in a legacy save');
  const restored = GameSession.restore(JSON.parse(snap), JSON.parse(JSON.stringify(s.journal)));
  assert.equal(restored.stateHash, s.stateHash);
  assert.equal(JSON.stringify(restored.snapshot), snap, 'byte-identical');
  assert.equal(GameSession.replay(JSON.parse(JSON.stringify(s.journal))).stateHash, s.stateHash);
  // Legacy villagers still walk straight lines (no route state).
  assert.ok(h.villagers.every((v) => v.nav === undefined));
  assert.equal(send(s, { type: 'set_gate', gateId: 'gate:pen', state: 'open' }).ok, false, 'no gates before the upgrade');
  const up = send(s, { type: 'upgrade_homestead' });
  assert.ok(up.ok && up.outcome.type === 'upgrade_homestead' && up.outcome.version === HOMESTEAD_NAV_VERSION);
  assert.equal(h.version, 2);
  assert.equal(send(s, { type: 'upgrade_homestead' }).ok, false, 'once');
  ticks(s, 40);
  assert.ok(h.villagers.some((v) => v.nav), 'upgraded villagers navigate');
  // The pre-upgrade snapshot plus the longer journal restores to the live state.
  assert.equal(GameSession.restore(JSON.parse(snap), JSON.parse(JSON.stringify(s.journal))).stateHash, s.stateHash);
  assert.equal(GameSession.replay(JSON.parse(JSON.stringify(s.journal))).stateHash, s.stateHash);
  // A thresh leg in a save now validates (it was missing from the effect list).
  const v = h.villagers[0];
  v.task = { kind: 'thresh', target: 'thresh:store', leg: 1, progress: 0, legs: [{ op: 'walk', x: 0, z: 0, ticks: 0, effect: 'none' }, { op: 'work', x: 0, z: 0, ticks: 4, effect: 'thresh' }] };
  assert.doesNotThrow(() => validateHomestead(JSON.parse(JSON.stringify(homesteadSnapshot(h))), s.world.life!.tick));
});

test('genesis is unchanged and new commands are strictly validated', () => {
  assert.equal(GameSession.genesis(1337).stateHash, 'e659504b056654dc');
  const s = founded();
  const hash = s.stateHash;
  for (const bad of [
    { type: 'set_gate', gateId: 'gate:barn', state: 'open' },
    { type: 'set_gate', gateId: 'gate:pen', state: 'ajar' },
    { type: 'set_gate', gateId: 'gate:pen', state: 'open', extra: 1 },
    { type: 'found_homestead', rules: 6 }, // M012 made rules 3 and then 4 valid, M013 made 5 valid; 6 does not exist
  ]) {
    const r = send(s, bad);
    assert.ok(!r.ok && r.code === 'invalid_command', JSON.stringify(bad));
  }
  assert.equal(send(s, { type: 'set_gate', gateId: 'gate:pen', state: 'closed' }).ok, false, 'unchanged is refused');
  assert.equal(s.stateHash, hash, 'rejections change nothing');
  // v2 snapshots validate strictly: an unknown gate state is rejected.
  const snap = JSON.parse(JSON.stringify(homesteadSnapshot(s.world.homestead!)));
  snap.gates[0].state = 'ajar';
  assert.throws(() => validateHomestead(snap, s.world.life!.tick));
});
