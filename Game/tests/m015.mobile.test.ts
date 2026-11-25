// M015 mobile verification: the opt-in performance monitor (?perf=1) and the
// graphics quality levels (?quality=, Settings). Both are presentation only:
// these tests pin the monitor's bucketing, thermal indicator and report
// format (pure functions), the quality presets and their mapping, and that
// neither changes simulation state hashes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GameSession } from '../src/app/session';
import {
  BASELINE_UNTIL_S, BUCKET_MS, BucketRecorder, HISTOGRAM_BINS, PerfBucket, THRESHOLDS, buildReport, parseSavedSession, percentile, reportText, sceneKey,
  summarizeFrames, thermalDrift,
} from '../src/app/perf-monitor';
import {
  FALLBACK_NATURE_NEAR, QUALITY_LEVELS, QUALITY_PRESETS, chooseQuality, natureNearFor, parseQuality, pixelRatioFor, resolveQuality,
} from '../src/app/quality';
import { DEFAULT_LOD_BANDS } from '../src/render/lod';
import { FALLBACK_LOD_BANDS, NatureView } from '../src/render/nature';
import { GROUND_COVER_RADIUS, GroundCoverView, groundCoverOffset } from '../src/render/ground-cover';
import { GENERATOR_V2, chunkKey, ensureChunk, worldToChunkX, worldToChunkZ } from '../src/sim/world';

// ---------- frame summaries ----------

test('perf: frame summary gives fps over the summed intervals, p50/p95 by nearest rank, and frames over 50 ms', () => {
  assert.deepEqual(summarizeFrames([]), { frames: 0, fps: 0, fpsP5: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, long50: 0 });
  const steady = summarizeFrames(new Array(120).fill(1000 / 60));
  assert.equal(steady.frames, 120);
  assert.equal(steady.fps, 60);
  assert.equal(steady.p95Ms, 16.7);
  assert.equal(steady.long50, 0);
  // 95 frames of 20 ms and 5 of 80 ms: p95 = 20 ms (rank 95), max 80, five long frames.
  const mixed = summarizeFrames([...new Array(95).fill(20), ...new Array(5).fill(80)]);
  assert.equal(mixed.p95Ms, 20);
  assert.equal(mixed.maxMs, 80);
  assert.equal(mixed.long50, 5);
  assert.equal(mixed.fps, Math.round((100 * 1000 / (95 * 20 + 5 * 80)) * 10) / 10);
  assert.equal(mixed.fpsP5, 50);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2);
  assert.equal(percentile([1, 2, 3, 4], 1), 4);
});

test('perf: 10 s buckets close on time; hidden time is reported as visibility; long gaps are not frames; a restored session continues its clock', () => {
  const ctx = { scene: 'walk:0,0:close', calls: 70, triangles: 120_000, heapMB: 80, battery: { level: 0.8, charging: false }, quality: 'medium', path: 'multi-draw' as const };
  const r = new BucketRecorder(1000);
  let now = 1000;
  const closed: PerfBucket[] = [];
  for (let i = 0; i < 1750; i++) { // 35 s at 50 fps
    now += 20;
    r.frame(20);
    const b = r.poll(now, () => ctx);
    if (b) closed.push(b);
  }
  assert.equal(closed.length, 3);
  assert.deepEqual(closed.map((b) => b.t), [0, 10, 20]);
  for (const b of closed) {
    assert.equal(b.dur, 10);
    assert.equal(b.fps, 50);
    assert.equal(b.frames, 500);
    assert.equal(b.visible, 1);
    assert.equal(b.calls, 70);
    assert.equal(b.battery, 0.8);
    assert.equal(b.charging, false);
  }
  // Half of the next bucket hidden; the 6 s gap on return is not counted as a frame.
  // The open bucket started at 31 s (now is 36 s): hidden from 34 s to 39 s, closed at 41 s.
  r.visibility(false, now - 2000);
  r.visibility(true, now + 3000);
  r.frame(6000);
  r.frame(20);
  const b = r.close(now + 5000, ctx);
  assert.equal(b.visible, 0.5);
  assert.equal(b.frames, 251, "250 frames before the gap and one after; the 6 s gap is skipped");
  assert.equal(r.sessionPercentile(0.5), 21);
  // Restored after a reload: the clock continues from the saved buckets.
  const again = new BucketRecorder(50_000, r.buckets);
  const next = again.close(50_000 + BUCKET_MS, ctx);
  assert.equal(next.t, 40);
  assert.equal(next.i, 4);
  assert.equal(again.sessionSeconds(50_000 + 5000), 45);
  // A reload loses the open bucket: the saved clock (here 47 s) wins over the last bucket's end.
  const later = new BucketRecorder(90_000, again.buckets, 57);
  assert.equal(later.sessionSeconds(90_000), 57);
  assert.equal(later.close(90_000 + BUCKET_MS, ctx).t, 57);
  // Frame times over 1 s land in the last histogram bin.
  const slow = new BucketRecorder(0);
  slow.frame(1500); slow.frame(1500);
  assert.equal(slow.sessionPercentile(0.5), HISTOGRAM_BINS);
});

