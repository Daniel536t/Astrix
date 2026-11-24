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
  CROP_RULES, DM, Facility, HomesteadState, MOISTURE_MAX, Plot, Species, TROUGH_MAX, cropStage, fieldRect,
  homesteadLayout, SPECIES_RULES, unitsOf,
} from '../sim/homestead';
import { FOUNDER_STOCKPILE } from '../sim/economy';
import { buildCottage, buildWell } from './village-kit';
import { Figure, FARMER_STYLE, HERDER_STYLE, buildFigure, animateFigure, placeFigure } from './characters';
import type { CharacterState } from '../sim/character';

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

type B = { w: number; h: number; d: number; x: number; y: number; z: number; c: string; ry?: number };
/** Merge boxes (y = bottom) into one vertex-coloured geometry with simple face shading. */
function boxes(list: B[]): THREE.BufferGeometry {
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

/** Fence posts and two rails around a rect (metres, local to `ox, oz`), with a gate gap on the +z side. */
function fence(list: B[], x0: number, z0: number, x1: number, z1: number, ground: (x: number, z: number) => number, gate = true): void {
  const post = (x: number, z: number) => { const y = ground(x, z); list.push({ w: 0.16, h: 1.05, d: 0.16, x, y, z, c: WOOD_DARK }); };
  const rail = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az), y = (ground(ax, az) + ground(bx, bz)) / 2, ry = Math.atan2(bz - az, bx - ax);
    for (const h of [0.45, 0.85]) list.push({ w: len, h: 0.09, d: 0.07, x: (ax + bx) / 2, y: y + h, z: (az + bz) / 2, c: WOOD, ry: -ry });
  };
  const side = (ax: number, az: number, bx: number, bz: number, skipMiddle: boolean) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 2));
    for (let i = 0; i <= n; i++) post(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n);
    for (let i = 0; i < n; i++) {
      if (skipMiddle && i === Math.floor(n / 2)) continue;
      rail(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, ax + ((bx - ax) * (i + 1)) / n, az + ((bz - az) * (i + 1)) / n);
    }
  };
  side(x0, z0, x1, z0, false); side(x1, z0, x1, z1, false); side(x1, z1, x0, z1, gate); side(x0, z1, x0, z0, false);
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
  fence(list, lx0, lz0, lx1, lz1, ground);
  const m = mesh(list, `field_${p.id}`);
  m.userData = { fieldId: p.id, crop: p.crop, state: p.state, stage, units: unitsOf(p), moisture: p.moisture };
  return m;
}

// ---------- animals ----------

