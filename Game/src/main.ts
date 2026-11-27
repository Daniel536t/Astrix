import * as THREE from 'three';
import './styles.css';
import {
  TimeState, advanceTime, surfaceAt, setVoxel, MAT,
  nearestHarvestable, residentSurfaceAt, residentVoxelAt, WORLD_SIZE, CHUNK_SIZE, SEA_LEVEL, Entity, LATEST_GENERATOR_VERSION, WILDERNESS,
} from './sim/world';
import { WorldRegistry, WorldListState, showWorldList } from './app/worlds';
import { VoxelTerrainView, ViewMode } from './render/terrain';
import { NatureView, lodCounts } from './render/nature';
import { buildTreeShowcase } from './render/tree-showcase';
import { resolveInspection } from './app/inspection';
import { woodlandOf } from './sim/woodland';
import { TiledLodMesh, type LodSet } from './render/lod';
import { buildNoxelSite, buildKit } from './render/noxel';
import { Sky, shadowLead, timeLabel } from './render/sky';
import { OrbitRig, alongView, viewGroundOffset } from './render/camera';
import { M2Game } from './app/m2';
import { M2_PROJECTS } from './app/projects';
import { M002_LAYOUT } from './sim/m002';
import { FOUNDER_STOCKPILE } from './sim/economy';
import { FrameStats, SectionStats } from './app/perf';
import { BANNER_NAMES, ExploreController, INTERACT_REACH } from './app/explore';
import { FaunaView } from './render/fauna';
import { ChunkWorkerPool } from './render/chunk-pool';
import { SimClock, SaveScheduler, TabLease, TICK_SECONDS } from './app/sim-clock';
import { buildVillageKitShowcase } from './render/village-kit';
import { LifeGame } from './app/life';
import { GameSession } from './app/session';
import { BrowserSaveStore } from './app/persistence';
import { SceneInspector } from './app/inspector';
import { TouchControls } from './app/touch-controls';
import { VitalsHud } from './app/vitals-hud';
import { HomesteadGame } from './app/homestead';
import { DAY_TICKS, SPECIES_RULES, felledTrees, playerPresence } from './sim/homestead';
import { DynamicBody, HomesteadBodies, quantisePresence } from './sim/bodies';
import { CHARACTER_RADIUS } from './sim/character';
import type { Presence } from './sim/bodies';
import { buildAnimalShowcase } from './render/animal-showcase';
import { renderBreakdown } from './app/render-breakdown';
import { GroundCoverView, groundCoverOffset } from './render/ground-cover';
import { DEFAULT_LOD_BANDS } from './render/lod';
import { FALLBACK_LOD_BANDS } from './render/nature';
import { QUALITY_PRESETS, QUALITY_STORAGE_KEY, natureNearFor, parseQuality, pixelRatioFor, probeGpu, resolveQuality } from './app/quality';
import { PerfOverlay } from './app/perf-overlay';
import { mountSettings } from './app/settings';
import { mergeStaticGroup } from './render/static-merge';
import { FRAME_CAP_STORAGE_KEY, FrameLimiter, resolveFrameCap } from './app/frame-cap';
import { WildGame } from './app/wild-game';
import { withinSceneBudget } from './render/wild-buildings';

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
// A player's own MagicBlock world chooses the terrain seed when no ?seed= is given.
let guestSeed: number | null = null;
try {
  const g = JSON.parse(localStorage.getItem('astrix:guest:v1') ?? 'null');
  if (g && Number.isSafeInteger(g.seed) && g.seed >= 0 && g.seed <= 0xffffffff) guestSeed = g.seed;
} catch { guestSeed = null; }
const settlementSeed = params.has('seed') && seedValid ? seed : guestSeed ?? 1337;
// W1: the open world. The settlement (seed as above, save key unchanged) unless a
// local wilderness world was opened from the world list.
let worldStorage: Storage | null = null;
try { worldStorage = window.localStorage; } catch { worldStorage = null; }
const worldRegistry = new WorldRegistry(worldStorage);
const wild = worldRegistry.active();
const wilderness = !!wild;
if (wild && params.has('seed')) paramWarnings.push('?seed= is ignored in a wilderness world (its seed is fixed when it is made)');
const worldSeed = wild ? wild.seed : settlementSeed;
const worldList: WorldListState = { registry: worldRegistry, settlementSeed, current: wild ? wild.id : 'settlement' };
const startT = num('t', 0.42, 0, 1);
const freeze = params.get('freeze') === '1';
/**
 * M013 dev/testing time-lapse: `?timescale=N` (1-60) issues settlement ticks
 * N times as often, up to 8 per frame. Only the rate of ordinary one-tick
 * commands changes; the rules, each tick and the journal format are the same.
 */
const timescale = num('timescale', 1, 1, 60);
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

