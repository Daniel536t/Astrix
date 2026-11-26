// W8: aiming and firing the bow (presentation and input only). Every shot is
// one journaled `shoot`; the simulation flies it and decides what it meets
// (sim/hunting.ts). Here:
//  - desktop: hold Q or the right mouse button to draw, aim with the mouse
//    (the arrow is launched so that its free flight passes the point under the
//    cursor, like a sight that allows for the drop), release to shoot; Z
//    switches between arrows and blunt arrows;
//  - touch: hold the Bow button to draw, drag to move the aim mark, release to
//    shoot. A light assist (touch only) may turn the aim by at most 3 degrees
//    toward the drawn body of the nearest animal before release; it never leads
//    a moving animal and never decides a hit: the flight is the simulation's.
//  - the preview dots are the sim's own free ballistic path for the current
//    draw and aim (no collisions), and the flight drawn after release is the
//    journaled shot's path up to the recorded impact.
import * as THREE from 'three';
import type { GameSession } from './session';
import type { ExploreController } from './explore';
import type { FaunaView } from '../render/fauna';
import { HuntView, buildHeldBow } from '../render/hunting';
import {
  ArrowKind, DRAW_FULL_MS, DRAW_MAX_MS, DRAW_MIN_MS, Flight, STUN_SECS, Prey, flightPath, launch, quantiseDir,
} from '../sim/hunting';
import { ITEM_LABEL, equippedTool } from '../sim/gathering';
import { WILD_HP } from '../sim/wildlife';
import type { Animal } from '../sim/wildlife';

export interface HuntUIOptions {
  session: GameSession;
  scene: THREE.Scene;
  camera: THREE.Camera;
  canvas: HTMLElement;
  explore: () => ExploreController | null;
  fauna: () => FaunaView | null;
  groundY: (x: number, z: number) => number | null;
  toast: (message: string, kind?: 'good' | 'warn' | 'bad') => void;
  /** An accepted command changed the world. */
  changed: () => void;
  /** True while another mode owns the pointer (build ghost, map). */
  busy: () => boolean;
}

/** Release height above the feet (m) and how far ahead of the body the arrow leaves (m). */
const CHEST = 1.35, AHEAD = 0.3;
/** Touch assist: the largest turn (radians) toward an animal's drawn body. */
const ASSIST = 3 * Math.PI / 180;
/** Touch: aim mark travel per pixel dragged. */
const DRAG_GAIN = 1.6;

const SP_LABEL: Record<string, string> = { deer: 'deer', rabbit: 'hare', fox: 'fox', wolf: 'wolf', trout: 'trout' };