type Part = { w: number; h: number; d: number; x?: number; y: number; z?: number; c: string };
const ANIMAL_PARTS: Record<Species, Part[]> = {
  chicken: [
    { w: 0.28, h: 0.24, d: 0.36, y: 0.14, c: '#F2EEE4' }, { w: 0.16, h: 0.16, d: 0.16, y: 0.34, z: 0.18, c: '#F2EEE4' },
    { w: 0.06, h: 0.07, d: 0.1, y: 0.48, z: 0.18, c: '#C8322A' }, { w: 0.06, h: 0.05, d: 0.08, y: 0.36, z: 0.29, c: '#E0A030' },
    { w: 0.04, h: 0.14, d: 0.04, x: -0.07, y: 0, c: '#E0A030' }, { w: 0.04, h: 0.14, d: 0.04, x: 0.07, y: 0, c: '#E0A030' },
    { w: 0.2, h: 0.14, d: 0.1, y: 0.3, z: -0.2, c: '#E6E0D2' },
  ],
  sheep: [
    { w: 0.7, h: 0.55, d: 1.0, y: 0.38, c: '#EDE6D6' }, { w: 0.3, h: 0.34, d: 0.32, y: 0.62, z: 0.58, c: '#3A3330' },
    { w: 0.14, h: 0.1, d: 0.06, x: -0.2, y: 0.78, z: 0.55, c: '#3A3330' }, { w: 0.14, h: 0.1, d: 0.06, x: 0.2, y: 0.78, z: 0.55, c: '#3A3330' },
    ...[[-0.22, 0.32], [0.22, 0.32], [-0.22, -0.32], [0.22, -0.32]].map(([x, z]) => ({ w: 0.13, h: 0.4, d: 0.13, x, y: 0, z, c: '#3A3330' })),
  ],
  goat: [
    { w: 0.5, h: 0.45, d: 0.9, y: 0.48, c: '#9C8B76' }, { w: 0.24, h: 0.3, d: 0.3, y: 0.82, z: 0.52, c: '#8A7A66' },
    { w: 0.05, h: 0.22, d: 0.05, x: -0.08, y: 1.08, z: 0.46, c: '#5A4E42' }, { w: 0.05, h: 0.22, d: 0.05, x: 0.08, y: 1.08, z: 0.46, c: '#5A4E42' },
    { w: 0.08, h: 0.14, d: 0.06, y: 0.68, z: 0.64, c: '#6E6152' },
    ...[[-0.16, 0.3], [0.16, 0.3], [-0.16, -0.3], [0.16, -0.3]].map(([x, z]) => ({ w: 0.1, h: 0.5, d: 0.1, x, y: 0, z, c: '#6E6152' })),
  ],
  pig: [
    { w: 0.6, h: 0.5, d: 1.0, y: 0.24, c: '#E7A7A0' }, { w: 0.38, h: 0.34, d: 0.26, y: 0.34, z: 0.58, c: '#E29A93' },
    { w: 0.2, h: 0.14, d: 0.08, y: 0.4, z: 0.74, c: '#D2847C' }, { w: 0.1, h: 0.1, d: 0.04, x: -0.13, y: 0.66, z: 0.56, c: '#D2847C' },
    { w: 0.1, h: 0.1, d: 0.04, x: 0.13, y: 0.66, z: 0.56, c: '#D2847C' },
    ...[[-0.18, 0.32], [0.18, 0.32], [-0.18, -0.32], [0.18, -0.32]].map(([x, z]) => ({ w: 0.13, h: 0.26, d: 0.13, x, y: 0, z, c: '#D2847C' })),
  ],
  cattle: [
    { w: 0.85, h: 0.75, d: 1.7, y: 0.65, c: '#4A3A2E' }, { w: 0.86, h: 0.4, d: 0.5, y: 0.9, z: -0.2, c: '#EDE6D6' },
    { w: 0.42, h: 0.42, d: 0.5, y: 1.05, z: 1.0, c: '#4A3A2E' }, { w: 0.3, h: 0.2, d: 0.14, y: 1.0, z: 1.28, c: '#D9B6A0' },
    { w: 0.6, h: 0.08, d: 0.08, y: 1.48, z: 0.95, c: '#E8DEC6' },
    ...[[-0.3, 0.6], [0.3, 0.6], [-0.3, -0.6], [0.3, -0.6]].map(([x, z]) => ({ w: 0.18, h: 0.65, d: 0.18, x, y: 0, z, c: '#3A2E24' })),
  ],
  horse: [
    { w: 0.6, h: 0.65, d: 1.6, y: 0.95, c: '#7A4E2E' }, { w: 0.3, h: 0.7, d: 0.34, y: 1.3, z: 0.78, c: '#7A4E2E' },
    { w: 0.28, h: 0.3, d: 0.62, y: 1.78, z: 1.0, c: '#6E4528' }, { w: 0.1, h: 0.6, d: 0.3, y: 1.4, z: 0.66, c: '#2E2018' },
    { w: 0.12, h: 0.6, d: 0.12, y: 0.75, z: -0.86, c: '#2E2018' },
    ...[[-0.2, 0.62], [0.2, 0.62], [-0.2, -0.62], [0.2, -0.62]].map(([x, z]) => ({ w: 0.15, h: 0.95, d: 0.15, x, y: 0, z, c: '#5A3820' })),
  ],
};
const ANIMAL_CAP = 64;