// ---- graphics quality (M015; presentation only) ----
// ?quality=low|medium|high|auto, else the Settings choice, else chosen from the device.
if (params.has('quality') && !parseQuality(params.get('quality'))) paramWarnings.push('ignored ?quality= (must be low, medium, high or auto)');
const coarsePointer = matchMedia('(pointer: coarse)').matches;
// M015 device report 1: in desktop-site mode the primary pointer read fine on one load and coarse on
// the next. The touch points and the GPU do not change between loads, so they decide too (quality.ts).
const anyCoarse = matchMedia('(any-pointer: coarse)').matches;
const maxTouchPoints = navigator.maxTouchPoints ?? 0;
let savedQuality: string | null = null;
try { savedQuality = localStorage.getItem(QUALITY_STORAGE_KEY); } catch { savedQuality = null; }
// Decided here, before the renderer exists, so the first frame already uses the level.
const quality = resolveQuality(params.get('quality'), savedQuality, () => {
  // Only devices with a touch screen need the GPU string (a throwaway context, released at once).
  const gpu = coarsePointer || anyCoarse || maxTouchPoints > 0 ? probeGpu() : null;
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { platform?: string } };
  return { touch: coarsePointer, maxTouchPoints, anyCoarse, platform: [navigator.platform, nav.userAgentData?.platform].filter(Boolean).join(' · ') || null,
    dpr: devicePixelRatio, hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemory: nav.deviceMemory ?? null, gpu: gpu?.gpu ?? null, multiDraw: gpu ? gpu.multiDraw : true,
    screenShort: Math.min(screen.width, screen.height) };
});
const preset = QUALITY_PRESETS[quality.level];
const perfOn = params.get('perf') === '1';
// M015 optional frame-rate cap: ?fps=0|30|60, else the Settings choice, else unlimited.
if (params.has('fps') && resolveFrameCap(params.get('fps'), null).source !== 'url') paramWarnings.push('ignored ?fps= (must be 0, 30 or 60)');
let savedCap: string | null = null;
try { savedCap = localStorage.getItem(FRAME_CAP_STORAGE_KEY); } catch { savedCap = null; }
const frameCap = resolveFrameCap(params.get('fps'), savedCap);
const limiter = new FrameLimiter(frameCap.cap);
/** Test harness: ?metrics=1 refreshes window.__metrics every frame instead of every 6th (read-only; for slow emulated runs). */
const metricsEveryFrame = params.get('metrics') === '1';

// ---- renderer ----
const renderer = new THREE.WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatioFor(preset, devicePixelRatio));
renderer.setSize(app.clientWidth, app.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = preset.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

// BatchedMesh draws one call per visible instance without WEBGL_multi_draw
// (some mobile GPUs). Vegetation then uses bounded merged tiles instead.
// ?multidraw=0 forces that fallback for testing.
const multiDrawSupported = renderer.extensions.has('WEBGL_multi_draw');
const multiDraw = params.get('multidraw') !== '0' && multiDrawSupported;
/** Trees, bushes and stone props: the quality level's full-detail distance on this render path. */
const natureBands = { ...(multiDraw ? DEFAULT_LOD_BANDS : FALLBACK_LOD_BANDS), near: natureNearFor(preset, multiDraw) };

const scene = new THREE.Scene();
const rig = new OrbitRig(renderer.domElement);

// Keep the drawing buffer and projection in step with the container, including
// mobile rotation and browser-chrome changes that fire no window resize.
function resizeRenderer(): void {
  const w = Math.max(1, app.clientWidth), h = Math.max(1, app.clientHeight);
  renderer.setPixelRatio(pixelRatioFor(preset, devicePixelRatio));
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
const store = wild
  ? new BrowserSaveStore(window.localStorage, worldSeed, wild.generatorVersion, { scenario: WILDERNESS, id: wild.id })
  : new BrowserSaveStore(window.localStorage, worldSeed, newWorldGenerator);
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
// The default view: the founder slice, or the wilderness spawn.
const sliceX = wild ? wild.spawn.x : -42, sliceZ = wild ? wild.spawn.z : -40;
if (wilderness) document.body.classList.add('wilderness');
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
/** M013: the drawn nature follows the world incrementally (chunk loads, growth, felling); full rebuilds only at start and on request. */
let natureView: NatureView | null = null;
let natureTargetsStale = false;
let natureTargetsAt = 0;
/** Full nature rebuilds so far (startup, scripted actions); LOD counters restart with each. */
let natureRebuilds = 0;
let natureInstances = 0;
// Distance LOD of trees, bushes and stone props (presentation only).
let natureLod: LodSet | null = null;
// Stable root: inspector registration survives chunk and harvest rebuilds.
const natureGroup = new THREE.Group();
natureGroup.name = 'styl_nature';
scene.add(natureGroup);
let lifeGame: LifeGame | null = null;
// Real-time settlement: one journaled tick every TICK_SECONDS of active play.
const simClock = new SimClock();
let realtimeNote = '';
const saveScheduler = new SaveScheduler(() => {
  const saved = store.save(session);
  persistenceMessage = saved.message;
});
let lsForLease: Storage | null = null;
try { lsForLease = window.localStorage; } catch { lsForLease = null; }
const lease = new TabLease(lsForLease, wild ? `astrix:lease:world:${wild.id}` : `astrix:lease:seed:${worldSeed}`);
let leaseCheckedAt = 0;
let lastSimAt = 0;
let felledSeen = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveScheduler.flush();
  else { simClock.reset(); lastSimAt = 0; }
});
window.addEventListener('pagehide', () => { saveScheduler.flush(); lease.release(); });
let explore: ExploreController | null = null;
let chainView: { metrics: () => Record<string, unknown> } | null = null;
let chainError = '';

