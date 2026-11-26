// W5: the in-world route trail. One mesh (one draw call): a flat ribbon
// laid on the ground along the next stretch of the planned route, a little
// above the surface. Presentation only; the route comes from sim/route.ts.
import * as THREE from 'three';

const MAX_POINTS = 160;
const HALF_WIDTH = 0.4;
const LIFT = 0.14;

export class TrailView {
  readonly mesh: THREE.Mesh;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos = new Float32Array(MAX_POINTS * 2 * 3);
  private readonly uv = new Float32Array(MAX_POINTS * 2 * 2);
  triangles = 0;
  /** First and last ribbon centre points (evidence). */
  ends: number[][] = [];

  constructor() {
    const idx: number[] = [];
    for (let i = 0; i + 1 < MAX_POINTS; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffdc3a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.name = 'route-trail';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
  }

  /**
   * Lay the ribbon along `pts` (metres), resampled every metre, at the ground
   * height `groundY` gives (null: unknown ground, the ribbon stops there).
   */
  set(pts: Array<{ x: number; z: number }>, groundY: (x: number, z: number) => number | null): void {
    const dense: Array<{ x: number; y: number; z: number }> = [];
    for (let k = 1; k < pts.length && dense.length < MAX_POINTS; k++) {
      const a = pts[k - 1], b = pts[k], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
      for (let i = k === 1 ? 0 : 1; i <= n && dense.length < MAX_POINTS; i++) {
        const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n;
        // The higher of the ground here and half a metre either way along the route, so a 1 m terrace step never buries the ribbon.
        const ux = (b.x - a.x) / n * 0.5, uz = (b.z - a.z) / n * 0.5;
        const g0 = groundY(x, z);
        if (g0 === null) { k = pts.length; break; }
        const y = Math.max(g0, groundY(x + ux, z + uz) ?? g0, groundY(x - ux, z - uz) ?? g0);
        dense.push({ x, y: y + LIFT, z });
      }
    }
    if (dense.length < 2) { this.clear(); return; }
    for (let i = 0; i < dense.length; i++) {
      const p = dense[i], q = dense[Math.min(dense.length - 1, i + 1)], o = dense[Math.max(0, i - 1)];
      let tx = q.x - o.x, tz = q.z - o.z;
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const nx = -tz * HALF_WIDTH, nz = tx * HALF_WIDTH;
      this.pos.set([p.x + nx, p.y, p.z + nz, p.x - nx, p.y, p.z - nz], i * 6);
      this.uv.set([0, i, 1, i], i * 4);
    }
    this.ends = [dense[0], dense[dense.length - 1]].map((q) => [q.x, q.y, q.z].map((v) => Math.round(v * 100) / 100));
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.uv as THREE.BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, (dense.length - 1) * 6);
    this.triangles = (dense.length - 1) * 2;
    this.mesh.visible = true;
  }

  clear(): void { this.geo.setDrawRange(0, 0); this.triangles = 0; this.mesh.visible = false; }
}
