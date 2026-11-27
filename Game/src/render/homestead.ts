// Presentation of the M006 homestead. Reads authoritative state only:
// buildings come from the sim's facility definitions, fields from the
// player's marked rectangles, crop stages from growth, trough contents from
// enclosure counters, villagers and animals from their tick positions
// (interpolated between ticks). Nothing here writes to the simulation.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { World } from '../sim/world';
import { residentSurfaceAt, surfaceAt } from '../sim/world';
import {
  CROP_RULES, DM, Facility, HomesteadState, MOISTURE_MAX, Plot, SPECIES, Species, TROUGH_MAX, cropStage, fieldRect,
  dayTime, homesteadLayout, SPECIES_RULES, unitsOf, fieldOpening, homesteadGates, BuildSite, SITE_RULES, Role, siteCells,
  isHerdHomestead,
} from '../sim/homestead';
import type { GateState } from '../sim/nav';
import { AnimalBatch } from './animal-kit';
import { turnHeading, turnRate } from '../sim/bodies';
import { SNAP_DISTANCE } from './smooth';
import { ANIMAL_MODELS } from './animal-models';
import { FOUNDER_STOCKPILE } from '../sim/economy';
import { COTTAGE_DOOR, buildCottage, buildWell, kitMaterial } from './village-kit';
import { Figure, FARMER_STYLE, HERDER_STYLE, WOODCUTTER_STYLE, BUILDER_STYLE, FigureStyle, buildFigure, animateFigure, placeFigure, plantedStride } from './characters';

const ROLE_STYLE: Record<Role, FigureStyle> = { farmer: FARMER_STYLE, herder: HERDER_STYLE, woodcutter: WOODCUTTER_STYLE, builder: BUILDER_STYLE };
/** A carried load (logs, a bundle or a sack), shared by every villager and shown only while the sim says they carry something. */
const LOAD_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
let loadGeos: Record<string, THREE.BufferGeometry> | null = null;
function loadGeometry(kind: 'wood' | 'fiber' | 'other'): THREE.BufferGeometry {
  loadGeos ??= {
    wood: boxes([{ w: 0.7, h: 0.13, d: 0.13, x: 0, y: 0, z: -0.07, c: '#7A5530' }, { w: 0.7, h: 0.13, d: 0.13, x: 0, y: 0, z: 0.07, c: '#8A6238' },
      { w: 0.7, h: 0.13, d: 0.13, x: 0, y: 0.12, z: 0, c: '#6E4A28' }]),
    fiber: boxes([{ w: 0.5, h: 0.28, d: 0.28, x: 0, y: 0, z: 0, c: '#D9C27A' }, { w: 0.06, h: 0.3, d: 0.3, x: 0, y: -0.01, z: 0, c: '#8E6E3A' }]),
    other: boxes([{ w: 0.34, h: 0.34, d: 0.3, x: 0, y: 0, z: 0, c: '#B89B6A' }]),
  };
  return loadGeos[kind];
}

/**
 * Turn a box from a building's own frame (width W along x, depth D along z,
 * door on the +z side, origin at its min corner) into the world for rotation
 * `rot` (door +z, +x, -z, -x), at footprint corner (x0, z0). Matches the
 * simulation's footprint and entrance (sim/homestead.ts siteCells, siteEntrance).
 */
export function turnBox(b: B, rot: number, x0: number, z0: number, W: number, D: number): B {
  let x = b.x, z = b.z, w = b.w, d = b.d;
  if (rot === 1) [x, z, w, d] = [z, W - x, d, w];
  else if (rot === 2) [x, z] = [W - x, D - z];
  else if (rot === 3) [x, z, w, d] = [D - z, x, d, w];
  return { ...b, x: x0 + x, z: z0 + z, w, d };
}

/** A finished building's boxes in its own frame (bottom at y). Timber stores show how full they are. */
function buildingModel(kind: BuildSite['kind'], W: number, D: number, y: number, stock: number | null): B[] {
  const l: B[] = [];
  const logs = (n: number, x0: number, x1: number, z0: number, rows: number) => {
    for (let i = 0; i < n; i++) l.push({ w: x1 - x0, h: 0.2, d: 0.2, x: (x0 + x1) / 2, y: y + 0.05 + Math.floor(i / rows) * 0.2, z: z0 + (i % rows) * 0.24, c: i % 2 ? '#7A5530' : '#8A6238' });
  };
  if (kind === 'well') {
    // A stone curb round dark water, two posts, a windlass beam and a little roof; a plank step at the front.
    const cx = W / 2, cz = D / 2;
    l.push({ w: 1.7, h: 0.75, d: 0.3, x: cx, y, z: cz - 0.7, c: STONE }, { w: 1.7, h: 0.75, d: 0.3, x: cx, y, z: cz + 0.7, c: STONE });
    l.push({ w: 0.3, h: 0.75, d: 1.1, x: cx - 0.7, y, z: cz, c: '#9A9890' }, { w: 0.3, h: 0.75, d: 1.1, x: cx + 0.7, y, z: cz, c: '#9A9890' });
    l.push({ w: 1.1, h: 0.1, d: 1.1, x: cx, y: y + 0.45, z: cz, c: WATER });
    for (const px of [-0.85, 0.85]) l.push({ w: 0.16, h: 1.9, d: 0.16, x: cx + px, y, z: cz, c: WOOD_DARK });
    l.push({ w: 1.9, h: 0.12, d: 0.12, x: cx, y: y + 1.55, z: cz, c: WOOD });
    l.push({ w: 0.22, h: 0.22, d: 0.22, x: cx, y: y + 1.05, z: cz, c: '#6E5238' });
    l.push({ w: 2.0, h: 0.12, d: 1.0, x: cx, y: y + 1.9, z: cz - 0.3, c: '#8E4A30' }, { w: 2.0, h: 0.12, d: 1.0, x: cx, y: y + 1.9, z: cz + 0.3, c: '#A2573A' });
    l.push({ w: 0.8, h: 0.08, d: 0.3, x: cx, y, z: D - 0.05, c: WOOD });
    return l;
  }
  if (kind === 'logstore') {
    // An open lean-to: tall back posts, short front posts, a sloping roof in two steps, logs under it.
    for (const px of [0.12, W - 0.12]) { l.push({ w: 0.16, h: 1.7, d: 0.16, x: px, y, z: 0.12, c: WOOD_DARK }, { w: 0.16, h: 1.3, d: 0.16, x: px, y, z: D - 0.12, c: WOOD_DARK }); }
    l.push({ w: W + 0.3, h: 0.12, d: D * 0.55, x: W / 2, y: y + 1.7, z: D * 0.27, c: '#8E4A30' }, { w: W + 0.3, h: 0.12, d: D * 0.55, x: W / 2, y: y + 1.45, z: D * 0.75, c: '#A2573A' });
    l.push({ w: W - 0.2, h: 0.1, d: 0.1, x: W / 2, y: y + 0.6, z: 0.08, c: WOOD });
    logs(stock === null ? 4 : Math.min(8, Math.ceil(stock / 3)), 0.25, W - 0.25, 0.28, 2);
    return l;
  }
  // Woodshed: corner posts, back and side walls, a thatched roof, timber stacked inside (open front).
  const posts: Array<[number, number]> = [[0.15, 0.15], [W - 0.15, 0.15], [0.15, D - 0.15], [W - 0.15, D - 0.15]];
  for (const [px, pz] of posts) l.push({ w: 0.22, h: 2.3, d: 0.22, x: px, y, z: pz, c: WOOD_DARK });
  l.push({ w: W, h: 1.7, d: 0.12, x: W / 2, y, z: 0.1, c: WOOD });
  l.push({ w: 0.12, h: 1.7, d: D, x: 0.1, y, z: D / 2, c: WOOD }, { w: 0.12, h: 1.7, d: D, x: W - 0.1, y, z: D / 2, c: WOOD });
  l.push({ w: W + 0.4, h: 0.18, d: D + 0.5, x: W / 2, y: y + 2.3, z: D / 2 + 0.1, c: STRAW }, { w: W - 0.2, h: 0.18, d: D - 0.2, x: W / 2, y: y + 2.48, z: D / 2, c: '#B8964E' });
  // v4/v5 woodsheds keep their six logs; a v6 timber store shows one log per 6 wood (up to 15).
  logs(stock === null ? 6 : Math.min(15, Math.ceil(stock / 4)), 0.3, W - 0.3, 0.45, 3);
  return l;
}