/** Switch between walking the founder (explore) and the settlement overview (builder). */
function toggleMode(force?: 'explore' | 'builder'): void {
  if (!explore) return;
  const next = force ?? (explore.active ? 'builder' : 'explore');
  touch?.releaseAll();
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
let showcase: { group: THREE.Group; update: (dt: number) => void } | null = null;
let homesteadGame: HomesteadGame | null = null;
/** STAB-002 S2: the presence sent with the latest tick (metrics only). */
let lastPresence: Presence | null = null;
/** STAB-002 S2: capsules of farm animals and villagers from sim state, for the founder's contact (player-local physics). */
let contactBodies: HomesteadBodies | null = null;
/** The object inspector is a developer tool now: ?inspect=1 (also in the kit scene). */
const devInspect = params.get('inspect') === '1' || isKit;
let faunaDirty = true;
terrainView.onChunksChanged = () => { faunaDirty = true; };
// Living creatures (ambient tier) for the resident near chunks.
const fauna = isMap || isKit ? null : new FaunaView(world, TICK_SECONDS);
if (fauna) scene.add(fauna.group);
if (params.get('trees') === '1') {
  // M013 developer lineup: every species through every lifecycle stage (near LOD), north of the kit spot.
  const trees = buildTreeShowcase(kitX - 20, kitZ + 14, (x, z) => residentSurfaceAt(world, Math.floor(x), Math.floor(z)) ?? surfaceAt(world, Math.floor(x), Math.floor(z)));
  scene.add(trees.group);
}
if (params.get('animals') === '1') {
  showcase = buildAnimalShowcase(kitX, kitZ, (x, z) => residentSurfaceAt(world, Math.floor(x), Math.floor(z)) ?? surfaceAt(world, Math.floor(x), Math.floor(z)));
  scene.add(showcase.group);
}
// Construction previews query the settlement envelope several times a second;
// keep it resident so chunk lifetime sweeps never thrash it.
// (A wilderness world has no settlement envelope or founder stockpile.)
if (!wilderness) {
  for (const r of M002_LAYOUT.envelope) terrainView.pinRect(r.x0, r.z0, r.x1, r.z1);
  terrainView.pinRect(FOUNDER_STOCKPILE.x - 4, FOUNDER_STOCKPILE.z - 4, FOUNDER_STOCKPILE.x + 4, FOUNDER_STOCKPILE.z + 4);
}

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
  natureView = new NatureView(world, { multiDraw, bands: natureBands });
  natureView.build(terrainView.loadedChunkKeys, rig.camera.position);
  natureGroup.add(natureView.group);
  natureGroup.visible = !isMap;
  natureInstances = natureView.instances;
  natureLod = natureView.lod;
  natureRebuilds++;
  sceneInspector?.refreshTargets();
  natureDirty = false;
}

rebuildNature();

// Render-only grass, flowers, ferns, stones, logs and understory near the view.
const groundCover = isMap || isKit ? null : new GroundCoverView(world, { radius: preset.groundCoverRadius, budgetMs: 2 });
if (groundCover) scene.add(groundCover.group);
const coverFocus = new THREE.Vector3();

const siteGroup = new THREE.Group();
siteGroup.name = 'noxel_sites';
for (const site of world.sites) siteGroup.add(buildNoxelSite(site));
// M015: the waystones and markers never move; outside the object inspector they are one mesh
// (one draw in each pass instead of one per site in view).
if (!devInspect && siteGroup.children.length > 1) {
  const merged = mergeStaticGroup(siteGroup, 'noxel_sites_merged');
  siteGroup.clear();
  siteGroup.add(...merged.group.children);
}
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
sky.sun.castShadow = preset.shadows;
sky.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
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

