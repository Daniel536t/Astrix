// M015 device report 1 (owner's Android tablet, 2026-11-25): fixes for the
// problems it found. Pins the stable mobile detection with this device's
// values, the frame-rate cap, the compact chat report, the streaming budgets
// (ground cover, worker results, padded volumes, macro LOD arrays) and the
// draw-call merges (near water per region, the MagicBlock settlement props).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { DeviceCaps, chooseQuality, mobileReason, resolveQuality } from '../src/app/quality';
import { FrameLimiter, parseFrameCap, resolveFrameCap } from '../src/app/frame-cap';
import { COMPACT_REPORT_MAX, PerfBucket, buildReport, compactReport, medianFpsThreshold, reportText } from '../src/app/perf-monitor';
import { GroundCoverView, coverExclusions, coverGeometry, groundCoverChunk } from '../src/render/ground-cover';
import { OBSTRUCTION_RADIUS } from '../src/sim/terrain';
import {
  VoxelTerrainView, buildMacroArrays, buildMacroMesh, macroMeshesFromArrays, macroSampleFor, mergeWaterGeometries, paddedFor, paddedForReference,
  waterRegionKey,
} from '../src/render/terrain';
import { meshPadded } from '../src/render/mesher';
import { meshChunkWater } from '../src/render/water';
import { mergeStaticGroup } from '../src/render/static-merge';
import { buildCrate, buildWoodpile, buildCottage } from '../src/render/village-kit';
import { buildFigure, VILLAGER_STYLE } from '../src/render/characters';
import {
  GENERATOR_V2, World, chunkKey, computeBaseColumns, createWorld, ensureChunk, generateBaseChunk, worldToChunkX, worldToChunkZ,
} from '../src/sim/world';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

// ---------- problem 3: stable automatic quality ----------

/** The owner's tablet as the report saw it: Chrome 142 in desktop-site mode (UA "X11; Linux x86_64"). */
const OWNER_TABLET: DeviceCaps = {
  touch: false, maxTouchPoints: 10, anyCoarse: false, platform: 'Linux x86_64',
  dpr: 1.875, hardwareConcurrency: 8, deviceMemory: 8, gpu: 'Adreno (TM) 710', multiDraw: true, screenShort: 854,
};