export class HuntUI {
  readonly view = new HuntView();
  readonly bow = buildHeldBow();
  private bowParent: THREE.Object3D | null = null;
  private drawing: { by: 'key' | 'mouse' | 'touch'; start: number; pointer?: number; x0: number; y0: number } | null = null;
  private mouse = { x: -1, y: -1 };
  private touchMark = { x: 0, y: 0 };
  /** Which arrows the bow shoots. */
  kind: ArrowKind = 'arrow';
  private readonly button: HTMLButtonElement;
  private readonly mark: HTMLElement;
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private aimNow: { from: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number }; heading: number; pitch: number } | null = null;
  private followUntil = 0;
  /** The drawn animal the sight is on (evidence), and the aim point. */
  private aimOn: string | null = null;
  private aimAtPoint: { x: number; y: number; z: number } | null = null;
  /** Evidence (?metrics=1): shots sent, refused, outcomes, the last shot and outcome, assist turns. */
  readonly stats = { shots: 0, refused: 0, lastRefusal: '', hits: 0, misses: 0, assisted: 0, last: null as null | Record<string, unknown>, lastCommand: null as null | Record<string, unknown> };

  constructor(private readonly o: HuntUIOptions) {
    o.scene.add(this.view.group);
    this.button = document.createElement('button');
    this.button.id = 'bow-button';
    this.button.type = 'button';
    this.button.className = 'pb bow-touch';
    this.button.textContent = 'Bow';
    this.button.setAttribute('aria-label', 'Bow: hold to draw, drag to aim, release to shoot');
    (document.getElementById('controls') ?? document.body).appendChild(this.button);
    this.mark = document.createElement('div');
    this.mark.id = 'aim-mark';
    this.mark.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.mark);
    this.button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.drawing || !this.ready) return;
      try { this.button.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      const p = this.defaultMark();
      this.touchMark = p;
      this.begin('touch', e.pointerId, e.clientX, e.clientY);
    });
    this.button.addEventListener('pointermove', (e) => {
      const d = this.drawing;
      if (!d || d.by !== 'touch' || d.pointer !== e.pointerId) return;
      const p = this.defaultMarkCache ?? this.defaultMark();
      const r = this.o.canvas.getBoundingClientRect();
      // The mark stays on the screen (it is where the sight points).
      this.touchMark = { x: Math.max(r.left + 8, Math.min(r.right - 8, p.x + (e.clientX - d.x0) * DRAG_GAIN)), y: Math.max(r.top + 8, Math.min(r.bottom - 8, p.y + (e.clientY - d.y0) * DRAG_GAIN)) };
    });
    const up = (e: PointerEvent) => { const d = this.drawing; if (d && d.by === 'touch' && d.pointer === e.pointerId) this.release(); };
    this.button.addEventListener('pointerup', up);
    this.button.addEventListener('pointercancel', (e) => { const d = this.drawing; if (d && d.by === 'touch' && d.pointer === e.pointerId) this.cancel('the draw was interrupted'); });
    this.button.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyQ' && !e.repeat && this.ready && !this.drawing && !isTyping(e.target)) { this.begin('key'); e.preventDefault(); }
      if (e.code === 'KeyZ' && !e.repeat && this.ready && !isTyping(e.target)) this.switchKind();
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'KeyQ' && this.drawing?.by === 'key') this.release(); });
    // Right mouse on the canvas: taken before the camera rig sees it (the rig orbits on any button).
    window.addEventListener('pointerdown', (e) => {
      if (e.target !== o.canvas || e.button !== 2 || e.pointerType !== 'mouse' || !this.ready || this.drawing) return;
      e.stopImmediatePropagation(); e.preventDefault();
      this.mouse = { x: e.clientX, y: e.clientY };
      this.begin('mouse', e.pointerId);
    }, { capture: true });
    window.addEventListener('pointerup', (e) => { if (e.button === 2 && this.drawing?.by === 'mouse') this.release(); }, { capture: true });
    window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') this.mouse = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('blur', () => { if (this.drawing) this.cancel('the draw was let down'); });
  }

  private get world() { return this.o.session.world; }
  /** The bow is in hand, the arrows exist in this world, and the player is walking. */
  get ready(): boolean {
    const w = this.world.wild, ex = this.o.explore(), ch = ex?.active ? ex.character : null;
    return !!w?.hunt && equippedTool(this.world)?.kind === 'bow' && !!ch && !ch.dead && !this.o.busy();
  }
  get isDrawing(): boolean { return !!this.drawing; }
  private arrowsOf(kind: ArrowKind): number { return this.world.wild?.items[kind] ?? 0; }

  switchKind(): void {
    this.kind = this.kind === 'arrow' ? 'blunt_arrow' : 'arrow';
    this.o.toast(`${this.kind === 'arrow' ? 'Arrows' : 'Blunt arrows (they stun, never kill)'} on the string · ${this.arrowsOf(this.kind)} left`);
  }

  private begin(by: 'key' | 'mouse' | 'touch', pointer?: number, x0 = 0, y0 = 0): void {
    if (this.arrowsOf(this.kind) < 1) {
      const other: ArrowKind = this.kind === 'arrow' ? 'blunt_arrow' : 'arrow';
      if (this.arrowsOf(other) > 0) this.kind = other;
      else { this.o.toast('no arrows: make arrows (or blunt arrows) at the workbench', 'warn'); return; }
    }
    this.defaultMarkCache = by === 'touch' ? this.touchMark : null;
    this.drawing = { by, start: performance.now(), ...(pointer !== undefined ? { pointer } : {}), x0, y0 };
  }

  private cancel(why: string): void {
    this.drawing = null;
    this.aimNow = null;
    const ex = this.o.explore();
    if (ex) ex.aim = null;
    this.view.showPreview(null, this.kind, this.o.groundY);
    this.mark.className = '';
    this.o.toast(why, 'warn');
  }

  private defaultMarkCache: { x: number; y: number } | null = null;
  /** Touch: the aim mark starts 15 m ahead of the player along the camera's view, at chest height. */
  private defaultMark(): { x: number; y: number } {
    const ch = this.o.explore()?.character, cam = this.o.camera, rect = this.o.canvas.getBoundingClientRect();
    if (!ch) return { x: rect.width / 2, y: rect.height / 2 };
    const f = new THREE.Vector3();
    cam.getWorldDirection(f);
    f.y = 0; f.normalize();
    const p = new THREE.Vector3(ch.x + f.x * 15, ch.y + CHEST, ch.z + f.z * 15).project(cam);
    return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height };
  }

  /**
   * The point the player aims at: along the camera ray through the mark, a drawn animal the ray passes through (its
   * body centre), else the first ground within 90 m, else (the sky) 40 m out along the ray. This only chooses where the sight
   * points; the arrow is flown by the simulation.
   */
  private aimPoint(sx: number, sy: number): THREE.Vector3 {
    const rect = this.o.canvas.getBoundingClientRect();
    this.ndc.set((sx - rect.left) / rect.width * 2 - 1, -((sy - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.o.camera);
    const o = this.ray.ray.origin, d = this.ray.ray.direction, ch = this.o.explore()!.character!;
    // Start where the ray passes the player (the camera is behind them), so nothing between the camera and the player is aimed at.
    const t0 = Math.max(0, (ch.x - o.x) * d.x + (ch.y + CHEST - o.y) * d.y + (ch.z - o.z) * d.z);
    let onAnimal: { t: number; p: THREE.Vector3; id: string } | null = null;
    for (const a of this.o.fauna()?.drawnTargets() ?? []) {
      const t = (a.x - o.x) * d.x + (a.y - o.y) * d.y + (a.z - o.z) * d.z;
      if (t < t0 + 1 || t > t0 + 90) continue;
      const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
      // The sight settles on the drawn body's centre (where it is drawn now; it does not lead a moving animal).
      if (Math.hypot(px - a.x, py - a.y, pz - a.z) <= 0.6 && (!onAnimal || t < onAnimal.t)) onAnimal = { t, p: new THREE.Vector3(a.x, a.y, a.z), id: a.id };
    }
    this.aimOn = null;
    for (let t = t0 + 1; t < t0 + 90; t += 0.5) {
      if (onAnimal && t >= onAnimal.t) { this.aimOn = onAnimal.id; return onAnimal.p; }
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t, g = this.o.groundY(x, z);
      if (g !== null && y <= g) return new THREE.Vector3(x, g, z);
    }
    return new THREE.Vector3(o.x + d.x * (t0 + 40), o.y + d.y * (t0 + 40), o.z + d.z * (t0 + 40));
  }

  /** The launch whose free flight passes through `target` for this draw (bisection on the elevation), as the sim will fly it. */
  private solve(from: { x: number; y: number; z: number }, target: THREE.Vector3, draw: number): { dir: { x: number; y: number; z: number }; heading: number; pitch: number } {
    const dx = target.x - from.x, dz = target.z - from.z, D = Math.max(0.5, Math.hypot(dx, dz)), hx = dx / D, hz = dz / D;
    const heading = Math.atan2(hx, hz);
    const fromCm = { x: Math.round(from.x * 100), y: Math.round(from.y * 100), z: Math.round(from.z * 100) };
    const yAt = (e: number): number => {
      const f = launch(fromCm, quantiseDir(hx * Math.cos(e), Math.sin(e), hz * Math.cos(e)), draw)!;
      const p = flightPath(f, this.kind, 240);
      for (let i = 3; i < p.length; i += 3) {
        const d1 = Math.hypot(p[i] - f.x, p[i + 2] - f.z);
        if (d1 >= D) { const d0 = Math.hypot(p[i - 3] - f.x, p[i - 1] - f.z), k = (D - d0) / Math.max(1e-6, d1 - d0); return p[i - 2] + (p[i + 1] - p[i - 2]) * k; }
      }
      return -1e9;
    };
    let lo = -0.8, hi = 0.75;
    if (yAt(hi) < target.y) lo = hi; // out of reach at this draw: as high as the sight goes
    else for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (yAt(m) < target.y) lo = m; else hi = m; }
    const e = (lo + hi) / 2;
    return { dir: quantiseDir(hx * Math.cos(e), Math.sin(e), hz * Math.cos(e)), heading, pitch: e };
  }

  /** Per frame: the held bow, the draw, the aim, the preview and the flights. */
  update(): void {
    const ex = this.o.explore();
    const hand = ex?.leftHand ?? null;
    if (hand && this.bowParent !== hand) { hand.add(this.bow); this.bowParent = hand; }
    const ready = this.ready;
    this.bow.visible = equippedTool(this.world)?.kind === 'bow' && !!ex?.active;
    document.body.classList.toggle('bow-ready', ready);
    if (this.drawing && !ready) this.cancel('the draw was let down');
    const ch = ex?.character;
    if (this.drawing && ch && ex) {
      const d = this.drawing;
      const draw = Math.min(DRAW_MAX_MS, performance.now() - d.start);
      const sx = d.by === 'touch' ? this.touchMark.x : this.mouse.x, sy = d.by === 'touch' ? this.touchMark.y : this.mouse.y;
      const rect = this.o.canvas.getBoundingClientRect();
      const mx = sx < 0 ? rect.left + rect.width / 2 : sx, my = sy < 0 ? rect.top + rect.height / 2 : sy;
      const target = this.aimPoint(mx, my);
      this.aimAtPoint = { x: r2(target.x), y: r2(target.y), z: r2(target.z) };
      const hx = target.x - ch.x, hz = target.z - ch.z, hl = Math.hypot(hx, hz) || 1;
      const from = { x: ch.x + hx / hl * AHEAD, y: ch.y + CHEST, z: ch.z + hz / hl * AHEAD };
      const s = this.solve(from, target, Math.max(DRAW_MIN_MS, draw));
      this.aimNow = { from, dir: s.dir, heading: s.heading, pitch: s.pitch };
      ex.aim = { heading: s.heading, pitch: s.pitch, draw: Math.min(1, draw / DRAW_FULL_MS) };
      this.view.showPreview(launch(cm(from), s.dir, Math.max(DRAW_MIN_MS, draw)), this.kind, this.o.groundY);
      this.mark.className = `on${draw >= DRAW_FULL_MS ? ' full' : draw >= DRAW_MIN_MS ? ' drawn' : ''}`;
      this.mark.style.transform = `translate(${mx - rect.left}px, ${my - rect.top}px)`;
    } else if (ex && performance.now() > this.followUntil && ex.aim) ex.aim = null;
    this.view.update(this.o.fauna()?.dazed ?? []);
  }

  /** Let go: below the shortest draw nothing happens; otherwise one journaled shot. */
  private release(): void {
    const d = this.drawing, aim = this.aimNow, ex = this.o.explore(), ch = ex?.character;
    this.drawing = null;
    this.mark.className = '';
    this.view.showPreview(null, this.kind, this.o.groundY);
    if (!d || !aim || !ch || !ex) { if (ex) ex.aim = null; return; }
    const draw = Math.min(DRAW_MAX_MS, Math.round(performance.now() - d.start));
    if (draw < DRAW_MIN_MS) { ex.aim = null; this.o.toast('draw the bow back further before you let go (hold a moment longer)', 'warn'); return; }
    let dir = aim.dir;
    if (d.by === 'touch') dir = this.assist(aim.from, dir);
    const fauna = this.o.fauna();
    const t = Math.round((fauna?.tickAlpha() ?? 0) * 1000);
    const before = new Map<string, Animal>();
    for (const a of this.world.wild?.wildlife?.animals.values() ?? []) if (Math.abs(a.x / 10 - ch.x) < 120 && Math.abs(a.z / 10 - ch.z) < 120) before.set(a.id, { ...a });
    const s = this.o.session;
    const c = { type: 'shoot', arrow: this.kind, from: cm(aim.from), dir, draw, t, at: { x: Math.round(ch.x * 10), z: Math.round(ch.z * 10) } };
    this.stats.lastCommand = { ...c };
    const r = s.dispatch({ schema: 3, id: s.commandId('shoot' as never, `${this.kind}:${s.nextSequence}`), expectedRevision: s.world.revision, ...c });
    this.followUntil = performance.now() + 220;
    if (!r.ok) { this.stats.refused++; this.stats.lastRefusal = r.reasons.join('; '); this.o.toast(`can't shoot: ${r.reasons.join('; ')}`, 'warn'); return; }
    this.o.changed();
    this.stats.shots++;
    const out = r.outcome;
    if (out.type !== 'shoot') return;
    this.stats.last = { ...out };
    if (out.hit === 'animal') this.stats.hits++; else this.stats.misses++;
    const f: Flight = launch(c.from, dir, draw)!;
    const end = { x: out.x / 100, y: out.y / 100, z: out.z / 100 };
    const stick = !out.broke && (out.hit === 'terrain' || out.hit === 'tree' || out.hit === 'trunk') && this.kind === 'arrow';
    // Until the drawn arrow arrives, a felled or stunned animal is drawn as it was.
    if (out.hit === 'animal' && out.ref && (out.result === 'killed' || out.result === 'stunned')) {
      const was = before.get(out.ref);
      if (was) fauna?.defer(was, performance.now() + out.ms);
    }
    this.view.fly(f, this.kind, out.ms, end, stick, () => this.o.toast(describe(out as unknown as Record<string, unknown> & { hit: string }, this.kind), out.hit === 'animal' && out.result !== 'glanced' ? 'good' : 'warn'));
  }

  /** Touch only: turn the aim by at most ASSIST toward the nearest drawn animal body within that cone (it does not lead and decides nothing). */
  private assist(from: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const n = Math.hypot(dir.x, dir.y, dir.z), u = { x: dir.x / n, y: dir.y / n, z: dir.z / n };
    let best: { ang: number; x: number; y: number; z: number } | null = null;
    for (const t of this.o.fauna()?.drawnTargets() ?? []) {
      const vx = t.x - from.x, vy = t.y - from.y, vz = t.z - from.z, l = Math.hypot(vx, vy, vz);
      if (l < 2 || l > 60) continue;
      // Compare headings only (the elevation is the sight's drop allowance and is kept).
      const a1 = Math.atan2(u.x, u.z), a2 = Math.atan2(vx, vz);
      let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      if (Math.abs(da) <= ASSIST && (!best || Math.abs(da) < Math.abs(best.ang))) best = { ang: da, x: vx, y: vy, z: vz };
    }
    if (!best) return dir;
    this.stats.assisted++;
    const h = Math.hypot(u.x, u.z), a = Math.atan2(u.x, u.z) + best.ang;
    return quantiseDir(Math.sin(a) * h, u.y, Math.cos(a) * h);
  }

  metrics(): Record<string, unknown> {
    return { ...this.stats, ready: this.ready, drawing: this.drawing ? { by: this.drawing.by, ms: Math.round(performance.now() - this.drawing.start) } : null, kind: this.kind,
      arrows: this.arrowsOf('arrow'), blunt: this.arrowsOf('blunt_arrow'), view: { ...this.view.stats, inFlight: this.view.inFlight }, bowVisible: this.bow.visible,
      aim: this.aimNow ? { ...this.aimNow, point: this.aimAtPoint, on: this.aimOn } : null,
      targets: (() => { const ch = this.o.explore()?.character; if (!ch) return []; return (this.o.fauna()?.drawnTargets() ?? []).map((t) => ({ ...t, d: Math.hypot(t.x - ch.x, t.z - ch.z) }))
        .filter((t) => t.d < 70).sort((a, b) => a.d - b.d).slice(0, 16).map((t) => ({ id: t.id, x: r2(t.x), y: r2(t.y), z: r2(t.z), d: r2(t.d) })); })() };
  }

  /** HUD hint while the bow is in hand. */
  hint(coarse: boolean): string {
    const a = this.arrowsOf('arrow'), b = this.arrowsOf('blunt_arrow');
    const what = `${this.kind === 'arrow' ? 'arrows' : 'blunt arrows'} (${a} arrows, ${b} blunt)`;
    return coarse ? `Bow: hold, drag to aim, release · ${what}` : `Q or right mouse: draw · aim with the mouse · release: shoot · Z: ${this.kind === 'arrow' ? 'blunt arrows' : 'arrows'} · ${what}`;
  }
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const cm = (p: { x: number; y: number; z: number }) => ({ x: Math.round(p.x * 100), y: Math.round(p.y * 100), z: Math.round(p.z * 100) });
function isTyping(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || t.matches('input, textarea, select'));
}