/** Boxes for a building site (planned stakes, materials on site, a frame rising with the work, the finished building), turned with the site. */
export function siteBoxes(list: B[], st: BuildSite, ground: (x: number, z: number) => number): void {
  const rule = SITE_RULES[st.kind];
  const rot = st.rot ?? 0;
  const W = rule.w, D = rule.d;
  const cells = siteCells(st);
  let y = Infinity;
  for (let z = cells.z0; z < cells.z1; z++) for (let x = cells.x0; x < cells.x1; x++) y = Math.min(y, ground(x + 0.5, z + 0.5));
  const put = (b: B) => list.push(turnBox(b, rot, cells.x0, cells.z0, W, D));
  const putAt = (b: Omit<B, 'y'>) => { const t = turnBox({ ...b, y: 0 }, rot, cells.x0, cells.z0, W, D); list.push({ ...t, y: ground(t.x, t.z) }); };
  if (st.state === 'done') {
    const stock = st.stock ? Object.values(st.stock).reduce((a, b) => a + b, 0) : null;
    for (const b of buildingModel(st.kind, W, D, y, stock)) put(b);
    return;
  }
  const posts: Array<[number, number]> = [[0.15, 0.15], [W - 0.15, 0.15], [0.15, D - 0.15], [W - 0.15, D - 0.15]];
  // Corner stakes and a string line (planned, approved; red-topped once cancelled).
  for (const [px, pz] of posts) put({ w: 0.08, h: 0.6, d: 0.08, x: px, y, z: pz, c: st.state === 'planned' ? '#E8E0C8' : st.state === 'cancelled' ? '#B84A3A' : '#C8A040' });
  put({ w: W, h: 0.02, d: 0.02, x: W / 2, y: y + 0.5, z: 0.15, c: '#F0EBDD' });
  put({ w: W, h: 0.02, d: 0.02, x: W / 2, y: y + 0.5, z: D - 0.15, c: '#F0EBDD' });
  if (st.state === 'planned') return;
  // Materials on site: one log per 2 wood, one bundle per 2 fibre, beside the footprint.
  const wood = st.delivered.wood ?? 0, fiber = st.delivered.fiber ?? 0;
  const used = st.state === 'cancelled' ? 0 : Math.min(1, st.work / rule.work);
  for (let i = 0; i < Math.ceil((wood * (1 - used)) / 2); i++) {
    const t = turnBox({ w: 1.2, h: 0.16, d: 0.16, x: W + 0.7, y: 0, z: 0.3 + (i % 3) * 0.2, c: i % 2 ? '#7A5530' : '#8A6238' }, rot, cells.x0, cells.z0, W, D);
    list.push({ ...t, y: ground(t.x, t.z) + Math.floor(i / 3) * 0.16 });
  }
  for (let i = 0; i < Math.ceil(fiber / 2); i++) putAt({ w: 0.4, h: 0.3, d: 0.3, x: -0.5, z: 0.3 + i * 0.35, c: STRAW });
  if (st.state === 'cancelled') return;
  // The frame rises with the work done: posts, then the wall rails, then the roof beams.
  if (st.work > 0) {
    const hgt = 2.3 * Math.min(1, used * 2);
    for (const [px, pz] of posts) put({ w: 0.2, h: Math.max(0.2, hgt), d: 0.2, x: px, y, z: pz, c: WOOD_DARK });
    if (used > 0.5) put({ w: W, h: 1.7 * Math.min(1, (used - 0.5) * 2.5), d: 0.12, x: W / 2, y, z: 0.1, c: WOOD });
    if (used > 0.8) { put({ w: W + 0.2, h: 0.12, d: 0.12, x: W / 2, y: y + 2.3, z: 0.15, c: WOOD_DARK }); put({ w: W + 0.2, h: 0.12, d: 0.12, x: W / 2, y: y + 2.3, z: D - 0.15, c: WOOD_DARK }); }
  }
}
import type { CharacterState } from '../sim/character';

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

