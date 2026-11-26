// W2: loose natural pickups (branch, stones, fibre plant, grass tuft, berry
// bush, mushroom) and dropped piles, drawn in the plain block style of the
// vegetation kit. One InstancedMesh per kind (7 draw calls at most), no
// shadows cast. The simulation decides what exists (sim/gathering.ts); this
// view only draws the live records near the player and drops a picked one on
// the next sync. Also the stone axe held in the hand.
import * as THREE from 'three';
import { Block, blocksGeometry } from './vegetation-kit';
import { natureMaterial } from './nature';
import type { LivePickup, PickupKind, WildItem } from '../sim/gathering';

// W3: logs (a single log, and a stack for a pile of several, e.g. at a stockpile).
// W6: mined material (a heap) and ingots (a bar), one mesh each, coloured per item (instance colour).
// W8: arrows lying on the ground, a folded hide, and meat or bone (a tinted heap).
type DrawKind = PickupKind | 'pile' | 'log' | 'log_stack' | 'mineral' | 'ingot' | 'arrow' | 'hide';
const KINDS: DrawKind[] = ['branch', 'loose_stone', 'fiber_plant', 'grass_tuft', 'berry_bush', 'mushroom', 'pile', 'log', 'log_stack', 'mineral', 'ingot', 'arrow', 'hide'];
/** W6: the tint of mined material and ingots lying on the ground. */
export const ITEM_TINT: Partial<Record<WildItem, string>> = {
  iron_ore: '#b5683e', copper_ore: '#3fa892', coal: '#333333', clay: '#b0724c', sand: '#e3d197', gravel: '#9c988e',
  iron_ingot: '#8d939a', copper_ingot: '#d1834a',
  // W8 (plain, bloodless colours).
  raw_meat: '#c9806e', cooked_meat: '#8c5a3a', bone: '#ebe5d3', hide: '#9b6b44', arrow: '#ffffff', blunt_arrow: '#8a6a4a',
};
const TINTED = new Set<DrawKind>(['mineral', 'ingot', 'arrow', 'hide']);
const LOG = '#7A5638', LOG_CUT = '#E2C997';
const log = (x: number, y: number, z: number, len = 1.1, r = 0.34): Block[] => [
  { x, y, z, w: len, h: r, d: r, hex: LOG },
  { x: x - len / 2 - 0.01, y, z, w: 0.03, h: r * 0.86, d: r * 0.86, hex: LOG_CUT },
  { x: x + len / 2 + 0.01, y, z, w: 0.03, h: r * 0.86, d: r * 0.86, hex: LOG_CUT },
];
const MAX_PER_KIND = 256;

const BARK = '#7A5638', BARK_D = '#5E412A', STONE = '#9A9890', STONE_D = '#7E7C76', FIBRE = '#9DB45A', FIBRE_D = '#7E9A44',
  GRASS = '#B7C96A', LEAF = '#4F8A3E', BERRY = '#C4344A', STEM = '#E9DFC6', CAP = '#B5553A', SOIL = '#8C7350';

