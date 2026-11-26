// W2: the wilderness player's gathering, bag and hand crafting. Presentation
// and input only: every change is a journaled command (app/wild-commands.ts)
// that the simulation (sim/gathering.ts) accepts or refuses.
import * as THREE from 'three';
import type { GameSession } from './session';
import type { ExploreController } from './explore';
import {
  CARRY_CAPACITY, FOOD_VALUE, ITEM_LABEL, LivePickup, PICKUP_LABEL, PICKUP_REACH, WILD_CONTENT_V2, WILD_RECIPES, WildItem,
  carriedWeight, equippedTool, pickupsNear,
} from '../sim/gathering';
import { PickupView, buildHeldAxe } from '../render/pickups';

export interface WildGameOptions {
  session: GameSession;
  scene: THREE.Scene;
  explore: () => ExploreController | null;
  groundY: (x: number, z: number) => number | null;
  /** An accepted command changed the world: schedule a save. */
  onChanged: () => void;
  /** Also mirrored into the HUD line by the caller. */
  notice: (message: string) => void;
}

/** Pickups are drawn within this radius of the player (metres). */
const DRAW_RADIUS = 48;
/** The prompt uses a little less than the simulation's reach, so a shown prompt is always accepted. */
const PROMPT_REACH = PICKUP_REACH - 0.25;

export class WildGame {
  readonly view = new PickupView();
  private readonly axe = buildHeldAxe();
  private readonly toastEl: HTMLElement;
  private toastTimer = 0;
  private readonly panel: HTMLElement;
  private readonly button: HTMLButtonElement;
  private version = 0;
  private drawn = { x: Infinity, z: Infinity, version: -1 };
  private axeParent: THREE.Object3D | null = null;
  private readonly startedAt = performance.now();
  /** Milliseconds from this page's start to the first stone axe crafted here (evidence). */
  firstAxeMs: number | null = null;
  /** The pickup within reach, if any. */
  target: LivePickup | null = null;
  private panelKey = '';

  constructor(private readonly o: WildGameOptions) {
    o.scene.add(this.view.group);
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    this.toastEl.id = 'wild-toast';
    this.toastEl.setAttribute('role', 'status');
    document.body.appendChild(this.toastEl);
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
    this.ensureContent();
  }

  private get world() { return this.o.session.world; }

  /** A W1 world (content v1) gains loose pickups, items and crafting through one journaled command. */
  private ensureContent(): void {
    if (this.world.wild) return;
    const r = this.send({ type: 'upgrade_wilderness', content: WILD_CONTENT_V2 }, 'v2');
    if (r) this.toast('The land around you now has loose branches, stones and plants to gather.', 'good');
  }

  private send(c: Record<string, unknown>, target: string): boolean {
    const s = this.o.session;
    const r = s.dispatch({ schema: 3, id: s.commandId(c.type as never, target), expectedRevision: s.world.revision, ...c });
    if (!r.ok) { this.toast(r.reasons.join('; '), 'warn'); return false; }
    this.version++;
    this.o.onChanged();
    return true;
  }

