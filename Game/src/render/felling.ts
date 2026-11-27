// W3: the presentation of physical tree felling. The simulation (sim/felling.ts)
// decides every state; this view only draws it:
//  - a damaged tree is drawn by a proxy (its own block model, taken out of the
//    nature batch) with a dark notch band and a pale cut whose size follows the
//    simulated hit points, and it shakes when a swing lands;
//  - a felled tree's proxy rotates about its foot toward the simulated fall
//    direction over FALL_S seconds while the M013 stump is already drawn;
//    then the trunk record is drawn lying;
//  - fallen trunks (instanced, shortened as logs come off) and stockpile
//    markers, in the plain block style of the vegetation kit.
import * as THREE from 'three';
import type { Entity, World } from '../sim/world';
import { DIRS16, Standing, Trunk, choppable } from '../sim/felling';
import type { TreeSpecies } from '../sim/vegetation';
import { vegetationVariant } from '../sim/vegetation';
import { blocksGeometry, vegetationPlan } from './vegetation-kit';
import { natureGeometry, natureMaterial } from './nature';
import { LOD_NEAR } from './lod';

/** The fall: rotation about the foot (s). */
export const FALL_S = 1.5;
const SHAKE_S = 0.45;
const MAX_TRUNKS = 128;
const MAX_PROXIES = 6;
/** Damaged trees are drawn with their notch within this distance of the player (m). */
const PROXY_RADIUS = 40;

const BARK = '#6E4E33', BARK_D = '#553B26', CUT = '#E2C997', CUT_D = '#C9AC78', NOTCH = '#2F2318', POST = '#8A6A44', FLAG = '#D8B23A';

interface Proxy {
  id: string; group: THREE.Group; notch: THREE.Mesh; chip: THREE.Mesh;
  trunkW: number; shakeAt: number; shakeAxis: THREE.Vector3;
  fall: { at: number; dx: number; dz: number; trunkId: string } | null;
}

export interface NatureHider { setHidden(id: string, on: boolean): void }

export class FellingView {
  readonly group = new THREE.Group();
  private readonly trunks: THREE.InstancedMesh;
  private readonly ends: THREE.InstancedMesh;
  private readonly marks: THREE.InstancedMesh;
  private readonly proxies = new Map<string, Proxy>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  /** Trunks still hidden behind their falling tree. */
  private readonly falling = new Set<string>();
  /** Drawn counts (metrics). */
  drawn = { trunks: 0, stockpiles: 0, proxies: 0, fallDeg: [] as number[] };
  falls = 0;

  constructor() {
    this.group.name = 'w3_felling';
    // A trunk of unit length along +x, unit height and depth, resting on y = 0; bark bands keep the block look.
    const trunkGeo = blocksGeometry([
      { x: 0.5, y: 0.5, z: 0, w: 1, h: 1, d: 1, hex: BARK },
      { x: 0.22, y: 0.5, z: 0, w: 0.05, h: 1.04, d: 1.04, hex: BARK_D },
      { x: 0.61, y: 0.5, z: 0, w: 0.04, h: 1.04, d: 1.04, hex: BARK_D },
      { x: 0.86, y: 0.5, z: 0, w: 0.05, h: 1.04, d: 1.04, hex: BARK_D },
    ]);
    this.trunks = this.instanced(trunkGeo, MAX_TRUNKS, 'w3_trunks', true);
    const endGeo = blocksGeometry([
      { x: 0, y: 0.5, z: 0, w: 0.04, h: 0.9, d: 0.9, hex: CUT },
      { x: 0, y: 0.5, z: 0, w: 0.05, h: 0.4, d: 0.4, hex: CUT_D },
    ]);
    this.ends = this.instanced(endGeo, MAX_TRUNKS * 2, 'w3_trunk_ends', false);
    const markGeo = blocksGeometry([
      { x: -1.2, y: 0.35, z: -1.2, w: 0.14, h: 0.7, d: 0.14, hex: POST },
      { x: 1.2, y: 0.35, z: -1.2, w: 0.14, h: 0.7, d: 0.14, hex: POST },
      { x: -1.2, y: 0.35, z: 1.2, w: 0.14, h: 0.7, d: 0.14, hex: POST },
      { x: 1.2, y: 0.8, z: 1.2, w: 0.14, h: 1.6, d: 0.14, hex: POST },
      { x: 1.42, y: 1.42, z: 1.2, w: 0.42, h: 0.28, d: 0.04, hex: FLAG },
      { x: 0, y: 0.06, z: -1.2, w: 2.4, h: 0.12, d: 0.12, hex: BARK_D },
      { x: 0, y: 0.06, z: 1.2, w: 2.4, h: 0.12, d: 0.12, hex: BARK_D },
      { x: -1.2, y: 0.06, z: 0, w: 0.12, h: 0.12, d: 2.4, hex: BARK_D },
      { x: 1.2, y: 0.06, z: 0, w: 0.12, h: 0.12, d: 2.4, hex: BARK_D },
    ]);
    this.marks = this.instanced(markGeo, 8, 'w3_stockpiles', true);
  }