test('perf: scene key groups the same mode, 48 m cell and zoom band', () => {
  assert.equal(sceneKey({ mode: 'walk', x: -18, z: -18, distance: 9 }), 'walk:-1,-1:close');
  assert.equal(sceneKey({ mode: 'walk', x: -30, z: -40, distance: 12 }), 'walk:-1,-1:close');
  assert.equal(sceneKey({ mode: 'builder', x: 220, z: -110, distance: 50 }), 'builder:4,-3:mid');
  assert.equal(sceneKey({ mode: 'builder', x: 0, z: 0, distance: 600 }), 'builder:0,0:far');
});

const bucket = (t: number, fps: number, scene = 'walk:-1,-1:close', visible = 1): PerfBucket => ({
  i: t / 10, t, dur: 10, visible, frames: fps * 10, fps, fpsP5: fps * 0.8, p50Ms: 1000 / fps, p95Ms: 1250 / fps, maxMs: 2000 / fps, long50: fps < 25 ? 3 : 0,
  scene, calls: 70, triangles: 130_000, heapMB: 90, battery: 0.9 - t / 36000, charging: false, quality: 'medium', path: 'multi-draw',
});

test('perf: thermal drift compares later buckets with the first two minutes in the same scene', () => {
  const base = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110].map((t) => bucket(t, t < 20 ? 20 : 60));
  // No revisit yet: unknown, with a hint.
  assert.equal(thermalDrift(base).status, 'unknown');
  assert.equal(thermalDrift([]).status, 'unknown');
  // Walking elsewhere, then back at the farm 20 min later at 42 fps: 30 % drift, throttling.
  const later = [...base, ...[120, 130, 140].map((t) => bucket(t, 30, 'walk:3,2:close')), ...[1200, 1210, 1220].map((t) => bucket(t, 42))];
  const d = thermalDrift(later);
  assert.equal(d.scene, 'walk:-1,-1:close');
  assert.equal(d.baselineFps, 60, 'the first 20 s (loading) are not part of the baseline');
  assert.equal(d.laterFps, 42);
  assert.equal(d.driftPct, 30);
  assert.equal(d.status, 'throttling');
  // Small drift is ok; 10-25 % is warming; hidden buckets are ignored.
  assert.equal(thermalDrift([...base, bucket(1200, 58)]).status, 'ok');
  assert.equal(thermalDrift([...base, bucket(1200, 50)]).status, 'warming');
  assert.equal(thermalDrift([...base, bucket(1200, 10, 'walk:-1,-1:close', 0.3)]).status, 'unknown');
  assert.ok(BASELINE_UNTIL_S === 120);
});

const device = {
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36', platform: 'Android',
  screen: { width: 1536, height: 960, availWidth: 1536, availHeight: 960, orientation: 'landscape-primary' }, viewport: { width: 1536, height: 864 }, dpr: 2,
  hardwareConcurrency: 8, deviceMemory: 8, gpu: 'Adreno (TM) 740', gpuVendor: 'Qualcomm', webgl2: true, multiDrawSupported: true, maxTextureSize: 16384, touch: true,
};
const render = { path: 'multi-draw' as const, quality: 'medium', qualitySource: 'auto', qualityReasons: ['touch device'], pixelRatio: 1.5, canvas: { width: 2304, height: 1296 } };