  toast(message: string, kind: 'good' | 'warn' | 'bad' = 'good'): void {
    this.o.notice(message);
    this.toastEl.textContent = message;
    this.toastEl.className = `toast show ${kind}`;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toastEl.className = 'toast'; }, 2600);
  }

  /** E / the touch Pick up button. */
  use(): void {
    const ch = this.o.explore()?.character;
    if (!ch || ch.dead) return;
    const p = this.target;
    if (!p) { this.toast('nothing to pick up within reach: walk up to a branch, stone or plant', 'warn'); return; }
    const w = this.world.wild!;
    const before = w.items[p.item] ?? 0;
    if (!this.send({ type: 'pickup', entityId: p.id, at: { x: Math.round(ch.x * 10), z: Math.round(ch.z * 10) } }, p.id)) return;
    const got = (w.items[p.item] ?? 0) - before;
    this.toast(`picked up ${got} ${ITEM_LABEL[p.item]} · bag ${carriedWeight(w)}/${CARRY_CAPACITY}`);
  }

  craft(recipe: string): void {
    const r = WILD_RECIPES.find((x) => x.id === recipe);
    if (!r || !this.send({ type: 'craft', recipe }, recipe)) return;
    if (r.output.tool === 'stone_axe' && this.firstAxeMs === null) this.firstAxeMs = Math.round(performance.now() - this.startedAt);
    this.toast(r.output.tool ? `You made a ${ITEM_LABEL[r.output.tool]}! Equip it from the bag.` : `made ${r.label.toLowerCase()}`);
  }

  equip(item: 'stone_axe' | 'hands'): void {
    if (this.send({ type: 'equip', item }, item)) this.toast(item === 'hands' ? 'bare hands' : 'stone axe in hand (tree felling comes with W3)');
  }

  eat(item: WildItem): void {
    if (this.send({ type: 'eat', item }, item)) this.toast(`ate ${ITEM_LABEL[item]} · hunger ${this.world.wild!.hunger}/100`);
  }

  drop(item: WildItem): void {
    const ch = this.o.explore()?.character;
    if (!ch) return;
    if (this.send({ type: 'drop', item, n: 1, at: { x: Math.round(ch.x * 10), z: Math.round(ch.z * 10) } }, item)) this.toast(`dropped 1 ${ITEM_LABEL[item]}`);
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
  }

  update(): void {
    const w = this.world.wild;
    const ex = this.o.explore();
    const ch = ex?.active ? ex.character : null;
    if (!w) return;
    // Reach and the prompt.
    this.target = null;
    if (ch && !ch.dead) {
      const near = pickupsNear(this.world, ch.x, ch.z, PROMPT_REACH);
      this.target = near[0] ?? null;
    }
    // The drawn set follows the player (or the camera target in the overview) and every accepted command.
    const fx = ch ? ch.x : this.drawn.x, fz = ch ? ch.z : this.drawn.z;
    if (Number.isFinite(fx) && (this.version !== this.drawn.version || Math.hypot(fx - this.drawn.x, fz - this.drawn.z) > 6)) {
      this.view.sync(pickupsNear(this.world, fx, fz, DRAW_RADIUS), this.o.groundY);
      this.drawn = { x: fx, z: fz, version: this.version };
    }
    // The axe in the hand.
    const hand = ex?.rightHand ?? null;
    if (hand && this.axeParent !== hand) { hand.add(this.axe); this.axeParent = hand; }
    this.axe.visible = equippedTool(this.world)?.kind === 'stone_axe';
    this.renderPanel();
  }

  /** The reach ring target for ExploreController. */
  reachTarget = (): { x: number; y: number; z: number } | null => {
    const t = this.target;
    return t ? { x: t.x, y: this.o.groundY(t.x, t.z) ?? t.y, z: t.z } : null;
  };

  /** HUD prompt, e.g. "E: pick up branch". */
  prompt(coarse: boolean): string {
    const t = this.target;
    if (!t) return '';
    const what = t.kind === 'pile' ? `${ITEM_LABEL[t.item]} (dropped)` : PICKUP_LABEL[t.kind];
    return `${coarse ? 'Pick up' : 'E: pick up'} ${what}${t.qty > 1 ? ` ×${t.qty}` : ''}`;
  }

  /** Short HUD summary of the bag. */
  summary(): string {
    const w = this.world.wild;
    if (!w) return 'bag: empty · bare hands';
    const items = Object.entries(w.items).filter(([, n]) => n > 0).map(([k, n]) => `${ITEM_LABEL[k as WildItem]} ${n}`);
    const tool = equippedTool(this.world);
    return `bag ${carriedWeight(w)}/${CARRY_CAPACITY}: ${items.length || w.tools.length ? [...items, ...w.tools.map((t) => ITEM_LABEL[t.kind])].join(', ') : 'empty'}`
      + ` · ${tool ? `${ITEM_LABEL[tool.kind]} in hand` : 'bare hands'} · hunger ${w.hunger}`;
  }

  private renderPanel(): void {
    if (this.panel.hidden) return;
    const w = this.world.wild;
    if (!w) return;
    const key = JSON.stringify([w.items, w.tools, w.equipped, w.hunger]);
    if (key === this.panelKey) return;
    this.panelKey = key;
    const have = (k: string) => w.items[k] ?? 0;
    const items = Object.entries(w.items).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b));
    const rows = items.length ? items.map(([k, n]) => `<li><span>${ITEM_LABEL[k as WildItem]} <b>×${n}</b></span>`
      + (FOOD_VALUE[k as WildItem] ? `<button type="button" data-eat="${k}">Eat</button>` : '')
      + `<button type="button" data-drop="${k}" aria-label="Drop one ${ITEM_LABEL[k as WildItem]}">Drop 1</button></li>`).join('')
      : '<li class="dim">nothing yet: pick up branches, stones and plants (E or Pick up)</li>';
    const tools = w.tools.length ? w.tools.map((t) => `<li><span>${ITEM_LABEL[t.kind]} <span class="dim">${t.durability}/60</span>${w.equipped === t.id ? ' <b class="eq">in hand</b>' : ''}</span>`
      + (w.equipped === t.id ? '<button type="button" data-equip="hands">Put away</button>' : `<button type="button" data-equip="${t.kind}">Equip</button>`) + '</li>').join('')
      : '<li class="dim">no tools yet</li>';
    const recipes = WILD_RECIPES.map((r) => {
      const need = Object.entries(r.input).map(([k, n]) => `<span class="${have(k) >= (n ?? 0) ? 'ok' : 'miss'}">${ITEM_LABEL[k as WildItem]} ${Math.min(have(k), n ?? 0)}/${n}</span>`).join(' · ');
      const ok = Object.entries(r.input).every(([k, n]) => have(k) >= (n ?? 0));
      return `<li class="recipe"><div><b>${r.label}</b><br><small>${need}</small></div><button type="button" data-craft="${r.id}" ${ok ? '' : 'disabled aria-disabled="true"'}>Craft</button></li>`;
    }).join('');
    this.panel.innerHTML = `<header><h2>Bag</h2><span class="dim">weight ${carriedWeight(w)}/${CARRY_CAPACITY} · hunger ${w.hunger}/100</span><button type="button" data-close aria-label="Close bag">×</button></header>`
      + `<h3>Items</h3><ul>${rows}</ul><h3>Tools</h3><ul>${tools}</ul><h3>Craft by hand</h3><ul>${recipes}</ul>`;
  }

  metrics(): Record<string, unknown> {
    const w = this.world.wild;
    return {
      content: w ? 2 : 1, items: w ? { ...w.items } : {}, tools: w ? w.tools.map((t) => ({ ...t })) : [], equipped: w?.equipped ?? null,
      hunger: w?.hunger ?? null, weight: w ? carriedWeight(w) : 0, taken: w ? w.taken.size : 0, piles: w ? w.piles.size : 0,
      drawn: this.view.count, target: this.target ? { id: this.target.id, kind: this.target.kind, x: this.target.x, z: this.target.z } : null,
      firstAxeMs: this.firstAxeMs, axeVisible: this.axe.visible,
    };
  }
}