/** One instanced mesh per species: up to 6 draw calls for every animal on the farm. */
class Herd {
  readonly meshes = new Map<Species, THREE.InstancedMesh>();
  private readonly prev = new Map<string, { x: number; z: number; heading: number }>();
  private readonly cur = new Map<string, { x: number; z: number; heading: number }>();
  constructor(group: THREE.Group) {
    for (const sp of Object.keys(ANIMAL_PARTS) as Species[]) {
      const g = boxes(ANIMAL_PARTS[sp].map((p) => ({ x: 0, z: 0, ...p })));
      const im = new THREE.InstancedMesh(g, MAT, ANIMAL_CAP);
      im.name = `herd_${sp}`; im.castShadow = true; im.receiveShadow = true; im.count = 0; im.frustumCulled = false;
      group.add(im);
      this.meshes.set(sp, im);
    }
  }
  /** Called when a new tick arrives: the old positions become the interpolation start. */
  advance(h: HomesteadState): void {
    this.prev.clear();
    for (const [id, p] of this.cur) this.prev.set(id, p);
    this.cur.clear();
    for (const a of h.animals) {
      const old = this.prev.get(a.id);
      const x = a.x / DM, z = a.z / DM;
      const moved = old ? Math.hypot(x - old.x, z - old.z) : 0;
      const heading = old && moved > 0.05 ? Math.atan2(x - old.x, z - old.z) : old?.heading ?? hash(a.x, a.z) * Math.PI * 2;
      this.cur.set(a.id, { x, z, heading });
    }
  }
  draw(world: World, h: HomesteadState, alpha: number, ground: (x: number, z: number) => number): void {
    const counts = new Map<Species, number>();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), tick = world.life?.tick ?? 0;
    for (const a of h.animals) {
      const c = this.cur.get(a.id); if (!c) continue;
      const p = this.prev.get(a.id) ?? c;
      const x = p.x + (c.x - p.x) * alpha, z = p.z + (c.z - p.z) * alpha;
      const walking = Math.hypot(c.x - p.x, c.z - p.z) > 0.05;
      const bob = walking ? Math.abs(Math.sin((performance.now() / 160) + hash(a.x, 0) * 6)) * 0.04 : 0;
      const young = tick - a.born < SPECIES_RULES[a.species].adultAge;
      const s = young ? 0.6 : 1;
      pos.set(x, ground(x, z) + bob, z); q.setFromAxisAngle(up, c.heading); scl.set(s, s, s);
      const im = this.meshes.get(a.species)!;
      const i = counts.get(a.species) ?? 0;
      if (i >= ANIMAL_CAP) continue;
      im.setMatrixAt(i, m4.compose(pos, q, scl));
      counts.set(a.species, i + 1);
    }
    for (const [sp, im] of this.meshes) {
      im.count = counts.get(sp) ?? 0;
      im.instanceMatrix.needsUpdate = true;
    }
  }
}

// ---------- the view ----------

