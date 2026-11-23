// Render layer — living creatures (ambient tier) over the sim fauna rules.
//
// FaunaView owns the ambient creature records for resident near chunks:
// spawned deterministically when a chunk loads, dropped when it unloads, and
// stepped at the fixed FAUNA_STEP rate. Rendering is instanced: per species one
// body mesh and one limb mesh (legs swing; fish tails flex), so a full near
// ring of wildlife costs five draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import palette from '../data/palette.json';
import { World } from '../sim/world';
import { Creature, FAUNA_STEP, FaunaContext, SPECIES, spawnChunkFauna, stepCreature } from '../sim/fauna';

const M = palette.materials as Record<string, { hex: string }>;
const C = (k: string) => new THREE.Color(M[k].hex);
const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

interface Box { w: number; h: number; d: number; x?: number; y?: number; z?: number; c: string; }
function boxes(list: Box[]): THREE.BufferGeometry {
  const geos = list.map((b) => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d).toNonIndexed();
    g.translate(b.x ?? 0, (b.y ?? 0) + b.h / 2, b.z ?? 0);
    g.deleteAttribute('uv');
    const col = C(b.c), n = g.attributes.position.count, cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const k = g.attributes.normal.getY(i) > 0.5 ? 1 : 0.86;
      cols[i * 3] = col.r * k; cols[i * 3 + 1] = col.g * k; cols[i * 3 + 2] = col.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g;
  });
  const merged = mergeGeometries(geos)!;
  geos.forEach((g) => g.dispose());
  return merged;
}

// Deer: deep chest, slimmer hindquarters, raised neck, small antlers. Legs are
// separate instances hinged at the body (y = 0.85).
const DEER_BODY = boxes([
  { w: 0.36, h: 0.42, d: 0.62, y: 0.82, z: 0.18, c: 'fauna_deer' },
  { w: 0.32, h: 0.36, d: 0.55, y: 0.86, z: -0.36, c: 'fauna_deer' },
  { w: 0.30, h: 0.10, d: 0.9, y: 0.80, z: -0.05, c: 'fauna_light' },
  { w: 0.16, h: 0.42, d: 0.18, y: 1.12, z: 0.50, c: 'fauna_deer' },
  { w: 0.18, h: 0.18, d: 0.32, y: 1.50, z: 0.62, c: 'fauna_deer' },
  { w: 0.04, h: 0.22, d: 0.04, x: 0.06, y: 1.66, z: 0.56, c: 'fauna_light' },
  { w: 0.04, h: 0.22, d: 0.04, x: -0.06, y: 1.66, z: 0.56, c: 'fauna_light' },
  { w: 0.12, h: 0.04, d: 0.04, x: 0.11, y: 1.84, z: 0.56, c: 'fauna_light' },
  { w: 0.12, h: 0.04, d: 0.04, x: -0.11, y: 1.84, z: 0.56, c: 'fauna_light' },
  { w: 0.10, h: 0.10, d: 0.06, y: 1.0, z: -0.66, c: 'fauna_light' },
]);
const DEER_LEG = boxes([{ w: 0.08, h: 0.85, d: 0.09, y: -0.85, c: 'fauna_deer' }]);
const HARE_BODY = boxes([
  { w: 0.20, h: 0.18, d: 0.34, y: 0.10, z: -0.02, c: 'fauna_hare' },
  { w: 0.14, h: 0.13, d: 0.15, y: 0.20, z: 0.17, c: 'fauna_hare' },
  { w: 0.035, h: 0.16, d: 0.05, x: 0.035, y: 0.32, z: 0.14, c: 'fauna_hare' },
  { w: 0.035, h: 0.16, d: 0.05, x: -0.035, y: 0.32, z: 0.14, c: 'fauna_hare' },
  { w: 0.07, h: 0.07, d: 0.05, y: 0.16, z: -0.2, c: 'fauna_light' },
]);
const HARE_LEG = boxes([{ w: 0.06, h: 0.10, d: 0.16, y: -0.10, z: 0.03, c: 'fauna_hare' }]);
const TROUT = boxes([
  { w: 0.08, h: 0.09, d: 0.26, y: -0.045, z: 0.04, c: 'fauna_trout' },
  { w: 0.07, h: 0.04, d: 0.24, y: -0.08, z: 0.04, c: 'fauna_trout_belly' },
  { w: 0.02, h: 0.05, d: 0.08, y: 0.04, z: 0.02, c: 'fauna_trout' },
]);
const TROUT_TAIL = boxes([
  { w: 0.05, h: 0.06, d: 0.10, y: -0.03, z: -0.05, c: 'fauna_trout' },
  { w: 0.02, h: 0.11, d: 0.06, y: -0.055, z: -0.12, c: 'fauna_trout' },
]);

const MAX = { deer: 48, rabbit: 48, trout: 160 } as const;
const LEGS: Record<string, Array<[number, number]>> = {
  deer: [[0.13, 0.36], [-0.13, 0.36], [0.12, -0.52], [-0.12, -0.52]],
  rabbit: [[0.07, 0.1], [-0.07, 0.1], [0.08, -0.12], [-0.08, -0.12]],
};

