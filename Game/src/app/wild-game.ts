// W2: the wilderness player's gathering, bag and hand crafting. Presentation
// and input only: every change is a journaled command (app/wild-commands.ts)
// that the simulation (sim/gathering.ts) accepts or refuses.
// W3: physical tree felling. Walk up to a tree (or tap it to target it) and
// swing the axe with E / the Use button (hold to keep swinging): each swing
// is one journaled `chop`, applied at once. The felled tree leaves a stump
// and a trunk; swings along the trunk (`cut_log`) make logs; logs are picked
// up and delivered by dropping them at a stockpile marked from the bag.
import * as THREE from 'three';
import type { GameSession } from './session';
import type { ExploreController } from './explore';
import {
  CARRY_CAPACITY, FOOD_VALUE, ITEM_LABEL, ITEM_WEIGHT, LivePickup, PICKUP_LABEL, PICKUP_REACH, STONE_AXE_DURABILITY, WILD_CONTENT_V3,
  WILD_RECIPES, WildItem, carriedWeight, equippedTool, pickupsNear,
} from '../sim/gathering';
import {
  CHOP_REACH, EventRecord, FellEvent, NearTree, SWING_COOLDOWN_MS, Trunk, choppable, stockpileAt, stockpileLogs, treeDistance,
  treesNear, trunkDistance, trunksNear,
} from '../sim/felling';
import { PickupView, buildHeldAxe } from '../render/pickups';
import { FellingView, NatureHider } from '../render/felling';

export interface WildGameOptions {
  session: GameSession;
  scene: THREE.Scene;
  explore: () => ExploreController | null;
  groundY: (x: number, z: number) => number | null;
  /** An accepted command changed the world: schedule a save. */
  onChanged: () => void;
  /** Also mirrored into the HUD line by the caller. */
  notice: (message: string) => void;
  /** W3: the camera and canvas, to tap a tree; the nature view, to draw a damaged or falling tree itself. */
  camera?: THREE.Camera;
  canvas?: HTMLElement;
  nature?: () => NatureHider | null;
}

/** Pickups are drawn within this radius of the player (metres). */
const DRAW_RADIUS = 48;
/** The prompt uses a little less than the simulation's reach, so a shown prompt is always accepted. */
const PROMPT_REACH = PICKUP_REACH - 0.25;
const CHOP_PROMPT = CHOP_REACH - 0.3;
/** A tapped tree stays targeted within this distance. */
const SELECT_KEEP = 25;

const EVENT_LABEL: Record<FellEvent, string> = {
  CHOP_STARTED: 'chop started', TREE_DAMAGED: 'tree damaged', TREE_FELLED: 'tree felled', TRUNK_CREATED: 'trunk on the ground',
  LOGS_CREATED: 'log cut', LOGS_COLLECTED: 'log picked up', LOGS_DELIVERED: 'logs delivered', STOCKPILE_MARKED: 'stockpile marked',
};

type Action =
  | { kind: 'none'; hint: string }
  | { kind: 'pickup'; p: LivePickup }
  | { kind: 'chop'; tree: NearTree }
  | { kind: 'cut'; trunk: Trunk }
  | { kind: 'deliver'; stockpileId: string; n: number };

export class WildGame {
  readonly view = new PickupView();
  readonly felling = new FellingView();
  private readonly axe = buildHeldAxe();
  private readonly toastEl: HTMLElement;
  private toastTimer = 0;
  private readonly panel: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly feed: HTMLElement;
  private version = 0;
  private drawn = { x: Infinity, z: Infinity, version: -1 };
  private axeParent: THREE.Object3D | null = null;
  private readonly startedAt = performance.now();
  /** Milliseconds from this page's start to the first stone axe crafted here (evidence). */
  firstAxeMs: number | null = null;
  /** The pickup within reach, if any (W2 metric). */
  target: LivePickup | null = null;
  /** W3: what E / Use does now. */
  action: Action = { kind: 'none', hint: '' };
  /** A tapped tree (`e:`) or trunk (`t:`), targeted until felled, cut up or left behind. */
  selected: string | null = null;
  private held = false;
  private lastSwing = -Infinity;
  private lastPointerDown = -Infinity;
  private panelKey = '';
  private feedKey = '';
  /** Felling evidence: accepted swings and refusals, first chop and fall times. */
  readonly stats = { chops: 0, cuts: 0, refused: 0, fells: 0, firstChopMs: null as number | null, lastFellMs: null as number | null, lastRefusal: '' };

