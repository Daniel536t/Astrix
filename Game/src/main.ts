import * as THREE from 'three';
import './styles.css';
import {
  generateWorld, TimeState, advanceTime, surfaceAt, setVoxel, MAT,
  nearestHarvestable, harvestEntity, WORLD_SIZE, CHUNK_SIZE, SEA_LEVEL,
  World, Entity,
} from './sim/world';
import { VoxelTerrainView, ViewMode } from './render/terrain';
import { buildNoxelNature } from './render/nature';
import { buildNoxelSite, buildKit } from './render/noxel';
import { Sky, timeLabel } from './render/sky';
import { OrbitRig } from './render/camera';

const params = new URLSearchParams(location.search);
const num = (k: string, fallback: number) => (params.has(k) ? Number(params.get(k)) : fallback);

const seed = num('seed', 1337);
const startT = params.has('t') ? Number(params.get('t')) : 0.42;
const freeze = params.get('freeze') === '1';
const sceneMode = params.get('scene') ?? 'world';
const isKit = sceneMode === 'kit';
const isMap = sceneMode === 'map';
const noUi = params.get('ui') === '0';
// 7x7 near chunks (49 draws) keeps the default view under the 90-call target
// while the 8 m macro LOD covers everything beyond 112 m. The macro grid is
// cached per seed/step, so a 48 m rebuild pays for geometry, not resampling.
const nearRadius = Math.max(1, Math.min(8, num('radius', 3)));
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
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const rig = new OrbitRig(renderer.domElement);

// ---- world (sim layer) ----
const loadT0 = performance.now();
const world = generateWorld(seed, 0);
const heroX = -24, heroZ = -24;
const heroY = surfaceAt(world, heroX, heroZ);
const kitX = 18, kitZ = 30;
const kitY = surfaceAt(world, kitX, kitZ);

// Reproducible inspection views: ?yaw=&pitch=&dist=&tx=&ty=&tz=
if (isKit) {
  rig.setView(
    num('yaw', 0), num('pitch', 40), num('dist', 38),
    num('tx', kitX + 2), num('ty', kitY + 4), num('tz', kitZ)
  );
} else if (isMap) {
  rig.setView(
    num('yaw', 0), num('pitch', 89), num('dist', 3300),
    num('tx', 0), num('ty', 8), num('tz', 0)
  );
} else {
  rig.setView(
    num('yaw', 38), num('pitch', 18), num('dist', 68),
    num('tx', heroX), num('ty', heroY + 5), num('tz', heroZ)
  );
}

const terrainView = new VoxelTerrainView(world, scene, {
  nearRadius,
  worldMacroStep: num('macro', 8),
  mapMacroStep: num('mapmacro', 8),
});

let natureDirty = true;
let natureInstances = 0;
let natureGroup: THREE.Group | null = null;
terrainView.onChunksChanged = () => { natureDirty = true; };

if (isMap) {
  terrainView.update(rig.target, 'map');
} else {
  terrainView.preload(rig.target);
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
  if (natureGroup) {
    scene.remove(natureGroup);
    disposeObject(natureGroup);
    natureGroup = null;
  }
  const result = buildNoxelNature(world, terrainView.loadedChunkKeys);
  natureGroup = result.group;
  natureGroup.visible = !isMap;
  natureInstances = result.instances;
  scene.add(natureGroup);
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
let lastAction = '';

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
  const e = nearestHarvestable(world, rig.target.x, rig.target.z, 40, 'wood');
  if (!e) return null;
  let total = 0;
  let resource = '';
  do {
    const result = harvestEntity(world, e.id);
    if (!result) break;
    total += result.amount;
    resource = result.resource;
    if (!deplete) break;
  } while (!e.harvested);
  lastAction = `harvested ${total} ${resource} from ${e.kind.replace('styl_', '').replace(/_/g, ' ')}` +
    (e.harvested ? ' (depleted)' : '');
  natureDirty = true;
  return e;
}

