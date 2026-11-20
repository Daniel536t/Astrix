// Performance measurement harness — M001 world foundation.
//
// Measures the running app under headless Chromium + SwiftShader. SwiftShader
// is software rasterisation: draw-call and triangle counts are meaningful,
// frame times are not representative of a real GPU. The JSON says so.
//
// Usage: node tools/measure.mjs <url> <out.json>
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const url = process.argv[2] ?? 'http://127.0.0.1:5173/?seed=1337&t=0.5&freeze=1&ui=0&debug=1';
const out = resolve(process.argv[3] ?? '/tmp/opencode/m001_measure.json');

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--enable-precise-memory-info',
  ],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('HeapProfiler.enable');

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
await page.waitForTimeout(800);

const cdpMetrics = async () => {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics.map(m => [m.name, m.value]));
};

// V8 heap plus ArrayBuffer backing stores. A forced GC removes collection
// noise, so repeated samples are comparable.
const heap = async () => {
  await cdp.send('HeapProfiler.collectGarbage');
  const usage = await cdp.send('Runtime.getHeapUsage');
  const m = await cdpMetrics();
  return {
    v8UsedMB: +(usage.usedSize / 1048576).toFixed(2),
    v8TotalMB: +(usage.totalSize / 1048576).toFixed(2),
    arrayBufferMB: +(usage.backingStorageSize / 1048576).toFixed(2),
    embedderMB: +(usage.embedderHeapUsedSize / 1048576).toFixed(2),
    nodes: m.Nodes,
    documents: m.Documents,
    layoutCount: m.LayoutCount,
    recalcStyleCount: m.RecalcStyleCount,
  };
};

const env = await page.evaluate(() => {
  const r = window.__probe.renderer;
  const gl = r.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    userAgent: navigator.userAgent,
    glVersion: gl.getParameter(gl.VERSION),
    glRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    devicePixelRatio,
    innerWidth,
    innerHeight,
  };
});

// ---- default view ----
const before = await heap();
const initial = await page.evaluate(() => {
  const r = window.__probe.renderer;
  return {
    calls: r.info.render.calls,
    tris: r.info.render.triangles,
    geometries: r.info.memory.geometries,
    textures: r.info.memory.textures,
    metrics: window.__metrics,
    initialPerf: window.__probe.terrainView?.streamPerf ?? null,
  };
});

// ---- frame pacing (SwiftShader, static scene) ----
const frameSamples = await page.evaluate(() => new Promise((resolve) => {
  const samples = [];
  let last = performance.now();
  function step(now) {
    samples.push(now - last);
    last = now;
    if (samples.length < 60) requestAnimationFrame(step);
    else resolve(samples);
  }
  requestAnimationFrame(step);
}));
const sorted = [...frameSamples].sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
const frameMs = {
  samples: sorted.length,
  p50: +pct(0.5).toFixed(2),
  p95: +pct(0.95).toFixed(2),
  max: +sorted[sorted.length - 1].toFixed(2),
  mean: +(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2),
};

const afterDefault = await heap();

// ---- streaming: move the near ring six chunks east and fill it ----
const streaming = await page.evaluate(() => {
  const tv = window.__probe.terrainView;
  const world = window.__world;
  if (!tv || !world) return { error: 'debug hooks unavailable' };
  tv.resetPerf();
  const start = { x: -24, z: -24 };
  const target = { x: 168, z: -24 };
  const genBefore = world.stats.generationMs;
  const chunksBefore = world.stats.chunksGenerated;
  const updates = [];
  const t0 = performance.now();
  for (let i = 0; i < 30; i++) {
    const u0 = performance.now();
    tv.update({ x: target.x, y: 20, z: target.z }, 'world');
    updates.push(+(performance.now() - u0).toFixed(2));
    if (tv.loadedChunks >= 49) break;
  }
  const totalMs = performance.now() - t0;
  return {
    start,
    target,
    loadedChunks: tv.loadedChunks,
    updates: updates.length,
    updateMs: +totalMs.toFixed(2),
    updateP50: +updates.sort((a, b) => a - b)[Math.floor(updates.length / 2)].toFixed(2),
    updateMax: +Math.max(...updates).toFixed(2),
    generationDeltaMs: +(world.stats.generationMs - genBefore).toFixed(2),
    chunksGeneratedDelta: world.stats.chunksGenerated - chunksBefore,
    perf: tv.streamPerf,
  };
});

// ---- macro LOD rebuilds: mode switch forces both resolutions ----
const macro = await page.evaluate(() => {
  const tv = window.__probe.terrainView;
  if (!tv) return { error: 'debug hooks unavailable' };
  tv.resetPerf();
  const target = { x: 168, y: 20, z: -24 };
  const t0 = performance.now();
  tv.update(target, 'map');
  const mapMs = performance.now() - t0;
  const t1 = performance.now();
  tv.update(target, 'world');
  const worldMs = performance.now() - t1;
  return {
    mapMs: +mapMs.toFixed(2),
    worldMs: +worldMs.toFixed(2),
    perf: tv.streamPerf,
  };
});

// ---- dirty-chunk remesh: 3x3 chunks around the target ----
const remesh = await page.evaluate(() => {
  const tv = window.__probe.terrainView;
  if (!tv) return { error: 'debug hooks unavailable' };
  tv.resetPerf();
  const t0 = performance.now();
  tv.rebuildAround(168, -24);
  return {
    totalMs: +(performance.now() - t0).toFixed(2),
    perf: tv.streamPerf,
  };
});

const afterStreaming = await heap();

const result = {
  capturedAt: new Date().toISOString(),
  url,
  viewport: '1600x900 @ 1x',
  environment: env,
  caveat: 'Headless Chromium with SwiftShader software rasterisation. Draw calls, triangles, chunk counts, generation and mesh times are measured. Frame times are software-rendering times and must not be read as GPU frame rates.',
  default: {
    calls: initial.calls,
    triangles: initial.tris,
    geometries: initial.geometries,
    textures: initial.textures,
    metrics: initial.metrics,
    initialPerf: initial.initialPerf,
    frameMs,
  },
  heap: {
    before,
    afterDefault,
    afterStreaming,
  },
  streaming,
  macro,
  remesh,
  errors,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2));
await browser.close();
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
