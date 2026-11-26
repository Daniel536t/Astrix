// W4: the wilderness buildings, drawn from simulation state only
// (sim/wild-build.ts). Plain-coloured block models per catalogue kind, built
// up stage by stage: a planned site shows its stakes and lines, each finished
// stage adds its parts, and the stage being worked rises with its work. All
// buildings share one merged mesh (rebuilt only when a site changes), so the
// whole set is one draw call plus its shadow; a lit campfire's flames are one
// small instanced mesh that flickers.
import * as THREE from 'three';
import type { World } from '../sim/world';
import { buildingDef } from '../sim/catalogue';
import type { WildSite } from '../sim/wild-build';
import { B, boxes } from './homestead';

const LOG = '#7A5534', LOG_D = '#5C3F26', CUT = '#D9BD8A', STONE = '#8E8E88', STONE_D = '#74746F', BRANCH = '#6E5B3B', LEAVES = '#5F7D3A',
  CORD = '#C9B27C', PLANK = '#B98C57', PLANK_D = '#9C7446', STAKE = '#E2D3A6', LINE = '#F1E6C0', ASH = '#3A3530', IRON = '#55585C';
const MAX_FIRES = 8;
/** Triangles in one box part (non-indexed: 12). */
const BOX_TRIANGLES = 12;

/**
 * W4 rendering budgets. The whole scene stays under the project's budget
 * (120 draw calls and 250k triangles a frame, the owner's spec), measured in
 * the browser from renderer.info; the buildings stay a small, fixed share of
 * it whatever the player builds: every site in one merged mesh plus one
 * instanced flame mesh (2 meshes, so 2 draw calls a pass), at most
 * TRIANGLES_PER_BUILDING per building in any construction stage, and so at
 * most MAX_WILD_SITES of them. Tests assert each model and stage
 * (tests/w4.ui.test.ts); the browser walkthrough measures the scene.
 */
export const SCENE_BUDGET = { drawCalls: 120, triangles: 250_000 } as const;
export const BUILDINGS_BUDGET = {
  meshes: 2,
  trianglesPerBuilding: 300,
  /** 32 sites at the per-building cap. */
  triangles: 32 * 300,
  /** The flames: MAX_FIRES instances of 3 boxes. */
  flameTriangles: MAX_FIRES * 3 * BOX_TRIANGLES,
} as const;
/** Is a measured frame (renderer.info) within the scene budget? */
export function withinSceneBudget(drawCalls: number, triangles: number): { drawCalls: number; triangles: number; limits: typeof SCENE_BUDGET; ok: boolean } {
  return { drawCalls, triangles, limits: SCENE_BUDGET, ok: drawCalls <= SCENE_BUDGET.drawCalls && triangles <= SCENE_BUDGET.triangles };
}
/** Triangles a site's model has now (its boxes; non-indexed boxes are 12 each). */
export function siteTriangles(s: WildSite): number { return siteBoxes(s).length * BOX_TRIANGLES; }

