// Orbit camera rig — ADB §4: narrow FOV, ~36° default pitch, ~58 m distance.
// M001 expands the target clamp to the 2048 m world and raises the far plane
// so the macro LOD and ocean horizon are not clipped.
import * as THREE from 'three';

type Pt = { x: number; y: number };

export class OrbitRig {
  readonly camera: THREE.PerspectiveCamera;
  target = new THREE.Vector3(0, 10, 0);
  yaw = THREE.MathUtils.degToRad(25);
  pitch = THREE.MathUtils.degToRad(36);
  distance = 58;

  private pointers = new Map<number, Pt>();
  private last = new Map<number, Pt>();
  private pinchDist = 0;
  private mid: Pt = { x: 0, y: 0 };
  private keys = new Set<string>();
  private padX = 0;
  private padZ = 0;
  private padActive = false;

  constructor(private el: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(38, el.clientWidth / Math.max(1, el.clientHeight), 0.5, 9000);
    this.apply();

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      const p = { x: e.clientX, y: e.clientY };
      this.pointers.set(e.pointerId, p);
      this.last.set(e.pointerId, p);
      if (this.pointers.size === 2) this.beginPinch();
    });

    el.addEventListener('pointermove', (e) => {
      const p = { x: e.clientX, y: e.clientY };
      const prev = this.last.get(e.pointerId);
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, p);
      this.last.set(e.pointerId, p);

      if (this.pointers.size === 1 && prev) {
        this.yaw -= (p.x - prev.x) * 0.005;
        this.pitch = THREE.MathUtils.clamp(this.pitch + (p.y - prev.y) * 0.004, 0.35, 1.25);
        this.apply();
      } else if (this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (this.pinchDist > 0) {
          this.zoomBy(this.pinchDist / Math.max(1, d));
          this.panBy((mx - this.mid.x) * 0.9, (my - this.mid.y) * 0.9);
        }
        this.pinchDist = d;
        this.mid = { x: mx, y: my };
      }
    });

    const release = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.last.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
      if (this.pointers.size === 1) {
        const [only] = [...this.pointers.values()];
        this.last.set([...this.pointers.keys()][0], { ...only });
      }
      try { el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(1 + Math.sign(e.deltaY) * 0.1);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', '+', '-', '='].includes(k)) {
        this.keys.add(k);
        if (k.startsWith('arrow') || k === ' ') e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    window.addEventListener('resize', () => {
      this.camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      this.camera.updateProjectionMatrix();
    });
  }

  private beginPinch() {
    const [a, b] = [...this.pointers.values()];
    this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    this.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /** Ground-plane basis for panning. */
  private basis() {
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return { right, forward };
  }

  /** Screen-space pan (pixels) converted to world movement at the current distance. */
  panBy(dx: number, dy: number) {
    const k = this.distance * 0.0016;
    const { right, forward } = this.basis();
    this.target.addScaledVector(right, -dx * k);
    this.target.addScaledVector(forward, dy * k);
    this.clampTarget();
    this.apply();
  }

  zoomBy(factor: number) {
    this.distance = THREE.MathUtils.clamp(this.distance * factor, 12, 1400);
    this.apply();
  }

  /** On-screen pad, −1..1 per axis. z>0 walks forward. */
  setPad(x: number, z: number) {
    this.padActive = x !== 0 || z !== 0;
    this.padX = x; this.padZ = z;
  }
  clearPad() { this.setPad(0, 0); this.padActive = false; }

  private clampTarget() {
    this.target.x = THREE.MathUtils.clamp(this.target.x, -1000, 1000);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -1000, 1000);
    this.target.y = THREE.MathUtils.clamp(this.target.y, 0, 104);
  }

  /** Keyboard + pad movement, called once per frame. */
  update(dt: number) {
    let ix = 0, iz = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) iz += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) iz -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) ix += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) ix -= 1;
    ix += this.padX; iz += this.padZ;
    if (this.keys.has('q')) this.yaw += dt * 1.1;
    if (this.keys.has('e')) this.yaw -= dt * 1.1;
    if (this.keys.has('+') || this.keys.has('=')) this.zoomBy(1 - dt * 1.2);
    if (this.keys.has('-')) this.zoomBy(1 + dt * 1.2);

    if (ix !== 0 || iz !== 0) {
      const len = Math.hypot(ix, iz) || 1;
      const speed = THREE.MathUtils.clamp(this.distance * 0.55, 16, 80)
        * (this.keys.has('shift') ? 2.2 : 1);
      const { right, forward } = this.basis();
      this.target.addScaledVector(right, (ix / len) * speed * dt);
      this.target.addScaledVector(forward, (iz / len) * speed * dt);
      this.clampTarget();
      this.apply();
    } else if (this.keys.has('q') || this.keys.has('e')) {
      this.apply();
    }
  }

  apply() {
    const x = this.target.x + this.distance * Math.cos(this.pitch) * Math.sin(this.yaw);
    const y = this.target.y + this.distance * Math.sin(this.pitch);
    const z = this.target.z + this.distance * Math.cos(this.pitch) * Math.cos(this.yaw);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }

  setView(yawDeg: number, pitchDeg: number, dist: number, tx: number, ty: number, tz: number) {
    this.yaw = THREE.MathUtils.degToRad(yawDeg);
    this.pitch = THREE.MathUtils.degToRad(pitchDeg);
    this.distance = dist;
    this.target.set(tx, ty, tz);
    this.clampTarget();
    // setView is a synchronous inspection/programmatic camera contract.
    // Update the position matrix before deriving the look-at quaternion so no
    // stale matrix update can be applied by the next renderer.render().
    this.camera.position.set(
      this.target.x + dist * Math.cos(this.pitch) * Math.sin(this.yaw),
      this.target.y + dist * Math.sin(this.pitch),
      this.target.z + dist * Math.cos(this.pitch) * Math.cos(this.yaw),
    );
    this.camera.updateMatrix();
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld(true);
  }
}
