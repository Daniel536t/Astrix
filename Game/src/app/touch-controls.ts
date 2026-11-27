// Touch controls for explore mode, modelled on Minecraft Bedrock's joystick
// layout: a floating analog joystick under the left thumb, drag anywhere on
// the right half to look, and hold-buttons on the right (Jump; Dive while
// swimming; Gather).
//
// Robustness rules (the old D-pad broke these):
//  - every control tracks its own pointer ids, so a second finger never stops
//    or replaces the first one's input;
//  - movement only exists while a finger is down on the joystick; lifting,
//    cancelling, losing capture, blurring or hiding the page clears it;
//  - no element can be text-selected or long-pressed into a callout.

/** Joystick radius in CSS pixels (knob travel). */
export const STICK_RADIUS = 56;
/** Inner fraction of the radius that produces no movement. */
export const STICK_DEAD_ZONE = 0.14;
/** Pushing the knob this far out (fraction of the radius) runs. */
export const STICK_RUN_AT = 0.92;

export interface StickVector {
  /** Strafe, −1..1 (right positive). */
  x: number;
  /** Forward, −1..1 (screen up is forward). */
  z: number;
  /** 0..1 after the dead zone. */
  magnitude: number;
  run: boolean;
}

/** Map a knob offset (screen pixels, y down) to an analog movement vector. */
export function stickVector(dx: number, dy: number, radius = STICK_RADIUS): StickVector {
  const d = Math.hypot(dx, dy);
  const raw = Math.min(1, d / radius);
  if (raw < STICK_DEAD_ZONE || d === 0) return { x: 0, z: 0, magnitude: 0, run: false };
  const magnitude = (raw - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE);
  return { x: (dx / d) * magnitude, z: (-dy / d) * magnitude, magnitude, run: raw >= STICK_RUN_AT };
}

/**
 * Where the joystick base sits after the finger moves: it follows the finger
 * when dragged past the rim, so the stick never "runs out" (a dynamic stick).
 */
export function followBase(base: { x: number; y: number }, finger: { x: number; y: number }, radius = STICK_RADIUS): { x: number; y: number } {
  const dx = finger.x - base.x, dy = finger.y - base.y;
  const d = Math.hypot(dx, dy);
  if (d <= radius) return base;
  const k = (d - radius) / d;
  return { x: base.x + dx * k, y: base.y + dy * k };
}

export interface TouchControlsOptions {
  /** Left-half region that starts the joystick. */
  zone: HTMLElement;
  setMove: (x: number, z: number, run: boolean) => void;
  clearMove: () => void;
  jumpButton: HTMLElement | null;
  diveButton: HTMLElement | null;
  onJump: (held: boolean) => void;
  onDive: (held: boolean) => void;
}

/** Track pointers on a button; `onChange(true)` on the first press, `false` when the last finger leaves. */
export function holdButton(el: HTMLElement, onChange: (held: boolean) => void): () => void {
  const down = new Set<number>();
  const press = (e: PointerEvent) => {
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    const was = down.size > 0;
    down.add(e.pointerId);
    el.classList.add('held');
    if (!was) onChange(true);
  };
  const release = (e: PointerEvent) => {
    if (!down.delete(e.pointerId)) return;
    if (down.size === 0) { el.classList.remove('held'); onChange(false); }
  };
  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  return () => { if (down.size) { down.clear(); el.classList.remove('held'); onChange(false); } };
}

export class TouchControls {
  private stickId: number | null = null;
  private base = { x: 0, y: 0 };
  private readonly baseEl: HTMLElement;
  private readonly knobEl: HTMLElement;
  private readonly resets: Array<() => void> = [];
  /** Last vector sent, for metrics and tests. */
  vector: StickVector = { x: 0, z: 0, magnitude: 0, run: false };

  constructor(private readonly o: TouchControlsOptions) {
    this.baseEl = document.createElement('div');
    this.baseEl.className = 'stick-base';
    this.knobEl = document.createElement('div');
    this.knobEl.className = 'stick-knob';
    this.baseEl.appendChild(this.knobEl);
    o.zone.appendChild(this.baseEl);

    o.zone.addEventListener('pointerdown', (e) => this.start(e));
    o.zone.addEventListener('pointermove', (e) => this.move(e));
    const end = (e: PointerEvent) => { if (e.pointerId === this.stickId) this.release(); };
    o.zone.addEventListener('pointerup', end);
    o.zone.addEventListener('pointercancel', end);
    o.zone.addEventListener('lostpointercapture', end);
    o.zone.addEventListener('contextmenu', (e) => e.preventDefault());

    if (o.jumpButton) this.resets.push(holdButton(o.jumpButton, o.onJump));
    if (o.diveButton) this.resets.push(holdButton(o.diveButton, o.onDive));

    // The OS can swallow a touch (edge gestures, notifications, app switch)
    // without delivering pointerup: never leave the character walking.
    const all = () => this.releaseAll();
    window.addEventListener('blur', all);
    window.addEventListener('pagehide', all);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') all(); });
  }

  private start(e: PointerEvent): void {
    if (this.stickId !== null) return;
    e.preventDefault();
    this.stickId = e.pointerId;
    try { this.o.zone.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    const r = this.o.zone.getBoundingClientRect();
    this.base = { x: e.clientX - r.left, y: e.clientY - r.top };
    this.baseEl.style.transform = `translate(${this.base.x}px, ${this.base.y}px)`;
    this.knobEl.style.transform = 'translate(0px, 0px)';
    this.baseEl.classList.add('active');
    this.o.zone.classList.add('active');
    this.apply(0, 0);
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    e.preventDefault();
    const r = this.o.zone.getBoundingClientRect();
    const finger = { x: e.clientX - r.left, y: e.clientY - r.top };
    this.base = followBase(this.base, finger);
    const dx = finger.x - this.base.x, dy = finger.y - this.base.y;
    this.baseEl.style.transform = `translate(${this.base.x}px, ${this.base.y}px)`;
    this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    this.apply(dx, dy);
  }

  private apply(dx: number, dy: number): void {
    this.vector = stickVector(dx, dy);
    this.baseEl.classList.toggle('run', this.vector.run);
    if (this.vector.magnitude > 0) this.o.setMove(this.vector.x, this.vector.z, this.vector.run);
    else this.o.clearMove();
  }

  /** Lift the joystick: movement stops immediately. */
  release(): void {
    if (this.stickId !== null) {
      try { this.o.zone.releasePointerCapture(this.stickId); } catch { /* already released */ }
    }
    this.stickId = null;
    this.vector = { x: 0, z: 0, magnitude: 0, run: false };
    this.baseEl.classList.remove('active', 'run');
    this.o.zone.classList.remove('active');
    this.o.clearMove();
  }

  releaseAll(): void {
    this.release();
    for (const r of this.resets) r();
  }

  get stickActive(): boolean { return this.stickId !== null; }
}
