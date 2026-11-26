// W2: the wilderness player's gathering, bag and hand crafting. Presentation
// and input only: every change is a journaled command (app/wild-commands.ts)
// that the simulation (sim/gathering.ts) accepts or refuses.
// W3: physical tree felling. Walk up to a tree (or tap it to target it) and
// swing the axe with E / the Use button (hold to keep swinging): each swing
// is one journaled `chop`, applied at once. The felled tree leaves a stump
// and a trunk; swings along the trunk (`cut_log`) make logs; logs are picked
// up and delivered by dropping them at a stockpile marked from the bag.
// W4: build anywhere (app/wild-build-ui.ts): the Build menu and ghost, and
// at a site E / Use delivers what it needs from the bag, then each press (or
// hold) is one swing of construction work. Finished buildings have panels
// (claim the lean-to, fuel and cook at the fire, craft at the workbench,
// store and take). A death (drowning) is journaled as `died` (carried items
// drop at the last dry spot); after the death screen a journaled `respawn`
// wakes the player at the claimed lean-to, or (refused, visibly) at the spawn
// banner; the character lands exactly where the outcome says.
import * as THREE from 'three';
import type { GameSession } from './session';
import type { ExploreController } from './explore';
import {
  CARRY_CAPACITY, CARRY_CAPACITY_V5, FOOD_VALUE, ITEM_LABEL, ITEM_WEIGHT, LATEST_WILD_CONTENT, LivePickup, PICKUP_LABEL, PICKUP_REACH, TOOL_DURABILITY,
  WILD_CONTENT_V5, WILD_CONTENT_V8, WILD_RECIPES, WildItem, carriedWeight, carryCapacity, equippedTool, pickupsNear,
} from '../sim/gathering';
import {
  CHOP_REACH, EventRecord, FellEvent, NearTree, SWING_COOLDOWN_MS, Trunk, choppable, stockpileAt, stockpileLogs, treeDistance,
  treesNear, trunkDistance, trunksNear,
} from '../sim/felling';
import { PickupView, buildHeldAxe, buildHeldPickaxe } from '../render/pickups';
import { DepositView } from '../render/deposits';
import { DEPOSIT_LABEL, Deposit, typedDepositsNear } from '../sim/deposits';
import { DEPOSIT_ITEM, MINE_REACH, MINE_SWINGS, depositLeft, depositWork, isDiscovered } from '../sim/mining';
import { FellingView, NatureHider } from '../render/felling';
import { WildBuildUI } from './wild-build-ui';
import { SITE_REACH, WildSite, buildingsNear, deliverable, freeIn, homeShelter, reservationsInSource, reservedTotalsIn, siteSpotOf, stageNeeds, stationNear } from '../sim/wild-build';
import { buildingDef } from '../sim/catalogue';
import { WildMap } from './wild-map';
import { waterSurfaceAt } from '../sim/world';

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
const MINE_PROMPT = MINE_REACH - 0.4;
/** A tapped tree stays targeted within this distance. */
const SELECT_KEEP = 25;

const EVENT_LABEL: Record<FellEvent, string> = {
  CHOP_STARTED: 'chop started', TREE_DAMAGED: 'tree damaged', TREE_FELLED: 'tree felled', TRUNK_CREATED: 'trunk on the ground',
  LOGS_CREATED: 'log cut', LOGS_COLLECTED: 'log picked up', LOGS_DELIVERED: 'logs delivered', STOCKPILE_MARKED: 'stockpile marked',
  SITE_PLACED: 'site placed', MATERIALS_DELIVERED: 'materials delivered', CONSTRUCTION_PROGRESS: 'construction', BUILDING_COMPLETED: 'building completed',
  SITE_CANCELLED: 'site cancelled', SHELTER_CLAIMED: 'shelter claimed', FIRE_FUELED: 'fire fuelled', FOOD_COOKED: 'food cooked',
  ITEMS_STORED: 'items stored', ITEMS_TAKEN: 'items taken', RESPAWNED: 'respawned', DIED: 'died',
  MINE_STARTED: 'mining started', DEPOSIT_MINED: 'unit mined', DEPOSIT_EXHAUSTED: 'deposit worked out', SMELT_STARTED: 'smelting started', SMELT_DONE: 'ingots ready',
};

type Action =
  | { kind: 'none'; hint: string }
  | { kind: 'pickup'; p: LivePickup }
  | { kind: 'chop'; tree: NearTree }
  | { kind: 'cut'; trunk: Trunk }
  | { kind: 'deliver'; stockpileId: string; n: number }
  | { kind: 'site_deliver'; s: WildSite; need: Record<string, number> }
  | { kind: 'site_work'; s: WildSite }
  | { kind: 'mine'; d: Deposit };

