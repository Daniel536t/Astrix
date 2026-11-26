// W8: hunting presentation, bloodless and in the plain block style. The
// simulation decides every flight and its outcome (sim/hunting.ts); this view
// only draws:
//  - the bow in the hand (and the arrow nocked while drawing);
//  - the aim preview: dots along the sim's own free ballistic path for the
//    current draw and aim (no collisions: a preview, not a promise);
//  - arrows in flight along the journaled shot's path, up to the recorded
//    impact, and arrows left standing where they struck (a short while);
//  - a small ring where an arrow struck, and a dazed ring over stunned animals.
// One InstancedMesh for all arrows, one Points for the preview, one ring mesh
// for impacts and one for dazed animals: at most five draw calls.
import * as THREE from 'three';
import { blocksGeometry } from './vegetation-kit';
import { natureMaterial } from './nature';
import { ArrowKind, flightPath } from '../sim/hunting';
import type { Flight } from '../sim/hunting';

const WOOD = '#8A6038', WOOD_D = '#5E412A', STRING = '#E9DFC6', FLETCH = '#B7C96A', HEAD = '#8E8C86', BLUNT = '#6E4A2C';
const ARROW_CAP = 24;
/** Arrows left standing where they struck stay drawn this long (s). */
const STUCK_S = 20;

export function buildHeldBow(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'held_bow';
  // A stave in three straight pieces (bent back at the tips) and the string; arm space, the hand at y ~ -0.6.
  const stave = blocksGeometry([
    { x: 0, y: -0.62, z: 0.08, w: 0.05, h: 0.62, d: 0.06, hex: WOOD },
    { x: 0, y: -0.24, z: 0.03, w: 0.045, h: 0.26, d: 0.05, hex: WOOD_D },
    { x: 0, y: -1.0, z: 0.03, w: 0.045, h: 0.26, d: 0.05, hex: WOOD_D },
    { x: 0, y: -0.62, z: -0.02, w: 0.012, h: 1.02, d: 0.012, hex: STRING },
  ]);
  const m = new THREE.Mesh(stave, natureMaterial);
  m.castShadow = true;
  g.add(m);
  g.visible = false;
  return g;
}

function arrowGeometry(): THREE.BufferGeometry {
  // Along +z, the tip at z = 0.7, the nock at 0.
  return blocksGeometry([
    { x: 0, y: 0, z: 0.35, w: 0.03, h: 0.03, d: 0.7, hex: WOOD },
    { x: 0, y: 0, z: 0.72, w: 0.06, h: 0.045, d: 0.07, hex: HEAD },
    { x: 0, y: 0, z: 0.07, w: 0.09, h: 0.012, d: 0.12, hex: FLETCH },
    { x: 0, y: 0, z: 0.07, w: 0.012, h: 0.09, d: 0.12, hex: FLETCH },
  ]);
}

interface Live { path: number[]; start: number; ms: number; kind: ArrowKind; stick: boolean; end: THREE.Vector3; dir: THREE.Vector3; landed: boolean; onLand?: () => void }

