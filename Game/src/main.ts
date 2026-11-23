import * as THREE from 'three';
import './styles.css';
import {
  TimeState, advanceTime, surfaceAt, setVoxel, MAT,
  nearestHarvestable, WORLD_SIZE, CHUNK_SIZE, SEA_LEVEL, Entity, LATEST_GENERATOR_VERSION,
} from './sim/world';
import { VoxelTerrainView, ViewMode } from './render/terrain';
import { buildNoxelNature } from './render/nature';
import { buildNoxelSite, buildKit } from './render/noxel';
import { Sky, timeLabel } from './render/sky';
import { OrbitRig } from './render/camera';
import { M2Game } from './app/m2';
import { M2_PROJECTS } from './app/projects';
import { M002_LAYOUT } from './sim/m002';
import { FOUNDER_STOCKPILE } from './sim/economy';
import { FrameStats } from './app/perf';
import { ExploreController, INTERACT_REACH } from './app/explore';
import { FaunaView } from './render/fauna';
import { ChunkWorkerPool } from './render/chunk-pool';
import { buildVillageKitShowcase } from './render/village-kit';
import { LifeGame } from './app/life';
import { GameSession } from './app/session';
import { BrowserSaveStore } from './app/persistence';
import { SceneInspector } from './app/inspector';

// A startup failure would otherwise leave a blank canvas with no explanation.
window.addEventListener('error', (e) => {
  if (window.__ready) return;
  const hudEl = document.getElementById('hud');
  if (hudEl) hudEl.textContent = `ASTrix could not start: ${e.message}. Try reloading, or a browser with WebGL2.`;
});

const params = new URLSearchParams(location.search);
// An invalid URL parameter falls back to its default and is reported in the HUD.
const paramWarnings: string[] = [];
const num = (k: string, fallback: number, min?: number, max?: number, integer = false) => {
  if (!params.has(k)) return fallback;
  const text = params.get(k) ?? '';
  const value = text.trim() === '' ? NaN : Number(text);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value))
    || (min !== undefined && value < min) || (max !== undefined && value > max)) {
    const range = min !== undefined && max !== undefined ? ` from ${min} to ${max}` : '';
    paramWarnings.push(`ignored ?${k}= (must be a finite${integer ? ' integer' : ''} number${range})`);
    return fallback;
  }
  return value;
};

const seedText = (params.get('seed') ?? '').trim();
const seed = seedText === '' ? NaN : Number(seedText);
const seedValid = Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff;
if (params.has('seed') && !seedValid) {
  paramWarnings.push('ignored ?seed= (must be an integer from 0 to 4294967295)');
}
const worldSeed = params.has('seed') && seedValid ? seed : 1337;
const startT = num('t', 0.42, 0, 1);
const freeze = params.get('freeze') === '1';
const sceneMode = params.get('scene') ?? 'world';
const isKit = sceneMode === 'kit';
const isMap = sceneMode === 'map';
const noUi = params.get('ui') === '0';
// 7x7 near chunks (49 draws) keeps the default view under the 90-call target
// while the 8 m macro LOD covers everything beyond 112 m. The macro grid is
// cached per seed/step, so a 48 m rebuild pays for geometry, not resampling.
const nearRadius = num('radius', 3, 1, 8, true);
const action = params.get('action') ?? '';

const app = document.getElementById('app')!;
const hud = document.getElementById('hud')!;
const controls = document.getElementById('controls')!;
if (noUi) document.body.classList.add('clean');
if (isKit) document.body.classList.add('kit');
if (isMap) document.body.classList.add('map');

// ---- renderer ----
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(app.clientWidth, app.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const rig = new OrbitRig(renderer.domElement);

// Keep the drawing buffer and projection in step with the container, including
// mobile rotation and browser-chrome changes that fire no window resize.
function resizeRenderer(): void {
  const w = Math.max(1, app.clientWidth), h = Math.max(1, app.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h);
  rig.camera.aspect = w / h;
  rig.camera.updateProjectionMatrix();
}
window.addEventListener('resize', resizeRenderer);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resizeRenderer).observe(app);