function applyScriptedAction(): void {
  if (action === 'dig' || action === 'both') {
    // Clear of the authored hero grove and Noxel sites, so the pit reads as
    // an edit to the terrain rather than a hole under a landmark.
    const n = digAt(0, -18, 2, 3);
    lastAction = `excavated ${n} voxels`;
  }
  if (action === 'harvest' || action === 'both') {
    harvestNearest(true);
  }
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
function metrics() {
  let edits = 0;
  for (const m of world.edits.values()) edits += m.size;
  let harvested = 0;
  for (const e of world.entities.values()) if (e.harvestedOnce) harvested++;
  return {
    seed,
    worldSize: WORLD_SIZE,
    chunkSize: CHUNK_SIZE,
    nearRadius,
    seaLevel: SEA_LEVEL,
    loadedChunks: terrainView.loadedChunks,
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
    nearTriangles: terrainView.nearTriangles,
    macroTriangles: terrainView.macroTriangleCount,
    rendererCalls: renderer.info.render.calls,
    rendererTriangles: renderer.info.render.triangles,
    rendererGeometries: renderer.info.memory.geometries,
    rendererTextures: renderer.info.memory.textures,
    streamPerf: terrainView.streamPerf,
    lastAction,
  };
}
window.__metrics = metrics();

const clock = new THREE.Clock();
let frames = 0;
const coarse = matchMedia('(pointer: coarse)').matches;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  advanceTime(time, dt * speed);
  rig.update(dt);

  sky.setFocus(rig.target);
  sky.update(time.t);
  if (isMap) scene.fog = null;

  const mode: ViewMode = isMap ? 'map' : isKit ? 'kit' : 'world';
  terrainView.update(rig.target, mode);
  if (natureDirty && !isMap && frames % 2 === 0) rebuildNature();
  if (natureGroup) natureGroup.visible = !isMap;

  renderer.render(scene, rig.camera);

  if (frames % 6 === 0) {
    window.__metrics = metrics();
    if (!noUi && !isMap && !isKit) {
      const m = window.__metrics;
      const hint = coarse
        ? 'drag: orbit · two fingers: move + zoom · pad: walk'
        : 'drag: orbit · WASD: move · wheel: zoom · F: dig · G: place · H: harvest · space: pause';
      hud.innerHTML =
        `<strong>ASTrix — World Foundation</strong> · M001 — seed ${seed} · ${WORLD_SIZE} × ${WORLD_SIZE} m · 1 m voxels<br>` +
        `${timeLabel(time.t)} · ${time.paused ? 'paused' : 'day ' + Math.round(time.dayLengthSec) + 's'}` +
        ` · ${m.loadedChunks} chunks · ${m.natureInstances} natural assets · ${m.rendererTriangles.toLocaleString()} tris` +
        `<br><span class="dim">${lastAction ? lastAction + ' · ' : ''}${hint}</span>`;
    }
  }

  frames++;
  if (frames === 3) window.__ready = true;
  requestAnimationFrame(frame);
}

// ---- input ----
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { time.paused = !time.paused; e.preventDefault(); }
  if (e.key === '1') time.t = 0.22;
  if (e.key === '2') time.t = 0.50;
  if (e.key === '3') time.t = 0.78;
  if (e.key === '4') time.t = 0.00;
  if (e.key === ']') speed = Math.min(24, speed * 2);
  if (e.key === '[') speed = Math.max(0.25, speed / 2);
  if (e.key === 'f' || e.key === 'F') {
    const n = digAt(Math.round(rig.target.x), Math.round(rig.target.z), 2, 3);
    lastAction = `excavated ${n} voxels`;
  }
  if (e.key === 'g' || e.key === 'G') {
    const changed = placeAt(Math.round(rig.target.x), Math.round(rig.target.z));
    lastAction = changed ? 'placed a stone voxel' : 'no voxel change';
  }
  if (e.key === 'h' || e.key === 'H') {
    if (!harvestNearest()) lastAction = 'no harvestable tree within 40 m';
  }
});

if (action) applyScriptedAction();

// Render-harness contract: the renderer and camera are read-only handles for
// screenshots and measurements. Simulation state is exposed only as metrics.
// Opt-in ?debug=1 adds scene/world inspection hooks for development; they are
// not part of the runtime contract.
window.__probe = { renderer, camera: rig.camera };
if (params.get('debug') === '1') {
  Object.assign(window.__probe, { THREE, terrainView });
  window.__scene = scene;
  window.__world = world;
}
requestAnimationFrame(frame);