export type B = { w: number; h: number; d: number; x: number; y: number; z: number; c: string; ry?: number };
/** Merge boxes (y = bottom) into one vertex-coloured geometry with simple face shading. */
export function boxes(list: B[]): THREE.BufferGeometry {
  const geos = list.map((b) => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d).toNonIndexed();
    if (b.ry) g.rotateY(b.ry);
    g.translate(b.x, b.y + b.h / 2, b.z);
    g.deleteAttribute('uv');
    const col = new THREE.Color(b.c);
    const n = g.attributes.position.count, normals = g.attributes.normal;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const ny = normals.getY(i), k = ny > 0.5 ? 1 : ny < -0.5 ? 0.72 : 0.88;
      colors[i * 3] = col.r * k; colors[i * 3 + 1] = col.g * k; colors[i * 3 + 2] = col.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  });
  const merged = mergeGeometries(geos)!;
  for (const g of geos) g.dispose();
  return merged;
}
function mesh(list: B[], name: string): THREE.Mesh {
  const m = new THREE.Mesh(boxes(list), MAT);
  m.name = name; m.castShadow = true; m.receiveShadow = true;
  return m;
}
const hash = (a: number, b: number, c = 0) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const WOOD = '#8A6440', WOOD_DARK = '#5E4128', STRAW = '#D8BE6A', SOIL = '#6B4A30', SOIL_WET = '#4A3222';
const WATER = '#4F9CC4', STONE = '#8C8C86', MUD = '#6E5238';
const STRAW_WOOD = '#B0875A', IRON = '#2E2B2A';

/** A gap in a fence: on its -z (`n`) or +z (`s`) side, between world x `from` and `to` (the sim's opening or gate). */
interface FenceGap { side: 'n' | 's'; from: number; to: number }

/** Fence posts and two rails around a rect (world metres), leaving the given gaps open. */
function fence(list: B[], x0: number, z0: number, x1: number, z1: number, ground: (x: number, z: number) => number, gaps: FenceGap[] = []): void {
  const post = (x: number, z: number) => { const y = ground(x, z); list.push({ w: 0.16, h: 1.05, d: 0.16, x, y, z, c: WOOD_DARK }); };
  const rail = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az), y = (ground(ax, az) + ground(bx, bz)) / 2, ry = Math.atan2(bz - az, bx - ax);
    for (const h of [0.45, 0.85]) list.push({ w: len, h: 0.09, d: 0.07, x: (ax + bx) / 2, y: y + h, z: (az + bz) / 2, c: WOOD, ry: -ry });
  };
  /** Posts about every 2 m plus at each gap end; rails everywhere except across a gap. */
  const side = (ax: number, az: number, bx: number, bz: number, open: Array<[number, number]>) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 2));
    const ts = new Set<number>();
    for (let i = 0; i <= n; i++) ts.add((len * i) / n);
    for (const [a, b] of open) { ts.add(a); ts.add(b); }
    const sorted = [...ts].filter((t) => t >= 0 && t <= len + 1e-6).sort((a, b) => a - b);
    const at = (t: number) => [ax + ((bx - ax) * t) / len, az + ((bz - az) * t) / len] as const;
    for (const t of sorted) post(...at(t));
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i], b = sorted[i + 1], mid = (a + b) / 2;
      if (b - a < 1e-3 || open.some(([g0, g1]) => mid > g0 && mid < g1)) continue;
      rail(...at(a), ...at(b));
    }
  };
  // Gap positions are world x; turn them into distances along each side.
  const north = gaps.filter((g) => g.side === 'n').map((g) => [g.from - x0, g.to - x0] as [number, number]);
  const south = gaps.filter((g) => g.side === 's').map((g) => [x1 - g.to, x1 - g.from] as [number, number]);
  side(x0, z0, x1, z0, north); side(x1, z0, x1, z1, []); side(x1, z1, x0, z1, south); side(x0, z1, x0, z0, []);
}

/**
 * A field gate or pen gate leaf on a -z fence edge from world (x, z) to (x + 1, z).
 * Closed: across the opening. Open: swung 90° into the enclosure. Locked: closed with an iron bar.
 */
function gateLeaf(list: B[], x: number, z: number, state: GateState, ground: (x: number, z: number) => number): void {
  const y = ground(x + 0.5, z + 0.3);
  if (state === 'open') {
    const lx = x + 0.1;
    list.push({ w: 0.08, h: 1.0, d: 0.08, x: lx, y, z: z + 0.05, c: WOOD_DARK }, { w: 0.08, h: 1.0, d: 0.08, x: lx, y, z: z + 0.9, c: WOOD_DARK });
    for (const h of [0.3, 0.8]) list.push({ w: 0.07, h: 0.09, d: 0.86, x: lx, y: y + h, z: z + 0.48, c: STRAW_WOOD });
    list.push({ w: 0.06, h: 0.08, d: 0.86, x: lx, y: y + 0.55, z: z + 0.48, c: WOOD });
    return;
  }
  list.push({ w: 0.08, h: 1.0, d: 0.08, x: x + 0.1, y, z, c: WOOD_DARK }, { w: 0.08, h: 1.0, d: 0.08, x: x + 0.9, y, z, c: WOOD_DARK });
  for (const h of [0.3, 0.8]) list.push({ w: 0.86, h: 0.09, d: 0.07, x: x + 0.5, y: y + h, z, c: STRAW_WOOD });
  list.push({ w: 0.86, h: 0.08, d: 0.06, x: x + 0.5, y: y + 0.55, z, c: WOOD });
  if (state === 'locked') list.push({ w: 0.12, h: 0.32, d: 0.12, x: x + 0.9, y: y + 0.4, z: z - 0.06, c: IRON });
}

/**
 * The farmhouse door leaf (M012), from the simulated door state. `x` is the
 * doorway centre, `z` the front wall face, `y` the threshold (top of the plinth).
 * Closed: in the frame. Open: swung 90° outward on its left hinge, against the
 * wall line. Locked: closed with an iron bar across.
 */