// ---- world (sim layer) ----
const loadT0 = performance.now();
// New worlds use the latest terrain generator; ?generator=1 creates a classic
// v1 world. An existing save always restores on its own recorded generator.
const newWorldGenerator = num('generator', LATEST_GENERATOR_VERSION, 1, LATEST_GENERATOR_VERSION, true);
const store = new BrowserSaveStore(window.localStorage, worldSeed, newWorldGenerator);
// ?newworld=1 archives this seed's existing save (kept, not deleted) and starts
// a fresh world on the latest generator. The parameter is removed afterwards
// so a reload does not archive again.
let archivedNote = '';
if (params.get('newworld') === '1') {
  try {
    const keys = store.archiveCurrent();
    archivedNote = keys.length ? `previous save archived (${keys.length})` : '';
  } catch (error) { archivedNote = `archive failed: ${(error as Error).message}`; }
  params.delete('newworld');
  const q = params.toString();
  history.replaceState(null, '', location.pathname + (q ? `?${q}` : ''));
}
const loaded = store.load();
const session = loaded.session;
const world = session.world;
let persistenceMessage = archivedNote ? `${loaded.message} (${archivedNote})` : loaded.message;
const debugMutations = import.meta.env.DEV && params.get('debugMutations') === '1';
const sliceX = -42, sliceZ = -40;
const sliceY = surfaceAt(world, sliceX, sliceZ);
const kitX = 18, kitZ = 30;
const kitY = surfaceAt(world, kitX, kitZ);

// Reproducible inspection views: ?yaw=&pitch=&dist=&tx=&ty=&tz=
if (isKit) {
  rig.setView(
    num('yaw', 0, -360, 360), num('pitch', 40, 1, 89), num('dist', 38, 12, 1400),
    num('tx', kitX + 2, -1000, 1000), num('ty', kitY + 4, 0, 104), num('tz', kitZ, -1000, 1000)
  );
} else if (isMap) {
  rig.setView(
    num('yaw', 0, -360, 360), num('pitch', 89, 1, 89), num('dist', 3300, 12, 10000),
    num('tx', 0, -1000, 1000), num('ty', 8, 0, 104), num('tz', 0, -1000, 1000)
  );
} else {
  rig.setView(
    num('yaw', 38, -360, 360), num('pitch', 20, 1, 89), num('dist', 78, 12, 1400),
    num('tx', sliceX, -1000, 1000), num('ty', sliceY + 3, 0, 104), num('tz', sliceZ, -1000, 1000)
  );
}

const terrainView = new VoxelTerrainView(world, scene, {
  nearRadius,
  worldMacroStep: num('macro', 8, 1, 64, true),
  mapMacroStep: num('mapmacro', 8, 1, 64, true),
});

let natureDirty = true;
let natureInstances = 0;
// Stable root: inspector registration survives chunk and harvest rebuilds.
const natureGroup = new THREE.Group();
natureGroup.name = 'styl_nature';
scene.add(natureGroup);
let lifeGame: LifeGame | null = null;
let explore: ExploreController | null = null;

/** Switch between walking the founder (explore) and the settlement overview (builder). */
function toggleMode(force?: 'explore' | 'builder'): void {
  if (!explore) return;
  const next = force ?? (explore.active ? 'builder' : 'explore');
  if (next === 'explore') explore.enter(); else explore.exit();
  document.body.classList.toggle('explore', explore.active);
  document.body.classList.remove('show-build', 'show-life');
  // Narrow screens: walking shows the world drawer instead of the Settlement panel.
  if (explore.active && matchMedia('(max-width: 760px)').matches) {
    const worldDrawer = document.getElementById('world-drawer') as HTMLInputElement | null;
    if (worldDrawer) worldDrawer.checked = true;
  }
  const button = document.getElementById('mode-button');
  if (button) button.textContent = explore.active ? 'Builder view' : 'Walk';
}
let sceneInspector: SceneInspector | null = null;
let faunaDirty = true;
terrainView.onChunksChanged = () => { natureDirty = true; faunaDirty = true; };
// Living creatures (ambient tier) for the resident near chunks.
const fauna = isMap || isKit ? null : new FaunaView(world);
if (fauna) scene.add(fauna.group);
// Construction previews query the settlement envelope several times a second;
// keep it resident so chunk lifetime sweeps never thrash it.
for (const r of M002_LAYOUT.envelope) terrainView.pinRect(r.x0, r.z0, r.x1, r.z1);
terrainView.pinRect(FOUNDER_STOCKPILE.x - 4, FOUNDER_STOCKPILE.z - 4, FOUNDER_STOCKPILE.x + 4, FOUNDER_STOCKPILE.z + 4);