export class FaunaView {
  readonly group = new THREE.Group();
  private creatures = new Map<string, Creature[]>();
  private phases = new Map<string, number>();
  private accumulator = 0;
  private meshes: Record<string, { body: THREE.InstancedMesh; limb: THREE.InstancedMesh }>;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(private readonly world: World) {
    this.group.name = 'fauna';
    const make = (geo: THREE.BufferGeometry, n: number, name: string) => {
      const mesh = new THREE.InstancedMesh(geo, material, n);
      mesh.name = name;
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    };
    this.meshes = {
      deer: { body: make(DEER_BODY, MAX.deer, 'fauna_deer'), limb: make(DEER_LEG, MAX.deer * 4, 'fauna_deer_legs') },
      rabbit: { body: make(HARE_BODY, MAX.rabbit, 'fauna_hare'), limb: make(HARE_LEG, MAX.rabbit * 4, 'fauna_hare_legs') },
      trout: { body: make(TROUT, MAX.trout, 'fauna_trout'), limb: make(TROUT_TAIL, MAX.trout, 'fauna_trout_tails') },
    };
  }

  /** Reconcile creature records with the resident near-chunk set. */
  sync(loaded: ReadonlySet<string>): void {
    for (const [key, list] of [...this.creatures]) {
      if (loaded.has(key)) continue;
      for (const c of list) this.phases.delete(c.id);
      this.creatures.delete(key);
    }
    for (const key of loaded) {
      if (this.creatures.has(key)) continue;
      const [cx, cz] = key.split(',').map(Number);
      this.creatures.set(key, spawnChunkFauna(this.world, cx, cz));
    }
  }

  get count(): number {
    let n = 0;
    for (const list of this.creatures.values()) n += list.length;
    return n;
  }

  all(): Creature[] { return [...this.creatures.values()].flat(); }

  update(dt: number, ctx: FaunaContext): void {
    this.accumulator = Math.min(this.accumulator + dt, FAUNA_STEP * 4);
    while (this.accumulator >= FAUNA_STEP) {
      for (const list of this.creatures.values()) for (const c of list) stepCreature(this.world, c, ctx);
      this.accumulator -= FAUNA_STEP;
    }
    this.draw(dt);
  }

  private draw(dt: number): void {
    const counts: Record<string, number> = { deer: 0, rabbit: 0, trout: 0 };
    const limbCounts: Record<string, number> = { deer: 0, rabbit: 0, trout: 0 };
    for (const list of this.creatures.values()) {
      for (const c of list) {
        const sp = c.species;
        const i = counts[sp];
        if (i >= MAX[sp]) continue;
        const ph = (this.phases.get(c.id) ?? 0) + dt * (2 + c.speed * (sp === 'rabbit' ? 5 : 2.2));
        this.phases.set(c.id, ph);
        const set = this.meshes[sp];
        // Body: grazing lowers the head end; sleeping lies down; hares hop.
        let pitch = 0, lift = 0, roll = 0;
        if (sp !== 'trout') {
          if (c.behaviour === 'graze') pitch = 0.22;
          if (c.behaviour === 'sleep' || c.behaviour === 'rest') lift = sp === 'deer' ? -0.5 : -0.06;
          if (sp === 'rabbit' && c.speed > 0) lift = Math.abs(Math.sin(ph)) * 0.18;
          if (sp === 'deer' && c.speed > 3) lift = Math.abs(Math.sin(ph)) * 0.15;
        } else {
          roll = Math.sin(ph * 1.5) * 0.05;
        }
        this.e.set(pitch, c.heading, roll, 'YXZ');
        this.q.setFromEuler(this.e);
        this.v.set(c.x, c.y + lift, c.z);
        set.body.setMatrixAt(i, this.m.compose(this.v, this.q, this.one));
        counts[sp] = i + 1;

        if (sp === 'trout') {
          // Tail flex: the tail instance yaws around the body's rear.
          const flex = Math.sin(ph * (c.speed > 1 ? 9 : 4)) * 0.45;
          this.e.set(0, c.heading + flex, roll, 'YXZ');
          this.q.setFromEuler(this.e);
          const back = 0.09;
          this.v.set(c.x - Math.sin(c.heading) * back, c.y, c.z - Math.cos(c.heading) * back);
          set.limb.setMatrixAt(limbCounts.trout++, this.m.compose(this.v, this.q, this.one));
          continue;
        }
        const legs = LEGS[sp];
        const hinge = sp === 'deer' ? 0.85 : 0.1;
        const swing = c.speed > 0 ? 0.55 : 0;
        const sleeping = c.behaviour === 'sleep' || c.behaviour === 'rest';
        for (let k = 0; k < 4; k++) {
          const [lx, lz] = legs[k];
          const a = sleeping ? 1.2 : Math.sin(ph + (k === 0 || k === 3 ? 0 : Math.PI)) * swing;
          const ch = Math.cos(c.heading), sh = Math.sin(c.heading);
          const wx = c.x + lx * ch + lz * sh, wz = c.z - lx * sh + lz * ch;
          this.e.set(a, c.heading, 0, 'YXZ');
          this.q.setFromEuler(this.e);
          this.v.set(wx, c.y + hinge + lift, wz);
          set.limb.setMatrixAt(limbCounts[sp]++, this.m.compose(this.v, this.q, this.one));
        }
      }
    }
    for (const sp of ['deer', 'rabbit', 'trout'] as const) {
      const set = this.meshes[sp];
      set.body.count = counts[sp];
      set.limb.count = limbCounts[sp];
      set.body.instanceMatrix.needsUpdate = true;
      set.limb.instanceMatrix.needsUpdate = true;
      set.body.visible = counts[sp] > 0;
      set.limb.visible = limbCounts[sp] > 0;
    }
  }

  metrics(): Record<string, number> {
    const out: Record<string, number> = { total: 0 };
    for (const c of this.all()) { out[c.species] = (out[c.species] ?? 0) + 1; out.total++; }
    return out;
  }
}

export { SPECIES };