function doorLeaf(list: B[], x: number, z: number, y: number, state: GateState): void {
  const w = COTTAGE_DOOR.w, h = COTTAGE_DOOR.h;
  if (state === 'open') {
    const hx = x - w / 2 + 0.06;
    list.push({ w: 0.12, h, d: w, x: hx, y, z: z + w / 2, c: DOOR_WOOD });
    list.push({ w: 0.14, h: 0.1, d: w * 0.9, x: hx, y: y + 0.4, z: z + w / 2, c: WOOD_DARK }, { w: 0.14, h: 0.1, d: w * 0.9, x: hx, y: y + 1.6, z: z + w / 2, c: WOOD_DARK });
    list.push({ w: 0.08, h: 0.08, d: 0.06, x: hx + 0.08, y: y + 1.0, z: z + w - 0.22, c: IRON });
    return;
  }
  list.push({ w, h, d: 0.12, x, y, z: z - 0.02, c: DOOR_WOOD });
  list.push({ w: w * 0.9, h: 0.1, d: 0.14, x, y: y + 0.4, z: z - 0.02, c: WOOD_DARK }, { w: w * 0.9, h: 0.1, d: 0.14, x, y: y + 1.6, z: z - 0.02, c: WOOD_DARK });
  list.push({ w: 0.08, h: 0.08, d: 0.06, x: x + 0.38, y: y + 1.0, z: z + 0.07, c: IRON });
  if (state === 'locked') list.push({ w: w + 0.3, h: 0.12, d: 0.1, x, y: y + 1.05, z: z + 0.1, c: IRON });
}
const DOOR_WOOD = '#8A6142';

/** Which state every gate leaf and the farmhouse door are drawn in (a legacy homestead draws them closed). */
export function drawnLeaves(h: HomesteadState): Record<string, GateState> {
  return Object.fromEntries(homesteadGates(h).map((g) => [g.id, h.gates?.find((x) => x.id === g.id)?.state ?? 'closed']));
}

/** A trough that shows its real contents: water level and a pile of straw. */
function trough(list: B[], x: number, z: number, y: number, water: number, feed: number): void {
  list.push({ w: 1.6, h: 0.12, d: 0.7, x, y, z, c: WOOD_DARK });
  list.push({ w: 1.6, h: 0.45, d: 0.1, x, y: y + 0.12, z: z - 0.3, c: WOOD }, { w: 1.6, h: 0.45, d: 0.1, x, y: y + 0.12, z: z + 0.3, c: WOOD });
  list.push({ w: 0.1, h: 0.45, d: 0.7, x: x - 0.75, y: y + 0.12, z, c: WOOD }, { w: 0.1, h: 0.45, d: 0.7, x: x + 0.75, y: y + 0.12, z, c: WOOD });
  list.push({ w: 0.1, h: 0.45, d: 0.6, x, y: y + 0.12, z, c: WOOD_DARK });
  if (water > 0) list.push({ w: 0.68, h: 0.04 + 0.36 * (water / TROUGH_MAX), d: 0.5, x: x - 0.37, y: y + 0.12, z, c: WATER });
  if (feed > 0) list.push({ w: 0.66, h: 0.04 + 0.36 * (feed / TROUGH_MAX), d: 0.5, x: x + 0.37, y: y + 0.12, z, c: STRAW });
}

// ---------- crops ----------

const CROP_LOOK: Record<string, { leaf: string; leafDark: string; ripe: string; head: string }> = {
  wheat: { leaf: '#7FA63A', leafDark: '#5E8A2C', ripe: '#D9B24A', head: '#E8C860' },
  potato: { leaf: '#4F8F3A', leafDark: '#3C7230', ripe: '#8F9A3E', head: '#B98F52' },
  flax: { leaf: '#6FA060', leafDark: '#557F49', ripe: '#C2A672', head: '#7C9BE0' },
};

/** One field: fence, soil per square metre at its own height, and plants by crop and stage. */
function fieldMesh(world: World, p: Plot, ground: (x: number, z: number) => number): THREE.Mesh {
  const list: B[] = [];
  const stage = cropStage(p);
  const look = CROP_LOOK[p.crop];
  const wet = p.moisture / MOISTURE_MAX;
  const soil = new THREE.Color(SOIL).lerp(new THREE.Color(SOIL_WET), wet).getStyle();
  for (let cz = 0; cz < p.d; cz++) {
    for (let cx = 0; cx < p.w; cx++) {
      const x = p.x + cx + 0.5, z = p.z + cz + 0.5, y = ground(x, z);
      if (p.state === 'wild') {
        // Marked but not dug: stakes at the corners, rough grass tufts.
        if (hash(cx, cz, 1) < 0.35) list.push({ w: 0.25, h: 0.18, d: 0.25, x: x + hash(cx, cz, 2) * 0.4 - 0.2, y, z, c: '#6E9A44' });
        continue;
      }
      // Dug soil: two ridges per metre, darker when watered.
      list.push({ w: 0.96, h: 0.08, d: 0.96, x, y: y - 0.03, z, c: soil });
      list.push({ w: 0.9, h: 0.06, d: 0.18, x, y: y + 0.05, z: z - 0.22, c: soil }, { w: 0.9, h: 0.06, d: 0.18, x, y: y + 0.05, z: z + 0.22, c: soil });
      if (stage === 0) continue;
      for (const row of [-0.22, 0.22]) {
        for (const col of [-0.26, 0.26]) {
          const px = x + col, pz = z + row, j = hash(Math.floor(px * 7), Math.floor(pz * 7), 3);
          const ripe = stage === 4;
          if (p.crop === 'potato') {
            const s = [0.12, 0.22, 0.32, 0.36][stage - 1];
            list.push({ w: s, h: s * 0.8, d: s, x: px, y: y + 0.08, z: pz, c: ripe ? look.ripe : j < 0.5 ? look.leaf : look.leafDark });
            if (stage >= 3) list.push({ w: s * 0.6, h: s * 0.5, d: s * 0.6, x: px + 0.05, y: y + 0.08 + s * 0.7, z: pz, c: ripe ? look.ripe : look.leaf });
            if (ripe && j < 0.5) list.push({ w: 0.1, h: 0.08, d: 0.1, x: px - 0.12, y: y + 0.08, z: pz + 0.1, c: look.head });
          } else {
            const h = [0.14, 0.32, 0.55, 0.62][stage - 1] * (0.85 + j * 0.3);
            const c = ripe ? look.ripe : j < 0.5 ? look.leaf : look.leafDark;
            list.push({ w: 0.05, h, d: 0.05, x: px, y: y + 0.08, z: pz, c });
            list.push({ w: 0.05, h: h * 0.8, d: 0.05, x: px + 0.08, y: y + 0.08, z: pz + 0.05, c });
            if (stage >= 3) {
              const headC = p.crop === 'flax' && !ripe ? look.head : ripe ? look.head : look.leafDark;
              list.push({ w: 0.08, h: 0.12, d: 0.08, x: px, y: y + 0.08 + h, z: pz, c: headC });
            }
          }
        }
      }
    }
  }
  const lx0 = p.x - 0.15, lz0 = p.z - 0.15, lx1 = p.x + p.w + 0.15, lz1 = p.z + p.d + 0.15;
  // The walk-in gap is where the navigation grid leaves the fence open.
  const gap = fieldOpening(p);
  fence(list, lx0, lz0, lx1, lz1, ground, [{ side: 's', from: gap.x, to: gap.x + 1 }]);
  const m = mesh(list, `field_${p.id}`);
  m.userData = { fieldId: p.id, crop: p.crop, state: p.state, stage, units: unitsOf(p), moisture: p.moisture };
  return m;
}