if (isMap) {
  terrainView.update(rig.target, 'map');
} else {
  terrainView.preload(rig.target);
}
// Streaming generation and meshing run in workers (?workers=0 disables them).
// Preload above stays synchronous so the first frame is complete.
let workerCount = 0;
if (!isMap && typeof Worker !== 'undefined' && params.get('workers') !== '0') {
  workerCount = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
  try { terrainView.enableWorkers(new ChunkWorkerPool(workerCount)); } catch { workerCount = 0; }
}
const initialLoadMs = performance.now() - loadT0;

function disposeObject(obj: THREE.Object3D): void {
  const seen = new Set<THREE.BufferGeometry>();
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh & { isBatchedMesh?: boolean; dispose?: () => void };
    if (mesh.isBatchedMesh) {
      mesh.dispose?.();
      return;
    }
    if (mesh.isMesh && mesh.geometry && !seen.has(mesh.geometry)) {
      seen.add(mesh.geometry);
      mesh.geometry.dispose();
    }
  });
}

function rebuildNature(): void {
  for (const child of natureGroup.children) disposeObject(child);
  natureGroup.clear();
  const result = buildNoxelNature(world, terrainView.loadedChunkKeys);
  // Map mode has no near chunks, so its hidden nature group is legitimately
  // empty. Avoid Three's variadic add() warning when handed an empty spread.
  if (result.group.children.length > 0) natureGroup.add(...result.group.children);
  natureGroup.visible = !isMap;
  natureInstances = result.instances;
  sceneInspector?.refreshTargets();
  natureDirty = false;
}

rebuildNature();

const siteGroup = new THREE.Group();
siteGroup.name = 'noxel_sites';
for (const site of world.sites) siteGroup.add(buildNoxelSite(site));
siteGroup.visible = !isMap;
scene.add(siteGroup);

// Provisional Noxel kit on a real voxel shelf.
let kitGroup: THREE.Group | null = null;
if (isKit) {
  kitGroup = new THREE.Group();
  kitGroup.name = 'noxel_integration_test';
  kitGroup.position.set(kitX, kitY, kitZ);
  for (const obj of buildKit()) kitGroup.add(obj);
  // Block-built village kit (inspection only; not simulation structures) on
  // a flat display platform beside the Noxel kit.
  const village = buildVillageKitShowcase();
  village.position.set(0, 1.2, -34);
  const platform = new THREE.Mesh(new THREE.BoxGeometry(34, 1.2, 30),
    new THREE.MeshLambertMaterial({ color: 0x8f8d84 }));
  platform.position.set(0, 0.6, -30);
  platform.receiveShadow = true;
  kitGroup.add(platform, village);
  scene.add(kitGroup);
}

// ---- light / time ----
const sky = new Sky(scene, renderer);
sky.fogScale = isMap ? 0 : 0.55;
const time: TimeState = { t: startT, dayLengthSec: 600, paused: freeze };
let speed = 1;
if (isMap) scene.fog = null;
sky.setFocus(rig.target);

// ---- actions (simulation owns the result) ----
let lastAction = paramWarnings.join(' · ');

function digAt(cx: number, cz: number, radius = 2, depth = 3): number {
  let edits = 0;
  for (let z = cz - radius; z <= cz + radius; z++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const sy = surfaceAt(world, x, z);
      for (let y = sy - 1; y >= sy - depth; y--) {
        if (setVoxel(world, x, y, z, MAT.AIR)) edits++;
      }
    }
  }
  terrainView.rebuildAround(cx, cz);
  return edits;
}

function placeAt(cx: number, cz: number): boolean {
  const sy = surfaceAt(world, cx, cz);
  const changed = setVoxel(world, cx, sy, cz, MAT.STONE);
  terrainView.rebuildAround(cx, cz);
  return changed;
}