export class WildGame {
  readonly view = new PickupView();
  readonly felling = new FellingView();
  /** W6: deposits in the land (mounds, seams, veins on ore outcrops, worked-out scars). */
  readonly deposits = new DepositView();
  /** W4: the Build menu, ghost, construction and building panels. */
  readonly build: WildBuildUI;
  /** W5: minimap, full map, waypoints, routes and the trail. */
  readonly map: WildMap;
  private readonly axe = buildHeldAxe();
  private readonly pickaxe = buildHeldPickaxe();
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
  readonly stats = { chops: 0, cuts: 0, refused: 0, fells: 0, firstChopMs: null as number | null, lastFellMs: null as number | null, lastRefusal: '',
    works: 0, mines: 0, unitsMined: 0, firstMineMs: null as number | null, deaths: 0, lastDeath: null as null | { dropped: Record<string, number>; piles: number } | { refused: string },
    lastRespawn: null as null | { point: string; x: number; z: number; refused: string[] } };

  constructor(private readonly o: WildGameOptions) {
    o.scene.add(this.view.group, this.felling.group, this.deposits.group);
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
        if (moved < 10 && dt < 450 && !this.build?.mode.active) this.pick(e.clientX, e.clientY);
      });
    }
    this.build = new WildBuildUI({
      world: () => this.world, send: (c, t, quiet) => { const r = this.send(c, t, quiet); return r && r.ok ? { ok: true, outcome: r.outcome as never } : null; },
      toast: (m, k) => this.toast(m, k), at: () => this.at(),
      player: () => { const c = o.explore()?.character; return c && !c.dead ? { x: c.x, z: c.z, heading: c.heading } : null; },
      scene: o.scene, ...(o.camera ? { camera: o.camera } : {}), ...(o.canvas ? { canvas: o.canvas } : {}),
    });
    this.build.onWork = (s) => { if (performance.now() - this.lastSwing >= SWING_COOLDOWN_MS) { this.lastSwing = performance.now(); this.work(s); } };
    this.build.onCraft = (r) => this.craft(r);
    this.ensureContent();
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { storage = null; }
    const fwd = new THREE.Vector3();
    this.map = new WildMap({
      world: () => this.world,
      dispatch: (c, t) => {
        const s = o.session;
        const r = s.dispatch({ schema: 3, id: s.commandId(c.type as never, t), expectedRevision: s.world.revision, ...c });
        if (r.ok) { this.version++; o.onChanged(); return { ok: true, outcome: r.outcome as never }; }
        return { ok: false, code: r.code, reasons: r.reasons };
      },
      toast: (m, k) => this.toast(m, k),
      player: () => { const c = o.explore()?.active ? o.explore()!.character : null; return c && !c.dead ? { x: c.x, z: c.z, heading: c.heading } : null; },
      cameraForward: () => { if (!o.camera) return null; o.camera.getWorldDirection(fwd); const l = Math.hypot(fwd.x, fwd.z); return l > 1e-3 ? { x: fwd.x / l, z: fwd.z / l } : null; },
      // On the ground, or on the water's surface where the route wades.
      groundY: (x, z) => { const g = o.groundY(x, z); if (g === null) return null; const fx = Math.floor(x), fz = Math.floor(z); return Math.max(g, waterSurfaceAt(this.world, fx, fz) - 0.08); },
      scene: o.scene, storage,
    });
    // W4: the claimed lean-to is the Home return target and the respawn point.
    const ex = o.explore();
    if (ex) {
      ex.homeOverride = () => { const h = homeShelter(this.world); return h ? { ...siteSpotOf(h), name: 'lean-to' } : null; };
      ex.respawnAt = () => this.respawn();
      ex.onDeath = (cause) => this.died(cause);
    }
  }

  /** The character died: journal it (carried items drop at the last dry spot; nothing is restored). */
  private died(cause: string): void {
    const ch = this.o.explore()?.character;
    if (!ch || !this.world.wild?.build) return;
    const safe = ch.safe ?? ch;
    this.stats.deaths++;
    const s = this.o.session;
    const r = s.dispatch({ schema: 3, id: s.commandId('died' as never, 'death'), expectedRevision: s.world.revision, type: 'died', cause: cause === 'drowned' ? 'drowned' : cause,
      at: { x: Math.round(safe.x * 10), z: Math.round(safe.z * 10) } });
    if (!r.ok) {
      // Shown, never hidden: the world could not record this death, so nothing is dropped.
      this.stats.lastDeath = { refused: r.reasons.join('; ') };
      this.toast(`You drowned, but the death could not be recorded (${r.reasons.join('; ')}). You keep what you carry and wake where you last stood on dry ground.`, 'bad');
      return;
    }
    this.version++; this.o.onChanged();
    if (r.outcome.type !== 'died') return;
    const o = r.outcome;
    this.stats.lastDeath = { dropped: { ...o.dropped }, piles: o.piles.length };
    const what = Object.entries(o.dropped).map(([k, n]) => `${n} ${ITEM_LABEL[k as WildItem] ?? k}`).join(', ');
    this.toast(`You drowned. ${what ? `Your ${what} lie where you last stood on dry ground.` : 'You carried nothing.'} Tools stay with you.`, 'bad');
  }

  /**
   * After the death screen: wake at the claimed lean-to (journaled); if that is
   * refused, say why and wake at the spawn banner (a distinct journaled
   * outcome). Returns the exact landing point, or null when no death was
   * recorded (the explore controller then wakes at the last dry spot).
   */
  private respawn(): { x: number; z: number } | null {
    const b = this.world.wild?.build;
    if (!b?.death) return null;
    const s = this.o.session;
    const go = (to: string) => s.dispatch({ schema: 3, id: s.commandId('respawn' as never, to), expectedRevision: s.world.revision, type: 'respawn', to });
    const refused: string[] = [];
    let r = b.home ? go(b.home) : null;
    if (r && !r.ok) refused.push(...r.reasons);
    if (!r || !r.ok) r = go('spawn');
    if (!r.ok || r.outcome.type !== 'respawn') { this.toast(`could not wake: ${r.ok ? '' : r.reasons.join('; ')}`, 'bad'); return null; }
    this.version++; this.o.onChanged();
    const o = r.outcome;
    this.stats.lastRespawn = { point: o.point, x: o.x, z: o.z, refused };
    this.toast(o.point === 'spawn'
      ? `${refused.length ? `You cannot wake at your lean-to: ${refused.join('; ')}. ` : b.home ? '' : 'You have no claimed lean-to. '}You wake at the spawn banner.`
      : 'You wake at your lean-to.', refused.length ? 'warn' : 'good');
    return { x: o.x / 10, z: o.z / 10 };
  }

  private get world() { return this.o.session.world; }

  /** A world with older wilderness content (v1-v7) gains the latest (v8) through one journaled command. */
  private ensureContent(): void {
    const w = this.world.wild;
    if (w && w.content >= LATEST_WILD_CONTENT) return;
    const had = !!w, fell = !!w?.fell, built = !!w?.build, big = !!w && w.content >= WILD_CONTENT_V5, mapped = !!w?.map, mined = !!w?.mine;
    const r = this.send({ type: 'upgrade_wilderness', content: WILD_CONTENT_V8 }, 'v8');
    if (r) this.toast(mined ? 'The wild animals now live on in your world: each deer, hare, fox, wolf and trout keeps its place and its ways when you leave and come back.'
      : mapped ? 'Deposits can now be mined: explore to find iron, copper, coal, clay, sand and gravel, equip a stone pickaxe and swing (E). Clay, sand and gravel build a clay smelter for ingots.'
      : big ? 'You now have a map: tap the small map (or press M) to open it, set waypoints and get a walking route. What you have not seen stays hidden.'
      : built ? `Your bag now holds ${CARRY_CAPACITY_V5} weight (was ${CARRY_CAPACITY}). At a building site, free materials in your bag can now be delivered in place of ones reserved in piles.`
      : fell ? 'You can now build anywhere: open Build (G) for a shelter, a fire, a workbench and storage.'
      : had ? 'Trees can now be felled and you can build: craft a stone axe, fell a tree, then open Build (G).'
        : 'The land around you now has loose branches, stones and plants to gather, trees to fell and room to build.', 'good');
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
    this.held = this.action.kind === 'chop' || this.action.kind === 'cut' || this.action.kind === 'site_work' || this.action.kind === 'mine';
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
    if (a.kind === 'site_deliver') { if (!repeat) this.build.deliverAll(a.s); return; }
    if (performance.now() - this.lastSwing < SWING_COOLDOWN_MS) return;
    this.lastSwing = performance.now();
    if (a.kind === 'chop') this.chop(a.tree);
    else if (a.kind === 'mine') this.mine(a.d);
    else if (a.kind === 'site_work') this.work(a.s);
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
      this.toast(`${o.events.includes('CHOP_STARTED') ? 'chop started · ' : ''}${t.sp} (${t.stage}) ${o.hp}/${o.max} · axe ${o.durability}/${TOOL_DURABILITY.stone_axe}`);
    }
  }

  /**
   * W6: one pickaxe swing at a deposit. A deposit in sight that the map does not have yet is reported first
   * (a journaled explore): only a discovered deposit is mined.
   */
  private mine(d: Deposit): void {
    const at = this.at();
    const ch = this.o.explore()?.character;
    if (!at || !ch) return;
    if (!isDiscovered(this.world, d.id)) this.map.reportNow({ x: ch.x, z: ch.z });
    const s = this.o.session;
    const r = s.dispatch({ schema: 3, id: s.commandId('mine' as never, d.id), expectedRevision: s.world.revision, type: 'mine', depositId: d.id, at });
    if (!r.ok) { this.refused(r, ''); this.toast(`can't mine: ${r.reasons.join('; ')}`, 'warn'); this.held = r.code === 'too_fast' && this.held; return; }
    this.version++;
    this.o.onChanged();
    this.stats.mines++;
    this.stats.firstMineMs ??= Math.round(performance.now() - this.startedAt);
    this.o.explore()?.swing(d.x, d.z);
    const o = r.outcome;
    if (o.type !== 'mine') return;
    const item = DEPOSIT_ITEM[d.type], w = this.world.wild!;
    if (o.amount) {
      this.stats.unitsMined++;
      if (o.left === 0) this.held = false;
      this.toast(`+1 ${ITEM_LABEL[item]} · ${o.left ? `${o.left}/${d.qty} left in the deposit` : 'the deposit is worked out (it does not regrow)'} · bag ${carriedWeight(w)}/${carryCapacity(w)}`, 'good');
      if (carriedWeight(w) + ITEM_WEIGHT[item] > carryCapacity(w)) this.held = false;
    } else this.toast(`mining ${DEPOSIT_LABEL[d.type]} ${o.work}/${MINE_SWINGS[d.type]} · ${o.left}/${d.qty} left · pickaxe ${o.durability}/${TOOL_DURABILITY.stone_pickaxe}`);
  }

  /** One swing of construction work on a site. */
  private work(site: WildSite): void {
    const at = this.at();
    if (!at) return;
    const s = this.o.session;
    const r = s.dispatch({ schema: 3, id: s.commandId('build_work' as never, site.id), expectedRevision: s.world.revision, type: 'build_work', siteId: site.id, at });
    const d = buildingDef(site.kind)!;
    if (!r.ok) { this.refused(r, ''); this.toast(`can't build: ${r.reasons.join('; ')}`, 'warn'); this.held = r.code === 'too_fast' && this.held; return; }
    this.version++;
    this.o.onChanged();
    this.stats.works++;
    const c = siteSpotOf(site);
    this.o.explore()?.swing(c.x, c.z);
    const o = r.outcome;
    if (o.type !== 'build_work') return;
    if (o.events.includes('BUILDING_COMPLETED')) {
      this.held = false;
      this.toast(`${d.label} finished! ${d.function.summary}`, 'good');
    } else {
      const left = stageNeeds(site);
      this.toast(`${d.label}: ${d.stages[Math.min(site.stage, d.stages.length - 1)].label}${Object.keys(left).length ? ` · deliver ${Object.entries(left).map(([k, n]) => `${n} ${ITEM_LABEL[k as WildItem] ?? k}`).join(', ')}` : ''}`);
      if (Object.keys(left).length) this.held = false;
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
    } else this.toast(`cutting… · axe ${o.durability}/${TOOL_DURABILITY.stone_axe}`);
  }

  private pickup(p: LivePickup): void {
    const w = this.world.wild!;
    const before = w.items[p.item] ?? 0;
    const at = this.at();
    // A pile whose units are all reserved is picked up for its site (they stay reserved for it, in the bag).
    const forSite = p.kind === 'pile' && w.build && freeIn(this.world, p.id, p.item) <= 0 ? reservationsInSource(this.world, p.id)[0]?.siteId : undefined;
    if (!at || !this.send({ type: 'pickup', entityId: p.id, at, ...(forSite ? { forSite } : {}) }, p.id)) return;
    const got = (w.items[p.item] ?? 0) - before;
    if (forSite) { this.toast(`picked up ${got} ${ITEM_LABEL[p.item]} for your ${buildingDef(w.build!.sites.get(forSite)!.kind)!.label.toLowerCase()} (still reserved for it) · bag ${carriedWeight(w)}/${carryCapacity(w)} · carry it to the site and deliver (E)`); return; }
    const room = Math.floor((carryCapacity(w) - carriedWeight(w)) / ITEM_WEIGHT.log);
    this.toast(`picked up ${got} ${ITEM_LABEL[p.item]}${got > 1 && p.item === 'log' ? 's' : ''} · bag ${carriedWeight(w)}/${carryCapacity(w)}`
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
    const at = r && r.station !== 'hand' ? this.at() : null;
    if (r && r.station !== 'hand' && !at) { this.toast('walk up to a workbench to make that', 'warn'); return; }
    if (!r || !this.send({ type: 'craft', recipe, ...(at ? { at } : {}) }, recipe)) return;
    if (r.output.tool === 'stone_axe' && this.firstAxeMs === null) this.firstAxeMs = Math.round(performance.now() - this.startedAt);
    this.toast(r.output.tool ? `You made a ${ITEM_LABEL[r.output.tool]}! Equip it from the bag.` : `made ${r.label.toLowerCase()}`);
  }

  equip(item: string): void {
    if (this.send({ type: 'equip', item }, item)) this.toast(item === 'hands' ? 'bare hands' : item === 'stone_axe' ? 'stone axe in hand: walk up to a tree and swing (E / Chop)' : `${ITEM_LABEL[item as WildItem] ?? item} in hand`);
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
    else if (d.equip) this.equip(d.equip);
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
    // W6: deposits in view (inspected: type and what is left, once discovered).
    if (this.world.wild.mine) for (const d of typedDepositsNear(this.world, ch.x, ch.z, SELECT_KEEP)) consider(d.id, d.x, (this.o.groundY(d.x, d.z) ?? d.y) + 0.5, d.z);
    const hit = best as { id: string; d: number } | null;
    if (!hit) return false;
    this.selected = hit.id;
    if (this.isDeposit(hit.id)) {
      this.toast(this.inspectText(hit.id));
      return true;
    }
    this.toast(hit.id.startsWith('t:') ? 'trunk targeted: walk up to it and swing (E / Cut log)' : 'tree targeted: walk up to it and swing (E / Chop)');
    return true;
  }

  private isDeposit(id: string): boolean { return !!this.world.wild?.mine && typedDepositsNear(this.world, this.o.explore()?.character?.x ?? 0, this.o.explore()?.character?.z ?? 0, SELECT_KEEP + 2).some((d) => d.id === id); }
  /** W6: what a deposit is, honestly: its type and what is left only once it is discovered. */
  inspectText(id: string): string {
    const d = typedDepositsNear(this.world, this.o.explore()?.character?.x ?? 0, this.o.explore()?.character?.z ?? 0, SELECT_KEEP + 2).find((x) => x.id === id);
    if (!d) return 'nothing there';
    if (!isDiscovered(this.world, d.id)) return 'a deposit: walk closer to see what it is (it goes on your map)';
    const left = depositLeft(this.world, d);
    const item = DEPOSIT_ITEM[d.type];
    return `${DEPOSIT_LABEL[d.type]} deposit · ${left ? `${left}/${d.qty} units left` : 'worked out (it does not regrow)'} · ${MINE_SWINGS[d.type]} pickaxe swings a unit · ${ITEM_LABEL[item]} weighs ${ITEM_WEIGHT[item]}`;
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
    // W4: at an unfinished site, deliver what it needs from the bag, then work on it.
    if (w.build) {
      const site = buildingsNear(this.world, ch.x, ch.z, SITE_REACH - 0.3).find(({ s }) => s.state !== 'done')?.s;
      if (site) {
        const need: Record<string, number> = {};
        for (const d of deliverable(this.world, site, this.at())) need[d.item] = (need[d.item] ?? 0) + d.n;
        if (Object.keys(need).length) return { kind: 'site_deliver', s: site, need };
        if (!Object.keys(stageNeeds(site)).length) return { kind: 'site_work', s: site };
      }
    }
    const room = carryCapacity(w) - carriedWeight(w);
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
    // W6: a targeted deposit in reach, or the nearest one with the pickaxe in hand.
    const dep = w.mine ? typedDepositsNear(this.world, ch.x, ch.z, MINE_PROMPT + 1.5).map((d) => ({ d, r: Math.hypot(d.x - ch.x, d.z - ch.z) }))
      .filter((x) => x.r <= MINE_PROMPT && depositLeft(this.world, x.d) > 0).sort((a, b) => a.r - b.r || a.d.id.localeCompare(b.d.id)) : [];
    const picked = dep.find((x) => x.d.id === this.selected);
    if (picked) return { kind: 'mine', d: picked.d };
    const pick = equippedTool(this.world)?.kind === 'stone_pickaxe';
    if (dep[0] && pick) return { kind: 'mine', d: dep[0].d };
    if (fits) return { kind: 'pickup', p: fits };
    if (dep[0]) return { kind: 'mine', d: dep[0].d };
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

  /** A recorded landing a living character still has to be put at (a reload during a pending death). */
  private wake: { x: number; z: number } | null = null;

  /** Frames since the HUD's height was last published (layout). */
  private hudFrames = 0;
  private hudBottom = -1;
  /**
   * Layout: publish where the HUD text ends (--hud-bottom, CSS px) so the
   * phone sheets and the event feed start below it instead of covering it.
   * The HUD's height changes with its text, so it is read a few times a second.
   */
  private publishHudBottom(): void {
    if (this.hudFrames++ % 12 !== 0 || typeof document === 'undefined' || typeof getComputedStyle !== 'function') return;
    const hud = document.getElementById('hud');
    const r = hud && getComputedStyle(hud).display !== 'none' ? hud.getBoundingClientRect() : null;
    const bottom = r && r.height > 0 && r.top < window.innerHeight / 2 ? Math.ceil(r.bottom) : 0;
    if (bottom !== this.hudBottom) { this.hudBottom = bottom; document.documentElement.style.setProperty('--hud-bottom', `${bottom}px`); }
  }

  update(): void {
    this.publishHudBottom();
    const w = this.world.wild;
    const ex = this.o.explore();
    const ch = ex?.active ? ex.character : null;
    if (!w) return;
    this.map.update();
    // A death recorded before a reload: the character is alive again on this page, so the respawn is journaled now.
    if (w.build?.death && ch && !ch.dead) this.wake = this.respawn();
    if (this.wake && ex?.wakeAt(this.wake)) this.wake = null;
    this.action = this.decide();
    this.target = this.action.kind === 'pickup' ? this.action.p : null;
    if (this.held && (this.action.kind === 'chop' || this.action.kind === 'cut' || this.action.kind === 'site_work' || this.action.kind === 'mine')) this.act(true);
    // The drawn set follows the player (or the camera target in the overview) and every accepted command.
    const fx = ch ? ch.x : this.drawn.x, fz = ch ? ch.z : this.drawn.z;
    if (Number.isFinite(fx) && (this.version !== this.drawn.version || Math.hypot(fx - this.drawn.x, fz - this.drawn.z) > 6)) {
      this.view.sync(pickupsNear(this.world, fx, fz, DRAW_RADIUS), this.o.groundY);
      this.drawn = { x: fx, z: fz, version: this.version };
    }
    this.felling.update(this.world, ch ? { x: ch.x, z: ch.z } : Number.isFinite(fx) ? { x: fx, z: fz } : null, this.o.groundY, this.o.nature?.() ?? null);
    this.deposits.sync(this.world, Number.isFinite(fx) ? { x: fx, z: fz } : null, this.o.groundY, this.o.nature?.() ?? null);
    // The axe in the hand.
    const hand = ex?.rightHand ?? null;
    if (hand && this.axeParent !== hand) { hand.add(this.axe, this.pickaxe); this.axeParent = hand; }
    this.axe.visible = equippedTool(this.world)?.kind === 'stone_axe';
    this.pickaxe.visible = equippedTool(this.world)?.kind === 'stone_pickaxe';
    this.build.update(performance.now() / 1000);
    this.renderPanel();
    this.renderFeed();
  }

  /** The reach ring target for ExploreController. */
  reachTarget = (): { x: number; y: number; z: number } | null => {
    const a = this.action;
    if (a.kind === 'pickup') return { x: a.p.x, y: this.o.groundY(a.p.x, a.p.z) ?? a.p.y, z: a.p.z };
    if (a.kind === 'chop') return { x: a.tree.e.x, y: this.o.groundY(a.tree.e.x, a.tree.e.z) ?? a.tree.e.y, z: a.tree.e.z };
    if (a.kind === 'mine') return { x: a.d.x, y: this.o.groundY(a.d.x, a.d.z) ?? a.d.y, z: a.d.z };
    if (a.kind === 'cut') {
      const ch = this.o.explore()?.character;
      const c = ch ? trunkDistance(a.trunk, ch.x, ch.z) : { px: a.trunk.x, pz: a.trunk.z };
      return { x: c.px, y: this.o.groundY(c.px, c.pz) ?? a.trunk.y, z: c.pz };
    }
    if (a.kind === 'deliver') { const s = this.world.wild?.fell?.stockpiles.get(a.stockpileId); return s ? { x: s.x, y: this.o.groundY(s.x, s.z) ?? s.y, z: s.z } : null; }
    if (a.kind === 'site_deliver' || a.kind === 'site_work') { const p = siteSpotOf(a.s); return { x: p.x, y: this.o.groundY(p.x, p.z) ?? a.s.y, z: p.z }; }
    return null;
  };

  /** Touch button label. */
  buttonLabel(): string {
    switch (this.action.kind) {
      case 'chop': return 'Chop';
      case 'cut': return 'Cut log';
      case 'deliver': case 'site_deliver': return 'Deliver';
      case 'site_work': return 'Build';
      case 'mine': return 'Mine';
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
        // A pile holding reservations says for which site; a fully reserved one is picked up for it (and stays reserved).
        const held = t.kind === 'pile' && this.world.wild?.build ? reservationsInSource(this.world, t.id) : [];
        if (held.length) {
          const site = buildingDef(held[0].kind)!.label.toLowerCase();
          const free = freeIn(this.world, t.id, t.item), res = t.qty - free;
          return free > 0 ? `${coarse ? 'Pick up' : 'E: pick up'} ${free} free ${ITEM_LABEL[t.item]} (${res} more reserved for your ${site})`
            : `${coarse ? 'Pick up' : 'E: pick up'} ${res} ${ITEM_LABEL[t.item]} reserved for your ${site} · carried for that site`;
        }
        return `${coarse ? 'Pick up' : 'E: pick up'} ${what}${t.qty > 1 ? ` ×${t.qty}` : ''}`;
      }
      case 'chop': {
        const dmg = this.world.wild?.fell?.chop.get(a.tree.e.id);
        const tool = equippedTool(this.world);
        return `${k}chop ${a.tree.sp} (${a.tree.stage})${dmg ? ` ${dmg.hp}/${dmg.max}` : ''}${tool ? '' : ' · needs an axe in hand'}${coarse ? '' : ' · hold to keep swinging'}`;
      }
      case 'cut': return `${k}cut log · ${a.trunk.left} left in the ${a.trunk.sp} trunk`;
      case 'mine': {
        const d = a.d, tool = equippedTool(this.world);
        if (!isDiscovered(this.world, d.id)) return `${k}mine the deposit here${coarse ? '' : ' (it goes on your map first)'}`;
        const work = depositWork(this.world, d);
        return `${k}mine ${DEPOSIT_LABEL[d.type]} · ${work}/${MINE_SWINGS[d.type]} swings · ${depositLeft(this.world, d)}/${d.qty} left${tool?.kind === 'stone_pickaxe' ? ` · pickaxe ${tool.durability}/${TOOL_DURABILITY.stone_pickaxe}` : ' · needs a pickaxe in hand'}${coarse ? '' : ' · hold to keep swinging'}`;
      }
      case 'deliver': return `${k}deliver ${a.n} log${a.n === 1 ? '' : 's'} to the stockpile`;
      case 'site_deliver': return `${k}deliver ${Object.entries(a.need).map(([m, n]) => `${n} ${ITEM_LABEL[m as WildItem] ?? m}`).join(', ')} to the ${buildingDef(a.s.kind)!.label.toLowerCase()}`;
      case 'site_work': { const d = buildingDef(a.s.kind)!; return `${k}build ${d.label.toLowerCase()} · ${d.stages[Math.min(a.s.stage, d.stages.length - 1)].label}${coarse ? '' : ' · hold to keep working'}`; }
      default: return a.hint;
    }
  }

  /** Short HUD summary of the bag. */
  summary(): string {
    const w = this.world.wild;
    if (!w) return 'bag: empty · bare hands';
    const items = Object.entries(w.items).filter(([, n]) => n > 0).map(([k, n]) => `${ITEM_LABEL[k as WildItem]} ${n}`);
    const tool = equippedTool(this.world);
    return `bag ${carriedWeight(w)}/${carryCapacity(w)}: ${items.length || w.tools.length ? [...items, ...w.tools.map((t) => ITEM_LABEL[t.kind])].join(', ') : 'empty'}`
      + ` · ${tool ? `${ITEM_LABEL[tool.kind]} ${tool.durability}/${TOOL_DURABILITY[tool.kind]} in hand` : 'bare hands'} · hunger ${w.hunger}`;
  }

  private renderFeed(): void {
    const ev = this.world.wild?.fell?.events ?? [];
    const last = ev.slice(-4);
    const key = last.map((e) => e.seq).join(',');
    if (key === this.feedKey) return;
    this.feedKey = key;
    this.feed.innerHTML = last.map((e) => `<div>${EVENT_LABEL[e.type]}${e.type === 'DEPOSIT_MINED' ? ` · ${e.n} left` : e.n !== undefined && e.type !== 'TREE_DAMAGED' && e.type !== 'TRUNK_CREATED' && e.type !== 'SMELT_STARTED' ? ` ×${e.n}` : ''}</div>`).join('');
    this.feed.classList.toggle('on', last.length > 0);
  }

  private renderPanel(): void {
    if (this.panel.hidden) return;
    const w = this.world.wild;
    if (!w) return;
    const at = this.at();
    const bench = !!at && !!w.build && stationNear(this.world, 'workbench', at);
    const reserved = w.build ? reservedTotalsIn(this.world, 'bag') : {};
    const key = JSON.stringify([w.content, w.items, w.tools, w.equipped, w.hunger, w.fell?.stockpiles.size, bench, reserved]);
    if (key === this.panelKey) return;
    this.panelKey = key;
    const have = (k: string) => w.items[k] ?? 0;
    const items = Object.entries(w.items).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b));
    const wt = (k: string) => ITEM_WEIGHT[k as WildItem] ?? 0;
    const rows = items.length ? items.map(([k, n]) => `<li><span>${ITEM_LABEL[k as WildItem]} <b>×${n}</b> <span class="dim" data-weight="${k}">${wt(k)} each · ${wt(k) * n}</span>${reserved[k] ? ` <span class="dim" data-bag-reserved="${k}">(${reserved[k]} reserved for a site)</span>` : ''}</span>`
      + (FOOD_VALUE[k as WildItem] ? `<button type="button" data-eat="${k}">Eat</button>` : '')
      + `<button type="button" data-drop="${k}" aria-label="Drop one ${ITEM_LABEL[k as WildItem]}">Drop 1</button></li>`).join('')
      : '<li class="dim">nothing yet: pick up branches, stones and plants (E or Pick up)</li>';
    const tools = w.tools.length ? w.tools.map((t) => `<li><span>${ITEM_LABEL[t.kind]} <span class="dim">${t.durability ? `${t.durability}/${TOOL_DURABILITY[t.kind]}` : 'broken'} · weight ${wt(t.kind)}</span>${w.equipped === t.id ? ' <b class="eq">in hand</b>' : ''}</span>`
      + (w.equipped === t.id ? '<button type="button" data-equip="hands">Put away</button>' : `<button type="button" data-equip="${t.kind}">Equip</button>`) + '</li>').join('')
      : '<li class="dim">no tools yet</li>';
    const recipes = WILD_RECIPES.filter((r) => r.station === 'hand' || bench).map((r) => {
      const need = Object.entries(r.input).map(([k, n]) => `<span class="${have(k) >= (n ?? 0) ? 'ok' : 'miss'}">${ITEM_LABEL[k as WildItem]} ${Math.min(have(k), n ?? 0)}/${n}</span>`).join(' · ');
      const toolOk = !r.tool || w.tools.some((t) => t.kind === r.tool && t.durability > 0);
      const ok = toolOk && Object.entries(r.input).every(([k, n]) => have(k) >= (n ?? 0));
      return `<li class="recipe" data-recipe="${r.id}"><div><b>${r.label}</b>${r.station !== 'hand' ? ' <span class="dim">(workbench)</span>' : ''}<br><small>${need}${r.tool ? ` · <span class="${toolOk ? 'ok' : 'miss'}">${ITEM_LABEL[r.tool]}</span>` : ''}</small>${r.note ? `<br><small class="dim" data-note>${r.note}</small>` : ''}</div><button type="button" data-craft="${r.id}" ${ok ? '' : 'disabled aria-disabled="true"'}>Craft</button></li>`;
    }).join('');
    const piles = w.fell ? `<h3>Logs</h3><ul><li><span class="dim">${w.fell.stockpiles.size ? `${w.fell.stockpiles.size} stockpile${w.fell.stockpiles.size === 1 ? '' : 's'} marked · drop logs at one to deliver` : 'no stockpile yet'}</span>`
      + `<button type="button" data-stockpile>Mark stockpile here</button></li></ul>` : '';
    const used = carriedWeight(w), cap = carryCapacity(w);
    this.panel.innerHTML = `<header><h2>Bag</h2><span class="dim" data-capacity>weight ${used}/${cap} · hunger ${w.hunger}/100</span><button type="button" data-close aria-label="Close bag">×</button></header>`
      + `<div class="bar" role="progressbar" aria-label="Bag weight" aria-valuemin="0" aria-valuemax="${cap}" aria-valuenow="${used}"><i style="width:${Math.min(100, Math.round(used / cap * 100))}%"></i></div>`
      + `<p class="dim" data-capacity-help>Carries ${cap} weight, ${cap - used} free · log ${ITEM_WEIGHT.log}, plank ${ITEM_WEIGHT.plank}, branch ${ITEM_WEIGHT.branch}, stone ${ITEM_WEIGHT.stone}, fibre ${ITEM_WEIGHT.fiber}, axe ${ITEM_WEIGHT.stone_axe}${w.mine ? `, ore ${ITEM_WEIGHT.iron_ore}, clay ${ITEM_WEIGHT.clay}, coal/sand/gravel ${ITEM_WEIGHT.coal}, ingot ${ITEM_WEIGHT.iron_ingot}` : ''}${cap > CARRY_CAPACITY ? '' : ' (this world has the old bag: it gains the bigger one when loaded)'}</p>`
      + `<h3>Items</h3><ul>${rows}</ul><h3>Tools</h3><ul>${tools}</ul>${piles}<h3>${bench ? 'Craft (by hand and at the workbench)' : 'Craft by hand'}</h3><ul>${recipes}</ul>${bench ? '' : '<p class="dim">Stand by a workbench for planks, pickaxe, hammer, knife and chest.</p>'}`;
  }

  /** Evidence (read-only, ?metrics=1): pickups, trees and trunks within r m of the player. */
  scan(r = 30): Record<string, unknown> | null {
    const ch = this.o.explore()?.character;
    if (!ch || !this.world.wild) return null;
    const round = (v: number) => Math.round(v * 100) / 100;
    return {
      x: round(ch.x), z: round(ch.z),
      pickups: pickupsNear(this.world, ch.x, ch.z, r).slice(0, 80).map((p) => ({ id: p.id, kind: p.kind, item: p.item, qty: p.qty, x: round(p.x), z: round(p.z) })),
      trees: treesNear(this.world, ch.x, ch.z, r).slice(0, 40).map((t) => ({ id: t.e.id, sp: t.sp, stage: t.stage, x: round(t.e.x), z: round(t.e.z) })),
      trunks: trunksNear(this.world, ch.x, ch.z, r).map(({ t }) => ({ id: t.id, x: round(t.x), z: round(t.z), left: t.left })),
    };
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
        : a.kind === 'mine' ? { kind: 'mine', id: a.d.id, type: a.d.type, left: depositLeft(this.world, a.d), qty: a.d.qty, work: depositWork(this.world, a.d) }
        : a.kind === 'cut' ? { kind: 'cut', id: a.trunk.id, left: a.trunk.left } : a.kind === 'pickup' ? { kind: 'pickup', id: a.p.id, item: a.p.item }
          : a.kind === 'deliver' ? { kind: 'deliver', id: a.stockpileId, n: a.n }
            : a.kind === 'site_deliver' ? { kind: 'site_deliver', id: a.s.id, need: a.need } : a.kind === 'site_work' ? { kind: 'site_work', id: a.s.id } : { kind: 'none', hint: a.hint },
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
      build: this.build.metrics(),
      map: this.map.metrics(),
      mining: w?.mine ? { worked: [...w.mine.deposits.values()].map((r) => ({ ...r })), drawn: { ...this.deposits.drawn },
        near: this.o.explore()?.character ? typedDepositsNear(this.world, this.o.explore()!.character!.x, this.o.explore()!.character!.z, 40).map((d) => ({ id: d.id, type: d.type, x: d.x, z: d.z, qty: d.qty, left: depositLeft(this.world, d), discovered: isDiscovered(this.world, d.id) })) : [] } : null,
    };
  }
}