test('perf: the report carries build, device, render path, summary, thermal result, checks against the proposed thresholds, and a short text summary', () => {
  const buckets = [...Array.from({ length: 12 }, (_, i) => bucket(i * 10, i < 2 ? 25 : 55)), ...Array.from({ length: 110 }, (_, i) => bucket(120 + i * 10, 50, i % 3 ? 'walk:2,0:close' : 'walk:-1,-1:close'))];
  const r = buildReport({ build: { commit: 'abc1234', dirty: false, bundle: 'index-X.js', url: 'https://astrix.nyc.boxd.sh/?perf=1' }, device, render,
    startedAt: '2026-11-25T10:00:00.000Z', createdAt: '2026-11-25T10:21:00.000Z', buckets, events: [{ t: 0, kind: 'start' }, { t: 600, kind: 'mark', detail: 'owner mark' }] });
  assert.equal(r.kind, 'astrix-perf-report');
  assert.equal(r.version, 1);
  assert.equal(r.durationS, 1220);
  assert.equal(r.summary.buckets, 122);
  assert.equal(r.summary.medianFps, 50);
  assert.equal(r.summary.maxCalls, 70);
  assert.equal(r.summary.battery.first, 0.9);
  assert.ok(r.summary.battery.dropPctPerHour! > 9 && r.summary.battery.dropPctPerHour! < 11, String(r.summary.battery.dropPctPerHour));
  assert.equal(r.thermal.status, 'ok');
  assert.equal(r.checks.medianFps.ok, true);
  assert.equal(r.checks.frameP95.ok, true);
  assert.equal(r.checks.thermalDrift.ok, true);
  assert.equal(r.checks.sessionLength.ok, true);
  assert.equal(r.checks.medianFps.threshold, `>= ${THRESHOLDS.medianFps} fps`);
  const text = reportText(r);
  for (const want of ['build abc1234 (index-X.js)', 'Android 14', 'GPU: Adreno (TM) 740', 'Render: multi-draw · quality medium', 'FPS: median 50', 'Thermal: ok', 'Checks: median fps PASS']) {
    assert.ok(text.includes(want), `${want} in\n${text}`);
  }
  assert.ok(text.split('\n').length <= 12 && text.length < 2000, 'short enough to paste');
  // The JSON survives a round trip unchanged (what Download and Copy produce).
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
  // A slow device fails the fps and frame-time checks; an empty session has no verdict.
  const slow = buildReport({ build: r.build, device, render, startedAt: '', createdAt: '', buckets: buckets.map((b) => ({ ...b, fps: 22, p95Ms: 70 })), events: [] });
  assert.equal(slow.checks.medianFps.ok, false);
  assert.equal(slow.checks.frameP95.ok, false);
  const empty = buildReport({ build: r.build, device, render, startedAt: '', createdAt: '', buckets: [], events: [] });
  assert.equal(empty.checks.medianFps.ok, null);
  assert.equal(empty.thermal.status, 'unknown');
  assert.ok(reportText(empty).includes('Thermal: unknown'));
});

test('perf: the saved session (sessionStorage) is versioned and rejects anything else', () => {
  assert.equal(parseSavedSession(null), null);
  assert.equal(parseSavedSession('{bad'), null);
  assert.equal(parseSavedSession(JSON.stringify({ version: 99, startedAt: 'x', buckets: [] })), null);
  const s = parseSavedSession(JSON.stringify({ version: 1, startedAt: 'x', buckets: [bucket(0, 60)] }));
  assert.equal(s?.buckets.length, 1);
  assert.deepEqual(s?.events, []);
});

// ---------- quality levels ----------