function harvestNearest(deplete = false): Entity | null {
  // Explore mode gathers what the founder can reach; builder mode keeps the
  // overview's 40 m radius around the camera target.
  const ch = explore?.active ? explore.character : null;
  const e = ch ? nearestHarvestable(world, ch.x, ch.z, INTERACT_REACH + 1.5)
    : nearestHarvestable(world, rig.target.x, rig.target.z, 40);
  if (!e) return null;
  let total = 0;
  let resource = '';
  let lastSave: { ok: boolean; message: string } | null = null;
  do {
    const schema = session.journal.schema;
    // Schema-2 worlds retain their original build-only journal. Current worlds
    // accept natural harvests; never relabel a legacy command as schema 3.
    if (schema === 2) {
      lastAction = 'natural gathering is unavailable in this legacy build-only world';
      persistenceMessage = lastAction;
      return null;
    }
    const result = session.dispatch({
      schema, id: session.commandId('harvest', e.id), type: 'harvest', entityId: e.id,
      expectedRevision: world.revision,
    });
    if (!result.ok) {
      lastAction = `harvest rejected: ${result.reasons.join('; ')}`;
      persistenceMessage = lastAction;
      return null;
    }
    if (result.outcome.type !== 'harvest') {
      lastAction = 'harvest rejected: unexpected command outcome';
      persistenceMessage = lastAction;
      return null;
    }
    total += result.outcome.amount;
    resource = result.outcome.resource;
    if (!result.duplicate) lastSave = store.save(session);
    if (!deplete) break;
  } while (session.world.entities.get(e.id) && !session.world.entities.get(e.id)?.harvested);
  const saved = lastSave ?? { ok: false, message: '' };
  lastAction = `harvested ${total} ${resource} from ${e.kind.replace('styl_', '').replace(/_/g, ' ')}` +
    (session.world.entities.get(e.id)?.harvested ? ' (depleted)' : '');
  persistenceMessage = saved.ok ? saved.message
    : saved.message || persistenceMessage;
  natureDirty = true;
  return e;
}

function applyScriptedAction(): void {
  if ((action === 'dig' || action === 'both') && debugMutations) {
    // Development-only, deliberately outside normal accepted-command history.
    digAt(0, -18, 2, 3);
    lastAction = 'development-only excavation (not journaled)';
  }
  if (action === 'harvest' || (action === 'both' && debugMutations)) harvestNearest(true);

  rebuildNature();
}

// ---- on-screen movement (touch) ----
const padButtons = controls.querySelectorAll<HTMLButtonElement>('[data-pad]');
for (const b of padButtons) {
  const [x, z] = (b.dataset.pad ?? '0,0').split(',').map(Number);
  const press = (e: PointerEvent) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    rig.setPad(x, z);
  };
  const release = () => rig.clearPad();
  b.addEventListener('pointerdown', press);
  b.addEventListener('pointerup', release);
  b.addEventListener('pointercancel', release);
  b.addEventListener('lostpointercapture', release);
}
function gather(): void {
  if (!harvestNearest() && !lastAction.startsWith('harvest rejected')
    && !lastAction.startsWith('natural gathering is unavailable')) {
    lastAction = explore?.active ? 'nothing to gather within reach — walk up to a tree, shrub or ore'
      : 'no harvestable resource within 40 m';
  }
}
document.getElementById('gather-nearest')?.addEventListener('click', gather);
document.getElementById('jump-button')?.addEventListener('pointerdown', (e) => { e.preventDefault(); explore?.jump(); });
document.getElementById('mode-button')?.addEventListener('click', () => toggleMode());

for (const b of controls.querySelectorAll<HTMLButtonElement>('[data-zoom]')) {
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    rig.zoomBy(b.dataset.zoom === 'in' ? 0.85 : 1.18);
  });
}