// ---------- animals ----------

const HERD_CAP = 64;
const shortest = (from: number, to: number) => { let d = to - from; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
interface Seen { shown?: number; h0?: number; at?: number; x: number; z: number; heading: number; phase: number; swing: number; hunger: number; eatUntil: number; speed: number; px: number; pz: number; sx: number; sz: number }

/**
 * Every farm animal, one animated instanced mesh per species. Poses come from
 * the simulation: legs swing at the speed the animal actually moved between
 * ticks, the head goes down when its hunger just dropped (it ate or drank),
 * sheep wool follows the real wool counter, animals lie down at night.
 */
class Herd {
  readonly batches = new Map<Species, AnimalBatch>();
  private readonly seen = new Map<string, Seen>();
  constructor(group: THREE.Group) {
    for (const sp of SPECIES) {
      const b = new AnimalBatch(ANIMAL_MODELS[sp], HERD_CAP, `herd_${sp}`);
      this.batches.set(sp, b);
      group.add(b.mesh);
    }
  }
  /** A new tick arrived: measure how far each animal moved and whether it just ate. */
  advance(h: HomesteadState, tickSeconds: number): void {
    const now = performance.now() / 1000, alive = new Set<string>();
    for (const a of h.animals) {
      alive.add(a.id);
      const x = a.x / DM, z = a.z / DM, s = this.seen.get(a.id);
      if (!s) { this.seen.set(a.id, { x, z, px: x, pz: z, sx: x, sz: z, heading: hash(a.x, a.z) * Math.PI * 2, phase: hash(a.z, a.x) * 6, swing: 0, hunger: a.hunger, eatUntil: 0, speed: 0 }); continue; }
      // Distance and heading come from the logical step; the blend starts from
      // where the animal is drawn now, so a late or early tick never pops it.
      const d = Math.hypot(x - s.x, z - s.z);
      // Rules v7 (STAB-002 S2): the turn starts from the heading drawn now, at the rate the founder's contact uses.
      s.h0 = s.shown ?? s.heading; s.at = now;
      if (d > 0.04) s.heading = Math.atan2(x - s.x, z - s.z);
      s.speed = d / tickSeconds;
      s.px = s.sx; s.pz = s.sz; s.x = x; s.z = z;
      if (Math.hypot(x - s.px, z - s.pz) > SNAP_DISTANCE) { s.px = x; s.pz = z; s.speed = 0; }
      if (a.hunger < s.hunger - 20) s.eatUntil = now + 1.8;
      s.hunger = a.hunger;
    }
    for (const id of [...this.seen.keys()]) if (!alive.has(id)) this.seen.delete(id);
  }
  draw(world: World, h: HomesteadState, alpha: number, dt: number, ground: (x: number, z: number) => number): void {
    for (const b of this.batches.values()) b.begin();
    const now = performance.now() / 1000, tick = world.life?.tick ?? 0, night = dayTime(tick).night;
    for (const a of h.animals) {
      const s = this.seen.get(a.id); if (!s) continue;
      const rule = SPECIES_RULES[a.species], walking = s.speed > 0.15;
      const x = s.px + (s.x - s.px) * alpha, z = s.pz + (s.z - s.pz) * alpha;
      s.sx = x; s.sz = z;
      // Turn toward the direction of travel; walk cycle advances with distance covered.
      if (isHerdHomestead(h)) s.shown = turnHeading(s.h0 ?? s.heading, s.heading, now - (s.at ?? now), turnRate(a.species));
      else if (walking) s.shown = (s.shown ?? s.heading) + shortest(s.shown ?? s.heading, s.heading) * (1 - Math.exp(-dt * 7));
      const heading = s.shown ?? s.heading;
      s.phase += dt * (walking ? 2.5 + s.speed * 3.2 : 0);
      s.swing += ((walking ? Math.min(0.75, 0.3 + s.speed * 0.2) : 0) - s.swing) * (1 - Math.exp(-dt * 8));
      // Rules v7: the pose is the sim's own state (head down while a grazing
      // bout or a drink runs, lying while resting). Older rules have no state,
      // so their poses stay as M012 drew them (head down for a meal, lying at night).
      const herd = isHerdHomestead(h);
      const bout = herd && (a.act === 'graze' || a.act === 'drink') && (a.until ?? 0) > 0;
      const eating = herd ? bout && !walking : now < s.eatUntil;
      const young = tick - a.born < rule.adultAge;
      const lying = herd ? a.act === 'rest' && !walking : night && !walking && !eating;
      let head = 0;
      if (eating) head = a.species === 'chicken' ? 0.35 + Math.max(0, Math.sin(now * 14)) * 0.6 : 0.85;
      else if (lying) head = 0.3;
      else if (!walking) head = Math.sin(now * 0.8 + a.x) * 0.08;
      const wool = a.species === 'sheep' ? 0.35 + 0.65 * Math.min(1, a.product / rule.product!.every) : 1;
      const flap = a.species === 'chicken' && s.speed > 1.2 ? 0.6 : 0;
      const bob = walking ? Math.abs(Math.sin(s.phase)) * 0.03 : 0;
      this.batches.get(a.species)!.push({
        x, y: ground(x, z) + bob, z, heading, scale: young ? (a.species === 'chicken' ? 0.5 : 0.62) : 1,
        phase: s.phase, legSwing: s.swing, headPitch: head, tailWag: eating || walking ? 0.3 : 0.1,
        male: a.sex === 'm', young, lying, extra: a.species === 'sheep' ? wool : flap,
      });
    }
    for (const b of this.batches.values()) b.end();
  }
}

/**
 * Bake the static homestead pieces that share the flat vertex-colour
 * material (farmhouse, well, enclosure fences and shelters) into one mesh.
 * They never move, so one draw per pass replaces one per building; the
 * geometry and colours are unchanged. Pieces with other materials (lit
 * windows) stay separate.
 */
function mergeStatics(g: THREE.Group): THREE.Group {
  g.updateMatrixWorld(true);
  const geos: THREE.BufferGeometry[] = [];
  const facilities: string[] = [];
  const keep: THREE.Object3D[] = [];
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.material === MAT || m.material === kitMaterial) {
      geos.push(m.geometry.clone().applyMatrix4(m.matrixWorld));
      m.geometry.dispose();
      let f: THREE.Object3D | null = m;
      while (f && f !== g && f.userData.facility === undefined) f = f.parent;
      if (f && f.userData.facility !== undefined && !facilities.includes(f.userData.facility)) facilities.push(f.userData.facility);
    } else {
      keep.push(m);
    }
  });
  const out = new THREE.Group();
  out.name = g.name;
  if (geos.length) {
    const merged = new THREE.Mesh(mergeGeometries(geos)!, MAT);
    for (const geo of geos) geo.dispose();
    merged.name = 'homestead_statics';
    merged.castShadow = true;
    merged.receiveShadow = true;
    merged.userData.facilities = facilities;
    out.add(merged);
  }
  for (const m of keep) {
    m.updateMatrixWorld(true);
    m.matrixWorld.decompose(m.position, m.quaternion, m.scale);
    out.add(m);
  }
  return out;
}

