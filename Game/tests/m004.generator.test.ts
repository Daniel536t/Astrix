import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENERATOR_V2, GENERATOR_VERSION, MAT,
  baseHeightAt, baseWaterLevelAt, createWorld, ensureChunk,
  getVoxel, hydrologyFor, surfaceAt, surfaceHeightAt, terrainV2,
  waterSurfaceAt, worldToChunkX, worldToChunkZ,
} from '../src/sim/world';
import { M002_LAYOUT } from '../src/sim/m002';
import { GameSession } from '../src/app/session';
import { BrowserSaveStore, KeyValueStorage } from '../src/app/persistence';
import { M2_PROJECTS, inspectProject } from '../src/app/projects';

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

test('generator v1 genesis is unchanged by the v2 work', () => {
  // Pinned before generator v2 existed (2026-11-23). Any change here breaks old saves.
  assert.equal(GameSession.genesis(1337).stateHash, 'e659504b056654dc');
  assert.equal(GameSession.genesis(1337).journal.generatorVersion, undefined);
  assert.equal(createWorld(1337).params.generatorVersion, GENERATOR_VERSION);
});

test('generator v2 is deterministic and differs from v1 only outside the founder corridor', () => {
  for (const x of [-62, -50, -40, -25, 0, 40]) {
    for (const z of [-48, -40, -33, 0, 30]) {
      assert.equal(baseHeightAt(1337, GENERATOR_V2, x, z), surfaceHeightAt(1337, x, z), `corridor ${x},${z}`);
    }
  }
  let changed = 0;
  for (let z = -900; z <= -500; z += 50) {
    for (let x = -500; x <= 100; x += 50) {
      if (baseHeightAt(1337, GENERATOR_V2, x, z) !== surfaceHeightAt(1337, x, z)) changed++;
    }
  }
  assert.ok(changed > 40, `the northern massif must change the landscape (${changed})`);

  const a = createWorld(1337, GENERATOR_V2), b = createWorld(1337, GENERATOR_V2);
  for (const [cx, cz] of [[26, 9], [30, 30], [42, 20]]) {
    assert.deepEqual(ensureChunk(a, cx, cz)!.data, ensureChunk(b, cx, cz)!.data);
  }
  let peak = -Infinity, snow = 0;
  for (let z = -950; z <= -450; z += 10) {
    for (let x = -600; x <= 300; x += 10) {
      const h = baseHeightAt(1337, GENERATOR_V2, x, z);
      peak = Math.max(peak, h);
    }
  }
  const w = createWorld(1337, GENERATOR_V2);
  for (let z = -900; z <= -600; z += 16) {
    for (let x = -500; x <= 100; x += 16) {
      const y = surfaceAt(w, x, z);
      if (getVoxel(w, x, y - 1, z) === MAT.SNOW) snow++;
    }
  }
  assert.ok(peak >= 85, `highlands must be tall (peak ${peak})`);
  assert.ok(snow > 10, `snowfields must exist above the snowline (${snow})`);
});

test('hydrology: the mountain river only descends downstream and has real drops', () => {
  const hydro = hydrologyFor(1337, GENERATOR_V2);
  const upper = hydro.upper!;
  assert.ok(upper.length > 300);
  const pts = upper.points;
  for (let i = 1; i < pts.length; i++) {
    assert.ok(pts[i].level >= pts[i - 1].level - 1e-9, `level rises downstream at ${i}`);
    assert.ok(pts[i].s > pts[i - 1].s);
  }
  assert.equal(pts[0].level, 0, 'the river mouth is at lake level');
  assert.ok(pts[pts.length - 1].level > 30, 'the source tarn is high in the massif');
  let steepest = 0;
  for (let i = 1; i < pts.length; i++) steepest = Math.max(steepest, (pts[i].level - pts[i - 1].level) / (pts[i].s - pts[i - 1].s));
  assert.ok(steepest > 0.4, `cascades must exist (steepest gradient ${steepest.toFixed(2)})`);

  // Flow at a channel point points downstream (toward lower water).
  const mid = pts[Math.floor(pts.length / 2)];
  const flow = hydro.flowAt(mid.x, mid.z, mid.level);
  assert.equal(flow.body, 'river');
  const down = pts[Math.floor(pts.length / 2) - 3];
  assert.ok(flow.dx * (down.x - mid.x) + flow.dz * (down.z - mid.z) > 0, 'flow follows the channel downstream');
  assert.ok(flow.speed > 0.3);

  // The lowland river flows south toward the sea, in both generator versions.
  for (const version of [GENERATOR_VERSION, GENERATOR_V2]) {
    const lower = hydrologyFor(1337, version).lower;
    const p = lower.points[Math.floor(lower.points.length / 2)];
    const f = hydrologyFor(1337, version).flowAt(p.x, p.z, 0);
    assert.equal(f.body, 'river');
    assert.ok(f.dz > 0.3, `lowland river flows south (v${version}, dz=${f.dz.toFixed(2)})`);
  }
  assert.equal(hydrologyFor(1337, GENERATOR_VERSION).upper, null, 'v1 has no mountain river');
});