/** M013: the tree within reach as the living woodland describes it ("the mature oak · age 3.2 days · 15 wood · may be felled"). */
function treeHint(e: Entity): string | null {
  if (!e.kind.startsWith('styl_tree_') || !woodlandOf(world)) return null;
  const info = resolveInspection(world, { entityId: e.id });
  if (!info) return null;
  const fact = (label: string) => info.facts.find((f) => f.label === label)?.value;
  return [`the ${info.name.toLowerCase()}`, fact('Stage'), fact('Timber'), fact('Woodland')].filter(Boolean).join(' · ');
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
  // The drawn nature follows through the world's change channel (no rebuild).
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

// ---- touch controls: joystick on the left half, look on the right, hold-buttons ----
const moveZone = document.getElementById('move-zone');
const touch = moveZone ? new TouchControls({
  zone: moveZone,
  setMove: (x, z, run) => rig.setPad(x, z, run),
  clearMove: () => rig.clearPad(),
  jumpButton: document.getElementById('jump-button'),
  diveButton: document.getElementById('dive-button'),
  onJump: (held) => explore?.setJumpHeld(held),
  onDive: (held) => explore?.setDiveHeld(held),
}) : null;
const vitals = noUi || isMap || isKit ? null : new VitalsHud();
/** W2: gathering, bag and hand crafting in a wilderness world. */
let wildGame: WildGame | null = null;
function gather(): void {
  if (wilderness) {
    if (wildGame) wildGame.use();
    else lastAction = 'nothing to gather here';
    return;
  }
  // In walk mode the Use button works the homestead first (water, dig, sow, harvest, feed...).
  if (explore?.active && homesteadGame?.useNearest()) return;
  if (!harvestNearest() && !lastAction.startsWith('harvest rejected')
    && !lastAction.startsWith('natural gathering is unavailable')) {
    lastAction = explore?.active ? 'nothing to gather within reach — walk up to a tree, shrub or ore'
      : 'no harvestable resource within 40 m';
  }
}
document.getElementById('gather-nearest')?.addEventListener('click', gather);
// Banner buttons (M009): act on the press, so a tap works while another finger is down.
const homeButton = document.getElementById('return-home-button');
const fieldButton = document.getElementById('return-banner-button');
const plantButton = document.getElementById('plant-banner-button');
for (const [el, run] of [
  [homeButton, () => explore?.startReturn('home')],
  [fieldButton, () => explore?.startReturn('field')],
  [plantButton, () => explore?.plantFieldBanner()],
] as const) {
  el?.addEventListener('pointerdown', (e) => { e.preventDefault(); run(); });
  el?.addEventListener('contextmenu', (e) => e.preventDefault());
}
/** Channel progress on the touch buttons; the field button dims until a banner is planted. */
function updateBannerButtons(): void {
  if (!explore) return;
  const target = explore.channel.target;
  const p = explore.channel.progress(performance.now());
  for (const [el, t] of [[homeButton, 'home'], [fieldButton, 'field']] as const) {
    if (!el) continue;
    const on = target === t;
    el.classList.toggle('channeling', on);
    el.style.setProperty('--p', on ? `${Math.round(p * 360)}deg` : '0deg');
  }
  fieldButton?.classList.toggle('empty', !explore.banners.field);
}
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
/**
 * M015: main-thread work per frame outside rendering: the frame loop minus the
 * render call, plus streaming work done in worker callbacks since the last
 * frame. Comparable across software and hardware GL.
 */
const frameUpdate = new FrameStats();
const sections = new SectionStats();
let inFrame = false;
let asyncStreamMs = 0;
terrainView.onSection = (name, ms) => { sections.record(name, ms); if (!inFrame) asyncStreamMs += ms; };
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
    frameUpdate: frameUpdate.report(),
    sections: sections.report(),
    cachedChunks: world.chunks.size,
    chunksGenerated: world.stats.chunksGenerated,
    generationMs: Math.round(world.stats.generationMs * 10) / 10,
    initialLoadMs: Math.round(initialLoadMs),
    entities: world.entities.size,
    trees: world.stats.trees,
    pinkTrees: world.stats.pinkTrees,
    pinkOverflow: world.stats.pinkOverflow,
    natureInstances,
    natureRebuilds,
    natureSync: natureView ? { ...natureView.stats } : null,
    timescale,
    vegetation: natureLod ? { ...lodCounts(natureLod), drawnTriangles: natureLod.drawnTriangles(),
      evaluations: natureLod.stats().evaluations, switches: natureLod.stats().switches,
      ...(natureLod instanceof TiledLodMesh ? { tileBuilds: natureLod.tileBuilds, meshBakes: natureLod.meshBakes, pendingBakes: natureLod.pendingBakes } : {}) } : null,
    edits,
    harvested,
    inventory: { ...world.inventory },
    life: m2Game?.lifeMetrics() ?? null,
    structures: world.structures.size,
    m2: m2Game?.metrics() ?? null,
    nearTriangles: terrainView.nearTriangles,
    nearDisplayedTriangles: terrainView.nearDisplayedTriangles,
    nearDisplayRadius: terrainView.displayRadiusChunks,
    displayedChunks: terrainView.displayedChunks,
    macroTriangles: terrainView.macroTriangleCount,
    macroVisibleTriangles: terrainView.macroVisibleTriangles,
    macroTilesInView: terrainView.macroTilesInView,
    viewAnchor: (() => {
      const near = viewGroundOffset(rig.camera, rig.target);
      return { nearGround: Math.round(near * 10) / 10, shadowLead: Math.round(shadowLead(near) * 10) / 10, coverOffset: Math.round(groundCoverOffset(near, preset.groundCoverRadius) * 10) / 10 };
    })(),
    groundCover: groundCover?.metrics() ?? null,
    multiDraw,
    quality: { level: quality.level, source: quality.source, reasons: quality.reasons, pixelRatio: renderer.getPixelRatio(), shadows: preset.shadows,
      shadowMapSize: preset.shadows ? preset.shadowMapSize : 0, antialias: preset.antialias, natureNear: natureBands.near, groundCoverRadius: preset.groundCoverRadius },
    frameCap: { cap: limiter.cap, source: frameCap.source },
    perf: perfOverlay?.metrics() ?? null,
    rendererCalls: renderer.info.render.calls,
    rendererTriangles: renderer.info.render.triangles,
    // W4: the frame against the scene budget (120 draw calls, 250k triangles).
    sceneBudget: withinSceneBudget(renderer.info.render.calls, renderer.info.render.triangles),
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
    realtime: { tickSeconds: TICK_SECONDS, issued: simClock.ticksIssued, leader: lease.isLeader, savePending: saveScheduler.pending, presence: lastPresence },
    fauna: fauna?.metrics() ?? null,
    chain: chainView?.metrics() ?? (chainError ? { error: chainError } : null),
    homestead: homesteadGame?.metrics() ?? null,
    wild: wildGame?.metrics() ?? null,
    touch: touch ? { stick: touch.stickActive, x: Math.round(touch.vector.x * 100) / 100, z: Math.round(touch.vector.z * 100) / 100, run: touch.vector.run } : null,
  };
}
// M015 opt-in performance monitor (?perf=1): reads frame timings and renderer counters only.
const perfOverlay: PerfOverlay | null = perfOn && !isMap && !isKit ? new PerfOverlay({
  renderer, multiDraw, multiDrawSupported, quality,
  build: typeof __ASTRIX_BUILD__ !== 'undefined' ? __ASTRIX_BUILD__ : { commit: 'dev', dirty: true },
  scene: () => ({ mode: explore?.active ? 'walk' : isMap || isKit ? 'other' : 'builder', x: rig.target.x, z: rig.target.z, distance: explore?.active ? rig.effectiveDistance : rig.distance }),
  counters: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
  frameCap: () => ({ cap: limiter.cap, source: frameCap.source }),
}) : null;
if (!noUi && !isMap && !isKit) {
  mountSettings({ current: quality, perfOn, frameCap, worlds: { current: wilderness ? `Wilderness ${wild!.id.slice(1)}` : 'Settlement', open: () => showWorldList(worldList) },
    ...(wilderness ? { map: { open: () => wildGame?.map.open(), shown: () => wildGame?.map.minimapShown ?? true, setShown: (on: boolean) => wildGame?.map.setMinimap(on) } } : {}),
    onFrameCap: (cap) => { limiter.set(cap); frameCap.cap = cap; frameCap.source = 'saved'; perfOverlay?.capChanged(cap); } });
}
// W1: ?worlds=1 opens the world list at start (also reachable from Settings → Worlds).
if (!noUi && !isMap && !isKit && params.get('worlds') === '1') showWorldList(worldList);
if (wilderness) document.title = 'ASTrix — Wilderness';

window.__metrics = metrics();

const timer = new THREE.Timer();
timer.connect(document);
let frames = 0;
const coarse = matchMedia('(pointer: coarse)').matches;