// ---------- the view ----------

export class HomesteadView {
  readonly group = new THREE.Group();
  private statics: THREE.Group | null = null;
  private readonly dynamic = new THREE.Group();
  private readonly fields = new THREE.Group();
  private readonly herd: Herd;
  private readonly people = new Map<string, { fig: Figure; role: string; load: THREE.Mesh; loadKind: string; prev: { x: number; z: number }; cur: { x: number; z: number }; shown: { x: number; z: number }; heading: number; step: number }>();
  private fieldKey = '';
  private troughKey = '';
  private lastTick = -1;
  private tickAt = 0;
  private revisionSeen = -1;

  constructor(private readonly world: World, private readonly tickSeconds: number) {
    this.group.name = 'homestead';
    this.group.add(this.dynamic, this.fields);
    this.herd = new Herd(this.group);
  }

  private ground = (x: number, z: number) => {
    const fx = Math.floor(x), fz = Math.floor(z);
    return residentSurfaceAt(this.world, fx, fz) ?? surfaceAt(this.world, fx, fz);
  };

  private buildStatics(h: HomesteadState): THREE.Group {
    const g = new THREE.Group();
    g.name = 'homestead_buildings';
    const layout = homesteadLayout(h);
    const at = (f: Facility) => ({ x0: f.rect.x0 / DM, z0: f.rect.z0 / DM, x1: f.rect.x1 / DM, z1: f.rect.z1 / DM });
    for (const f of layout) {
      const r = at(f), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      const list: B[] = [];
      if (f.kind === 'farmhouse') {
        // The door leaf is not baked in: it is drawn from the simulated door state with the gate leaves.
        const house = buildCottage({ width: r.x1 - r.x0, depth: r.z1 - r.z0, roof: 'thatch', seed: 31, chimney: true, door: false });
        house.position.set(cx, this.lowest(r) , cz);
        house.userData.facility = f.id;
        g.add(house);
        continue;
      }
      if (f.kind === 'well') {
        const well = buildWell(5);
        well.position.set(cx, this.ground(cx, cz), cz);
        well.userData.facility = f.id;
        g.add(well);
        continue;
      }
      // Enclosures: fence around the rect with a gap for the gate (its leaf is drawn with the troughs, as it moves), plus a shelter.
      const gate = homesteadGates(h).find((g) => g.id === `gate:${f.id}`);
      fence(list, r.x0, r.z0, r.x1, r.z1, this.ground, gate ? [{ side: 'n', from: gate.x, to: gate.x + 1 }] : []);
      if (f.kind === 'coop') {
        const y = this.lowest({ x0: r.x0 + 0.5, z0: r.z0 + 0.5, x1: r.x0 + 3.5, z1: r.z0 + 3 });
        list.push({ w: 3, h: 0.5, d: 2.5, x: r.x0 + 2, y, z: r.z0 + 1.75, c: STONE });
        list.push({ w: 3, h: 1.5, d: 2.5, x: r.x0 + 2, y: y + 0.5, z: r.z0 + 1.75, c: '#B8875A' });
        list.push({ w: 3.4, h: 0.25, d: 2.9, x: r.x0 + 2, y: y + 2, z: r.z0 + 1.75, c: '#8E4A30' });
        list.push({ w: 2.6, h: 0.25, d: 2.2, x: r.x0 + 2, y: y + 2.25, z: r.z0 + 1.75, c: '#A2573A' });
        list.push({ w: 0.6, h: 0.8, d: 0.06, x: r.x0 + 2, y: y + 0.5, z: r.z0 + 3.02, c: WOOD_DARK });
        list.push({ w: 0.3, h: 0.08, d: 1.2, x: r.x0 + 2, y: y + 0.2, z: r.z0 + 3.6, c: WOOD, });
      } else if (f.kind === 'sty') {
        const y = this.lowest({ x0: r.x0 + 0.5, z0: r.z0 + 0.5, x1: r.x0 + 3, z1: r.z0 + 2.5 });
        list.push({ w: 2.6, h: 1.1, d: 2, x: r.x0 + 1.8, y, z: r.z0 + 1.5, c: '#8A7A66' });
        list.push({ w: 3, h: 0.22, d: 2.4, x: r.x0 + 1.8, y: y + 1.1, z: r.z0 + 1.5, c: '#6E5238' });
        list.push({ w: 2.2, h: 0.06, d: 1.6, x: r.x0 + 4, y: this.ground(r.x0 + 4, r.z0 + 3.2), z: r.z0 + 3.2, c: MUD });
      } else if (f.kind === 'paddock') {
        // Small open-fronted lean-to in the back corner: back wall, two front posts, a roof stepped down toward the front.
        const y = this.lowest({ x0: r.x0 + 0.5, z0: r.z0 + 0.5, x1: r.x0 + 3.5, z1: r.z0 + 2.5 });
        const cx = r.x0 + 2, bz = r.z0 + 0.7;
        list.push({ w: 3, h: 1.7, d: 0.15, x: cx, y, z: bz, c: '#B8875A' });
        list.push({ w: 0.15, h: 1.7, d: 1.6, x: cx - 1.5, y, z: bz + 0.75, c: '#B8875A' });
        list.push({ w: 0.15, h: 1.7, d: 1.6, x: cx + 1.5, y, z: bz + 0.75, c: '#B8875A' });
        for (const px of [-1.5, 1.5]) list.push({ w: 0.2, h: 1.3, d: 0.2, x: cx + px, y, z: bz + 1.55, c: WOOD_DARK });
        list.push({ w: 3.3, h: 0.14, d: 1, x: cx, y: y + 1.7, z: bz + 0.35, c: '#8E4A30' });
        list.push({ w: 3.3, h: 0.14, d: 1, x: cx, y: y + 1.45, z: bz + 1.2, c: '#A2573A' });
        list.push({ w: 1.6, h: 0.4, d: 0.8, x: cx, y, z: bz + 0.6, c: STRAW });
      } else if (f.kind === 'pen') {
        const y = this.lowest({ x0: r.x0 + 0.5, z0: r.z0 + 0.5, x1: r.x0 + 3.5, z1: r.z0 + 2.5 });
        for (const [px, pz] of [[0.6, 0.6], [3.4, 0.6], [0.6, 2.4], [3.4, 2.4]]) list.push({ w: 0.2, h: 1.8, d: 0.2, x: r.x0 + px, y, z: r.z0 + pz, c: WOOD_DARK });
        list.push({ w: 3.4, h: 0.2, d: 2.4, x: r.x0 + 2, y: y + 1.8, z: r.z0 + 1.5, c: '#9C7A4C' });
      }
      const m = mesh(list, `facility_${f.id}`);
      m.userData.facility = f.id;
      g.add(m);
    }
    return mergeStatics(g);
  }