test('quality: the owner\'s Adreno 710 tablet in desktop-site mode is a tablet (medium) on every load, whatever the pointer media query says', () => {
  // First load reported a fine primary pointer ("0s start quality high"), the reload a coarse one ("medium").
  const loads: DeviceCaps[] = [
    OWNER_TABLET,
    { ...OWNER_TABLET, touch: true },
    { ...OWNER_TABLET, anyCoarse: true },
    { ...OWNER_TABLET, touch: true, anyCoarse: true },
  ];
  for (const caps of loads) {
    const q = chooseQuality(caps);
    assert.equal(q.level, 'medium', JSON.stringify(caps));
  }
  assert.match(mobileReason(OWNER_TABLET)!, /mobile GPU \(Adreno \(TM\) 710\)/);
  const r = resolveQuality(null, null, () => OWNER_TABLET);
  assert.deepEqual([r.level, r.source], ['medium', 'auto']);
  // The other mobile GPU families, behind a desktop user agent.
  for (const gpu of ['Mali-G710 MC10', 'Apple GPU', 'Samsung Xclipse 920', 'PowerVR Rogue GE8320', 'Immortalis-G715']) {
    assert.notEqual(chooseQuality({ ...OWNER_TABLET, gpu }).level, 'high', gpu);
  }
  // An ARM platform string is enough when the GPU is not exposed.
  assert.equal(chooseQuality({ ...OWNER_TABLET, gpu: null, platform: 'Linux armv8l' }).level, 'medium');
  // Desktops stay high: a touch laptop with a desktop GPU, a Mac, and no touch screen at all.
  assert.equal(chooseQuality({ ...OWNER_TABLET, gpu: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)', platform: 'Win32' }).level, 'high');
  assert.equal(chooseQuality({ ...OWNER_TABLET, maxTouchPoints: 0, gpu: 'Apple M2', platform: 'MacIntel' }).level, 'high');
  assert.equal(chooseQuality({ ...OWNER_TABLET, maxTouchPoints: 0 }).level, 'high', 'no touch screen: a desktop, even with an Adreno string');
  // Weak signals still pick low on this path.
  assert.equal(chooseQuality({ ...OWNER_TABLET, gpu: 'Adreno (TM) 610', hardwareConcurrency: 4 }).level, 'low');
});

test('quality: main.ts decides the level before the renderer exists, from stable signals, and probes the GPU on any touch screen', () => {
  const main = read('src/main.ts');
  assert.ok(main.indexOf('resolveQuality(') < main.indexOf('new THREE.WebGLRenderer('), 'the level is chosen before the first render');
  assert.match(main, /navigator\.maxTouchPoints/);
  assert.match(main, /any-pointer: coarse/);
  assert.match(main, /coarsePointer \|\| anyCoarse \|\| maxTouchPoints > 0 \? probeGpu\(\)/);
});

// ---------- problem 4: frame-rate cap ----------

/** Draws a limiter allows over `seconds` at a display rate, with optional timestamp jitter (ms). */
function drawsAt(hz: number, cap: number, seconds = 10, jitter = 0): { draws: number; gaps: number[] } {
  const l = new FrameLimiter(cap);
  const gaps: number[] = [];
  let draws = 0, last = -1, seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (let i = 0; i < hz * seconds; i++) {
    const t = 1000 + (i * 1000) / hz + rnd() * 2 * jitter;
    if (l.shouldDraw(t)) { draws++; if (last >= 0) gaps.push(i - last); last = i; }
  }
  return { draws, gaps };
}

test('frame cap: unlimited draws every display frame; 60 and 30 skip whole frames to the cap on 60, 90 and 120 Hz screens', () => {
  assert.equal(drawsAt(60, 0).draws, 600);
  assert.equal(drawsAt(120, 0).draws, 1200);
  assert.equal(drawsAt(60, 60).draws, 600, '60 Hz at a 60 cap: every frame');
  const c120 = drawsAt(120, 60);
  assert.ok(Math.abs(c120.draws - 600) <= 1, `${c120.draws}`);
  assert.ok(c120.gaps.every((g) => g === 2), '120 Hz at 60: every second frame');
  const c30 = drawsAt(60, 30);
  assert.ok(Math.abs(c30.draws - 300) <= 1, `${c30.draws}`);
  assert.ok(c30.gaps.every((g) => g === 2), '60 Hz at 30: every second frame');
  const c90 = drawsAt(90, 60);
  assert.ok(c90.draws >= 440 && c90.draws <= 601, `90 Hz at 60: ${c90.draws}`);
  // rAF jitter of +-1.5 ms keeps the cadence (no doubled frames).
  const jit = drawsAt(60, 30, 10, 1.5);
  assert.ok(Math.abs(jit.draws - 300) <= 2, `${jit.draws}`);
  assert.ok(jit.gaps.every((g) => g >= 2), 'never two frames in a row at 30 fps');
  // A stall (hidden tab) restarts the cadence instead of drawing a burst.
  const l = new FrameLimiter(30);
  assert.equal(l.shouldDraw(0), true);
  assert.equal(l.shouldDraw(5000), true);
  assert.equal(l.shouldDraw(5016.7), false);
  assert.equal(l.shouldDraw(5033.4), true);
  l.set(0);
  assert.equal(l.shouldDraw(5034), true);
});

test('frame cap: parsing, precedence (?fps=, Settings, unlimited) and the limiter sits at the top of the frame loop', () => {
  assert.equal(parseFrameCap('30'), 30);
  assert.equal(parseFrameCap('60'), 60);
  assert.equal(parseFrameCap('unlimited'), 0);
  assert.equal(parseFrameCap('45'), null);
  assert.deepEqual(resolveFrameCap('30', '60'), { cap: 30, source: 'url' });
  assert.deepEqual(resolveFrameCap(null, '60'), { cap: 60, source: 'saved' });
  assert.deepEqual(resolveFrameCap(null, null), { cap: 0, source: 'default' }, 'unlimited by default');
  assert.deepEqual(resolveFrameCap('x', 'y'), { cap: 0, source: 'default' });
  const main = read('src/main.ts');
  const frame = main.slice(main.indexOf('function frame('));
  assert.ok(frame.indexOf('limiter.shouldDraw') < frame.indexOf('advanceTime('), 'a skipped frame does no work');
  assert.equal(medianFpsThreshold(0), 30);
  assert.equal(medianFpsThreshold(60), 30);
  assert.equal(medianFpsThreshold(30), 28.5);
});

// ---------- problems 4 and 5: the report ----------

const device = {
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36', platform: 'Linux x86_64',
  screen: { width: 1366, height: 854, availWidth: 1366, availHeight: 854, orientation: 'landscape-primary' }, viewport: { width: 1365, height: 709 }, dpr: 1.875,
  hardwareConcurrency: 8, deviceMemory: 8, gpu: 'Adreno (TM) 710', gpuVendor: 'Qualcomm', webgl2: true, multiDrawSupported: true, maxTextureSize: 16384, touch: true,
  maxTouchPoints: 10, anyCoarse: true,
};
const render = { path: 'multi-draw' as const, quality: 'medium', qualitySource: 'auto', qualityReasons: ['touch screen with a mobile GPU (Adreno (TM) 710)'], pixelRatio: 1.5,
  canvas: { width: 2047, height: 1063 }, frameCap: 0, frameCapSource: 'default' };
const bucket = (i: number): PerfBucket => ({
  i, t: i * 10, dur: 10, visible: i === 75 ? 0.4 : 1, frames: 595, fps: 59.5 - (i % 7), fpsP5: 31.2, p50Ms: 16.7, p95Ms: 19.3, maxMs: 88.4, long50: i % 9,
  scene: i < 42 ? `walk:-${3 + (i % 6)},0:mid` : 'walk:-1,0:mid', calls: 121 + (i % 23), triangles: 194_094 - i * 13, heapMB: 136 + (i % 50), battery: 0.72 - i * 0.0008,
  charging: false, quality: i > 75 ? 'medium' : 'high', path: 'multi-draw', cap: 0,
});
const report = (n: number, extra: Partial<typeof render> = {}) => buildReport({ build: { commit: 'b235406', dirty: false, bundle: 'index-BnwDzHwe.js', url: 'https://astrix.nyc.boxd.sh/?perf=1' },
  device, render: { ...render, ...extra }, startedAt: '2026-11-25T10:00:00.000Z', createdAt: '2026-11-25T10:18:00.000Z',
  buckets: Array.from({ length: n }, (_, i) => bucket(i)), events: [{ t: 0, kind: 'start', detail: 'quality high · multi-draw · cap unlimited' }, { t: 751, kind: 'hidden' }, { t: 751, kind: 'reload', detail: 'quality medium · multi-draw' }] });

test('report: Copy gives the summary plus one line per bucket under 8 KB for the owner\'s 107-bucket session, where summary + JSON was 30 KB and got cut', () => {
  const r = report(107);
  const full = `${reportText(r)}\n\n--- JSON ---\n${JSON.stringify(r)}`;
  assert.ok(full.length > 25_000, `the old paste: ${full.length}`);
  const text = compactReport(r);
  assert.ok(text.length <= COMPACT_REPORT_MAX, `${text.length}`);
  assert.ok(text.startsWith(reportText(r)), 'the summary comes first, unchanged');
  assert.match(text, /one line per 10 s/);
  const lines = text.split('\n');
  const table = lines.slice(lines.findIndex((l) => l.startsWith('Buckets')) + 1);
  assert.equal(table.length, 107, 'every bucket, including the ones after 62');
  assert.match(table[106], /^106 1060 /);
  assert.match(table[42], /^42 420 [\d.]+\/31 19 \d 1\d\d 194 \d+ H walk:-1,0:mid$/, table[42]);
  assert.equal(table[43].split(' ').at(-1), '=', 'a repeated scene is "="');
  assert.match(table[75], / v0\.4 /, 'a partly hidden bucket shows its visibility');
  assert.match(table[76], / M /, 'quality per line');
});

test('report: long sessions fold into minute lines and still fit; the frame cap is in the summary, the buckets and the fps check', () => {
  for (const n of [360, 1200, 4000]) {
    const text = compactReport(report(n));
    assert.ok(text.length <= COMPACT_REPORT_MAX, `${n} buckets: ${text.length}`);
    assert.match(text, /one line per \d+ min|bucket table omitted/);
  }
  assert.match(compactReport(report(360)), /one line per 1 min/);
  const capped = buildReport({ ...{ build: { commit: 'x', dirty: false, bundle: null, url: '' }, device, startedAt: '', createdAt: '', events: [] },
    render: { ...render, frameCap: 30, frameCapSource: 'saved' }, buckets: Array.from({ length: 30 }, (_, i) => ({ ...bucket(i), fps: 29.6, cap: 30 })) });
  assert.match(reportText(capped), /frame cap 30 fps \(saved\)/);
  assert.equal(capped.checks.medianFps.ok, true, '29.6 fps at a 30 cap passes');
  assert.match(capped.checks.medianFps.threshold, />= 28.5 fps \(frame cap 30\)/);
  assert.match(compactReport(capped).split('\n').at(-1)!, / H30 /, 'the cap per bucket line');
  assert.match(reportText(report(5)), /frame cap unlimited \(default\)/);
});

// ---------- problem 2: streaming work spread over frames ----------

function loadAround(world: World, x: number, z: number, r: number): Set<string> {
  const ccx = worldToChunkX(x), ccz = worldToChunkZ(z);
  const keys = new Set<string>();
  for (let dz = -r - 1; dz <= r + 1; dz++) for (let dx = -r - 1; dx <= r + 1; dx++) {
    ensureChunk(world, ccx + dx, ccz + dz);
    if (Math.abs(dx) <= r && Math.abs(dz) <= r) keys.add(chunkKey(ccx + dx, ccz + dz));
  }
  return keys;
}

test('streaming: ground cover with a budget places new chunks over several updates, keeps the old mesh meanwhile, and ends with the same pieces', () => {
  const world = createWorld(1337, GENERATOR_V2);
  const loaded = loadAround(world, 220, -110, 3);
  const all = new GroundCoverView(world);
  all.update({ x: 220, z: -110 }, loaded);
  const sliced = new GroundCoverView(world, { budgetMs: 0 });
  let updates = 0, rebuilt = false;
  while (!rebuilt && updates < 50) { rebuilt = sliced.update({ x: 220, z: -110 }, loaded); updates++; if (!rebuilt) assert.ok(sliced.deferred > 0); }
  assert.ok(rebuilt);
  assert.ok(updates > 2, `placed over ${updates} updates (one chunk each)`);
  assert.deepEqual(sliced.metrics(), { ...all.metrics(), rebuilds: 1 });
  assert.equal((sliced.mesh.geometry.attributes.position.array as Float32Array).join(), (all.mesh.geometry.attributes.position.array as Float32Array).join());
  // The written-out piece transform matches the Matrix4 compose path it replaced.
  const cache = (all as unknown as { cache: Map<string, { pieces: Array<{ x: number; y: number; z: number; rot: number; scale: number; model: string }> }> }).cache;
  const r2 = all.radius ** 2;
  const ref: number[] = [], refN: number[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (let cz = worldToChunkZ(Math.floor(-110 - all.radius)); cz <= worldToChunkZ(Math.floor(-110 + all.radius)); cz++) {
    for (let cx = worldToChunkX(Math.floor(220 - all.radius)); cx <= worldToChunkX(Math.floor(220 + all.radius)); cx++) {
      for (const p of cache.get(chunkKey(cx, cz))?.pieces ?? []) {
        if ((p.x - 220) ** 2 + (p.z + 110) ** 2 > r2) continue;
        m.compose(v.set(p.x, p.y, p.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot), new THREE.Vector3().setScalar(p.scale));
        nm.getNormalMatrix(m);
        const g = coverGeometry(p.model);
        const gp = g.attributes.position.array as Float32Array, gn = g.attributes.normal.array as Float32Array;
        for (let i = 0; i < gp.length; i += 3) {
          v.set(gp[i], gp[i + 1], gp[i + 2]).applyMatrix4(m); ref.push(v.x, v.y, v.z);
          v.set(gn[i], gn[i + 1], gn[i + 2]).applyMatrix3(nm).normalize(); refN.push(v.x, v.y, v.z);
        }
      }
    }
  }
  const pos = all.mesh.geometry.attributes.position.array as Float32Array, nrm = all.mesh.geometry.attributes.normal.array as Float32Array;
  assert.equal(pos.length, ref.length);
  let worst = 0;
  for (let i = 0; i < ref.length; i++) worst = Math.max(worst, Math.abs(pos[i] - ref[i]), Math.abs(nrm[i] - refN[i]));
  assert.ok(worst < 1e-4, `largest difference ${worst}`);
});

test('streaming: ground cover reads trunk clearance live from the chunk entity index, with the same pieces as indexing every entity', () => {
  const world = createWorld(1337, GENERATOR_V2);
  const keys = loadAround(world, 220, -110, 2);
  const lazy = coverExclusions(world);
  const eager = new Map<string, Array<{ x: number; z: number; r: number }>>();
  for (const e of world.entities.values()) {
    const list = eager.get(e.chunk) ?? [];
    list.push({ x: e.x, z: e.z, r: (OBSTRUCTION_RADIUS as Record<string, number>)[e.kind] ?? 1 });
    eager.set(e.chunk, list);
  }
  const old = { ...lazy, entities: { get: (k: string) => eager.get(k), clear: () => {} } };
  let pieces = 0;
  for (const key of keys) {
    const [cx, cz] = key.split(',').map(Number);
    const a = groundCoverChunk(world.seed, cx, cz, world.chunks.get(key)!, lazy);
    assert.deepEqual(a, groundCoverChunk(world.seed, cx, cz, world.chunks.get(key)!, old), key);
    pieces += a.length;
  }
  assert.ok(pieces > 300, `${pieces}`);
});

test('streaming: the padded volume for worker meshing is built by row copies and matches the per-cell version byte for byte (world edge included)', () => {
  const world = createWorld(1337, GENERATOR_V2);
  for (const [cx, cz] of [[31, 32], [0, 0], [63, 5], [10, 63]]) {
    const chunk = ensureChunk(world, cx, cz)!;
    assert.deepEqual(paddedFor(world, chunk), paddedForReference(world, chunk), `${cx},${cz}`);
  }
});

test('streaming: macro LOD arrays (the worker job) give the same tiles as the synchronous build', () => {
  const world = createWorld(1337, GENERATOR_V2);
  const opts = { step: 8, hole: { minX: -128, maxX: 96, minZ: -96, maxZ: 128 }, focus: { x: -18, z: 10 } };
  const sync = buildMacroMesh(world, opts);
  const { sample } = macroSampleFor(world, 8);
  const grid = { N: sample.N, heights: sample.heights.slice(), tops: sample.tops.slice(), underwater: sample.underwater.slice() };
  const a = buildMacroArrays(grid, world.seed, opts);
  const { meshes, triangles } = macroMeshesFromArrays(a, new THREE.MeshBasicMaterial());
  assert.equal(triangles, sync.triangles);
  assert.deepEqual(meshes.map((m) => m.name), sync.meshes.map((m) => m.name));
  assert.deepEqual(meshes.map((m) => [m.geometry.drawRange.start, m.geometry.drawRange.count]), sync.meshes.map((m) => [m.geometry.drawRange.start, m.geometry.drawRange.count]));
  assert.deepEqual(Array.from(a.position), Array.from(sync.meshes[0].geometry.attributes.position.array as Float32Array));
  assert.ok(triangles > 10_000);
});

/** A worker pool stand-in: the real worker functions, resolved asynchronously. */
function fakePool(log: string[]) {
  return {
    size: 3, failed: false, inFlight: 0,
    generate(seed: number, version: number, cx: number, cz: number) { log.push('generate'); return Promise.resolve({ base: generateBaseChunk(seed, version, cx, cz), columns: computeBaseColumns(seed, version, cx, cz), ms: 1 }); },
    mesh(padded: Uint8Array, heights: Uint8Array, ox: number, oz: number, seed: number) { log.push('mesh'); return Promise.resolve({ arrays: meshPadded(padded, heights.slice(), ox, oz, seed), ms: 1 }); },
    macro(grid: Parameters<typeof buildMacroArrays>[0], seed: number, opts: Parameters<typeof buildMacroArrays>[2]) {
      log.push('macro');
      const g = { N: grid.N, heights: grid.heights.slice(), tops: grid.tops.slice(), underwater: grid.underwater.slice() };
      return Promise.resolve({ arrays: buildMacroArrays(g, seed, opts), ms: 1 });
    },
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

test('streaming: worker results wait for a frame and are applied within its budget; the macro LOD is rebuilt off the main thread while the old tiles stay', async () => {
  const world = createWorld(1337, GENERATOR_V2);
  const scene = new THREE.Scene();
  const view = new VoxelTerrainView(world, scene, { nearRadius: 2 });
  const focus = new THREE.Vector3(-150, 20, 10);
  view.preload(focus);
  const log: string[] = [];
  view.enableWorkers(fakePool(log) as never);
  view.streamBudgetMs = 0;
  const macroBefore = view.macroTriangleCount;
  // Walk 64 m west: new chunks are requested, and the macro is due (moved > 48 m).
  focus.x -= 64;
  view.update(focus);
  assert.ok(view.macroBuildPending, 'the macro build went to the worker');
  assert.ok(log.includes('macro'));
  assert.equal(view.macroTriangleCount, macroBefore, 'the old tiles are drawn until the new ones arrive');
  const sections: string[] = [];
  view.onSection = (name) => sections.push(name);
  let maxApplied = 0;
  for (let frame = 0; frame < 400 && (view.pendingChunkBuilds > 0 || view.readyQueue > 0); frame++) {
    await flush();
    const before = view.readyQueue;
    view.update(focus);
    // With a zero budget exactly one waiting result is applied per frame.
    const applied = before - (view.readyQueue - 0);
    maxApplied = Math.max(maxApplied, applied);
  }
  assert.equal(view.pendingChunkBuilds, 0);
  assert.equal(view.readyQueue, 0);
  assert.ok(!view.macroBuildPending);
  assert.ok(maxApplied <= 1, `at most one result per frame at a zero budget (${maxApplied})`);
  assert.ok(sections.includes('macroadopt') && sections.includes('chunkinstall') && sections.includes('chunkpad'));
  assert.notEqual(view.macroTriangleCount, macroBefore, 'the new macro tiles replaced the old');
  const ccx = worldToChunkX(Math.round(focus.x)), ccz = worldToChunkZ(Math.round(focus.z));
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) assert.ok(view.loadedChunkKeys.has(chunkKey(ccx + dx, ccz + dz)), `${dx},${dz} loaded`);
});

// ---------- problem 1: draw calls ----------

test('draw calls: near water is one merged mesh per 4x4-chunk region with every chunk\'s triangles', () => {
  const world = createWorld(1337, GENERATOR_V2);
  const keys = loadAround(world, -60, 0, 2);
  const geos: THREE.BufferGeometry[] = [];
  for (const key of keys) { const w = meshChunkWater(world, world.chunks.get(key)!); if (w) geos.push(w.geometry); }
  assert.ok(geos.length >= 2, `${geos.length} chunks with water near the river`);
  const merged = mergeWaterGeometries(geos);
  assert.equal(merged.index!.count, geos.reduce((a, g) => a + g.index!.count, 0));
  assert.equal(merged.attributes.position.count, geos.reduce((a, g) => a + g.attributes.position.count, 0));
  assert.deepEqual(Object.keys(merged.attributes).sort(), Object.keys(geos[0].attributes).sort());
  assert.equal(waterRegionKey(31, 32), '7,8');
  assert.equal(waterRegionKey(28, 35), '7,8');
  // In the view: one water mesh per region, not per chunk.
  const scene = new THREE.Scene();
  const view = new VoxelTerrainView(createWorld(1337, GENERATOR_V2), scene, { nearRadius: 3 });
  view.preload(new THREE.Vector3(-60, 10, 0));
  let waterMeshes = 0, chunkWater = 0;
  scene.traverse((o) => { if (o.name.startsWith('near_water_region_')) waterMeshes++; if (o.name.startsWith('water_chunk_')) chunkWater++; });
  assert.equal(chunkWater, 0);
  assert.equal(waterMeshes, view.waterRegionCount);
  assert.ok(waterMeshes >= 1 && waterMeshes <= 4, `${waterMeshes}`);
});

test('draw calls: the MagicBlock settlement props bake into one mesh per material with the same triangles and bounds', () => {
  const g = new THREE.Group();
  const add = (o: THREE.Object3D, x: number, z: number, ry = 0) => { o.position.set(x, 3, z); o.rotation.y = ry; g.add(o); };
  add(buildCottage({ width: 6, depth: 5, seed: 11 }), 6, -60, Math.PI);
  for (let i = 0; i < 12; i++) add(buildCrate(), i, -54);
  for (let i = 0; i < 8; i++) add(buildWoodpile(i + 1), 14, -54 + i, Math.PI / 2);
  for (let i = 0; i < 10; i++) add(buildFigure(VILLAGER_STYLE).root, 3 + i, -50, i * 0.4);
  g.updateMatrixWorld(true);
  let meshes = 0, tris = 0;
  const box = new THREE.Box3();
  g.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; meshes++; const n = m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; tris += n / 3;
    const c = m.geometry.clone().applyMatrix4(m.matrixWorld); c.computeBoundingBox(); box.union(c.boundingBox!); });
  const r = mergeStaticGroup(g, 'props');
  assert.equal(r.input, meshes);
  assert.ok(meshes >= 31, `${meshes} meshes before`);
  const mats = new Set(r.group.children.map((c) => ((c as THREE.Mesh).material as THREE.Material).uuid));
  assert.equal(r.output, mats.size, 'one mesh per material');
  assert.ok(r.output <= 3, `${r.output} meshes after`);
  let after = 0;
  const box2 = new THREE.Box3();
  r.group.updateMatrixWorld(true);
  for (const c of r.group.children) { const m = c as THREE.Mesh; after += m.geometry.attributes.position.count / 3; box2.union(m.geometry.boundingBox!); assert.ok(m.castShadow); }
  assert.equal(after, tris, 'no triangle lost');
  for (const k of ['x', 'y', 'z'] as const) {
    assert.ok(Math.abs(box.min[k] - box2.min[k]) < 1e-3 && Math.abs(box.max[k] - box2.max[k]) < 1e-3, `bounds ${k}`);
  }
  const chain = read('src/chain/chain-view.ts');
  assert.match(chain, /mergeStaticGroup\(staging, 'magicblock_props'\)/);
});
