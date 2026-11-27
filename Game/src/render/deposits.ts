// W6: natural deposits drawn from simulation state (sim/deposits.ts, sim/mining.ts), in the plain block style
// of the vegetation kit. Presentation only: the simulation decides what exists and what is left.
//  - clay, sand and gravel: a low mound, coloured per type, shrinking as it is dug out;
//  - coal: a dark seam of blocks on the stone slope, shrinking as it is mined;
//  - iron and copper: the existing ore outcrop (drawn by the nature view) with coloured vein blocks on it;
//  - a worked-out deposit: a flat scar of spoil; a worked-out outcrop is hidden from the nature view.
// Four instanced meshes (one draw call each when anything of that kind is near), per-instance colour.
import * as THREE from 'three';
import type { World } from '../sim/world';
import { Block, blocksGeometry } from './vegetation-kit';
import { natureMaterial } from './nature';
import type { NatureHider } from './felling';
import { Deposit, DepositType, typedDepositsNear } from '../sim/deposits';
import { depositLeft } from '../sim/mining';

const MAX = 128;
/** Drawn within this radius of the player (m). */
export const DEPOSIT_DRAW_RADIUS = 56;
const TINT: Record<DepositType, string> = { iron: '#c46a3c', copper: '#45b8a2', coal: '#3a3a3a', clay: '#b87a52', sand: '#e6d49a', gravel: '#a29e94' };
const W = '#ffffff', L = '#e4e4e4', D = '#c8c8c8';

const MOUND: Block[] = [
  { x: 0, y: 0.12, z: 0, w: 2.0, h: 0.24, d: 1.7, hex: L },
  { x: 0.1, y: 0.33, z: -0.05, w: 1.4, h: 0.22, d: 1.2, hex: W },
  { x: -0.15, y: 0.5, z: 0.05, w: 0.8, h: 0.16, d: 0.7, hex: L },
  { x: 0.7, y: 0.18, z: 0.55, w: 0.4, h: 0.2, d: 0.35, hex: D },
  { x: -0.75, y: 0.15, z: -0.5, w: 0.35, h: 0.16, d: 0.3, hex: D },
];
const SEAM: Block[] = [
  { x: 0, y: 0.25, z: 0, w: 1.6, h: 0.5, d: 1.1, hex: L },
  { x: 0.25, y: 0.65, z: 0.1, w: 0.9, h: 0.35, d: 0.8, hex: W },
  { x: -0.6, y: 0.2, z: 0.45, w: 0.5, h: 0.4, d: 0.45, hex: D },
  { x: 0.75, y: 0.15, z: -0.45, w: 0.45, h: 0.3, d: 0.4, hex: D },
];
/** Vein blocks set into an ore outcrop (its model is about 1.3 m across and 1.3 m high at scale 1). */
const VEIN: Block[] = [
  { x: 0.42, y: 0.55, z: 0.3, w: 0.22, h: 0.16, d: 0.22, hex: W },
  { x: -0.35, y: 0.8, z: 0.2, w: 0.18, h: 0.14, d: 0.2, hex: L },
  { x: 0.1, y: 1.05, z: -0.3, w: 0.2, h: 0.14, d: 0.18, hex: W },
  { x: -0.2, y: 0.35, z: -0.45, w: 0.2, h: 0.16, d: 0.2, hex: L },
];
const SCAR: Block[] = [
  { x: 0, y: 0.03, z: 0, w: 1.9, h: 0.06, d: 1.6, hex: '#6f6455' },
  { x: 0.5, y: 0.09, z: 0.3, w: 0.35, h: 0.12, d: 0.3, hex: '#857a6a' },
  { x: -0.5, y: 0.08, z: -0.35, w: 0.3, h: 0.1, d: 0.35, hex: '#5e5446' },
];

type Kind = 'mound' | 'seam' | 'vein' | 'scar';

export class DepositView {
  readonly group = new THREE.Group();
  private readonly meshes: Record<Kind, THREE.InstancedMesh>;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly hidden = new Set<string>();
  private key = '';
  /** Metrics. */
  drawn = { deposits: 0, mounds: 0, seams: 0, veins: 0, scars: 0, syncs: 0 };
  /** The deposits drawn now (the host targets them). */
  list: Deposit[] = [];

  constructor() {
    this.group.name = 'w6_deposits';
    const make = (name: Kind, plan: Block[], tint: boolean): THREE.InstancedMesh => {
      const mesh = new THREE.InstancedMesh(blocksGeometry(plan), natureMaterial, MAX);
      mesh.name = `deposit_${name}`;
      mesh.count = 0; mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false;
      if (tint) mesh.setColorAt(0, this.c.set('#ffffff'));
      this.group.add(mesh);
      return mesh;
    };
    this.meshes = { mound: make('mound', MOUND, true), seam: make('seam', SEAM, true), vein: make('vein', VEIN, true), scar: make('scar', SCAR, false) };
  }

  /** Draw the deposits within DEPOSIT_DRAW_RADIUS of `at`; worked-out outcrops are hidden from the nature view. */
  sync(world: World, at: { x: number; z: number } | null, groundY: (x: number, z: number) => number | null, nature: NatureHider | null): void {
    if (!at || !world.wild?.mine) { if (this.list.length) this.clear(); return; }
    const list = typedDepositsNear(world, at.x, at.z, DEPOSIT_DRAW_RADIUS);
    const key = `${Math.round(at.x / 4)},${Math.round(at.z / 4)}|${list.map((d) => `${d.id}:${depositLeft(world, d)}`).join(',')}`;
    if (key === this.key) return;
    this.key = key;
    this.list = list;
    const n: Record<Kind, number> = { mound: 0, seam: 0, vein: 0, scar: 0 };
    const put = (k: Kind, d: Deposit, s: number, y: number, rot: number, tint?: string) => {
      const mesh = this.meshes[k];
      const i = n[k];
      if (i >= MAX) return;
      this.q.setFromAxisAngle(this.up, rot);
      this.m.compose(this.p.set(d.x, y, d.z), this.q, this.sc.set(s, k === 'scar' ? 1 : s, s));
      mesh.setMatrixAt(i, this.m);
      if (tint) mesh.setColorAt(i, this.c.set(tint));
      n[k] = i + 1;
    };
    for (const d of list) {
      const left = depositLeft(world, d), frac = left / d.qty;
      const y = groundY(d.x, d.z) ?? d.y;
      const rot = turn(d.id);
      if (d.type === 'iron' || d.type === 'copper') {
        if (left > 0) put('vein', d, 0.95, y - 0.15, rot, TINT[d.type]);
        else { put('scar', d, 1, y, rot); if (!this.hidden.has(d.id)) { this.hidden.add(d.id); nature?.setHidden(d.id, true); } }
        continue;
      }
      if (left <= 0) { put('scar', d, 1, y, rot); continue; }
      put(d.type === 'coal' ? 'seam' : 'mound', d, 0.5 + 0.5 * frac, y - 0.05, rot, TINT[d.type]);
    }
    for (const k of Object.keys(this.meshes) as Kind[]) {
      const mesh = this.meshes[k];
      mesh.count = n[k];
      mesh.visible = n[k] > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.drawn = { deposits: list.length, mounds: n.mound, seams: n.seam, veins: n.vein, scars: n.scar, syncs: this.drawn.syncs + 1 };
  }

  private clear(): void {
    this.list = [];
    this.key = '';
    for (const mesh of Object.values(this.meshes)) { mesh.count = 0; mesh.visible = false; }
  }
}

/** A fixed turn per deposit id. */
function turn(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 628) / 100;
}