  private lowest(r: { x0: number; z0: number; x1: number; z1: number }): number {
    let lo = Infinity;
    for (let z = Math.floor(r.z0); z <= Math.floor(r.z1); z++) for (let x = Math.floor(r.x0); x <= Math.floor(r.x1); x++) lo = Math.min(lo, this.ground(x + 0.5, z + 0.5));
    return lo;
  }

  /** Rebuild what changed and move the living things. Call every frame. */
  update(frameDt: number): void {
    const h = this.world.homestead;
    this.group.visible = !!h;
    if (!h) return;
    if (!this.statics) { this.statics = this.buildStatics(h); this.group.add(this.statics); }
    const tick = this.world.life?.tick ?? 0;
    if (tick !== this.lastTick) {
      this.lastTick = tick; this.tickAt = performance.now();
      this.herd.advance(h, this.tickSeconds);
      for (const v of h.villagers) {
        const p = this.people.get(v.id);
        if (p) {
          // Blend from where the villager is drawn now (no pop on late ticks); heading/speed use the logical step.
          const nx = v.x / DM, nz = v.z / DM;
          p.step = Math.hypot(nx - p.cur.x, nz - p.cur.z);
          if (p.step > 0.05) p.heading = Math.atan2(nx - p.cur.x, nz - p.cur.z);
          p.prev = Math.hypot(nx - p.shown.x, nz - p.shown.z) > SNAP_DISTANCE ? { x: nx, z: nz } : { x: p.shown.x, z: p.shown.z };
          p.cur = { x: nx, z: nz };
        }
      }
      this.refreshFields(h);
      this.refreshTroughs(h);
    }
    // A gate set by the owner between ticks shows at once.
    if (this.world.revision !== this.revisionSeen) { this.revisionSeen = this.world.revision; this.refreshTroughs(h); }
    const alpha = Math.min(1, (performance.now() - this.tickAt) / (this.tickSeconds * 1000));
    this.herd.draw(this.world, h, alpha, frameDt, this.ground);
    this.drawPeople(h, alpha, frameDt);
  }

  private refreshFields(h: HomesteadState): void {
    const key = h.plots.map((p) => `${p.id}:${p.x},${p.z},${p.w},${p.d}:${p.crop}:${p.state}:${cropStage(p)}:${Math.round((p.moisture / MOISTURE_MAX) * 3)}`).join('|');
    if (key === this.fieldKey) return;
    this.fieldKey = key;
    for (const c of this.fields.children) (c as THREE.Mesh).geometry.dispose();
    this.fields.clear();
    for (const p of h.plots) this.fields.add(fieldMesh(this.world, p, this.ground));
  }