test('quality: high is the pre-M015 renderer exactly; medium and low only lower presentation settings', () => {
  const h = QUALITY_PRESETS.high, m = QUALITY_PRESETS.medium, l = QUALITY_PRESETS.low;
  assert.deepEqual(QUALITY_LEVELS, ['low', 'medium', 'high']);
  assert.equal(h.pixelRatioCap, 2);
  assert.equal(h.antialias, true);
  assert.equal(h.shadows, true);
  assert.equal(h.shadowMapSize, 2048);
  assert.equal(h.natureNear, DEFAULT_LOD_BANDS.near);
  assert.equal(h.groundCoverRadius, GROUND_COVER_RADIUS);
  assert.equal(natureNearFor(h, false), FALLBACK_LOD_BANDS.near, 'the multidraw=0 fallback keeps its M014 70 m band at high');
  assert.equal(FALLBACK_NATURE_NEAR, FALLBACK_LOD_BANDS.near);
  for (const [a, b] of [[l, m], [m, h]] as const) {
    assert.ok(a.pixelRatioCap <= b.pixelRatioCap && a.natureNear <= b.natureNear && a.groundCoverRadius <= b.groundCoverRadius && a.shadowMapSize <= b.shadowMapSize);
  }
  assert.deepEqual({ ...m }, { level: 'medium', pixelRatioCap: 1.5, antialias: true, shadows: true, shadowMapSize: 1024, natureNear: 70, groundCoverRadius: 40 });
  assert.deepEqual({ ...l }, { level: 'low', pixelRatioCap: 1, antialias: false, shadows: false, shadowMapSize: 1024, natureNear: 50, groundCoverRadius: 30 });
  for (const p of [h, m, l]) assert.ok(natureNearFor(p, false) <= 70 && natureNearFor(p, true) === p.natureNear);
  // The mid band (130 m) is the same at every level: only full-detail distance changes.
  assert.equal(DEFAULT_LOD_BANDS.mid, 130);
  assert.equal(pixelRatioFor(h, 3), 2);
  assert.equal(pixelRatioFor(m, 2.625), 1.5);
  assert.equal(pixelRatioFor(m, 1), 1);
  assert.equal(pixelRatioFor(l, 3), 1);
  assert.equal(groundCoverOffset(-20, 30), Math.min(0, -20 + 30 - 8));
});