  private instanced(g: THREE.BufferGeometry, n: number, name: string, shadow: boolean): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(g, natureMaterial, n);
    mesh.name = name;
    mesh.count = 0;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }

  /** A swing landed on this tree: shake it (presentation only, after `delayMs`). */
  hit(id: string, delayMs = 0): void {
    const pr = this.proxies.get(id);
    if (pr) pr.shakeAt = performance.now() + delayMs;
    else this.pendingHits.set(id, performance.now() + delayMs);
  }
  private readonly pendingHits = new Map<string, number>();

  /** The simulation felled this tree: animate the fall toward the trunk's direction, then show the trunk. */
  fall(world: World, e: Entity, t: Trunk, nature: NatureHider | null, delayMs = 0): void {
    let pr = this.proxies.get(e.id);
    if (!pr) pr = this.addProxy(e, t.sp, t.stage);
    const [dx, dz] = DIRS16[t.dir];
    pr.fall = { at: performance.now() + delayMs, dx, dz, trunkId: t.id };
    pr.notch.visible = true;
    this.falling.add(t.id);
    // The stump is drawn by the nature batch from now on.
    nature?.setHidden(e.id, false);
    this.falls++;
    void world;
  }

  get fallingCount(): number { return this.falling.size; }

  private addProxy(e: Entity, sp: TreeSpecies, stage: Standing): Proxy {
    const variant = vegetationVariant(e);
    const plan = vegetationPlan(sp, stage, variant);
    const geo = natureGeometry({ key: `${sp}:${stage}:${variant}`, plan }, LOD_NEAR);
    const group = new THREE.Group();
    group.name = `w3_tree_${e.id}`;
    group.position.set(e.x, e.y - 0.15, e.z);
    const body = new THREE.Group();
    body.rotation.y = e.rot;
    body.scale.setScalar(e.scale);
    const mesh = new THREE.Mesh(geo, natureMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
    const tw = (plan.trunk[0]?.w ?? 0.5);
    const notch = new THREE.Mesh(blocksGeometry([{ x: 0, y: 0, z: 0, w: 1, h: 1, d: 1, hex: NOTCH }]), natureMaterial);
    const chip = new THREE.Mesh(blocksGeometry([{ x: 0, y: 0, z: 0, w: 1, h: 1, d: 1, hex: CUT }]), natureMaterial);
    body.add(notch, chip);
    group.add(body);
    this.group.add(group);
    const pr: Proxy = { id: e.id, group, notch, chip, trunkW: tw, shakeAt: this.pendingHits.get(e.id) ?? -1, shakeAxis: new THREE.Vector3(1, 0, 0), fall: null };
    this.pendingHits.delete(e.id);
    this.proxies.set(e.id, pr);
    return pr;
  }

  private removeProxy(pr: Proxy, nature: NatureHider | null): void {
    this.group.remove(pr.group);
    pr.notch.geometry.dispose(); pr.chip.geometry.dispose();
    this.proxies.delete(pr.id);
    if (!pr.fall) nature?.setHidden(pr.id, false);
  }

  /** Damage drawing: a dark band growing with the damage and a pale cut on the player's side. */
  private shapeDamage(pr: Proxy, frac: number, player: { x: number; z: number } | null, e: Entity): void {
    const w = pr.trunkW;
    const h = 0.08 + 0.22 * frac;
    pr.notch.scale.set(w * 1.06, h, w * 1.06);
    pr.notch.position.set(0, 0.75, 0);
    pr.notch.visible = frac > 0;
    // The pale cut faces the player (in the body's rotated frame).
    const ang = player ? Math.atan2(player.x - e.x, player.z - e.z) - e.rot : 0;
    const depth = 0.1 + 0.25 * frac;
    pr.chip.scale.set(w * (0.4 + 0.5 * frac), h * 0.8, depth);
    pr.chip.position.set(Math.sin(ang) * (w / 2 + 0.01 - depth / 2), 0.75, Math.cos(ang) * (w / 2 + 0.01 - depth / 2));
    pr.chip.rotation.y = ang;
    pr.chip.visible = frac > 0;
  }

  /**
   * Per frame: proxies for damaged trees near the player (hit points from the
   * simulation), shake and fall animations, trunks and stockpile markers.
   */
  update(world: World, player: { x: number; z: number } | null, groundY: (x: number, z: number) => number | null, nature: NatureHider | null): void {
    const f = world.wild?.fell;
    const now = performance.now();
    // Which damaged trees get a proxy: nearest first, bounded.
    const want = new Map<string, number>();
    if (f && player) {
      const list = [...f.chop.values()].map((c) => ({ c, e: world.entities.get(c.id) }))
        .filter((x) => x.e && Math.hypot(x.e.x - player.x, x.e.z - player.z) < PROXY_RADIUS)
        .sort((a, b) => Math.hypot(a.e!.x - player.x, a.e!.z - player.z) - Math.hypot(b.e!.x - player.x, b.e!.z - player.z))
        .slice(0, MAX_PROXIES);
      for (const x of list) want.set(x.c.id, 1 - x.c.hp / x.c.max);
    }
    for (const pr of [...this.proxies.values()]) {
      if (pr.fall) {
        const t = (now - pr.fall.at) / 1000;
        if (t > FALL_S + 0.25) { this.falling.delete(pr.fall.trunkId); this.removeProxy(pr, nature); }
        continue;
      }
      if (!want.has(pr.id)) this.removeProxy(pr, nature);
    }
    for (const [id, frac] of want) {
      const e = world.entities.get(id)!;
      let pr = this.proxies.get(id);
      if (!pr) {
        const life = stageOf(world, e);
        if (!life) continue;
        pr = this.addProxy(e, life.sp, life.stage);
      }
      nature?.setHidden(id, true);
      this.shapeDamage(pr, frac, player, e);
    }
    // Animate.
    const fallDeg: number[] = [];
    for (const pr of this.proxies.values()) {
      if (pr.fall) {
        const t = Math.max(0, Math.min(1, (now - pr.fall.at) / 1000 / FALL_S));
        // Slow start, accelerating fall, a small settle at the ground.
        const a = t < 1 ? (Math.PI / 2) * t * t : Math.PI / 2;
        this.q.setFromAxisAngle(this.p.set(pr.fall.dz, 0, -pr.fall.dx).normalize(), a);
        pr.group.quaternion.copy(this.q);
        fallDeg.push(Math.round(a * 180 / Math.PI));
        continue;
      }
      const st = (now - pr.shakeAt) / 1000;
      if (pr.shakeAt >= 0 && st >= 0 && st < SHAKE_S) {
        const amp = 0.045 * Math.exp(-st * 7) * Math.sin(st * 46);
        if (st < 0.02) pr.shakeAxis.set(Math.cos(pr.shakeAt), 0, Math.sin(pr.shakeAt)).normalize();
        pr.group.quaternion.setFromAxisAngle(pr.shakeAxis, amp);
      } else pr.group.quaternion.identity();
    }
    // Trunks and markers.
    let n = 0, k = 0;
    if (f) {
      for (const t of f.trunks.values()) {
        if (n >= MAX_TRUNKS || this.falling.has(t.id)) continue;
        if (player && Math.hypot(t.x - player.x, t.z - player.z) > 120) continue;
        const [dx, dz] = DIRS16[t.dir];
        const len = t.len / 10 * t.left / t.logs, d = t.r * 2 / 100;
        const y = groundY(t.x + dx * len / 2, t.z + dz * len / 2) ?? t.y;
        this.q.setFromAxisAngle(this.up, Math.atan2(-dz, dx));
        this.m.compose(this.p.set(t.x, y - 0.04, t.z), this.q, this.sc.set(len, d, d));
        this.trunks.setMatrixAt(n++, this.m);
        this.m.compose(this.p.set(t.x, y - 0.04, t.z), this.q, this.sc.set(1, d, d));
        this.ends.setMatrixAt(k++, this.m);
        this.m.compose(this.p.set(t.x + dx * len, y - 0.04, t.z + dz * len), this.q, this.sc.set(1, d, d));
        this.ends.setMatrixAt(k++, this.m);
      }
    }
    this.trunks.count = n; this.ends.count = k;
    this.trunks.visible = n > 0; this.ends.visible = k > 0;
    this.trunks.instanceMatrix.needsUpdate = true; this.ends.instanceMatrix.needsUpdate = true;
    let s = 0;
    for (const sp of f?.stockpiles.values() ?? []) {
      if (s >= 8) break;
      const y = groundY(sp.x, sp.z) ?? sp.y;
      this.m.compose(this.p.set(sp.x, y, sp.z), this.q.identity(), this.sc.set(1, 1, 1));
      this.marks.setMatrixAt(s++, this.m);
    }
    this.marks.count = s; this.marks.visible = s > 0; this.marks.instanceMatrix.needsUpdate = true;
    this.drawn = { trunks: n, stockpiles: s, proxies: this.proxies.size, fallDeg };
  }
}

function stageOf(world: World, e: Entity): { sp: TreeSpecies; stage: Standing } | null {
  const c = choppable(world, e);
  return c.ok ? { sp: c.sp, stage: c.stage } : null;
}