function frame(timestamp?: number) {
  // Frame-rate cap: skip this display frame entirely (no step, no render) until 1/cap s have passed.
  if (timestamp !== undefined && !limiter.shouldDraw(timestamp)) { requestAnimationFrame(frame); return; }
  const workStart = performance.now();
  inFrame = true;
  if (lastFrameAt > 0) frameInterval.record(workStart - lastFrameAt);
  lastFrameAt = workStart;
  timer.update(timestamp);
  // The first rAF timestamp can precede the direct first call, giving a
  // negative delta; never let time run backwards.
  const dt = Math.max(0, Math.min(timer.getDelta(), 0.1));
  advanceTime(time, dt * speed);
  rig.update(dt);
  explore?.update(dt);
  wildGame?.update();
  updateBannerButtons();
  // Real-time simulation. Freeze (evidence captures), pause, hidden tabs and
  // non-leader tabs do not advance settlement time.
  const nowMs = Date.now();
  if (nowMs - leaseCheckedAt > 2000) { lease.heartbeat(nowMs); leaseCheckedAt = nowMs; }
  const simActive = (!!lifeGame || wilderness) && !freeze && !time.paused && lease.isLeader
    && document.visibilityState === 'visible' && session.journal.schema === 3;
  // Wall-clock delta (the animation dt is clamped to 0.1 s, which would slow
  // settlement time on low frame rates). SimClock caps each step at one tick.
  const simDt = lastSimAt ? (nowMs - lastSimAt) / 1000 : 0;
  lastSimAt = nowMs;
  const dueTicks = timescale > 1 ? simClock.advanceMany(simDt * timescale, simActive, Math.min(8, Math.ceil(timescale))) : simClock.advance(simDt, simActive) ? 1 : 0;
  for (let k = 0; k < dueTicks; k++) {
    const tTick = performance.now();
    // STAB-002 S2: the player's quantised presence rides on the tick (rules v7, walking on the settlement grid only).
    lastPresence = lifeGame ? playerPresence(world, explore?.active ? explore.character : null, explore?.intent) : wildPresence();
    const r = lifeGame ? lifeGame.realtimeTick(lastPresence) : wildernessTick(lastPresence);
    sections.record('tick', performance.now() - tTick);
    // A villager felled a tree (rules v4): redraw nature from the entities, as after the player's harvest.
    // (M013: felled trees, stumps and growth reach the drawing incrementally through NatureView.sync.)
    felledSeen = felledTrees.get(world) ?? 0;
    if (r.ok) saveScheduler.markDirty(nowMs);
    else realtimeNote = `settlement time stopped: ${r.reasons.join('; ')}`;
  }
  // STAB-002 S2: the contact capsules start blending a new tick in the same frame as the drawn herd does.
  if (dueTicks && session.world.homestead) contactBodies?.observe(session.world.homestead, session.world.life?.tick ?? 0, performance.now());
  saveScheduler.poll(nowMs);
  // After the tick, so the drawn homestead (gate leaves, sites, loads) is never a frame behind the state it reports.
  const tHome = performance.now();
  homesteadGame?.update(dt);
  sections.record('homestead', performance.now() - tHome);
  realtimeNote = (!lifeGame && !wilderness) || session.journal.schema !== 3 ? ''
    : !lease.isLeader ? 'another tab is running this world — time paused here'
      : time.paused ? `${wilderness ? 'world' : 'settlement'} paused (P)` : realtimeNote.startsWith('settlement time stopped') ? realtimeNote
        : `${wilderness ? 'world' : 'settlement'} tick ${session.world.life?.tick ?? 0} · next in ${simClock.secondsToNext.toFixed(0)} s`;
  showcase?.update(dt);
  const tFauna = performance.now();
  if (fauna) {
    if (faunaDirty) {
      const tSync = performance.now();
      fauna.sync(terrainView.loadedChunkKeys); faunaDirty = fauna.pendingSpawn;
      sections.record('faunasync', performance.now() - tSync);
    }
    const ch = explore?.active ? explore.character : null;
    if (!freeze) fauna.update(dt, { threats: ch ? [{ x: ch.x, z: ch.z }] : [], night: time.t < 0.2 || time.t > 0.82 });
    else fauna.update(0, { threats: [], night: false });
  }
  sections.record('fauna', performance.now() - tFauna);

  // With a homestead, the sky follows settlement time so villagers sleep when it is dark.
  // W7: in a wilderness world with sim wildlife the sky follows world time too, so dawn, midday and night are the animals' own.
  const lifeTick = session.world.homestead || session.world.wild?.wildlife ? session.world.life?.tick : undefined;
  if (lifeTick !== undefined && !freeze) {
    const frac = Math.min(0.999, Math.max(0, 1 - simClock.secondsToNext / TICK_SECONDS));
    time.t = ((lifeTick + frac) / DAY_TICKS + 0.23) % 1;
  }
  sky.setFocus(rig.target);
  // Where the bottom screen edge meets the ground: the shadow box and ground
  // cover keep that nearest on-screen ground covered at long zoom.
  const nearGround = viewGroundOffset(rig.camera, rig.target);
  sky.setShadowView(rig.target, rig.camera.position, nearGround);
  sky.update(time.t);
  if (isMap) scene.fog = null;
  // Underwater: when the lens is inside water, visibility drops to a few metres.
  const cam = rig.camera.position;
  const camUnder = !isMap && residentVoxelAt(world, Math.floor(cam.x), Math.floor(cam.y), Math.floor(cam.z)) === MAT.WATER;
  if (camUnder) { sky.fog.color.set('#1E5F78'); sky.fog.density = 0.11; }
  vitals?.update(explore?.active ? explore.character : null, dt);

  const mode: ViewMode = isMap ? 'map' : isKit ? 'kit' : 'world';
  terrainView.setWaterTime(freeze ? 0 : timer.getElapsed());
  const tTerrain = performance.now();
  // Zoomed out, the drawn near ring shrinks (chunks stay loaded; presentation only).
  terrainView.setViewDistance(rig.distance);
  terrainView.update(rig.target, mode);
  terrainView.cullMacro(rig.camera);
  sections.record('terrain', performance.now() - tTerrain);
  if (natureView && !isMap) {
    // M013: incremental nature: newly loaded chunks a few at a time, felled, planted and grown trees in place.
    const tSync = performance.now();
    if (natureView.sync(terrainView.loadedChunkKeys, rig.camera.position)) natureTargetsStale = true;
    natureLod = natureView.lod;
    natureInstances = natureView.instances;
    sections.record('naturesync', performance.now() - tSync);
    if (natureTargetsStale && nowMs - natureTargetsAt > 1000) { natureTargetsStale = false; natureTargetsAt = nowMs; sceneInspector?.refreshTargets(); }
  }
  if (natureDirty && !isMap && frames % 2 === 0) {
    // Timed apart from 'vegetation' (band updates): a chunk load rebuilds the
    // whole nature set, which also re-bakes every fallback tile.
    const tRebuild = performance.now();
    rebuildNature();
    sections.record('naturerebuild', performance.now() - tRebuild);
  }
  const tVegetation = performance.now();
  // Throttled inside LodBatch: bands are re-evaluated only after the camera
  // moves 4 m, so a still camera costs one distance check per frame.
  if (natureLod && !isMap) natureLod.update(rig.camera.position);
  sections.record('vegetation', performance.now() - tVegetation);
  if (natureGroup) natureGroup.visible = !isMap;
  const tCover = performance.now();
  groundCover?.update(alongView(rig.target, rig.camera.position, groundCoverOffset(nearGround, preset.groundCoverRadius), coverFocus), terrainView.displayedChunkKeys);
  sections.record('groundcover', performance.now() - tCover);
  m2Game?.update(performance.now());
  sceneInspector?.update();

  const tRender = performance.now();
  renderer.render(scene, rig.camera);
  const renderMs = performance.now() - tRender;
  sections.record('render', renderMs);
  frameWork.record(performance.now() - workStart);
  frameUpdate.record(performance.now() - workStart - renderMs + asyncStreamMs);
  asyncStreamMs = 0;
  perfOverlay?.frame(workStart);

  if (frames % 6 === 0 || metricsEveryFrame) {
    window.__metrics = metrics();
    if (!noUi && !isMap && !isKit) {
      const m = window.__metrics;
      const walking = !!explore?.active;
      const work = walking ? homesteadGame?.nearest() : null;
      // W2: the wilderness prompts for the loose pickup in reach (trees are not harvested there).
      const wildPrompt = walking && wildGame ? wildGame.prompt(coarse) : '';
      const reach = work ? `<b>E: ${work.label}</b> · ` : wildPrompt ? `<b>${wildPrompt}</b> · ` : walking && !wilderness && explore?.reachable
        ? `<b>E: gather ${explore.reachable.resource ?? ''} from ${treeHint(explore.reachable) ?? explore.reachable.kind.replace('styl_', '').replace(/_/g, ' ')}</b> · ` : '';
      const useButton = document.getElementById('gather-nearest');
      const useLabel = work ? work.label : wilderness ? (wildGame ? wildGame.buttonLabel() : 'Pick up') : 'Gather';
      useButton?.classList.toggle('idle', wilderness && (!wildGame || wildGame.idle));
      if (useButton && useButton.textContent !== useLabel) { useButton.textContent = useLabel; useButton.classList.toggle('work', !!work); }
      const hint = wilderness
        ? (walking ? (coarse ? 'left thumb: walk (push to the rim to run) · right: drag to look, tap a tree to target it · Chop / Pick up: hold to keep swinging · Jump · Dive · Plant: mark this spot with your banner · Home: hold still to return to where you began'
          : 'WASD: walk · Shift: run · Space: jump · C: dive · E: pick up / chop / cut log / deliver (hold to keep swinging) · click a tree: target it · I: bag, crafting, stockpile · V: plant banner · R: return home · T: return to banner · drag: look · wheel: zoom · Tab: overview · P: pause')
          : coarse ? 'drag: orbit · two fingers: move + zoom' : 'drag: orbit · WASD: pan · Tab: walk · P: pause')
        : walking
        ? (coarse ? 'left thumb: walk (push to the rim to run) · right: drag to look · tap Jump twice to jump higher, hold to swim up · Dive · Plant: mark this spot with your banner · Home / To banner: hold still to return · Farm: fields, people, animals'
          : 'WASD: walk · Shift: run · Space: jump (tap twice to jump higher, hold to swim up) · C: dive · E: use / gather / open a gate · V: plant banner · R: return home · T: return to banner · F: plan a field · G: build · drag: look · wheel: zoom · Tab: builder view · B/I: panels · P: pause')
        : coarse
          ? 'drag: orbit · two fingers: move + zoom'
          : debugMutations
            ? 'DEV ONLY · F: dig · G: place · H: harvest · P: pause'
            : 'drag: orbit · WASD: pan · H: harvest · G: build · Tab: walk · P: pause';
      const channelTarget = explore?.channel.target;
      const channel = channelTarget ? `Returning to your ${BANNER_NAMES[channelTarget]} in ${explore!.channel.remaining(performance.now()).toFixed(1)} s · hold still` : '';
      const persistence = m.save.persistent ? m.save.message
        : m.save.status === 'unavailable' ? `VOLATILE — ${m.save.message}` : m.save.message;
      const built = m.m2 ? `${m.m2.projectsBuilt}/${M2_PROJECTS.length} built` : '';
      const carried = Object.entries(m.inventory as Record<string, number>).filter(([, n]) => n > 0);
      hud.innerHTML =
        (wilderness ? `<strong>ASTrix — Wilderness ${wild!.id.slice(1)}</strong> · local only · seed ${worldSeed}<br>`
          : `<strong>ASTrix — Founder’s Settlement</strong> <span class="demo-badge">DEMO</span> · seed ${worldSeed} · ${WORLD_SIZE} × ${WORLD_SIZE} m · 1 m voxels<br>`) +
        `${timeLabel(time.t)} · ${time.paused ? 'paused' : 'day ' + Math.round(time.dayLengthSec) + 's'}` +
        (realtimeNote ? ` · ${realtimeNote}` : '') +
        (wilderness ? ` · <span class="inv">${wildGame ? wildGame.summary() : `bag: ${carried.length ? carried.map(([k, n]) => `${k} ${n}`).join(', ') : 'empty'} · bare hands`}</span>`
          : ` · wood ${m.inventory.wood ?? 0} · stone ${m.inventory.stone ?? 0}` +
            ` · ${m.structures} structure${m.structures === 1 ? '' : 's'}${built ? ` (${built})` : ''}`) +
        (channel ? `<br><b class="returning">${channel}</b>` : '') +
        `<br><span class="dim">${reach}${lastAction ? lastAction + ' · ' : ''}${hint} · ${persistence}</span>`;
    }
  }

  frames++;
  if (frames === 3) window.__ready = true;
  inFrame = false;
  requestAnimationFrame(frame);
}