test('quality: parsing, precedence (URL, then the Settings choice, then auto) and the device heuristic', () => {
  assert.equal(parseQuality('LOW'), 'low');
  assert.equal(parseQuality(' high '), 'high');
  assert.equal(parseQuality('auto'), 'auto');
  assert.equal(parseQuality('ultra'), null);
  assert.equal(parseQuality(null), null);
  const strong = { touch: true, dpr: 2, hardwareConcurrency: 8, deviceMemory: 8, gpu: 'Adreno (TM) 740', multiDraw: true, screenShort: 960 };
  assert.equal(chooseQuality({ ...strong, touch: false }).level, 'high');
  assert.equal(chooseQuality(strong).level, 'medium');
  assert.equal(chooseQuality({ ...strong, hardwareConcurrency: 4 }).level, 'low');
  assert.equal(chooseQuality({ ...strong, deviceMemory: 2 }).level, 'low');
  assert.equal(chooseQuality({ ...strong, gpu: 'Mali-G52 MC2' }).level, 'low');
  assert.equal(chooseQuality({ ...strong, gpu: 'Mali-G710 MC10' }).level, 'medium');
  assert.equal(chooseQuality({ ...strong, gpu: 'Adreno (TM) 506' }).level, 'low');
  assert.equal(chooseQuality({ ...strong, gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' }).level, 'low');
  assert.equal(chooseQuality({ ...strong, multiDraw: false, dpr: 3 }).level, 'low');
  assert.equal(chooseQuality({ ...strong, multiDraw: false, dpr: 2 }).level, 'medium');
  assert.equal(chooseQuality({ ...strong, hardwareConcurrency: null, deviceMemory: null, gpu: null }).level, 'medium');
  let probed = 0;
  const caps = () => { probed++; return strong; };
  assert.deepEqual(resolveQuality('low', 'high', caps), { level: 'low', source: 'url', choice: 'low', reasons: ['?quality='] });
  assert.equal(resolveQuality(null, 'high', caps).source, 'saved');
  assert.equal(resolveQuality('auto', 'high', caps).level, 'medium', '?quality=auto ignores the saved choice');
  assert.equal(resolveQuality('bogus', 'low', caps).level, 'low');
  assert.equal(resolveQuality(null, 'auto', caps).source, 'auto');
  assert.equal(probed, 2, 'the device is only probed for auto');
});

// ---------- never changes state ----------

/** Resident chunks within `r` chunks of a point. */
function loadAround(s: GameSession, x: number, z: number, r: number): Set<string> {
  const keys = new Set<string>();
  const cx = worldToChunkX(x), cz = worldToChunkZ(z);
  for (let dz = -r - 1; dz <= r + 1; dz++) for (let dx = -r - 1; dx <= r + 1; dx++) {
    ensureChunk(s.world, cx + dx, cz + dz);
    if (Math.abs(dx) <= r && Math.abs(dz) <= r) keys.add(chunkKey(cx + dx, cz + dz));
  }
  return keys;
}

test('quality and perf never change state: the drawn nature and ground cover at every level leave hashes, revisions and entities as they were', () => {
  let n = 0;
  const run = (level: keyof typeof QUALITY_PRESETS | null) => {
    const s = GameSession.genesis(1337, GENERATOR_V2);
    const send = (c: Record<string, unknown>) => { const r = s.dispatch({ schema: 3, id: `m015:${n++}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never); assert.ok(r.ok, JSON.stringify(r)); };
    send({ type: 'found_homestead', rules: 6 });
    const h = s.world.homestead!;
    const loaded = loadAround(s, h.anchorX, h.anchorZ, 2);
    const before = { hash: s.stateHash, revision: s.world.revision, entities: s.world.entities.size };
    if (level) {
      const p = QUALITY_PRESETS[level];
      for (const multiDraw of [true, false]) {
        const view = new NatureView(s.world, { multiDraw, bands: { ...(multiDraw ? DEFAULT_LOD_BANDS : FALLBACK_LOD_BANDS), near: natureNearFor(p, multiDraw) } });
        view.build(loaded, { x: h.anchorX, y: 30, z: h.anchorZ });
        view.lod?.update({ x: h.anchorX + 40, y: 30, z: h.anchorZ });
      }
      const cover = new GroundCoverView(s.world, { radius: p.groundCoverRadius });
      cover.update({ x: h.anchorX, z: h.anchorZ }, loaded);
      assert.ok(cover.metrics().pieces > 0);
    }
    assert.deepEqual({ hash: s.stateHash, revision: s.world.revision, entities: s.world.entities.size }, before);
    for (let i = 0; i < 40; i++) send({ type: 'tick', ticks: 1 });
    return s.stateHash;
  };
  const plain = run(null);
  for (const level of QUALITY_LEVELS) assert.equal(run(level), plain, `${level}: same hash after 40 ticks`);
  assert.equal(GameSession.genesis(1337).stateHash, 'e659504b056654dc');
});

test('quality and perf never change state: no simulation, session or save module imports them', () => {
  const src = resolve(process.cwd(), 'src');
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
  walk(join(src, 'sim'));
  files.push(...['session.ts', 'persistence.ts', 'sim-clock.ts', 'homestead.ts', 'life.ts', 'm2.ts', 'explore.ts', 'build-mode.ts'].map((f) => join(src, 'app', f)));
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    assert.ok(!/from '\.\.?\/(app\/)?(perf-monitor|perf-overlay|quality|settings)'/.test(text), `${f} must not import the M015 presentation modules`);
  }
  const main = readFileSync(join(src, 'main.ts'), 'utf8');
  // The monitor reads renderer counters and frame times only; the URL flags reach no command.
  assert.ok(!/session\.dispatch\([^)]*(perf|quality)/.test(main));
  assert.match(main, /perfOverlay\?\.frame\(workStart\)/);
});