if (isKit) {
  const panel = document.createElement('div');
  panel.id = 'kit-panel';
  panel.innerHTML =
    '<strong>VOXEL + NOXEL — INTEGRATION TEST</strong>' +
    '<span class="warn">PROVISIONAL · owner Noxel reference images not supplied</span>' +
    '<dl>' +
    '<dt>Post</dt><dd>1.2 × 4.8 × 1.2 m · 3 volumes · 0.4 m slab base</dd>' +
    '<dt>Wall panel</dt><dd>4.0 × 0.4 × 1.2 m foundation · 3.2 m storey · 0.3 m parapet</dd>' +
    '<dt>Gateway</dt><dd>6.0 m lintel · 4.8 m posts · two 1.6 m caps</dd>' +
    '<dt>Stair</dt><dd>4 × 0.3 m risers · 0.9 m treads · 2.0 m landing</dd>' +
    '<dt>Waystone</dt><dd>7.8 m · 8 volumes · forked landmark</dd>' +
    '</dl>' +
    '<p>Terrain: chunked 1 m voxel volume · 32 × 32 × 128 chunks · greedy 3D mesher. ' +
    'The shelf is authoritative voxel state, not a render-only plane.</p>';
  app.appendChild(panel);
}

if (isMap) {
  const north = document.createElement('div');
  north.id = 'map-north';
  north.textContent = 'N ↑';
  app.appendChild(north);
  const panel = document.createElement('div');
  panel.id = 'map-panel';
  panel.innerHTML =
    '<strong>WORLD MAP — 2048 × 2048 m</strong>' +
    '<p>N ↑ · Founder valley (centre) · Eastwood forest (E) · Crown highlands (NW) · Mirror lake (NW) · river to the sea · broken coast all round. ' +
    '1 m voxels near the player; 8 m macro LOD for this map.</p>';
  app.appendChild(panel);
}

// ---- HUD / metrics ----
let m2Game: M2Game | null = null;

const frameWork = new FrameStats();
const frameInterval = new FrameStats();
let lastFrameAt = 0;

function metrics() {
  let edits = 0;
  for (const m of world.edits.values()) edits += m.size;
  let harvested = 0;
  for (const e of world.entities.values()) if (e.harvestedOnce) harvested++;
  return {
    seed: worldSeed,
    generatorVersion: world.params.generatorVersion,
    worldSize: WORLD_SIZE,
    chunkSize: CHUNK_SIZE,
    nearRadius,
    seaLevel: SEA_LEVEL,
    loadedChunks: terrainView.loadedChunks,
    residentChunks: terrainView.residentChunks,
    pendingChunkBuilds: terrainView.pendingChunkBuilds,
    sweptChunks: terrainView.evictedBySweep,
    chunkWorkers: terrainView.workerMetrics,
    frameWork: frameWork.report(),
    frameInterval: frameInterval.report(),
    cachedChunks: world.chunks.size,
    chunksGenerated: world.stats.chunksGenerated,
    generationMs: Math.round(world.stats.generationMs * 10) / 10,
    initialLoadMs: Math.round(initialLoadMs),
    entities: world.entities.size,
    trees: world.stats.trees,
    pinkTrees: world.stats.pinkTrees,
    pinkOverflow: world.stats.pinkOverflow,
    natureInstances,
    edits,
    harvested,
    inventory: { ...world.inventory },
    life: m2Game?.lifeMetrics() ?? null,
    structures: world.structures.size,
    m2: m2Game?.metrics() ?? null,
    nearTriangles: terrainView.nearTriangles,
    macroTriangles: terrainView.macroTriangleCount,
    rendererCalls: renderer.info.render.calls,
    rendererTriangles: renderer.info.render.triangles,
    rendererGeometries: renderer.info.memory.geometries,
    rendererTextures: renderer.info.memory.textures,
    streamPerf: terrainView.streamPerf,
    save: store.metrics(),
    harvestable: nearestHarvestable(world, rig.target.x, rig.target.z, 40)?.id ?? null,
    acceptedCommands: session.nextSequence,
    stateHash: session.stateHash,
    debugMutations,
    authority: 'local-stub / local-simulation-only',
    inspection: sceneInspector?.metrics() ?? null,
    lastAction,
    persistenceMessage,
    explore: explore?.metrics() ?? null,
    fauna: fauna?.metrics() ?? null,
  };
}
window.__metrics = metrics();

const timer = new THREE.Timer();
timer.connect(document);
let frames = 0;
const coarse = matchMedia('(pointer: coarse)').matches;