function plan(kind: DrawKind): Block[] {
  switch (kind) {
    case 'branch': return [
      { x: 0, y: 0.07, z: 0, w: 1.5, h: 0.13, d: 0.14, hex: BARK },
      { x: 0.35, y: 0.07, z: 0.2, w: 0.09, h: 0.09, d: 0.36, hex: BARK_D },
      { x: -0.45, y: 0.06, z: -0.13, w: 0.08, h: 0.08, d: 0.24, hex: BARK_D },
    ];
    case 'loose_stone': return [
      { x: 0, y: 0.13, z: 0, w: 0.46, h: 0.26, d: 0.36, hex: STONE },
      { x: 0.3, y: 0.08, z: 0.16, w: 0.22, h: 0.16, d: 0.2, hex: STONE_D },
    ];
    case 'fiber_plant': return [
      { x: 0, y: 0.05, z: 0, w: 0.3, h: 0.1, d: 0.3, hex: FIBRE_D },
      { x: 0.08, y: 0.45, z: 0, w: 0.07, h: 0.8, d: 0.07, hex: FIBRE },
      { x: -0.09, y: 0.38, z: 0.07, w: 0.07, h: 0.66, d: 0.07, hex: FIBRE },
      { x: 0, y: 0.34, z: -0.1, w: 0.07, h: 0.58, d: 0.07, hex: FIBRE_D },
    ];
    case 'grass_tuft': return [
      { x: 0, y: 0.17, z: 0, w: 0.34, h: 0.34, d: 0.12, hex: GRASS },
      { x: 0, y: 0.13, z: 0, w: 0.12, h: 0.26, d: 0.32, hex: GRASS },
    ];
    case 'berry_bush': return [
      { x: 0, y: 0.3, z: 0, w: 0.8, h: 0.6, d: 0.75, hex: LEAF },
      { x: 0.28, y: 0.45, z: 0.39, w: 0.13, h: 0.13, d: 0.06, hex: BERRY, omit: 32 },
      { x: -0.2, y: 0.3, z: 0.39, w: 0.13, h: 0.13, d: 0.06, hex: BERRY, omit: 32 },
      { x: 0.41, y: 0.25, z: -0.15, w: 0.06, h: 0.13, d: 0.13, hex: BERRY, omit: 2 },
      { x: -0.1, y: 0.62, z: 0.05, w: 0.13, h: 0.06, d: 0.13, hex: BERRY, omit: 8 },
    ];
    case 'mushroom': return [
      { x: 0, y: 0.1, z: 0, w: 0.09, h: 0.2, d: 0.09, hex: STEM },
      { x: 0, y: 0.24, z: 0, w: 0.32, h: 0.09, d: 0.32, hex: CAP },
      { x: 0.2, y: 0.06, z: 0.12, w: 0.06, h: 0.12, d: 0.06, hex: STEM },
      { x: 0.2, y: 0.14, z: 0.12, w: 0.16, h: 0.05, d: 0.16, hex: CAP },
    ];
    case 'pile': return [
      { x: 0, y: 0.08, z: 0, w: 0.6, h: 0.16, d: 0.5, hex: SOIL },
      { x: 0.05, y: 0.2, z: 0, w: 0.36, h: 0.1, d: 0.3, hex: BARK },
    ];
    case 'mineral': return [
      { x: 0, y: 0.08, z: 0, w: 0.62, h: 0.16, d: 0.54, hex: '#e2e2e2' },
      { x: 0.04, y: 0.21, z: -0.02, w: 0.38, h: 0.14, d: 0.34, hex: '#ffffff' },
      { x: -0.2, y: 0.07, z: 0.22, w: 0.18, h: 0.14, d: 0.16, hex: '#c9c9c9' },
    ];
    case 'ingot': return [
      { x: 0, y: 0.07, z: 0, w: 0.5, h: 0.14, d: 0.22, hex: '#ffffff' },
      { x: 0, y: 0.15, z: 0, w: 0.42, h: 0.03, d: 0.16, hex: '#dcdcdc' },
    ];
    case 'arrow': return [
      { x: 0, y: 0.03, z: 0, w: 0.03, h: 0.03, d: 0.7, hex: BARK },
      { x: 0, y: 0.03, z: 0.37, w: 0.06, h: 0.04, d: 0.07, hex: STONE },
      { x: 0, y: 0.03, z: -0.3, w: 0.09, h: 0.012, d: 0.12, hex: FIBRE },
      { x: 0.08, y: 0.03, z: 0.02, w: 0.03, h: 0.03, d: 0.66, hex: BARK, omit: 0 },
    ];
    case 'hide': return [
      { x: 0, y: 0.04, z: 0, w: 0.7, h: 0.08, d: 0.5, hex: '#ffffff' },
      { x: 0.05, y: 0.1, z: -0.05, w: 0.5, h: 0.05, d: 0.36, hex: '#e6e6e6' },
    ];
    case 'log': return log(0, 0.17, 0);
    case 'log_stack': return [...log(0, 0.17, -0.19), ...log(0, 0.17, 0.19), ...log(0, 0.48, 0)];
  }
}