  constructor(private readonly o: WildGameOptions) {
    o.scene.add(this.view.group, this.felling.group);
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    this.toastEl.id = 'wild-toast';
    this.toastEl.setAttribute('role', 'status');
    document.body.appendChild(this.toastEl);
    this.feed = document.createElement('div');
    this.feed.id = 'wild-events';
    this.feed.setAttribute('aria-label', 'Recent felling events');
    document.body.appendChild(this.feed);
    this.button = document.createElement('button');
    this.button.id = 'bag-button';
    this.button.type = 'button';
    this.button.textContent = 'Bag';
    this.button.setAttribute('aria-label', 'Bag: your items, tools and hand crafting (I)');
    this.button.addEventListener('click', () => this.toggle());
    document.body.appendChild(this.button);
    this.panel = document.createElement('section');
    this.panel.id = 'wild-panel';
    this.panel.setAttribute('aria-label', 'Bag and crafting');
    this.panel.hidden = true;
    this.panel.addEventListener('click', (e) => this.onPanelClick(e));
    document.body.appendChild(this.panel);
    // Hold the Use button to keep swinging (the click that follows a press is ignored: the press acted).
    const use = document.getElementById('gather-nearest');
    use?.addEventListener('pointerdown', (e) => { e.preventDefault(); this.lastPointerDown = performance.now(); this.holdStart(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) use?.addEventListener(ev, () => this.holdEnd());
    // Tap or click a tree (or trunk) to target it.
    if (o.canvas && o.camera) {
      let down: { x: number; y: number; t: number } | null = null;
      o.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
      o.canvas.addEventListener('pointerup', (e) => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
        down = null;
        if (moved < 10 && dt < 450) this.pick(e.clientX, e.clientY);
      });
    }
    this.ensureContent();
  }

  private get world() { return this.o.session.world; }

  /** A W1 (content v1) or W2 (content v2) world gains the latest wilderness content through one journaled command. */
  private ensureContent(): void {
    if (this.world.wild?.fell) return;
    const had = !!this.world.wild;
    const r = this.send({ type: 'upgrade_wilderness', content: WILD_CONTENT_V3 }, 'v3');
    if (r) this.toast(had ? 'Trees can now be felled: craft a stone axe, walk up to a tree and swing.'
      : 'The land around you now has loose branches, stones and plants to gather, and trees to fell.', 'good');
  }

  private send(c: Record<string, unknown>, target: string, quiet = false): ReturnType<GameSession['dispatch']> | null {
    const s = this.o.session;
    const r = s.dispatch({ schema: 3, id: s.commandId(c.type as never, target), expectedRevision: s.world.revision, ...c });
    if (!r.ok) { if (!quiet) this.toast(r.reasons.join('; '), 'warn'); return null; }
    this.version++;
    this.o.onChanged();
    return r;
  }

  toast(message: string, kind: 'good' | 'warn' | 'bad' = 'good'): void {
    this.o.notice(message);
    this.toastEl.textContent = message;
    this.toastEl.className = `toast show ${kind}`;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toastEl.className = 'toast'; }, 2600);
  }

  private at(): { x: number; z: number } | null {
    const ch = this.o.explore()?.character;
    return ch && !ch.dead ? { x: Math.round(ch.x * 10), z: Math.round(ch.z * 10) } : null;
  }

  /** E / the touch Use button (a click right after a press of the button is the same action). */
  use(): void {
    if (performance.now() - this.lastPointerDown < 700) return;
    this.act(false);
  }

  /** Press: act now; while held, swings repeat at the swing pace. */
  holdStart(): void {
    // Only a press that swings keeps swinging: holding after a pickup or delivery must not start chopping.
    this.held = this.action.kind === 'chop' || this.action.kind === 'cut';
    this.act(false);
  }
  holdEnd(): void { this.held = false; }

  private act(repeat: boolean): void {
    const ch = this.o.explore()?.character;
    if (!ch || ch.dead) return;
    const a = this.action;
    if (a.kind === 'none') { if (!repeat) this.toast(a.hint || 'nothing to do within reach: walk up to a tree, a trunk or something to pick up', 'warn'); return; }
    if (a.kind === 'pickup') { if (!repeat) this.pickup(a.p); return; }
    if (a.kind === 'deliver') { if (!repeat) this.deliver(a.n); return; }
    if (performance.now() - this.lastSwing < SWING_COOLDOWN_MS) return;
    this.lastSwing = performance.now();
    if (a.kind === 'chop') this.chop(a.tree);
    else this.cut(a.trunk);
  }

  private refused(r: { reasons: string[] } | null, fallback: string): void {
    this.stats.refused++;
    this.stats.lastRefusal = r?.reasons.join('; ') ?? fallback;
  }

  private chop(t: NearTree): void {
    const at = this.at();
    if (!at) return;
    const s = this.o.session;
    const r = s.dispatch({ schema: 3, id: s.commandId('chop' as never, t.e.id), expectedRevision: s.world.revision, type: 'chop', entityId: t.e.id, at });
    if (!r.ok) { this.refused(r, ''); this.toast(`can't chop: ${r.reasons.join('; ')}`, 'warn'); this.held = r.code === 'too_fast' && this.held; return; }
    this.version++;
    this.o.onChanged();
    this.stats.chops++;
    this.stats.firstChopMs ??= Math.round(performance.now() - this.startedAt);
    this.o.explore()?.swing(t.e.x, t.e.z);
    const o = r.outcome;
    if (o.type !== 'chop') return;
    this.selected = t.e.id;
    if (o.trunkId) {
      const trunk = this.world.wild!.fell!.trunks.get(o.trunkId)!;
      // The fall starts when the strike lands.
      this.felling.fall(this.world, t.e, trunk, this.o.nature?.() ?? null, 220);
      this.stats.fells++;
      this.stats.lastFellMs = Math.round(performance.now() - this.startedAt);
      this.selected = o.trunkId;
      this.held = false;
      this.toast(`The ${t.sp} falls! Swing along the trunk to cut it into ${trunk.logs} log${trunk.logs === 1 ? '' : 's'}.${o.branchPile ? ' Branches fell from the crown.' : ''}`, 'good');
    } else {
      this.felling.hit(t.e.id, 200);
      this.toast(`${o.events.includes('CHOP_STARTED') ? 'chop started · ' : ''}${t.sp} (${t.stage}) ${o.hp}/${o.max} · axe ${o.durability}/${STONE_AXE_DURABILITY}`);
    }
  }

  private cut(t: Trunk): void {
    const at = this.at();
    if (!at) return;
    const s = this.o.session;
    const r = s.dispatch({ schema: 3, id: s.commandId('cut_log' as never, t.id), expectedRevision: s.world.revision, type: 'cut_log', trunkId: t.id, at });
    if (!r.ok) { this.refused(r, ''); this.toast(`can't cut: ${r.reasons.join('; ')}`, 'warn'); return; }
    this.version++;
    this.o.onChanged();
    this.stats.cuts++;
    const c = trunkDistance(t, this.o.explore()!.character!.x, this.o.explore()!.character!.z);
    this.o.explore()?.swing(c.px, c.pz);
    const o = r.outcome;
    if (o.type !== 'cut_log') return;
    if (o.pileId) {
      if (o.left === 0) { this.selected = null; this.held = false; }
      this.toast(o.left ? `a log comes off · ${o.left} left in the trunk · pick it up (E / Pick up)` : 'the last log: the trunk is cut up · pick the logs up and carry them to a stockpile');
    } else this.toast(`cutting… · axe ${o.durability}/${STONE_AXE_DURABILITY}`);
  }

  private pickup(p: LivePickup): void {
    const w = this.world.wild!;
    const before = w.items[p.item] ?? 0;
    const at = this.at();
    if (!at || !this.send({ type: 'pickup', entityId: p.id, at }, p.id)) return;
    const got = (w.items[p.item] ?? 0) - before;
    const room = Math.floor((CARRY_CAPACITY - carriedWeight(w)) / ITEM_WEIGHT.log);
    this.toast(`picked up ${got} ${ITEM_LABEL[p.item]}${got > 1 && p.item === 'log' ? 's' : ''} · bag ${carriedWeight(w)}/${CARRY_CAPACITY}`
      + (p.item === 'log' ? (w.fell?.stockpiles.size ? ` · room for ${room} more · carry them to your stockpile` : ' · mark a stockpile (Bag) and carry them there') : ''));
  }

  private deliver(n: number): void {
    const at = this.at();
    if (!at) return;
    const r = this.send({ type: 'drop', item: 'log', n, at }, 'deliver');
    if (!r || !r.ok || r.outcome.type !== 'drop') return;
    const sp = r.outcome.stockpileId ? this.world.wild!.fell!.stockpiles.get(r.outcome.stockpileId) : undefined;
    this.toast(sp ? `delivered ${n} log${n === 1 ? '' : 's'} · ${stockpileLogs(this.world, sp)} at the stockpile` : `dropped ${n} log${n === 1 ? '' : 's'}`);
  }

  markStockpile(): void {
    const at = this.at();
    if (!at) { this.toast('walk (Tab) to mark a stockpile where you stand', 'warn'); return; }
    if (this.send({ type: 'mark_stockpile', at }, 'stockpile')) this.toast('stockpile marked here: drop logs at it to deliver them (E when you carry logs)');
  }

  craft(recipe: string): void {
    const r = WILD_RECIPES.find((x) => x.id === recipe);
    if (!r || !this.send({ type: 'craft', recipe }, recipe)) return;
    if (r.output.tool === 'stone_axe' && this.firstAxeMs === null) this.firstAxeMs = Math.round(performance.now() - this.startedAt);
    this.toast(r.output.tool ? `You made a ${ITEM_LABEL[r.output.tool]}! Equip it from the bag.` : `made ${r.label.toLowerCase()}`);
  }

  equip(item: 'stone_axe' | 'hands'): void {
    if (this.send({ type: 'equip', item }, item)) this.toast(item === 'hands' ? 'bare hands' : 'stone axe in hand: walk up to a tree and swing (E / Chop)');
  }

  eat(item: WildItem): void {
    if (this.send({ type: 'eat', item }, item)) this.toast(`ate ${ITEM_LABEL[item]} · hunger ${this.world.wild!.hunger}/100`);
  }

  drop(item: WildItem): void {
    const at = this.at();
    if (!at) return;
    const r = this.send({ type: 'drop', item, n: 1, at }, item);
    if (r && r.ok && r.outcome.type === 'drop' && r.outcome.stockpileId) this.toast('delivered 1 log to the stockpile');
    else if (r) this.toast(`dropped 1 ${ITEM_LABEL[item]}`);
  }

  toggle(force?: boolean): void {
    this.panel.hidden = force === undefined ? !this.panel.hidden : !force;
    this.button.classList.toggle('on', !this.panel.hidden);
    this.panelKey = '';
    this.renderPanel();
  }

  private onPanelClick(e: MouseEvent): void {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.close !== undefined) this.toggle(false);
    else if (d.craft) this.craft(d.craft);
    else if (d.eat) this.eat(d.eat as WildItem);
    else if (d.drop) this.drop(d.drop as WildItem);
    else if (d.equip) this.equip(d.equip as 'stone_axe' | 'hands');
    else if (d.stockpile !== undefined) this.markStockpile();
  }

  /** Tap / click: target the tree or trunk nearest the pointer on screen. */
  pick(cx: number, cy: number): boolean {
    const ch = this.o.explore()?.character;
    const cam = this.o.camera, el = this.o.canvas;
    if (!ch || !cam || !el || !this.world.wild?.fell) return false;
    const rect = el.getBoundingClientRect();
    const v = new THREE.Vector3();
    let best: { id: string; d: number } | null = null;
    const consider = (id: string, x: number, y: number, z: number) => {
      v.set(x, y, z).project(cam);
      if (v.z > 1) return;
      const sx = rect.left + (v.x + 1) / 2 * rect.width, sy = rect.top + (1 - v.y) / 2 * rect.height;
      const d = Math.hypot(sx - cx, sy - cy);
      if (d < 60 && (!best || d < best.d)) best = { id, d };
    };
    for (const t of treesNear(this.world, ch.x, ch.z, SELECT_KEEP)) {
      const g = this.o.groundY(t.e.x, t.e.z) ?? t.e.y;
      for (const h of [0.8, 1.8, 3]) consider(t.e.id, t.e.x, g + h, t.e.z);
    }
    for (const { t } of trunksNear(this.world, ch.x, ch.z, SELECT_KEEP)) {
      const c = trunkDistance(t, ch.x, ch.z);
      consider(t.id, c.px, (this.o.groundY(c.px, c.pz) ?? t.y) + 0.3, c.pz);
    }
    const hit = best as { id: string; d: number } | null;
    if (!hit) return false;
    this.selected = hit.id;
    this.toast(hit.id.startsWith('t:') ? 'trunk targeted: walk up to it and swing (E / Cut log)' : 'tree targeted: walk up to it and swing (E / Chop)');
    return true;
  }

  /** What E / Use does now, nearest and most deliberate first. */
  private decide(): Action {
    const w = this.world.wild;
    const ch = this.o.explore()?.active ? this.o.explore()?.character : null;
    if (!w || !ch || ch.dead) return { kind: 'none', hint: '' };
    const f = w.fell;
    const carrying = w.items.log ?? 0;
    const sp = f && carrying ? stockpileAt(this.world, ch.x, ch.z) : null;
    if (sp) return { kind: 'deliver', stockpileId: sp.id, n: carrying };
    const room = CARRY_CAPACITY - carriedWeight(w);
    const near = pickupsNear(this.world, ch.x, ch.z, PROMPT_REACH);
    const fits = near.find((p) => ITEM_WEIGHT[p.item] <= room) ?? null;
    // A targeted tree or trunk out of reach does not block what is in reach; its hint shows when nothing is.
    let selHint = '';
    if (f && this.selected) {
      const id = this.selected;
      if (id.startsWith('t:')) {
        const t = f.trunks.get(id);
        if (!t) this.selected = null;
        else {
          const d = trunkDistance(t, ch.x, ch.z).d - t.r / 100;
          if (d <= CHOP_PROMPT) return { kind: 'cut', trunk: t };
          if (d > SELECT_KEEP) this.selected = null;
          else selHint = 'walk up to the targeted trunk to cut it';
        }
      } else {
        const e = this.world.entities.get(id);
        const c = choppable(this.world, e);
        if (!c.ok) this.selected = null;
        else {
          const d = treeDistance(e!, c.stage, ch.x, ch.z);
          if (d <= CHOP_PROMPT) return { kind: 'chop', tree: { e: e!, sp: c.sp, stage: c.stage, d } };
          if (d > SELECT_KEEP) this.selected = null;
          else selHint = `walk up to the targeted ${c.sp} to chop it`;
        }
      }
    }
    if (fits) return { kind: 'pickup', p: fits };
    if (f) {
      const trunk = trunksNear(this.world, ch.x, ch.z, CHOP_PROMPT)[0];
      if (trunk && equippedTool(this.world)) return { kind: 'cut', trunk: trunk.t };
      const tree = treesNear(this.world, ch.x, ch.z, CHOP_PROMPT)[0];
      // Without an axe the swing is still offered: the simulation refuses it and says why.
      if (tree) return { kind: 'chop', tree };
    }
    if (near[0]) return { kind: 'pickup', p: near[0] };
    if (selHint) return { kind: 'none', hint: selHint };
    return { kind: 'none', hint: carrying ? (f?.stockpiles.size ? 'carry the logs to your stockpile and press E there' : 'mark a log stockpile from the Bag, then drop the logs there') : '' };
  }

  update(): void {
    const w = this.world.wild;
    const ex = this.o.explore();
    const ch = ex?.active ? ex.character : null;
    if (!w) return;
    this.action = this.decide();
    this.target = this.action.kind === 'pickup' ? this.action.p : null;
    if (this.held && (this.action.kind === 'chop' || this.action.kind === 'cut')) this.act(true);
    // The drawn set follows the player (or the camera target in the overview) and every accepted command.
    const fx = ch ? ch.x : this.drawn.x, fz = ch ? ch.z : this.drawn.z;
    if (Number.isFinite(fx) && (this.version !== this.drawn.version || Math.hypot(fx - this.drawn.x, fz - this.drawn.z) > 6)) {
      this.view.sync(pickupsNear(this.world, fx, fz, DRAW_RADIUS), this.o.groundY);
      this.drawn = { x: fx, z: fz, version: this.version };
    }
    this.felling.update(this.world, ch ? { x: ch.x, z: ch.z } : Number.isFinite(fx) ? { x: fx, z: fz } : null, this.o.groundY, this.o.nature?.() ?? null);
    // The axe in the hand.
    const hand = ex?.rightHand ?? null;
    if (hand && this.axeParent !== hand) { hand.add(this.axe); this.axeParent = hand; }
    this.axe.visible = equippedTool(this.world)?.kind === 'stone_axe';
    this.renderPanel();
    this.renderFeed();
  }

  /** The reach ring target for ExploreController. */
  reachTarget = (): { x: number; y: number; z: number } | null => {
    const a = this.action;
    if (a.kind === 'pickup') return { x: a.p.x, y: this.o.groundY(a.p.x, a.p.z) ?? a.p.y, z: a.p.z };
    if (a.kind === 'chop') return { x: a.tree.e.x, y: this.o.groundY(a.tree.e.x, a.tree.e.z) ?? a.tree.e.y, z: a.tree.e.z };
    if (a.kind === 'cut') {
      const ch = this.o.explore()?.character;
      const c = ch ? trunkDistance(a.trunk, ch.x, ch.z) : { px: a.trunk.x, pz: a.trunk.z };
      return { x: c.px, y: this.o.groundY(c.px, c.pz) ?? a.trunk.y, z: c.pz };
    }
    if (a.kind === 'deliver') { const s = this.world.wild?.fell?.stockpiles.get(a.stockpileId); return s ? { x: s.x, y: this.o.groundY(s.x, s.z) ?? s.y, z: s.z } : null; }
    return null;
  };

  /** Touch button label. */
  buttonLabel(): string {
    switch (this.action.kind) {
      case 'chop': return 'Chop';
      case 'cut': return 'Cut log';
      case 'deliver': return 'Deliver';
      default: return 'Pick up';
    }
  }
  get idle(): boolean { return this.action.kind === 'none'; }

  /** HUD prompt, e.g. "E: chop oak (old) 9/13". */
  prompt(coarse: boolean): string {
    const a = this.action, k = coarse ? '' : 'E: ';
    switch (a.kind) {
      case 'pickup': {
        const t = a.p;
        const what = t.kind === 'pile' ? `${ITEM_LABEL[t.item]}${t.qty > 1 ? 's' : ''}${t.item === 'log' ? '' : ' (dropped)'}` : PICKUP_LABEL[t.kind];
        return `${coarse ? 'Pick up' : 'E: pick up'} ${what}${t.qty > 1 ? ` ×${t.qty}` : ''}`;
      }
      case 'chop': {
        const dmg = this.world.wild?.fell?.chop.get(a.tree.e.id);
        const tool = equippedTool(this.world);
        return `${k}chop ${a.tree.sp} (${a.tree.stage})${dmg ? ` ${dmg.hp}/${dmg.max}` : ''}${tool ? '' : ' · needs an axe in hand'}${coarse ? '' : ' · hold to keep swinging'}`;
      }
      case 'cut': return `${k}cut log · ${a.trunk.left} left in the ${a.trunk.sp} trunk`;
      case 'deliver': return `${k}deliver ${a.n} log${a.n === 1 ? '' : 's'} to the stockpile`;
      default: return a.hint;
    }
  }

  /** Short HUD summary of the bag. */
  summary(): string {
    const w = this.world.wild;
    if (!w) return 'bag: empty · bare hands';
    const items = Object.entries(w.items).filter(([, n]) => n > 0).map(([k, n]) => `${ITEM_LABEL[k as WildItem]} ${n}`);
    const tool = equippedTool(this.world);
    return `bag ${carriedWeight(w)}/${CARRY_CAPACITY}: ${items.length || w.tools.length ? [...items, ...w.tools.map((t) => ITEM_LABEL[t.kind])].join(', ') : 'empty'}`
      + ` · ${tool ? `${ITEM_LABEL[tool.kind]} ${tool.durability}/${STONE_AXE_DURABILITY} in hand` : 'bare hands'} · hunger ${w.hunger}`;
  }

  private renderFeed(): void {
    const ev = this.world.wild?.fell?.events ?? [];
    const last = ev.slice(-4);
    const key = last.map((e) => e.seq).join(',');
    if (key === this.feedKey) return;
    this.feedKey = key;
    this.feed.innerHTML = last.map((e) => `<div>${EVENT_LABEL[e.type]}${e.n !== undefined && e.type !== 'TREE_DAMAGED' && e.type !== 'TRUNK_CREATED' ? ` ×${e.n}` : ''}</div>`).join('');
    this.feed.classList.toggle('on', last.length > 0);
  }

  private renderPanel(): void {
    if (this.panel.hidden) return;
    const w = this.world.wild;
    if (!w) return;
    const key = JSON.stringify([w.items, w.tools, w.equipped, w.hunger, w.fell?.stockpiles.size]);
    if (key === this.panelKey) return;
    this.panelKey = key;
    const have = (k: string) => w.items[k] ?? 0;
    const items = Object.entries(w.items).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b));
    const rows = items.length ? items.map(([k, n]) => `<li><span>${ITEM_LABEL[k as WildItem]} <b>×${n}</b></span>`
      + (FOOD_VALUE[k as WildItem] ? `<button type="button" data-eat="${k}">Eat</button>` : '')
      + `<button type="button" data-drop="${k}" aria-label="Drop one ${ITEM_LABEL[k as WildItem]}">Drop 1</button></li>`).join('')
      : '<li class="dim">nothing yet: pick up branches, stones and plants (E or Pick up)</li>';
    const tools = w.tools.length ? w.tools.map((t) => `<li><span>${ITEM_LABEL[t.kind]} <span class="dim">${t.durability ? `${t.durability}/${STONE_AXE_DURABILITY}` : 'broken'}</span>${w.equipped === t.id ? ' <b class="eq">in hand</b>' : ''}</span>`
      + (w.equipped === t.id ? '<button type="button" data-equip="hands">Put away</button>' : `<button type="button" data-equip="${t.kind}">Equip</button>`) + '</li>').join('')
      : '<li class="dim">no tools yet</li>';
    const recipes = WILD_RECIPES.map((r) => {
      const need = Object.entries(r.input).map(([k, n]) => `<span class="${have(k) >= (n ?? 0) ? 'ok' : 'miss'}">${ITEM_LABEL[k as WildItem]} ${Math.min(have(k), n ?? 0)}/${n}</span>`).join(' · ');
      const ok = Object.entries(r.input).every(([k, n]) => have(k) >= (n ?? 0));
      return `<li class="recipe"><div><b>${r.label}</b><br><small>${need}</small></div><button type="button" data-craft="${r.id}" ${ok ? '' : 'disabled aria-disabled="true"'}>Craft</button></li>`;
    }).join('');
    const piles = w.fell ? `<h3>Logs</h3><ul><li><span class="dim">${w.fell.stockpiles.size ? `${w.fell.stockpiles.size} stockpile${w.fell.stockpiles.size === 1 ? '' : 's'} marked · drop logs at one to deliver` : 'no stockpile yet'}</span>`
      + `<button type="button" data-stockpile>Mark stockpile here</button></li></ul>` : '';
    this.panel.innerHTML = `<header><h2>Bag</h2><span class="dim">weight ${carriedWeight(w)}/${CARRY_CAPACITY} · hunger ${w.hunger}/100</span><button type="button" data-close aria-label="Close bag">×</button></header>`
      + `<h3>Items</h3><ul>${rows}</ul><h3>Tools</h3><ul>${tools}</ul>${piles}<h3>Craft by hand</h3><ul>${recipes}</ul>`;
  }

  metrics(): Record<string, unknown> {
    const w = this.world.wild;
    const f = w?.fell;
    const a = this.action;
    return {
      content: w ? w.content : 1, items: w ? { ...w.items } : {}, tools: w ? w.tools.map((t) => ({ ...t })) : [], equipped: w?.equipped ?? null,
      hunger: w?.hunger ?? null, weight: w ? carriedWeight(w) : 0, taken: w ? w.taken.size : 0, piles: w ? w.piles.size : 0,
      drawn: this.view.count, target: this.target ? { id: this.target.id, kind: this.target.kind, x: this.target.x, z: this.target.z } : null,
      firstAxeMs: this.firstAxeMs, axeVisible: this.axe.visible,
      action: a.kind === 'chop' ? { kind: 'chop', id: a.tree.e.id, sp: a.tree.sp, stage: a.tree.stage, x: a.tree.e.x, z: a.tree.e.z }
        : a.kind === 'cut' ? { kind: 'cut', id: a.trunk.id, left: a.trunk.left } : a.kind === 'pickup' ? { kind: 'pickup', id: a.p.id, item: a.p.item }
          : a.kind === 'deliver' ? { kind: 'deliver', id: a.stockpileId, n: a.n } : { kind: 'none', hint: a.hint },
      selected: this.selected,
      felling: f ? {
        damaged: [...f.chop.values()].map((c) => ({ ...c })),
        trunks: [...f.trunks.values()].map((t) => ({ id: t.id, tree: t.tree, sp: t.sp, stage: t.stage, x: t.x, z: t.z, dir: t.dir, len: t.len, r: t.r, logs: t.logs, left: t.left })),
        stockpiles: [...f.stockpiles.values()].map((s) => ({ ...s, logs: stockpileLogs(this.world, s) })),
        events: f.events.slice(-12).map((e: EventRecord) => ({ ...e })), eventSeq: f.eventSeq,
        stumps: f.woodland.trees.filter((t) => t.st === 'stump').length,
        drawn: this.felling.drawn, falling: this.felling.fallingCount, falls: this.felling.falls,
        swingsDrawn: this.o.explore()?.swings ?? 0, swinging: this.o.explore()?.swinging ?? false,
      } : null,
      stats: { ...this.stats },
    };
  }
}