/** Footprint-local parts of a kind (door at +z, rotation 0), by stage index. */
function stageParts(kind: string, W: number, D: number, s: WildSite): B[][] {
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, c: string): B => ({ x, y, z, w, h, d, c });
  switch (kind) {
    case 'lean_to': return [
      // Ground frame: two branches on the ground.
      [box(1.5, 0, 0.3, 2.9, 0.12, 0.12, BRANCH), box(1.5, 0, 1.75, 2.9, 0.12, 0.12, BRANCH)],
      // Ridge log on two posts at the back.
      [box(0.2, 0, 0.3, 0.2, 1.8, 0.2, LOG_D), box(2.8, 0, 0.3, 0.2, 1.8, 0.2, LOG_D), box(1.5, 1.72, 0.3, 3.1, 0.26, 0.26, LOG),
        box(-0.02, 1.72, 0.3, 0.04, 0.24, 0.24, CUT), box(3.02, 1.72, 0.3, 0.04, 0.24, 0.24, CUT)],
      // Branch roof sloping down to the front, lashed with cord.
      [box(1.5, 1.45, 0.55, 3, 0.16, 0.6, LEAVES), box(1.5, 1.0, 1.05, 3, 0.16, 0.55, BRANCH), box(1.5, 0.55, 1.5, 3, 0.16, 0.5, LEAVES),
        box(1.5, 0.12, 1.85, 3, 0.16, 0.3, BRANCH), box(0.6, 1.5, 0.55, 0.05, 0.2, 0.62, CORD), box(2.4, 1.5, 0.55, 0.05, 0.2, 0.62, CORD),
        box(1.5, 0, 0.12, 3, 1.75, 0.18, BRANCH)],
    ];
    case 'campfire': {
      const ring: B[] = [];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        ring.push(box(1 + Math.cos(a) * 0.62, 0, 1 + Math.sin(a) * 0.62, 0.3, 0.22, 0.3, k % 2 ? STONE : STONE_D));
      }
      ring.push(box(1, 0, 1, 0.8, 0.04, 0.8, ASH));
      return [ring, [box(1, 0.06, 1, 0.9, 0.12, 0.14, BRANCH), box(1, 0.16, 1, 0.14, 0.12, 0.9, LOG_D), box(1, 0.26, 1, 0.6, 0.1, 0.12, BRANCH)]];
    }
    case 'workbench': return [
      [box(0.2, 0, 0.2, 0.3, 0.2, 0.3, STONE), box(1.8, 0, 0.2, 0.3, 0.2, 0.3, STONE), box(0.2, 0, 0.8, 0.3, 0.2, 0.3, STONE_D), box(1.8, 0, 0.8, 0.3, 0.2, 0.3, STONE_D)],
      [box(0.2, 0.2, 0.2, 0.16, 0.55, 0.16, LOG_D), box(1.8, 0.2, 0.2, 0.16, 0.55, 0.16, LOG_D), box(0.2, 0.2, 0.8, 0.16, 0.55, 0.16, LOG_D), box(1.8, 0.2, 0.8, 0.16, 0.55, 0.16, LOG_D),
        box(1, 0.35, 0.5, 1.7, 0.1, 0.1, LOG)],
      [box(1, 0.75, 0.5, 2, 0.16, 0.9, PLANK), box(1, 0.91, 0.25, 0.5, 0.05, 0.2, IRON), box(1.6, 0.91, 0.7, 0.3, 0.08, 0.3, STONE)],
    ];
    case 'log_store': {
      const logs = Math.min(6, s.stock?.log ?? 0);
      const stack: B[] = [];
      for (let k = 0; k < logs; k++) stack.push(box(1, 0.3 + Math.floor(k / 3) * 0.3, 0.3 + (k % 3) * 0.32, 1.9, 0.28, 0.28, k % 2 ? LOG : LOG_D));
      return [
        [box(1, 0, 0.25, 2, 0.2, 0.3, STONE), box(1, 0, 1.05, 2, 0.2, 0.3, STONE_D)],
        [box(0.1, 0.2, 0.1, 0.18, 1.1, 0.18, LOG_D), box(1.9, 0.2, 0.1, 0.18, 1.1, 0.18, LOG_D), box(0.1, 0.2, 1.2, 0.18, 0.9, 0.18, LOG_D), box(1.9, 0.2, 1.2, 0.18, 0.9, 0.18, LOG_D), ...stack],
        [box(1, 1.3, 0.55, 2.2, 0.14, 1.3, LEAVES), box(1, 1.15, 1.25, 2.2, 0.12, 0.35, BRANCH)],
      ];
    }
    case 'storage_shed': return [
      [box(0.3, 0, 0.3, 0.4, 0.25, 0.4, STONE), box(2.7, 0, 0.3, 0.4, 0.25, 0.4, STONE), box(0.3, 0, 2.7, 0.4, 0.25, 0.4, STONE_D), box(2.7, 0, 2.7, 0.4, 0.25, 0.4, STONE_D)],
      [box(0.3, 0.25, 0.3, 0.2, 2, 0.2, LOG_D), box(2.7, 0.25, 0.3, 0.2, 2, 0.2, LOG_D), box(0.3, 0.25, 2.7, 0.2, 2, 0.2, LOG_D), box(2.7, 0.25, 2.7, 0.2, 2, 0.2, LOG_D),
        box(1.5, 2.2, 0.3, 2.6, 0.18, 0.18, LOG), box(1.5, 2.2, 2.7, 2.6, 0.18, 0.18, LOG)],
      [box(1.5, 0.25, 0.25, 2.7, 1.95, 0.1, PLANK), box(0.25, 0.25, 1.5, 0.1, 1.95, 2.6, PLANK_D), box(2.75, 0.25, 1.5, 0.1, 1.95, 2.6, PLANK_D),
        box(0.75, 0.25, 2.75, 1.0, 1.95, 0.1, PLANK), box(2.25, 0.25, 2.75, 1.0, 1.95, 0.1, PLANK), box(1.5, 2.3, 1.5, 3.3, 0.16, 3.3, PLANK_D),
        box(1.5, 0.25, 1.2, 0.9, 0.6, 0.6, PLANK)],
    ];
  }
  // Unknown (later) kinds are never placed; draw a plain block per stage.
  const d = buildingDef(kind);
  return (d?.stages ?? []).map((_, i) => [box(W / 2, i * 0.5, D / 2, W, 0.5, D, i % 2 ? PLANK : STONE)]);
}

/** Stakes at the corners and a line around a site that is only marked out. */
function stakes(W: number, D: number): B[] {
  const out: B[] = [];
  for (const [x, z] of [[0.05, 0.05], [W - 0.05, 0.05], [0.05, D - 0.05], [W - 0.05, D - 0.05]]) out.push({ x, y: 0, z, w: 0.08, h: 0.55, d: 0.08, c: STAKE });
  out.push({ x: W / 2, y: 0.4, z: 0.05, w: W, h: 0.02, d: 0.02, c: LINE }, { x: W / 2, y: 0.4, z: D - 0.05, w: W, h: 0.02, d: 0.02, c: LINE },
    { x: 0.05, y: 0.4, z: D / 2, w: 0.02, h: 0.02, d: D, c: LINE }, { x: W - 0.05, y: 0.4, z: D / 2, w: 0.02, h: 0.02, d: D, c: LINE });
  return out;
}