// ---- input ----
// W3: releasing E stops the repeated axe swings.
window.addEventListener('keyup', (e) => { if (e.key === 'e' || e.key === 'E') wildGame?.holdEnd(); });
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
  // M014 build mode takes Escape (close), X (turn) and Enter (place) while it is open.
  if (homesteadGame?.build.key(e)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  // W4: the wilderness Build menu (G) and its placement ghost (Escape, X, Enter).
  if (wildGame && explore?.active && wildGame.build.key(e)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  // W5: M opens and closes the wilderness map; Escape closes it.
  if (wildGame && (e.key === 'm' || e.key === 'M') && !e.repeat) { wildGame.map.toggle(); e.preventDefault(); return; }
  if (wildGame?.map.isOpen && e.key === 'Escape') { wildGame.map.close(); e.preventDefault(); return; }
  // Key map (documented in 00_Project_Core/Controls.md): P pauses time; Space
  // is jump in explore mode (handled by the explore controller).
  if (e.key === 'p' || e.key === 'P') time.paused = !time.paused;
  if (e.code === 'Space' && !explore?.active) e.preventDefault();
  if (e.key === 'Tab' && explore) { e.preventDefault(); toggleMode(); }
  if ((e.key === 'e' || e.key === 'E') && explore?.active) {
    // W3: in the wilderness E is held to keep swinging the axe.
    if (wilderness && wildGame) { if (!e.repeat) wildGame.holdStart(); } else gather();
  }
  if (e.key === 'b' || e.key === 'B') { document.body.classList.toggle('show-build'); document.body.classList.remove('show-life'); }
  if ((e.key === 'i' || e.key === 'I') && wildGame) wildGame.toggle();
  else if (e.key === 'i' || e.key === 'I') { document.body.classList.toggle('show-life'); document.body.classList.remove('show-build'); }
  if (e.key === '1') time.t = 0.22;
  if (e.key === '2') time.t = 0.50;
  if (e.key === '3') time.t = 0.78;
  if (e.key === '4') time.t = 0.00;
  if (e.key === ']') speed = Math.min(24, speed * 2);
  if (e.key === '[') speed = Math.max(0.25, speed / 2);
  if ((e.key === 'f' || e.key === 'F') && !debugMutations && explore?.active && homesteadGame) {
    homesteadGame.startPlanning();
  }
  if ((e.key === 'f' || e.key === 'F') && debugMutations) {
    digAt(Math.round(rig.target.x), Math.round(rig.target.z), 2, 3);
    lastAction = 'development-only excavation (not journaled)';
  }
  // M014: G opens build mode (choose a building, where it goes and which way it faces); G again closes it.
  if ((e.key === 'g' || e.key === 'G') && !debugMutations && homesteadGame) {
    if (homesteadGame.build.active) homesteadGame.build.close(); else homesteadGame.build.open();
  }
  if ((e.key === 'g' || e.key === 'G') && debugMutations) {
    const changed = placeAt(Math.round(rig.target.x), Math.round(rig.target.z));
    lastAction = changed ? 'placed a stone voxel' : 'no voxel change';
  }
  if (e.key === 'h' || e.key === 'H') gather();
}, { capture: true });