function frame(timestamp?: number) {
  const workStart = performance.now();
  if (lastFrameAt > 0) frameInterval.record(workStart - lastFrameAt);
  lastFrameAt = workStart;
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.1);
  advanceTime(time, dt * speed);
  rig.update(dt);
  explore?.update(dt);
  if (fauna) {
    if (faunaDirty) { fauna.sync(terrainView.loadedChunkKeys); faunaDirty = false; }
    const ch = explore?.active ? explore.character : null;
    if (!freeze) fauna.update(dt, { threats: ch ? [{ x: ch.x, z: ch.z }] : [], night: time.t < 0.2 || time.t > 0.82 });
    else fauna.update(0, { threats: [], night: false });
  }

  sky.setFocus(rig.target);
  sky.update(time.t);
  if (isMap) scene.fog = null;

  const mode: ViewMode = isMap ? 'map' : isKit ? 'kit' : 'world';
  terrainView.setWaterTime(freeze ? 0 : timer.getElapsed());
  terrainView.update(rig.target, mode);
  if (natureDirty && !isMap && frames % 2 === 0) rebuildNature();
  if (natureGroup) natureGroup.visible = !isMap;
  m2Game?.update(performance.now());
  sceneInspector?.update();

  renderer.render(scene, rig.camera);
  frameWork.record(performance.now() - workStart);

  if (frames % 6 === 0) {
    window.__metrics = metrics();
    if (!noUi && !isMap && !isKit) {
      const m = window.__metrics;
      const walking = !!explore?.active;
      const reach = walking && explore?.reachable
        ? `<b>E: gather ${explore.reachable.resource ?? ''} from ${explore.reachable.kind.replace('styl_', '').replace(/_/g, ' ')}</b> · ` : '';
      const hint = walking
        ? (coarse ? 'pad: walk · drag: look · Jump · Gather · Builder view'
          : 'WASD: walk · Shift: run · Space: jump · E: gather · drag: look · wheel: zoom · Tab: builder view · B/I: panels · P: pause')
        : coarse
          ? 'tap to inspect · drag: orbit · two fingers: move + zoom'
          : debugMutations
            ? 'DEV ONLY · click: inspect · F: dig · G: place · H: harvest · P: pause'
            : 'hover: identify · click: inspect · drag: orbit · WASD: pan · H: harvest · Tab: walk · P: pause';
      const persistence = m.save.persistent ? m.save.message
        : m.save.status === 'unavailable' ? `VOLATILE — ${m.save.message}` : m.save.message;
      const built = m.m2 ? `${m.m2.projectsBuilt}/${M2_PROJECTS.length} built` : '';
      hud.innerHTML =
        `<strong>ASTrix — Founder Settlement</strong> · seed ${worldSeed} · ${WORLD_SIZE} × ${WORLD_SIZE} m · 1 m voxels<br>` +
        `${timeLabel(time.t)} · ${time.paused ? 'paused' : 'day ' + Math.round(time.dayLengthSec) + 's'}` +
        ` · wood ${m.inventory.wood ?? 0} · stone ${m.inventory.stone ?? 0}` +
        ` · ${m.structures} structure${m.structures === 1 ? '' : 's'}${built ? ` (${built})` : ''}` +
        `<br><span class="dim">${reach}${lastAction ? lastAction + ' · ' : ''}${hint} · ${persistence}</span>`;
    }
  }

  frames++;
  if (frames === 3) window.__ready = true;
  requestAnimationFrame(frame);
}