export class HuntView {
  readonly group = new THREE.Group();
  private readonly arrows: THREE.InstancedMesh;
  private readonly preview: THREE.Points;
  private readonly previewPos: Float32Array;
  private readonly ring: THREE.Mesh;
  private readonly dazed: THREE.InstancedMesh;
  private ringStart = -1;
  private readonly live: Live[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly fwd = new THREE.Vector3(0, 0, 1);
  private readonly tint = new THREE.Color();
  /** Evidence: flights drawn, landed, and the preview's point count. */
  readonly stats = { flights: 0, landed: 0, previewPoints: 0 };

  constructor() {
    this.group.name = 'w8_hunting';
    this.arrows = new THREE.InstancedMesh(arrowGeometry(), natureMaterial, ARROW_CAP);
    this.arrows.name = 'hunt_arrows';
    this.arrows.count = 0;
    this.arrows.frustumCulled = false;
    this.arrows.castShadow = false;
    this.arrows.setColorAt(0, new THREE.Color('#ffffff'));
    const N = 48;
    this.previewPos = new Float32Array(N * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.previewPos, 3));
    pg.setDrawRange(0, 0);
    this.preview = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xfff4d6, size: 0.13, transparent: true, opacity: 0.85, depthWrite: false }));
    this.preview.name = 'hunt_aim_preview';
    this.preview.frustumCulled = false;
    this.preview.renderOrder = 4;
    const rg = new THREE.RingGeometry(0.18, 0.3, 12);
    rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.name = 'hunt_impact';
    this.ring.visible = false;
    this.ring.renderOrder = 4;
    const dg = new THREE.TorusGeometry(0.16, 0.025, 4, 10);
    dg.rotateX(Math.PI / 2);
    this.dazed = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({ color: 0xf2cf4a }), 16);
    this.dazed.name = 'hunt_dazed';
    this.dazed.count = 0;
    this.dazed.frustumCulled = false;
    this.group.add(this.arrows, this.preview, this.ring, this.dazed);
  }

  /** The aim preview: the free flight for this launch, drawn until it reaches the ground (`ground` gives the drawn ground). */
  showPreview(f: Flight | null, kind: ArrowKind, ground: (x: number, z: number) => number | null): void {
    const g = this.preview.geometry;
    if (!f) { g.setDrawRange(0, 0); this.stats.previewPoints = 0; return; }
    const path = flightPath(f, kind, 150);
    let n = 0;
    for (let i = 3; i < path.length && n < this.previewPos.length / 3; i += 9) {
      const x = path[i], y = path[i + 1], z = path[i + 2];
      const gy = ground(x, z);
      this.previewPos[n * 3] = x; this.previewPos[n * 3 + 1] = y; this.previewPos[n * 3 + 2] = z;
      n++;
      if (gy !== null && y < gy) break;
    }
    g.setDrawRange(0, n);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.stats.previewPoints = n;
  }

  /**
   * Draw a journaled shot: along the sim's path from the launch for `ms`, ending at the recorded impact. `stick`:
   * the arrow stays standing there (ground, a tree, a trunk). `onLand` runs when it arrives (feedback, reactions).
   */
  fly(f: Flight, kind: ArrowKind, ms: number, end: { x: number; y: number; z: number }, stick: boolean, onLand?: () => void): void {
    const steps = Math.min(240, Math.ceil(ms / (1000 / 60)) + 1);
    const path = flightPath(f, kind, steps);
    const n = path.length / 3;
    const ax = path[(n - 2) * 3], ay = path[(n - 2) * 3 + 1], az = path[(n - 2) * 3 + 2];
    const dir = new THREE.Vector3(end.x - ax, end.y - ay, end.z - az);
    if (dir.lengthSq() < 1e-6) dir.set(f.vx, f.vy, f.vz);
    dir.normalize();
    if (this.live.length >= ARROW_CAP) this.live.shift();
    this.live.push({ path, start: performance.now(), ms, kind, stick, end: new THREE.Vector3(end.x, end.y, end.z), dir, landed: false, onLand });
    this.stats.flights++;
  }

  /** Stunned animals (x, y, z of the head) get a slowly turning ring over them. */
  update(dazed: ReadonlyArray<{ x: number; y: number; z: number }>): void {
    const now = performance.now();
    let k = 0;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const a = this.live[i];
      const t = now - a.start;
      if (t >= a.ms && !a.landed) {
        a.landed = true;
        this.stats.landed++;
        this.ring.position.copy(a.end).y += 0.03;
        this.ring.visible = true;
        this.ringStart = now;
        a.onLand?.();
      }
      if (a.landed && (!a.stick || t > a.ms + STUCK_S * 1000)) { this.live.splice(i, 1); continue; }
    }
    for (const a of this.live) {
      const t = now - a.start;
      if (a.landed) {
        // Standing in what it struck, a third of the shaft in.
        this.v.copy(a.end).addScaledVector(a.dir, -0.48);
        this.q.setFromUnitVectors(this.fwd, a.dir);
      } else {
        const f = Math.min(a.path.length / 3 - 1.001, t / (1000 / 60));
        const i = Math.floor(f), u = f - i, p = a.path;
        const x = p[i * 3] + (p[i * 3 + 3] - p[i * 3]) * u, y = p[i * 3 + 1] + (p[i * 3 + 4] - p[i * 3 + 1]) * u, z = p[i * 3 + 2] + (p[i * 3 + 5] - p[i * 3 + 2]) * u;
        this.v.set(x, y, z);
        const d = new THREE.Vector3(p[i * 3 + 3] - p[i * 3], p[i * 3 + 4] - p[i * 3 + 1], p[i * 3 + 5] - p[i * 3 + 2]);
        if (d.lengthSq() > 1e-9) this.q.setFromUnitVectors(this.fwd, d.normalize());
        this.v.addScaledVector(d, -0.7);
      }
      this.arrows.setMatrixAt(k, this.m.compose(this.v, this.q, this.s));
      this.arrows.setColorAt(k, this.tint.set(a.kind === 'blunt_arrow' ? BLUNT : '#ffffff'));
      k++;
    }
    this.arrows.count = k;
    this.arrows.visible = k > 0;
    this.arrows.instanceMatrix.needsUpdate = true;
    if (this.arrows.instanceColor) this.arrows.instanceColor.needsUpdate = true;
    if (this.ring.visible) {
      const age = (now - this.ringStart) / 600;
      if (age >= 1) this.ring.visible = false;
      else { this.ring.scale.setScalar(1 + age * 1.6); (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - age); }
    }
    let n = 0;
    for (const d of dazed) {
      if (n >= 16) break;
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), now / 400 + n);
      this.dazed.setMatrixAt(n++, this.m.compose(this.v.set(d.x, d.y + 0.25, d.z), this.q, this.s));
    }
    this.dazed.count = n;
    this.dazed.visible = n > 0;
    this.dazed.instanceMatrix.needsUpdate = true;
  }

  get inFlight(): number { return this.live.filter((a) => !a.landed).length; }
}