export class HomesteadView {
  readonly group = new THREE.Group();
  private statics: THREE.Group | null = null;
  private readonly dynamic = new THREE.Group();
  private readonly fields = new THREE.Group();
  private readonly herd: Herd;
  private readonly people = new Map<string, { fig: Figure; role: string; prev: { x: number; z: number }; cur: { x: number; z: number }; heading: number }>();
  private fieldKey = '';
  private troughKey = '';
  private lastTick = -1;
  private tickAt = 0;

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
        const house = buildCottage({ width: r.x1 - r.x0, depth: r.z1 - r.z0, roof: 'thatch', seed: 31, chimney: true });
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
      // Enclosures: fence around the rect, plus a shelter that matches the species.
      fence(list, r.x0, r.z0, r.x1, r.z1, this.ground);
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
        const y = this.lowest({ x0: r.x0 + 0.5, z0: r.z0 + 0.5, x1: r.x0 + 5.5, z1: r.z0 + 3.5 });
        for (const [px, pz] of [[0.6, 0.6], [5.4, 0.6], [0.6, 3.4], [5.4, 3.4]]) list.push({ w: 0.25, h: 2.4, d: 0.25, x: r.x0 + px, y, z: r.z0 + pz, c: WOOD_DARK });
        list.push({ w: 5.6, h: 0.22, d: 3.6, x: r.x0 + 3, y: y + 2.4, z: r.z0 + 2, c: '#9C7A4C' });
        list.push({ w: 5.4, h: 0.4, d: 0.12, x: r.x0 + 3, y: y + 0.2, z: r.z0 + 0.5, c: WOOD });
        list.push({ w: 1.8, h: 0.9, d: 1, x: r.x0 + 1.5, y, z: r.z0 + 1.5, c: STRAW });
      } else if (f.kind === 'pen') {
        const y = this.lowest({ x0: r.x0 + 0.5, z0: r.z0 + 0.5, x1: r.x0 + 3.5, z1: r.z0 + 2.5 });
        for (const [px, pz] of [[0.6, 0.6], [3.4, 0.6], [0.6, 2.4], [3.4, 2.4]]) list.push({ w: 0.2, h: 1.8, d: 0.2, x: r.x0 + px, y, z: r.z0 + pz, c: WOOD_DARK });
        list.push({ w: 3.4, h: 0.2, d: 2.4, x: r.x0 + 2, y: y + 1.8, z: r.z0 + 1.5, c: '#9C7A4C' });
      }
      const m = mesh(list, `facility_${f.id}`);
      m.userData.facility = f.id;
      g.add(m);
    }
    return g;
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
      this.herd.advance(h);
      for (const v of h.villagers) {
        const p = this.people.get(v.id);
        if (p) { p.prev = p.cur; p.cur = { x: v.x / DM, z: v.z / DM }; }
      }
      this.refreshFields(h);
      this.refreshTroughs(h);
    }
    const alpha = Math.min(1, (performance.now() - this.tickAt) / (this.tickSeconds * 1000));
    this.herd.draw(this.world, h, alpha, this.ground);
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
      + `|barn:${Math.ceil(Object.values(h.overflow).reduce((a, b) => a + b, 0) / 20)}`;
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
    if (list.length) this.dynamic.add(mesh(list, 'homestead_troughs'));
  }

  private drawPeople(h: HomesteadState, alpha: number, dt: number): void {
    for (const v of h.villagers) {
      let p = this.people.get(v.id);
      if (!p || p.role !== v.role) {
        if (p) this.group.remove(p.fig.root);
        const fig = buildFigure(v.role === 'farmer' ? FARMER_STYLE : HERDER_STYLE);
        fig.root.name = `villager_${v.id}`;
        fig.root.userData = { villagerId: v.id, name: v.name, role: v.role };
        this.group.add(fig.root);
        const at = { x: v.x / DM, z: v.z / DM };
        p = { fig, role: v.role, prev: at, cur: at, heading: 0 };
        this.people.set(v.id, p);
      }
      const x = p.prev.x + (p.cur.x - p.prev.x) * alpha, z = p.prev.z + (p.cur.z - p.prev.z) * alpha;
      const dist = Math.hypot(p.cur.x - p.prev.x, p.cur.z - p.prev.z);
      if (dist > 0.05) p.heading = Math.atan2(p.cur.x - p.prev.x, p.cur.z - p.prev.z);
      const working = v.task?.legs[v.task.leg]?.op === 'work' && v.task.kind !== 'rest' && v.task.kind !== 'idle';
      const resting = v.task?.kind === 'rest' && dist < 0.05;
      p.fig.root.visible = !resting; // indoors at night
      const y = this.ground(x, z);
      placeFigure(p.fig, x, y, z, p.heading);
      const speed = dist / this.tickSeconds;
      const state = { mode: 'ground', speed, grounded: true } as unknown as CharacterState;
      animateFigure(p.fig, state, dt);
      if (working && speed < 0.1) {
        // A simple work motion: both arms swing down and forward (digging, pouring, milking).
        const t = performance.now() / 260;
        p.fig.armL.rotation.x = -0.9 + Math.sin(t) * 0.6;
        p.fig.armR.rotation.x = -0.9 + Math.sin(t) * 0.6;
        p.fig.torso.rotation.x = 0.25;
      }
      p.fig.root.userData.task = v.task?.kind ?? 'idle';
    }
  }

  metrics(): Record<string, unknown> {
    return {
      fields: this.fields.children.length,
      herd: Object.fromEntries([...this.herd.meshes].map(([k, m]) => [k, m.count])),
      villagers: [...this.people.values()].map((p) => ({ visible: p.fig.root.visible, task: p.fig.root.userData.task,
        x: Math.round(p.fig.root.position.x * 10) / 10, z: Math.round(p.fig.root.position.z * 10) / 10 })),
    };
  }
}