if (action) applyScriptedAction();

if (!isMap && devInspect) {
  sceneInspector = new SceneInspector({ world, scene, camera: rig.camera,
    canvas: renderer.domElement, terrain: terrainView.group });
  sceneInspector.addRoot(natureGroup);
  sceneInspector.addRoot(siteGroup);
  if (kitGroup) sceneInspector.addRoot(kitGroup);
}

if (!isMap && !isKit && !wilderness) {
  m2Game = new M2Game({ session, store, scene, terrainView, rig });
  lifeGame = new LifeGame({ session, store, scene, onSaved: () => saveScheduler.saved(Date.now()), toast: (message, kind) => {
    lastAction = message;
    persistenceMessage = store.metrics().message || persistenceMessage;
    m2Game?.toast(message, kind);
  } });
  m2Game.setLifeController(lifeGame);
  if (!noUi) {
    homesteadGame = new HomesteadGame({ session, store, scene,
      onSaved: () => saveScheduler.saved(Date.now()),
      toast: (message, kind) => { lastAction = message; m2Game?.toast(message, kind); },
      player: () => { const c = explore?.character; return c && !c.dead ? { x: c.x, z: c.z, heading: c.heading } : null; },
      camera: () => rig.camera, canvas: renderer.domElement });
  }
  sceneInspector?.addRoot(m2Game.inspectableRoot);
  sceneInspector?.addRoot(lifeGame.inspectableRoot);
  if (noUi) {
    m2Game.setVisible(false);
    lifeGame.setVisible(false);
    sceneInspector?.setVisible(false);
  }
  if (action === 'build' || action === 'all') m2Game.buildAll();
}

// MagicBlock Ephemeral Rollup panel (live ER ticks, cranks, VRF, delegation & Solana checkpoints).
// Loaded lazily in both Demo Settlement and Wilderness modes so players can always inspect MagicBlock
// state; in Wilderness mode only the UI panel mounts (no 3D settlement props). ?chain=0 disables it.
if (!isMap && !isKit && params.get('chain') !== '0' && !noUi) {
  import('./chain/chain-view').then(({ startChainView }) => {
    chainView = startChainView({ scene, origin: { x: 6, z: -60 },
      groundY: (x, z) => residentSurfaceAt(world, x, z) ?? surfaceAt(world, x, z), worlds: worldList, wilderness });
  }).catch((e) => { chainError = String(e).slice(0, 120); });
}