/** What a shot did, in words. */
export function describe(o: Record<string, unknown> & { hit: string }, kind: ArrowKind): string {
  const sp = typeof o.ref === 'string' ? SP_LABEL[/^fauna:([a-z]+):/.exec(o.ref)?.[1] ?? ''] ?? 'animal' : '';
  const startled = Array.isArray(o.startled) && o.startled.length ? ` · ${o.startled.length} animal${o.startled.length === 1 ? '' : 's'} startled` : '';
  const where = o.part === 'head' ? 'a head shot: ' : '';
  const back = o.pileId ? ' Pick the arrow up (E).' : '';
  switch (o.hit) {
    case 'animal': {
      const spk = /^fauna:([a-z]+):/.exec(String(o.ref))?.[1] as Prey;
      switch (o.result) {
        case 'killed': return `Hit, ${where}the ${sp} is down. Walk up to it and butcher it with the knife (E).${startled}`;
        case 'wounded': return `Hit, ${where}the ${sp} is wounded (${o.hp}/${WILD_HP[spk]}) and runs: it is slower and tires.${startled}`;
        case 'stunned': return `The blunt arrow stunned the ${sp}: it lies still and will come round in about ${STUN_SECS[spk]} s.${back}${startled}`;
        case 'bruised': return `The blunt arrow only bruised the ${sp}: it runs off unhurt.${back}${startled}`;
        default: return `The ${ITEM_LABEL[kind]} glanced off the ${sp}: it was too slow to do harm.${back}${startled}`;
      }
    }
    case 'terrain': return `Missed: ${o.broke ? 'the arrow broke on the stone.' : `the ${ITEM_LABEL[kind]} struck the ground.${back}`}${startled}`;
    case 'tree': return `Missed: the ${ITEM_LABEL[kind]} struck a tree.${back}${startled}`;
    case 'trunk': return `Missed: the ${ITEM_LABEL[kind]} struck a fallen trunk.${back}${startled}`;
    case 'building': return `Missed: the ${ITEM_LABEL[kind]} ${o.broke ? 'broke against' : 'struck'} a building.${back}${startled}`;
    case 'water': return `Missed: the ${ITEM_LABEL[kind]} is lost in the water.${startled}`;
    default: return `The ${ITEM_LABEL[kind]} flew out of sight.${startled}`;
  }
}