export class PickupView {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<DrawKind, THREE.InstancedMesh>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly pos = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly tint = new THREE.Color();
  /** Instances drawn after the last sync. */
  count = 0;

  constructor() {
    this.group.name = 'w2_pickups';
    for (const kind of KINDS) {
      const mesh = new THREE.InstancedMesh(blocksGeometry(plan(kind)), natureMaterial, MAX_PER_KIND);
      mesh.name = `pickup_${kind}`;
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      if (TINTED.has(kind)) mesh.setColorAt(0, new THREE.Color('#ffffff'));
      this.meshes.set(kind, mesh);
      this.group.add(mesh);
    }
  }

  /** Draw exactly these live records. `groundY` gives the drawn ground (resident terrain). */
  sync(list: readonly LivePickup[], groundY: (x: number, z: number) => number | null): void {
    const counts = new Map<DrawKind, number>();
    this.count = 0;
    for (const p of list) {
      const tint = p.kind === 'pile' ? ITEM_TINT[p.item] : undefined;
      const kind: DrawKind = p.kind === 'pile' && p.item === 'log' ? (p.qty > 1 ? 'log_stack' : 'log')
        : tint ? (p.item.endsWith('_ingot') ? 'ingot' : p.item === 'arrow' || p.item === 'blunt_arrow' ? 'arrow' : p.item === 'hide' ? 'hide' : 'mineral') : p.kind;
      const mesh = this.meshes.get(kind)!;
      const i = counts.get(kind) ?? 0;
      if (i >= MAX_PER_KIND) continue;
      const y = groundY(p.x, p.z) ?? p.y;
      this.q.setFromAxisAngle(this.up, kind === 'log' || kind === 'log_stack' ? pileTurn(p.id) : p.rot);
      // A partly picked bush or plant looks a little smaller.
      const s = p.kind === 'berry_bush' || p.kind === 'fiber_plant' ? 0.8 + 0.1 * Math.min(2, p.qty - 1) : 0.9 + 0.08 * p.variant;
      this.m.compose(this.pos.set(p.x, y, p.z), this.q, this.one.set(s, s, s));
      mesh.setMatrixAt(i, this.m);
      if (tint) mesh.setColorAt(i, this.tint.set(tint));
      counts.set(kind, i + 1);
      this.count++;
    }
    for (const [kind, mesh] of this.meshes) {
      mesh.count = counts.get(kind) ?? 0;
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

/** A fixed turn per pile id, so logs do not all lie parallel. */
function pileTurn(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 628) / 100;
}

/** W6: the stone pickaxe for the right hand: a haft and a two-pointed stone head across it. */
export function buildHeldPickaxe(): THREE.Mesh {
  const g = blocksGeometry([
    { x: 0, y: -0.62, z: 0.14, w: 0.06, h: 0.06, d: 0.66, hex: BARK },
    { x: 0, y: -0.62, z: 0.47, w: 0.08, h: 0.44, d: 0.09, hex: STONE_D },
    { x: 0, y: -0.62, z: 0.42, w: 0.08, h: 0.08, d: 0.05, hex: FIBRE_D },
  ]);
  const mesh = new THREE.Mesh(g, natureMaterial);
  mesh.name = 'held_stone_pickaxe';
  mesh.castShadow = true;
  mesh.visible = false;
  return mesh;
}

/** The stone axe: a haft and a lashed stone head, for the right hand (arm space, the hand at y ≈ -0.6). */
export function buildHeldAxe(): THREE.Mesh {
  const g = blocksGeometry([
    { x: 0, y: -0.62, z: 0.12, w: 0.06, h: 0.06, d: 0.62, hex: BARK },
    { x: 0, y: -0.62, z: 0.44, w: 0.09, h: 0.2, d: 0.12, hex: STONE },
    { x: 0, y: -0.62, z: 0.37, w: 0.08, h: 0.08, d: 0.05, hex: FIBRE_D },
  ]);
  const mesh = new THREE.Mesh(g, natureMaterial);
  mesh.name = 'held_stone_axe';
  mesh.castShadow = true;
  mesh.visible = false;
  return mesh;
}