/** The parts drawn for a site now: finished stages, and the stage being worked rising with its work. */
export function siteBoxes(s: WildSite): B[] {
  const d = buildingDef(s.kind);
  if (!d) return [];
  const W = d.footprint.w, D = d.footprint.d;
  const parts = stageParts(s.kind, W, D, s);
  const local: B[] = [];
  if (s.state !== 'done') local.push(...stakes(W, D));
  for (let i = 0; i < parts.length; i++) {
    if (i < s.stage) local.push(...parts[i]);
    else if (i === s.stage && s.work > 0) {
      const f = Math.max(0.25, s.work / d.stages[i].work);
      for (const b of parts[i]) local.push({ ...b, h: b.h * f });
    }
  }
  // Footprint-local to world: the same quarter-turn mapping as the simulation's collision boxes.
  return local.map((b) => {
    let x = b.x, z = b.z, w = b.w, dd = b.d;
    switch (s.rot) {
      case 1: x = b.z; z = W - b.x; w = b.d; dd = b.w; break;
      case 2: x = W - b.x; z = D - b.z; break;
      case 3: x = D - b.z; z = b.x; w = b.d; dd = b.w; break;
    }
    return { ...b, x: s.x + x, z: s.z + z, w, d: dd, y: s.y + b.y };
  });
}

export class WildBuildingsView {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly flames: THREE.InstancedMesh;
  private key = '';
  private fires: Array<{ x: number; y: number; z: number; seed: number }> = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  /** Metrics. */
  drawn = { sites: 0, triangles: 0, fires: 0, rebuilds: 0, meshes: 1 };

  constructor() {
    this.group.name = 'w4_buildings';
    const flameGeo = boxes([
      { x: 0, y: 0, z: 0, w: 0.42, h: 0.5, d: 0.42, c: '#F08A24' },
      { x: 0.02, y: 0.12, z: -0.02, w: 0.24, h: 0.55, d: 0.24, c: '#FFD45A' },
      { x: -0.12, y: 0, z: 0.1, w: 0.16, h: 0.3, d: 0.16, c: '#F25A1E' },
    ]);
    this.flames = new THREE.InstancedMesh(flameGeo, new THREE.MeshBasicMaterial({ vertexColors: true }), MAX_FIRES);
    this.flames.name = 'w4_flames';
    this.flames.count = 0;
    this.flames.frustumCulled = false;
    this.group.add(this.flames);
  }

  /** Rebuild the merged mesh when a site changed; place the flames of lit fires. */
  sync(world: World): void {
    const b = world.wild?.build;
    const sites = b ? [...b.sites.values()].sort((a, c) => a.id.localeCompare(c.id)) : [];
    const key = sites.map((s) => `${s.id}:${s.kind}:${s.x},${s.z},${s.rot}:${s.y}:${s.state}:${s.stage}:${s.work}:${(s.fuel ?? 0) > 0 ? 1 : 0}:${Math.min(6, s.stock?.log ?? 0)}`).join('|');
    if (key === this.key) return;
    this.key = key;
    if (this.mesh) { this.mesh.geometry.dispose(); this.group.remove(this.mesh); this.mesh = null; }
    const list = sites.flatMap((s) => siteBoxes(s));
    if (list.length) {
      this.mesh = new THREE.Mesh(boxes(list), this.material);
      this.mesh.name = 'w4_buildings_mesh';
      this.mesh.castShadow = true; this.mesh.receiveShadow = true;
      this.group.add(this.mesh);
    }
    this.fires = sites.filter((s) => s.state === 'done' && (s.fuel ?? 0) > 0 && buildingDef(s.kind)?.function.kind === 'fire').slice(0, MAX_FIRES)
      // The campfire is square (2 x 2): its fire is at the footprint's centre whatever the rotation.
      .map((s, i) => ({ x: s.x + 1, y: s.y + 0.2, z: s.z + 1, seed: i * 1.7 }));
    this.drawn = { sites: sites.length, triangles: this.mesh ? this.mesh.geometry.attributes.position.count / 3 : 0, fires: this.fires.length, rebuilds: this.drawn.rebuilds + 1,
      meshes: this.group.children.filter((c) => (c as THREE.Mesh).isMesh).length };
  }

  /** Every frame: the flames flicker. */
  update(time: number): void {
    this.flames.count = this.fires.length;
    for (let i = 0; i < this.fires.length; i++) {
      const f = this.fires[i];
      const k = 0.85 + 0.18 * Math.sin(time * 11 + f.seed) + 0.1 * Math.sin(time * 23.7 + f.seed * 3);
      this.p.set(f.x, f.y, f.z);
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), time * 1.3 + f.seed);
      this.sc.set(1, k, 1);
      this.m.compose(this.p, this.q, this.sc);
      this.flames.setMatrixAt(i, this.m);
    }
    this.flames.instanceMatrix.needsUpdate = true;
    this.flames.visible = this.fires.length > 0;
  }
}