/** W1: one journaled world tick in a wilderness world (no settlement controller there). */
/**
 * W7 (wilderness content v8): the player's quantised presence rides on every wilderness tick while the character
 * is alive (walking or swimming): the wildlife is simulated around it and reacts to it. Older content sends none.
 */
function wildPresence(): Presence | null {
  const ch = explore?.active ? explore.character : null;
  if (!session.world.wild?.wildlife || !ch || ch.dead) return null;
  const intent = explore?.intent;
  const i = intent && Math.hypot(intent.x, intent.z) > 0.1 ? { x: intent.x * 4, z: intent.z * 4 } : { x: ch.vx, z: ch.vz };
  return quantisePresence(ch.x, ch.z, i.x, i.z);
}
function wildernessTick(presence: Presence | null): { ok: boolean; reasons: string[] } {
  const r = session.dispatch({ schema: 3, id: session.commandId('tick', 'realtime'), type: 'tick', ticks: 1, expectedRevision: world.revision,
    ...(presence ? { presence } : {}) });
  return r.ok ? { ok: true, reasons: [] } : { ok: false, reasons: r.reasons };
}

if (!isMap && !isKit && wilderness && !noUi) {
  // No settlement yet: the Farm button stays, greyed, and says why.
  const farm = document.createElement('button');
  farm.id = 'farm-button';
  farm.type = 'button';
  farm.className = 'off';
  farm.textContent = 'Farm';
  farm.setAttribute('aria-disabled', 'true');
  farm.setAttribute('aria-label', 'Farm: not available. You have no farm, people or animals in the wilderness yet.');
  farm.title = 'No farm yet: in the wilderness you start with bare hands.';
  farm.addEventListener('click', () => { lastAction = 'no farm yet: in the wilderness you start alone, with bare hands and an empty bag'; });
  document.body.appendChild(farm);
}

if (!isMap && !isKit) {

  // The founder character. Explore is the default way to play; scripted
  // evidence captures (action=, ui=0, explicit camera params) and ?mode=builder
  // start in the settlement overview.
  let storage: Storage | null = null;
  try { storage = window.localStorage; } catch { storage = null; }
  // STAB-002 S2: the founder's soft contact with farm animals, villagers and
  // wildlife. Player-local physics; the capsules come from sim state (homestead
  // positions of the last two ticks, wildlife records), not from the meshes.
  contactBodies = new HomesteadBodies(TICK_SECONDS);
  const groundAt = (x: number, z: number) => { const fx = Math.floor(x), fz = Math.floor(z); return residentSurfaceAt(world, fx, fz) ?? surfaceAt(world, fx, fz); };
  const adultAge = (sp: keyof typeof SPECIES_RULES) => SPECIES_RULES[sp].adultAge;
  const bodiesNear = (x: number, z: number): DynamicBody[] => {
    const out: DynamicBody[] = [];
    const h = session.world.homestead, tick = session.world.life?.tick ?? 0, now = performance.now();
    if (h && contactBodies) { contactBodies.observe(h, tick, now); contactBodies.collect(h, tick, now, x, z, 8, groundAt, adultAge, out, CHARACTER_RADIUS); }
    fauna?.bodies(x, z, 8, out);
    return out;
  };
  explore = new ExploreController({ world, scene, rig, storage, spawn: wild ? wild.spawn : { x: -18, z: -18 }, bodies: bodiesNear,
    ...(wild ? { storageScope: wild.id } : {}) });
  explore.onNotice = (message, kind) => {
    lastAction = message;
    m2Game?.toast(message, kind ?? 'good');
  };
  if (wilderness && !noUi) {
    wildGame = new WildGame({ session, scene, explore: () => explore, groundY: (x, z) => residentSurfaceAt(world, Math.floor(x), Math.floor(z)),
      camera: rig.camera, canvas: renderer.domElement, nature: () => natureView, fauna: () => fauna,
      onChanged: () => { const r = store.save(session); persistenceMessage = r.message; saveScheduler.saved(Date.now()); }, notice: (message) => { lastAction = message; } });
    explore.reachOverride = wildGame.reachTarget;
    // Evidence harness (?metrics=1 only): a read-only scan of what lies around the player.
    if (metricsEveryFrame) (window as unknown as { __wildNear?: (r?: number) => unknown }).__wildNear = (r?: number) => wildGame?.scan(r) ?? null;
    // W7 evidence harness (?metrics=1 only): the drawn wildlife as shown, with sim state, read-only.
    if (metricsEveryFrame) (window as unknown as { __wildlife?: () => unknown }).__wildlife = () => fauna?.simSample() ?? null;
  }
  const scripted = action !== '' || noUi || params.has('tx') || params.has('dist');
  const startMode = params.get('mode') ?? (scripted ? 'builder' : 'explore');
  if (startMode === 'explore') toggleMode('explore');
}

// Render-harness contract: renderer/camera are read-only handles for visual
// measurements. Normal/production simulation state is exposed only as metrics.
// Mutable inspection handles require a development build and explicit opt-in.
window.__probe = { renderer, camera: rig.camera };
// Read-only draw call / triangle breakdown per scene owner (main + shadow pass).
window.__renderBreakdown = () => renderBreakdown(scene, { camera: rig.camera, renderer, multiDraw });
// Evidence runs: restart the rolling frame and section statistics before a measured window (no state change).
window.__perfReset = () => { sections.reset(); frameWork.reset(); frameInterval.reset(); frameUpdate.reset(); terrainView.resetPerf(); };
if (import.meta.env.DEV && params.get('debug') === '1') {
  Object.assign(window.__probe, { THREE, terrainView });
  window.__scene = scene;
  window.__world = world;
}
requestAnimationFrame(frame);