  private refreshTroughs(h: HomesteadState): void {
    const key = h.enclosures.map((e) => `${e.id}:${Math.round(e.water / 3)}:${Math.round(e.feed / 3)}:${e.eggs > 0 ? 1 : 0}`).join('|')
      + `|barn:${Math.ceil(Object.values(h.overflow).reduce((a, b) => a + b, 0) / 20)}|gates:${(h.gates ?? []).map((g) => g.state).join(',')}`
      + `|sites:${(h.sites ?? []).map((st) => `${st.id}:${st.state}:${st.work}:${st.rot ?? 0}:${JSON.stringify(st.delivered)}:${JSON.stringify(st.stock ?? null)}`).join(';')}`;
    if (key === this.troughKey) return;
    this.troughKey = key;
    for (const c of this.dynamic.children) (c as THREE.Mesh).geometry.dispose();
    this.dynamic.clear();
    const list: B[] = [];
    for (const f of homesteadLayout(h)) {
      const e = h.enclosures.find((q) => q.id === f.id);
      if (!e || !f.trough) continue;
      const x = f.trough.x / DM, z = f.trough.z / DM;
      trough(list, x, z, this.ground(x, z), e.water, e.feed);
      if (e.id === 'coop' && e.eggs > 0) {
        const r = f.rect;
        for (let i = 0; i < Math.min(6, e.eggs); i++) list.push({ w: 0.08, h: 0.1, d: 0.08, x: r.x0 / DM + 1.3 + i * 0.14, y: this.ground(r.x0 / DM + 1.3, r.z0 / DM + 3.4) + 0.1, z: r.z0 / DM + 3.4, c: '#F4EBD8' });
      }
    }
    // The barn beside the store: an open-fronted shed whose sacks show how full it is (one per 20).
    const bx = FOUNDER_STOCKPILE.x + 4.2, bz = FOUNDER_STOCKPILE.z - 0.4, by = this.ground(bx, bz);
    for (const [px, pz] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) list.push({ w: 0.2, h: 2.4, d: 0.2, x: bx + px, y: by, z: bz + pz, c: WOOD_DARK });
    list.push({ w: 3.6, h: 1.6, d: 0.12, x: bx, y: by, z: bz - 1.25, c: WOOD });
    list.push({ w: 0.12, h: 1.6, d: 2.5, x: bx - 1.7, y: by, z: bz, c: WOOD }, { w: 0.12, h: 1.6, d: 2.5, x: bx + 1.7, y: by, z: bz, c: WOOD });
    list.push({ w: 4, h: 0.2, d: 3, x: bx, y: by + 2.4, z: bz, c: '#8E4A30' }, { w: 3.2, h: 0.2, d: 2.2, x: bx, y: by + 2.6, z: bz, c: '#A2573A' });
    const loose = Object.values(h.overflow).reduce((a, b) => a + b, 0);
    for (let i = 0; i < Math.ceil(loose / 20); i++) {
      const x = bx - 1.2 + (i % 4) * 0.8, z = bz - 0.6 + Math.floor(i / 4) % 2 * 0.8, y = by + Math.floor(i / 8) * 0.55;
      list.push({ w: 0.62, h: 0.52, d: 0.62, x, y, z, c: i % 2 ? '#B89B6A' : '#9C7A4C' });
    }
    // Gate leaves and the farmhouse door show the simulated state (closed for a legacy homestead, which has no gates in its state).
    const leaves = drawnLeaves(h);
    for (const g of homesteadGates(h)) {
      if (g.id.startsWith('gate:')) { gateLeaf(list, g.x, g.z, leaves[g.id], this.ground); continue; }
      const house = homesteadLayout(h).find((f) => f.kind === 'farmhouse')!;
      const r = { x0: house.rect.x0 / DM, z0: house.rect.z0 / DM, x1: house.rect.x1 / DM, z1: house.rect.z1 / DM };
      doorLeaf(list, g.x + 0.5, r.z1, this.lowest(r) + COTTAGE_DOOR.plinth, leaves[g.id]);
    }
    // v4 building sites share this mesh (no extra draw call).
    for (const st of h.sites ?? []) siteBoxes(list, st, this.ground);
    if (list.length) {
      const m = mesh(list, 'homestead_troughs');
      m.userData.leaves = leaves;
      this.dynamic.add(m);
    }
  }

  private drawPeople(h: HomesteadState, alpha: number, dt: number): void {
    for (const v of h.villagers) {
      let p = this.people.get(v.id);
      if (!p || p.role !== v.role) {
        if (p) this.group.remove(p.fig.root);
        const fig = buildFigure(ROLE_STYLE[v.role] ?? FARMER_STYLE);
        fig.root.name = `villager_${v.id}`;
        fig.root.userData = { villagerId: v.id, name: v.name, role: v.role };
        // The load rides on the shoulder (on the torso joint, so it moves with the walk).
        const load = new THREE.Mesh(loadGeometry('other'), LOAD_MAT);
        load.name = 'villager_load';
        load.position.set(0, 0.62, -0.18);
        load.visible = false;
        load.castShadow = true;
        fig.torso.add(load);
        this.group.add(fig.root);
        const at = { x: v.x / DM, z: v.z / DM };
        p = { fig, role: v.role, load, loadKind: 'other', prev: at, cur: at, shown: { ...at }, heading: 0, step: 0 };
        this.people.set(v.id, p);
      }
      const x = p.prev.x + (p.cur.x - p.prev.x) * alpha, z = p.prev.z + (p.cur.z - p.prev.z) * alpha;
      p.shown.x = x; p.shown.z = z;
      const dist = p.step;
      const working = v.task?.legs[v.task.leg]?.op === 'work' && v.task.kind !== 'rest' && v.task.kind !== 'idle';
      const resting = v.task?.kind === 'rest' && dist < 0.05;
      p.fig.root.visible = !resting; // indoors at night
      const y = this.ground(x, z);
      placeFigure(p.fig, x, y, z, p.heading);
      const speed = dist / this.tickSeconds;
      const state = { mode: 'ground', speed, grounded: true } as unknown as CharacterState;
      // STAB-002 S4: the gait cycle follows the ground speed (1.3 m/s under v1 to v6, 1.95 m/s under v7) with planted feet.
      animateFigure(p.fig, state, dt, undefined, plantedStride(speed));
      if (working && speed < 0.1) {
        // A simple work motion: both arms swing down and forward (digging, pouring, milking).
        const t = performance.now() / 260;
        p.fig.armL.rotation.x = -0.9 + Math.sin(t) * 0.6;
        p.fig.armR.rotation.x = -0.9 + Math.sin(t) * 0.6;
        p.fig.torso.rotation.x = 0.25;
      }
      p.fig.root.userData.task = v.task?.kind ?? 'idle';
      // What the sim says is in hand (water is a can, not drawn here).
      const kind = !v.carry || v.carry.item === 'water' ? '' : v.carry.item === 'wood' ? 'wood' : v.carry.item === 'fiber' ? 'fiber' : 'other';
      p.load.visible = !!kind && p.fig.root.visible;
      if (kind && kind !== p.loadKind) { p.load.geometry = loadGeometry(kind as 'wood' | 'fiber' | 'other'); p.loadKind = kind; }
      p.fig.root.userData.carry = v.carry ? `${v.carry.amount} ${v.carry.item}` : null;
    }
  }

  metrics(): Record<string, unknown> {
    const dyn = this.dynamic.children[0] as THREE.Mesh | undefined;
    return {
      leaves: dyn?.userData.leaves ?? null,
      fields: this.fields.children.length,
      herd: Object.fromEntries([...this.herd.batches].map(([k, b]) => [k, b.count])),
      villagers: [...this.people.values()].map((p) => ({ visible: p.fig.root.visible, task: p.fig.root.userData.task, role: p.role, load: p.load.visible ? p.loadKind : null,
        x: Math.round(p.fig.root.position.x * 10) / 10, z: Math.round(p.fig.root.position.z * 10) / 10 })),
    };
  }
}