// ---- input ----
window.addEventListener('keydown', (e) => {
  const target = e.target;
  // Capture before OrbitRig's listener so UI editing cannot also steer/zoom.
  // Canvas, body and other non-interactive game targets keep global shortcuts.
  // Escape belongs to the focused UI control (including the object inspector).
  // Do not suppress its delivery with stopImmediatePropagation. Other editing
  // keys stay isolated from camera/game shortcuts as before.
  if (e.key !== 'Escape' && target instanceof HTMLElement && !target.matches('canvas')
    && (target.isContentEditable || typeof target.getAttribute('contenteditable') === 'string'
      || target.matches('input, textarea, select, button, a[href], [contenteditable], [role="textbox"]')
      || target.closest('input, textarea, select, button, a[href], [contenteditable], [role="textbox"]'))) {
    e.stopImmediatePropagation();
    // Release a movement key that began on the canvas before focus moved here.
    window.dispatchEvent(new KeyboardEvent('keyup', { key: e.key }));
    return;
  }
  // Key map (documented in 00_Project_Core/Controls.md): P pauses time; Space
  // is jump in explore mode (handled by the explore controller).
  if (e.key === 'p' || e.key === 'P') time.paused = !time.paused;
  if (e.code === 'Space' && !explore?.active) e.preventDefault();
  if (e.key === 'Tab' && explore) { e.preventDefault(); toggleMode(); }
  if ((e.key === 'e' || e.key === 'E') && explore?.active) gather();
  if (e.key === 'b' || e.key === 'B') { document.body.classList.toggle('show-build'); document.body.classList.remove('show-life'); }
  if (e.key === 'i' || e.key === 'I') { document.body.classList.toggle('show-life'); document.body.classList.remove('show-build'); }
  if (e.key === '1') time.t = 0.22;
  if (e.key === '2') time.t = 0.50;
  if (e.key === '3') time.t = 0.78;
  if (e.key === '4') time.t = 0.00;
  if (e.key === ']') speed = Math.min(24, speed * 2);
  if (e.key === '[') speed = Math.max(0.25, speed / 2);
  if ((e.key === 'f' || e.key === 'F') && debugMutations) {
    digAt(Math.round(rig.target.x), Math.round(rig.target.z), 2, 3);
    lastAction = 'development-only excavation (not journaled)';
  }
  if ((e.key === 'g' || e.key === 'G') && debugMutations) {
    const changed = placeAt(Math.round(rig.target.x), Math.round(rig.target.z));
    lastAction = changed ? 'placed a stone voxel' : 'no voxel change';
  }
  if (e.key === 'h' || e.key === 'H') gather();
}, { capture: true });

if (action) applyScriptedAction();

if (!isMap) {
  sceneInspector = new SceneInspector({ world, scene, camera: rig.camera,
    canvas: renderer.domElement, terrain: terrainView.group });
  sceneInspector.addRoot(natureGroup);
  sceneInspector.addRoot(siteGroup);
  if (kitGroup) sceneInspector.addRoot(kitGroup);
}

if (!isMap && !isKit) {
  m2Game = new M2Game({ session, store, scene, terrainView, rig });
  lifeGame = new LifeGame({ session, store, scene, toast: (message, kind) => {
    lastAction = message;
    persistenceMessage = store.metrics().message || persistenceMessage;
    m2Game?.toast(message, kind);
  } });
  m2Game.setLifeController(lifeGame);
  sceneInspector?.addRoot(m2Game.inspectableRoot);
  sceneInspector?.addRoot(lifeGame.inspectableRoot);
  if (noUi) {
    m2Game.setVisible(false);
    lifeGame.setVisible(false);
    sceneInspector?.setVisible(false);
  }
  if (action === 'build' || action === 'all') m2Game.buildAll();

  // The founder character. Explore is the default way to play; scripted
  // evidence captures (action=, ui=0, explicit camera params) and ?mode=builder
  // start in the settlement overview.
  let storage: Storage | null = null;
  try { storage = window.localStorage; } catch { storage = null; }
  explore = new ExploreController({ world, scene, rig, storage, spawn: { x: -18, z: -18 } });
  const scripted = action !== '' || noUi || params.has('tx') || params.has('dist');
  const startMode = params.get('mode') ?? (scripted ? 'builder' : 'explore');
  if (startMode === 'explore') toggleMode('explore');
}

// Render-harness contract: renderer/camera are read-only handles for visual
// measurements. Normal/production simulation state is exposed only as metrics.
// Mutable inspection handles require a development build and explicit opt-in.
window.__probe = { renderer, camera: rig.camera };
if (import.meta.env.DEV && params.get('debug') === '1') {
  Object.assign(window.__probe, { THREE, terrainView });
  window.__scene = scene;
  window.__world = world;
}
requestAnimationFrame(frame);