test('v2 water voxels fill the channel to the hydrological level and are contained', () => {
  const world = createWorld(1337, GENERATOR_V2);
  const upper = hydrologyFor(1337, GENERATOR_V2).upper!;
  let checked = 0, raisedColumns = 0, leaks = 0;
  const leakSamples: string[] = [];
  for (let i = 1; i < upper.points.length - 1; i++) {
    const p = upper.points[i];
    const n = upper.points[i + 1];
    const len = Math.hypot(n.x - p.x, n.z - p.z) || 1;
    // Sample across the channel, perpendicular to the centreline.
    for (const off of [-3, -1.5, 0, 1.5, 3]) {
    const x = Math.round(p.x - (n.z - p.z) / len * off), z = Math.round(p.z + (n.x - p.x) / len * off);
    const surface = surfaceAt(world, x, z);
    const top = waterSurfaceAt(world, x, z);
    const expected = baseWaterLevelAt(1337, GENERATOR_V2, x, z);
    checked++;
    if (expected > surface) {
      raisedColumns += expected > 0 ? 1 : 0;
      assert.equal(top, expected, `water at ${x},${z} reaches the level`);
      // Containment: at the water's top layer every side neighbour is water or solid.
      const y = top - 1;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const m = getVoxel(world, x + dx, y, z + dz);
        if (m !== MAT.AIR) continue;
        // A lower water surface downstream is a cascade step, not a leak.
        const nx = x + dx, nz = z + dz;
        const wet = waterSurfaceAt(world, nx, nz) > surfaceAt(world, nx, nz);
        const here = upper.nearest(x, z), there = upper.nearest(nx, nz);
        if (wet && here && there && there.s <= here.s + 0.75) continue;
        { leaks++; if (leakSamples.length < 5) leakSamples.push(`${x + dx},${y},${z + dz}`); }
      }
    }
    }
  }
  assert.ok(checked > 200, `sampled ${checked}`);
  assert.ok(raisedColumns > 30, `the mountain river must hold raised water (${raisedColumns})`);
  assert.equal(leaks, 0, `water must not stand against open air: ${leakSamples.join(' ')}`);
});

test('founder projects remain buildable on a generator v2 world', () => {
  const session = GameSession.genesis(1337, GENERATOR_V2);
  assert.equal(session.journal.generatorVersion, GENERATOR_V2);
  for (const project of M2_PROJECTS) {
    const inspection = inspectProject(session.world, project);
    assert.ok(inspection.plan.ok, `${project.id} plan`);
    assert.notEqual(inspection.state, 'invalid', `${project.id} site`);
  }
  const house = session.dispatch({
    schema: 3, id: 'build:house:1', type: 'build', projectId: 'house',
    expectedRevision: session.world.revision, designVersion: 2,
  });
  assert.equal(house.ok, true, house.ok ? '' : house.reasons.join('; '));
  for (const r of M002_LAYOUT.envelope) {
    assert.ok(ensureChunk(session.world, worldToChunkX(r.x0), worldToChunkZ(r.z0)));
  }
});

test('saves: v2 worlds round-trip exactly and v1 saves keep loading as v1', () => {
  const storage = new MemoryStorage();
  const store = new BrowserSaveStore(storage, 1337, GENERATOR_V2);
  const loaded = store.load();
  assert.equal(loaded.session.world.params.generatorVersion, GENERATOR_V2);
  const s = loaded.session;
  const r = s.dispatch({ schema: 3, id: 'tick:1', type: 'tick', ticks: 1, expectedRevision: s.world.revision });
  assert.equal(r.ok, true);
  assert.equal(store.save(s).ok, true);
  const again = new BrowserSaveStore(storage, 1337, GENERATOR_VERSION).load();
  assert.equal(again.status, 'restored');
  assert.equal(again.session.world.params.generatorVersion, GENERATOR_V2, 'the save, not the store default, decides');
  assert.equal(again.session.stateHash, s.stateHash);

  const legacyStorage = new MemoryStorage();
  const legacyStore = new BrowserSaveStore(legacyStorage, 1337, GENERATOR_VERSION);
  const legacy = legacyStore.load().session;
  legacy.dispatch({ schema: 3, id: 'tick:1', type: 'tick', ticks: 1, expectedRevision: legacy.world.revision });
  legacyStore.save(legacy);
  const raw = legacyStorage.getItem('astrix:m002:v3:seed:1337')!;
  assert.equal(raw.includes('generatorVersion":2'), false);
  const reopened = new BrowserSaveStore(legacyStorage, 1337, GENERATOR_V2).load();
  assert.equal(reopened.status, 'restored');
  assert.equal(reopened.session.world.params.generatorVersion, GENERATOR_VERSION);
  assert.equal(reopened.session.stateHash, legacy.stateHash);
});

test('a journal and snapshot from different generators are rejected', () => {
  const v2 = GameSession.genesis(1337, GENERATOR_V2);
  const tampered = JSON.parse(JSON.stringify(v2.journal));
  delete tampered.generatorVersion;
  assert.throws(() => GameSession.restore(v2.snapshot, tampered), /generator/);
  const bad = JSON.parse(JSON.stringify(v2.journal));
  bad.generatorVersion = 7;
  assert.throws(() => GameSession.restore(v2.snapshot, bad));
});

test('v2 chunk generation stays within budget per chunk', () => {
  const world = createWorld(1337, GENERATOR_V2);
  terrainV2(1337);
  const t0 = performance.now();
  for (let i = 0; i < 6; i++) ensureChunk(world, 26 + i, 9);
  const per = (performance.now() - t0) / 6;
  assert.ok(per < 60, `v2 chunk generation ${per.toFixed(1)} ms`);
});
