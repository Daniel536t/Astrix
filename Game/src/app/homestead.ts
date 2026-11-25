// M006 homestead controller. Every write is a journaled GameSession command;
// the view, panel, planner preview and steward suggestions only read state.
//
// The steward is the in-game AI agent. It runs here, in the owner's browser,
// as a deterministic rule-based planner over the authoritative state. It can
// only issue commands tagged `actor: 'steward'`, and the simulation enforces
// its permissions (auto / ask first / never) per action. Anything set to
// "ask first" becomes a proposal that only the owner can approve.
import * as THREE from 'three';
import { GameSession, Command } from './session';
import { BrowserSaveStore } from './persistence';
import {
  CROPS, CROP_RULES, CropKind, DM, FIELD_MAX, FIELD_MIN, HomesteadAction, MOISTURE_MAX, Policy, Role, SPECIES, SPECIES_RULES,
  checkField, cropStage, fenceCost, fieldUnits, homesteadLayout, nearbyActions, recentHomesteadEvents, unitsOf, findFieldSpot,
  dayTime, OVERFLOW_CAPACITY, homesteadGates, isNavHomestead, isLivingHomestead, nearbyGate, straysOf,
  HOMESTEAD_WORK_VERSION, isWorkHomestead, ROLES, SITE_RULES, findSiteSpot, reservations, siteProgress, siteStatus, woodlot, MIN_STANDING_TREES,
  treeEntityId, HOMESTEAD_WOODLAND_VERSION,
} from '../sim/homestead';
import {
  isWoodlandHomestead, managedWoodland, woodcutterStatus, woodlandStats, plantable, seedParent, insideWindow,
} from '../sim/forestry';
import { CYCLE, HARVEST_MODES, LifeStage, POLICY_LIMITS, QUOTA_TREE, WOOD_DAY, WoodPolicy, stageLabel, treeLife } from '../sim/woodland';
import { growthStage } from '../sim/vegetation';
import type { EnclosureId } from '../sim/homestead';
import type { GateState } from '../sim/nav';
import { expandPath, navCell, navStats, gateLabel } from '../sim/nav';
import { FOUNDER_STOCKPILE_ID } from '../sim/economy';
import { HomesteadView } from '../render/homestead';
import { residentSurfaceAt, surfaceAt } from '../sim/world';
import { TICK_SECONDS } from './sim-clock';

export interface HomesteadGameOptions {
  session: GameSession;
  store: BrowserSaveStore;
  scene: THREE.Scene;
  toast: (message: string, kind: 'good' | 'warn' | 'bad') => void;
  onSaved?: () => void;
  /** Where the player stands and faces (for the field planner and Use). */
  player: () => { x: number; z: number; heading: number } | null;
}

type Receipt = ReturnType<GameSession['dispatch']>;

export class HomesteadGame {
  readonly view: HomesteadView;
  private readonly panel: HTMLElement;
  private readonly planBar: HTMLElement;
  private readonly preview: THREE.Group;
  private planning: { crop: CropKind; w: number; d: number } | null = null;
  private planSpec: { x: number; z: number; w: number; d: number; crop: CropKind } | null = null;
  private planReasons: string[] = [];
  private planCheckedKey = '';
  private planCheckedAt = 0;
  private panelRevision = -1;
  private stewardTick = -1;
  private lastAssignTick = -1000;
  private eventsSeen = 0;
  private lastEvents: string[] | undefined;

  constructor(private readonly o: HomesteadGameOptions) {
    this.view = new HomesteadView(o.session.world, TICK_SECONDS);
    o.scene.add(this.view.group);
    this.preview = new THREE.Group();
    this.preview.name = 'field_plan_preview';
    this.preview.visible = false;
    o.scene.add(this.preview);
    this.panel = document.createElement('section');
    this.panel.id = 'homestead-panel';
    this.panel.setAttribute('aria-label', 'Homestead');
    this.panel.hidden = true;
    document.body.appendChild(this.panel);
    this.panel.addEventListener('click', (e) => this.onPanelClick(e));
    this.panel.addEventListener('change', (e) => this.onPanelChange(e));
    this.planBar = document.createElement('div');
    this.planBar.id = 'field-planner';
    this.planBar.hidden = true;
    this.planBar.setAttribute('role', 'group');
    this.planBar.setAttribute('aria-label', 'Plan a field');
    document.body.appendChild(this.planBar);
    this.planBar.addEventListener('click', (e) => this.onPlanClick(e));
    const toggle = document.createElement('button');
    toggle.id = 'farm-button';
    toggle.type = 'button';
    toggle.textContent = 'Farm';
    toggle.setAttribute('aria-label', 'Open the homestead: fields, villagers, animals and steward');
    toggle.addEventListener('click', () => this.togglePanel());
    document.body.appendChild(toggle);
    this.ensureFounded();
  }

  get world() { return this.o.session.world; }
  get available(): boolean { return this.o.session.journal.schema === 3 && !!this.world.life; }

  private send(command: Record<string, unknown>, target = ''): Receipt {
    const s = this.o.session;
    const full = { schema: 3, id: s.commandId(command.type as Command['type'], target), expectedRevision: s.world.revision, ...command };
    const r = s.dispatch(full);
    if (r.ok && !r.duplicate) { this.o.store.save(s); this.o.onSaved?.(); }
    return r;
  }

  /**
   * Schema-3 worlds without a homestead get one under settlement rules v2 (a
   * journaled command). A legacy homestead loads with its exact saved hash and
   * is then switched by a journaled `upgrade_homestead` command, so villagers
   * navigate in old worlds too.
   */
  private ensureFounded(): void {
    if (!this.available) return;
    if (!this.world.homestead) {
      const r = this.send({ type: 'found_homestead', rules: HOMESTEAD_WOODLAND_VERSION });
      if (r.ok) this.o.toast('Settlers arrived: Ada the farmer, Bram the herder and Cora, with animals and supplies. Open Farm to plan a field, give Cora work or plan a woodshed.', 'good');
      return;
    }
    if (this.world.homestead.version < HOMESTEAD_WOODLAND_VERSION) {
      // M012/M013: one journaled upgrade to settlement rules v5 (from v1-v4); the saved hash loads first, unchanged.
      const was = this.world.homestead.version;
      const r = this.send({ type: 'upgrade_homestead', rules: HOMESTEAD_WOODLAND_VERSION });
      const cora = was < 4 ? ' Cora has joined the homestead: make her a woodcutter or a builder in Farm.' : '';
      const wood = ' The woodland is alive now: trees grow, age and regrow; set how it is harvested in Farm.';
      if (r.ok) this.o.toast((was < 2 ? 'The homestead now has gates and doors: villagers and animals walk real routes around fences, buildings and trees.'
        : was < 3 ? 'The homestead is livelier: animals use open gates, villagers make way for each other, and you can open gates with Use.'
          : was < 4 ? 'Villagers can now fell trees and build.' : '') + cora + wood, 'good');
    }
  }

  // ---------- actions near the player ----------

  /** The best action within reach, for the Use button label and the E key (M012: a gate or door within reach counts too). */
  nearest(): { action: HomesteadAction | 'gate'; target: string; label: string; next?: GateState } | null {
    const p = this.o.player();
    if (!p || !this.world.homestead) return null;
    const work = nearbyActions(this.world, p.x, p.z)[0] ?? null;
    const gate = nearbyGate(this.world, p.x, p.z);
    if (gate && (!work || gate.d <= work.d)) return { action: 'gate', target: gate.gateId, label: gate.label, next: gate.next };
    return work;
  }

  /** Perform the nearest homestead action. Returns false when there is none (fall back to gathering). */
  useNearest(): boolean {
    const a = this.nearest();
    if (!a) return false;
    if (a.action === 'gate') {
      // The same journaled command as the Farm panel's gate buttons.
      const r = this.send({ type: 'set_gate', gateId: a.target, state: a.next }, a.target);
      if (r.ok) this.o.toast(`${a.label.replace(/^Unlock and open/, 'Unlocked and opened').replace(/^Open/, 'Opened').replace(/^Close/, 'Closed')}`, 'good');
      else this.o.toast(r.reasons.join('; '), 'bad');
      return true;
    }
    const r = this.send({ type: 'homestead_act', action: a.action, target: a.target }, a.target);
    if (r.ok && r.outcome.type === 'homestead_act') {
      const gained = Object.entries(r.outcome.gained).map(([k, n]) => `+${n} ${k}`).join(' ');
      const spent = Object.entries(r.outcome.spent).map(([k, n]) => `−${n} ${k}`).join(' ');
      this.o.toast(`${a.label}${gained || spent ? ` (${[gained, spent].filter(Boolean).join(', ')})` : ''}`, 'good');
    } else if (!r.ok) {
      this.o.toast(r.reasons.join('; '), 'bad');
    }
    return true;
  }

  // ---------- field planner ----------

  startPlanning(crop: CropKind = 'wheat'): void {
    this.planning = { crop, w: 4, d: 4 };
    this.panel.hidden = true;
    this.planBar.hidden = false;
    this.preview.visible = true;
    this.planCheckedKey = '';
    document.body.classList.add('planning-field');
    this.renderPlanBar();
  }

  stopPlanning(): void {
    this.planning = null;
    this.planBar.hidden = true;
    this.preview.visible = false;
    document.body.classList.remove('planning-field');
  }

  private onPlanClick(e: Event): void {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || !this.planning) return;
    const act = b.dataset.plan;
    const p = this.planning;
    if (act === 'crop') p.crop = b.dataset.crop as CropKind;
    if (act === 'w-') p.w = Math.max(FIELD_MIN, p.w - 1);
    if (act === 'w+') p.w = Math.min(FIELD_MAX, p.w + 1);
    if (act === 'd-') p.d = Math.max(FIELD_MIN, p.d - 1);
    if (act === 'd+') p.d = Math.min(FIELD_MAX, p.d + 1);
    if (act === 'turn') [p.w, p.d] = [p.d, p.w];
    if (act === 'cancel') { this.stopPlanning(); return; }
    if (act === 'place' && this.planSpec) {
      const spec = this.planSpec;
      const r = this.send({ type: 'mark_field', ...spec }, `${spec.x},${spec.z}`);
      if (r.ok && r.outcome.type === 'mark_field') {
        this.o.toast(`Marked a ${spec.w} × ${spec.d} m ${CROP_RULES[spec.crop].label.toLowerCase()} field (${r.outcome.units} × 9 m², ${r.outcome.wood} wood for the fence). Ada will dig and sow it.`, 'good');
        this.stopPlanning();
      } else if (!r.ok) {
        this.o.toast(r.reasons.join('; '), 'bad');
      }
      return;
    }
    this.planCheckedKey = '';
    this.renderPlanBar();
  }

  private renderPlanBar(): void {
    const p = this.planning;
    if (!p) return;
    const wood = fenceCost(p.w, p.d), units = fieldUnits(p.w, p.d);
    const rule = CROP_RULES[p.crop];
    const ok = this.planReasons.length === 0 && !!this.planSpec;
    this.planBar.innerHTML = `
      <div class="plan-row crops">${CROPS.map((c) => `<button type="button" data-plan="crop" data-crop="${c}" class="${c === p.crop ? 'on' : ''}" aria-pressed="${c === p.crop}">${CROP_RULES[c].label}</button>`).join('')}</div>
      <div class="plan-row size">
        <span>Width</span><button type="button" data-plan="w-" aria-label="Narrower">−</button><b>${p.w} m</b><button type="button" data-plan="w+" aria-label="Wider">+</button>
        <span>Depth</span><button type="button" data-plan="d-" aria-label="Shallower">−</button><b>${p.d} m</b><button type="button" data-plan="d+" aria-label="Deeper">+</button>
        <button type="button" data-plan="turn" aria-label="Turn the field">Turn</button>
      </div>
      <div class="plan-info">${p.w * p.d} m² · needs ${units} seed per sowing · fence ${wood} wood (you have ${this.world.inventory.wood ?? 0}) · ${rule.label.toLowerCase()}: ${rule.purpose}</div>
      <div class="plan-reasons ${ok ? 'ok' : 'bad'}" aria-live="polite">${ok ? 'Good spot. Walk to move the field; it sits in front of you.' : this.planReasons.map((r) => `• ${r}`).join('<br>') || 'Walk to choose where the field goes.'}</div>
      <div class="plan-row actions"><button type="button" data-plan="place" class="primary" ${ok ? '' : 'disabled'}>Mark field</button><button type="button" data-plan="cancel">Cancel</button></div>`;
  }

  private updatePlanner(): void {
    const p = this.planning, me = this.o.player();
    if (!p || !me) return;
    // The field sits in front of the player, snapped to whole metres.
    const fx = Math.sin(me.heading), fz = Math.cos(me.heading);
    const cx = me.x + fx * (Math.max(p.w, p.d) / 2 + 1.5), cz = me.z + fz * (Math.max(p.w, p.d) / 2 + 1.5);
    const spec = { x: Math.round(cx - p.w / 2), z: Math.round(cz - p.d / 2), w: p.w, d: p.d, crop: p.crop };
    const key = JSON.stringify(spec);
    const now = performance.now();
    if (key !== this.planCheckedKey && now - this.planCheckedAt > 220) {
      this.planCheckedKey = key; this.planCheckedAt = now;
      this.planSpec = spec;
      this.planReasons = checkField(this.world, spec);
      this.renderPlanBar();
      this.drawPreview(spec, this.planReasons.length === 0);
    }
  }

  private drawPreview(spec: { x: number; z: number; w: number; d: number }, ok: boolean): void {
    for (const c of this.preview.children) (c as THREE.Mesh).geometry.dispose();
    this.preview.clear();
    const mat = new THREE.MeshBasicMaterial({ color: ok ? 0x7fe08a : 0xf06a5e, transparent: true, opacity: 0.38, depthWrite: false });
    const geos: THREE.BufferGeometry[] = [];
    for (let z = 0; z < spec.d; z++) {
      for (let x = 0; x < spec.w; x++) {
        const wx = spec.x + x, wz = spec.z + z;
        const y = residentSurfaceAt(this.world, wx, wz) ?? surfaceAt(this.world, wx, wz);
        const g = new THREE.BoxGeometry(0.94, 0.12, 0.94);
        g.translate(wx + 0.5, y + 0.07, wz + 0.5);
        geos.push(g);
      }
    }
    for (const g of geos) { const m = new THREE.Mesh(g, mat); m.renderOrder = 4; this.preview.add(m); }
  }

  // ---------- steward (AI agent) ----------

  /** Deterministic rules over authoritative state; every decision is a journaled, permission-checked command. */
  private runSteward(): void {
    const h = this.world.homestead, life = this.world.life;
    if (!h || !life || !h.steward.enabled) return;
    const tick = life.tick;
    if (tick === this.stewardTick || tick % 15 !== 0) return;
    this.stewardTick = tick;
    const s = life.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory;
    // Work waiting for each role.
    const farm = h.plots.filter((p) => p.state === 'ripe' || p.state === 'wild' || (p.state === 'growing' && p.moisture <= 4)).length;
    const herd = h.enclosures.filter((e) => e.water <= 10 || e.feed <= 4).length
      + h.animals.filter((a) => { const p = SPECIES_RULES[a.species].product; return p && p.resource !== 'eggs' && a.product >= p.every; }).length;
    const farmers = h.villagers.filter((v) => v.role === 'farmer'), herders = h.villagers.filter((v) => v.role === 'herder');
    if (tick - this.lastAssignTick >= 300 && h.steward.policy.assign_role !== 'off') {
      let move: { v: string; role: Role; why: string } | null = null;
      // v4: an approved site with nobody to build it, or short of wood with nobody felling, takes a spare farmer (never the last one).
      const approved = (h.sites ?? []).filter((st) => st.state === 'approved');
      const spare = farmers.length > 1 || (farmers.length === 1 && h.plots.length === 0) ? farmers[farmers.length - 1] : null;
      if (spare && approved.length && !h.villagers.some((v) => v.role === 'builder')) move = { v: spare.id, role: 'builder', why: `the ${SITE_RULES[approved[0].kind].label.toLowerCase()} is approved and nobody is building it` };
      else if (spare && approved.some((st) => (SITE_RULES[st.kind].cost.wood ?? 0) > (st.delivered.wood ?? 0) + (st.reserved.wood ?? 0)) && !h.villagers.some((v) => v.role === 'woodcutter')
        && woodlot(this.world, h).trees.length) move = { v: spare.id, role: 'woodcutter', why: 'a building site is waiting for timber' };
      if (move) { /* v4 move first */ } else
      if (farm >= 3 && herd === 0 && herders.length > 1) move = { v: herders[0].id, role: 'farmer', why: `${farm} fields need work and the animals are fine` };
      else if (herd >= 3 && farm === 0 && farmers.length > 1) move = { v: farmers[0].id, role: 'herder', why: `${herd} animal tasks waiting and the fields are fine` };
      else if (farmers.length === 0 && h.plots.length > 0) move = { v: herders[herders.length - 1].id, role: 'farmer', why: 'fields need a farmer' };
      else if (herders.length === 0 && h.animals.length > 0) move = { v: farmers[farmers.length - 1].id, role: 'herder', why: 'the animals need a herder' };
      if (move) {
        this.lastAssignTick = tick;
        const name = h.villagers.find((v) => v.id === move!.v)!.name;
        if (h.steward.policy.assign_role === 'auto') {
          const r = this.send({ type: 'assign_role', villagerId: move.v, role: move.role, actor: 'steward' }, move.v);
          if (r.ok) this.o.toast(`Steward: ${name} now works as a ${move.role} (${move.why}).`, 'good');
        } else {
          this.send({ type: 'steward_propose', action: 'assign_role', villagerId: move.v, role: move.role, reason: `Make ${name} a ${move.role}: ${move.why}` });
        }
      }
    }
    // Suggest another field when every field is busy and there is seed and wood to spare.
    const busy = h.plots.length > 0 && h.plots.every((p) => p.state === 'growing' || p.state === 'ripe');
    const none = h.plots.length === 0 && tick > 60;
    const wood = fenceCost(4, 4);
    if ((busy || none) && (s.wood ?? 0) >= wood && (s.seed ?? 0) >= 2 && h.steward.policy.expand_field !== 'off'
      && !h.steward.proposals.some((p) => p.action === 'expand_field') && findFieldSpot(this.world)) {
      const reason = none ? `No fields yet: I can fence a 4 x 4 m wheat field for ${wood} wood from the store.`
        : `Every field is in use and the store has seed; a 4 x 4 m wheat field costs ${wood} wood.`;
      if (h.steward.policy.expand_field === 'auto') {
        const r = this.send({ type: 'expand_field', actor: 'steward' });
        if (r.ok) this.o.toast(`Steward fenced a new field (${reason})`, 'good');
      } else {
        const r = this.send({ type: 'steward_propose', action: 'expand_field', reason });
        if (r.ok) this.o.toast('Steward has a request: open Farm to approve or decline.', 'warn');
      }
    }
  }

  // ---------- panel ----------

  togglePanel(force?: boolean): void {
    this.panel.hidden = force === undefined ? !this.panel.hidden : !force;
    if (!this.panel.hidden) { this.stopPlanning(); this.panelRevision = -1; this.renderPanel(); }
  }

  private renderPanel(): void {
    const h = this.world.homestead, life = this.world.life;
    if (!h || !life || this.panel.hidden) return;
    if (this.panelRevision === this.world.revision) return;
    this.panelRevision = this.world.revision;
    const pct = (n: number, d: number) => `${Math.round((n / d) * 100)}%`;
    const task = (k?: string) => ({ till: 'digging a field', sow: 'sowing', water: 'watering', harvest: 'harvesting', thresh: 'threshing seed',
      water_trough: 'filling a trough', feed: 'feeding animals', collect: 'collecting eggs', round_up: 'bringing strays back', shear: 'shearing', milk: 'milking',
      store: 'carrying to the store', restock: 'tidying the store', eat: 'eating', rest: 'resting at home', idle: 'idle',
      chop: 'felling a tree', haul: 'carrying building materials', build: 'building' } as Record<string, string>)[k ?? 'idle'] ?? k;
    const fields = h.plots.map((p) => {
      const rule = CROP_RULES[p.crop];
      const state = p.state === 'wild' ? 'marked, not dug yet' : p.state === 'tilled' ? `dug, waiting for ${unitsOf(p)} seed`
        : p.state === 'growing' ? `growing ${pct(p.growth, rule.growTicks)} · soil ${p.moisture === 0 ? '<b class="warn">dry</b>' : pct(p.moisture, MOISTURE_MAX)}` : '<b>ready to harvest</b>';
      const canChange = p.state === 'wild' || p.state === 'tilled';
      return `<li><span class="crop crop-${p.crop}"></span><b>${rule.label}</b> ${p.w}×${p.d} m · ${state}
        <span class="row-actions">${canChange ? `<select data-field="${p.id}" aria-label="Crop for this field">${CROPS.map((c) => `<option value="${c}" ${c === p.crop ? 'selected' : ''}>${CROP_RULES[c].label}</option>`).join('')}</select>` : ''}
        <button type="button" data-remove="${p.id}" aria-label="Remove this field">Remove</button></span></li>`;
    }).join('') || '<li class="dim">No fields yet. Plan one: you choose the place, the size and the crop.</li>';
    const route = (v: (typeof h.villagers)[number]) => {
      const n = v.nav;
      if (!n || !isNavHomestead(h)) return '';
      if (n.blocked) return ` · <b class="warn">can't get there: ${n.blocked.reason}</b> (${life.tick - n.blocked.since} ticks)`;
      if (n.opening) return ` · opening the ${gateLabel(n.opening)}`;
      if (n.wait) return ` · <b>waiting</b>: ${n.wait.reason} (${life.tick - n.wait.since} ticks)`;
      const steps = v.task?.legs[v.task.leg]?.op === 'walk' ? expandPath(n.path, navCell(v.x), navCell(v.z)).length / 2 : 0;
      return steps ? ` · walking, ${steps} m to go` : '';
    };
    const gaveUp = (v: (typeof h.villagers)[number]) => (v.avoid ?? []).map((a) => `<br><span class="warn">gave up ${a.target.replace(/:.*/, '')} (${a.reason}); retries in ${Math.max(0, a.until - life.tick)} ticks</span>`).join('');
    const people = h.villagers.map((v) => `<li><b>${v.name}</b> · ${v.role} · ${task(v.task?.kind)}${route(v)}${v.carry ? ` · carrying ${v.carry.item.startsWith('harvest') ? 'a harvest' : `${v.carry.amount} ${v.carry.item}`}` : ''}
      · energy ${v.energy}% · ${v.hunger >= 70 ? '<b class="warn">hungry</b>' : 'fed'}${gaveUp(v)}${(() => { const why = woodcutterStatus(this.world, h, v); return why ? `<br><span class="warn" data-woodcutter-why>not felling: ${why}</span>` : ''; })()}
      <span class="row-actions">${isWorkHomestead(h)
        ? `<label>Job <select data-role-of="${v.id}" aria-label="Job for ${v.name}">${ROLES.map((r) => `<option value="${r}" ${r === v.role ? 'selected' : ''}>${r}</option>`).join('')}</select></label>`
        : `<button type="button" data-assign="${v.id}" data-role="${v.role === 'farmer' ? 'herder' : 'farmer'}">Make ${v.role === 'farmer' ? 'herder' : 'farmer'}</button>`}</span></li>`).join('');
    const held = reservations(h);
    const heldText = Object.entries(held).map(([k, n]) => `${n} ${k}`).join(', ');
    const sites = isWorkHomestead(h) ? (h.sites ?? []).map((st) => {
      const rule = SITE_RULES[st.kind];
      const cost = Object.entries(rule.cost).map(([k, n]) => `${st.delivered[k] ?? 0}/${n} ${k}`).join(', ');
      const res = Object.entries(st.reserved).map(([k, n]) => `${n} ${k}`).join(', ');
      return `<li data-site="${st.id}"><b>${rule.label}</b> at ${st.x}, ${st.z} · ${st.state === 'done' ? 'built' : `${st.state} · ${siteProgress(st)}% · on site ${cost}${res ? ` · reserved in store: ${res}` : ''}`}
        <br><span class="dim">${siteStatus(this.world, st)}</span>
        <span class="row-actions">${st.state === 'planned' ? `<button type="button" class="primary" data-approve-site="${st.id}">Approve (reserve ${Object.entries(rule.cost).map(([k, n]) => `${n} ${k}`).join(', ')})</button>` : ''}${st.state !== 'done' && !Object.keys(st.delivered).length && !st.work ? `<button type="button" data-cancel-site="${st.id}">Cancel</button>` : ''}</span></li>`;
    }).join('') || '<li class="dim">No building sites. A woodshed needs 12 wood (a woodcutter brings it) and 4 fibre.</li>' : '';
    const lot = isWorkHomestead(h) ? woodlot(this.world, h) : null;
    const animals = SPECIES.map((sp) => {
      const list = h.animals.filter((a) => a.species === sp);
      if (!list.length) return '';
      const hungry = list.filter((a) => a.hunger >= 80).length, young = list.filter((a) => life.tick - a.born < SPECIES_RULES[sp].adultAge).length;
      const name = { chicken: ['chicken', 'chickens'], sheep: ['sheep', 'sheep'], goat: ['goat', 'goats'], pig: ['pig', 'pigs'], cattle: ['cow', 'cattle'], horse: ['horse', 'horses'] }[sp][list.length === 1 ? 0 : 1];
      return `<li><b>${list.length} ${name}</b>${young ? ` (${young} young)` : ''} · ${SPECIES_RULES[sp].purpose}${hungry ? ` · <b class="warn">${hungry} hungry</b>` : ''}</li>`;
    }).join('');
    const strays = isLivingHomestead(h) ? h.enclosures.map((e) => {
      const n = straysOf(h, e.id as EnclosureId).length;
      return n ? `${n} out of the ${e.id}` : '';
    }).filter(Boolean).join(', ') : '';
    const troughs = (strays ? `<b class="warn">${strays}</b> · ` : '') + h.enclosures.map((e) => `${homesteadLayout(h).find((f) => f.id === e.id)!.label.toLowerCase()}: water ${e.water}, feed ${e.feed}, pasture ${e.grass}%${e.id === 'coop' && e.eggs ? `, ${e.eggs} eggs` : ''}`).join(' · ');
    const gates = homesteadGates(h).map((g) => {
      const state = h.gates?.find((x) => x.id === g.id)?.state ?? 'closed';
      const btn = (to: string, label: string) => state === to ? '' : `<button type="button" data-gate="${g.id}" data-state="${to}">${label}</button>`;
      return `<li><b>${g.label}</b> · ${state === 'locked' ? '<b class="warn">locked: villagers cannot pass</b>' : state === 'open' ? 'open' : 'closed (villagers open and close it)'}
        <span class="row-actions">${btn('open', 'Open')}${btn('closed', 'Close')}${btn('locked', 'Lock')}</span></li>`;
    }).join('');
    const st = h.steward;
    const pol = (a: 'assign_role' | 'expand_field', label: string) => `<label>${label} <select data-policy="${a}">${(['auto', 'approve', 'off'] as Policy[]).map((p) => `<option value="${p}" ${st.policy[a] === p ? 'selected' : ''}>${p === 'auto' ? 'may act' : p === 'approve' ? 'ask me first' : 'never'}</option>`).join('')}</select></label>`;
    const proposals = st.proposals.map((p) => `<li>${p.reason}<span class="row-actions"><button type="button" class="primary" data-approve="${p.id}">Approve</button><button type="button" data-decline="${p.id}">Decline</button></span></li>`).join('');
    const stock = life.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory;
    const stored = Object.values(stock).reduce((a, b) => a + b, 0), barn = Object.values(h.overflow).reduce((a, b) => a + b, 0);
    const full = stored >= 195 && barn >= OVERFLOW_CAPACITY - 5;
    const reserve = h.plots.filter((p) => p.state === 'tilled' || p.state === 'wild').reduce((n, p) => n + unitsOf(p), 0);
    const clock = dayTime(life.tick);
    const events = (recentHomesteadEvents.get(this.world) ?? []).slice(-4).reverse().map((e) => `<li>${e}</li>`).join('');
    this.panel.innerHTML = `
      <header><h2>Homestead</h2><span class="dim">day ${clock.day + 1} · ${clock.night ? 'night' : 'day'}</span><button type="button" data-close aria-label="Close">×</button></header>
      <p class="${full ? 'warn' : 'dim'}">Store ${stored} / 200 · barn ${barn} / ${OVERFLOW_CAPACITY}${full ? ' · <b>full: ripe crops and products wait until there is room (use or withdraw goods)</b>' : ''}</p>
      ${isWorkHomestead(h) ? `<p class="dim" data-store>In store: ${Object.entries(stock).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${n} ${k}${held[k] ? ` (${held[k]} reserved)` : ''}`).join(', ') || 'nothing'}</p>` : ''}
      <h3>Fields</h3><ul>${fields}</ul>
      <div class="row-actions"><button type="button" class="primary" data-plan-new>Plan a new field</button><span class="dim">seed in store ${stock.seed ?? 0} (${reserve} reserved for sowing)</span></div>
      <h3>People</h3><ul>${people}</ul>
      ${lot && !isWoodlandHomestead(h) ? `<p class="dim">Woodland: ${lot.trees.length} mature trees may be felled · ${lot.standing} mature or old trees standing (${MIN_STANDING_TREES} are always kept)</p>` : ''}
      ${lot && isWoodlandHomestead(h) ? this.woodlandPanel() : ''}
      ${lot ? `<h3>Building</h3><ul>${sites}</ul><div class="row-actions"><button type="button" data-site-new>Plan a woodshed</button>${heldText ? `<span class="dim">reserved for building: ${heldText} (not usable for anything else)</span>` : ''}</div>` : ''}
      <h3>Animals</h3><ul>${animals}</ul><p class="dim">${troughs}</p>
      ${gates ? `<h3>Gates and doors</h3><ul>${gates}</ul>` : ''}
      <h3>Steward <span class="dim">(AI agent)</span></h3>
      <div class="steward"><label><input type="checkbox" data-steward ${st.enabled ? 'checked' : ''}> Steward on</label> ${pol('assign_role', 'Reassign jobs')} ${pol('expand_field', 'Fence new fields')}</div>
      ${proposals ? `<ul class="proposals">${proposals}</ul>` : '<p class="dim">No requests.</p>'}
      ${events ? `<h3>Recently</h3><ul class="events">${events}</ul>` : ''}`;
  }

  // ---------- M013 woodland ----------

  /** The tree nearest the player (within 8 m) in the managed woodland, standing or a stump. */
  private nearestTree(): { id: string; name: string; d: number } | null {
    const p = this.o.player(), h = this.world.homestead;
    if (!p || !h || !isWoodlandHomestead(h)) return null;
    let best: { id: string; name: string; d: number } | null = null;
    for (const m of managedWoodland(this.world, h).all) {
      if (!m.life.present) continue;
      const d = Math.hypot(m.e.x - p.x, m.e.z - p.z);
      if (d <= 8 && (!best || d < best.d)) best = { id: m.e.id, name: `${stageLabel(m.life.stage)} ${m.life.species}`, d };
    }
    return best;
  }

  /** The cell in front of the player where a sapling would go. */
  private plantCell(): { x: number; z: number } | null {
    const p = this.o.player();
    if (!p) return null;
    return { x: Math.floor(p.x + Math.sin(p.heading) * 1.6), z: Math.floor(p.z + Math.cos(p.heading) * 1.6) };
  }

  private woodlandPanel(): string {
    const h = this.world.homestead!, w = h.woodland!, life = this.world.life!;
    const lot = managedWoodland(this.world, h);
    const reg = { x: h.anchorX - 10, z: h.anchorZ - 10 };
    const st = woodlandStats(this.world, { x: reg.x, z: reg.z, radius: 85 });
    if (!st) return '';
    const stages = (['sapling', 'young', 'mature', 'old', 'dying', 'snag', 'stump'] as LifeStage[]).filter((k) => st.byStage[k]).map((k) => `${st.byStage[k]} ${stageLabel(k)}`).join(', ');
    const p = w.policy;
    const sel = (k: string, opts: Array<[string, string]>, v: string) => `<select data-wpolicy="${k}" aria-label="${k}">${opts.map(([o, l]) => `<option value="${o}" ${o === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const num = (k: keyof typeof POLICY_LIMITS, label: string) => `<label>${label} <input type="number" data-wpolicy="${k}" min="${POLICY_LIMITS[k][0]}" max="${POLICY_LIMITS[k][1]}" value="${p[k]}" style="width:3.5em"></label>`;
    const near = this.nearestTree();
    const cell = this.plantCell();
    const plantWhy = cell ? (() => { const parent = seedParent(this.world, h, cell.x + 0.5, cell.z + 0.5, null); if (!parent) return ['no mature tree within 20 m to lift a sapling from'];
      return plantable(this.world, h, cell.x, cell.z, treeLife(this.world, parent)!.species); })() : ['walk (Tab) to plant where you stand'];
    const zones = w.zones.map((z) => `<li>Protected area ${z.id.slice(5)} · ${z.r} m round ${z.x}, ${z.z} <span class="row-actions"><button type="button" data-remove-zone="${z.id}">Remove</button></span></li>`).join('');
    const marked = w.protect.slice(0, 6).map((id) => { const e = this.world.entities.get(id); const l = e ? treeLife(this.world, e) : null;
      return `<li>${l ? `${stageLabel(l.stage)} ${l.species}` : id} at ${e ? `${Math.round(e.x)}, ${Math.round(e.z)}` : '?'} <span class="row-actions"><button type="button" data-unprotect="${id}">Unprotect</button></span></li>`; }).join('');
    const orders = w.orders.length ? `${w.orders.length} sapling${w.orders.length > 1 ? 's' : ''} to replant (${w.orders.map((o) => o.sp).join(', ')})` : 'nothing to replant';
    return `<h3>Woodland <span class="dim">(living: trees grow, age and regrow)</span></h3>
      <p class="dim" data-woodland-stats>${st.trees} trees in the managed woodland: ${stages || 'none'} · <b>${st.harvestable} may be felled</b> · ${st.protected} protected · ${st.regrowing} regrowing
      <br>Sustainable: about ${st.sustainableTreesPerDay} trees (${st.sustainableWoodPerDay} wood) a day, ${st.rotationDays}-day rotation · felling allowance ${p.harvest === 'sustainable' ? `${(w.quota / QUOTA_TREE).toFixed(1)} trees (+${(w.rate * WOOD_DAY / QUOTA_TREE).toFixed(1)}/day)` : p.harvest === 'paused' ? 'paused' : 'by demand'}
      · woodcutter walks ${st.meanPathToStore ?? '–'} m on average to the store
      <br>So far: ${w.felled} felled · ${w.planted} planted · ${w.seeded} seeded themselves · ${w.sprouted} stumps resprouted · ${orders} · day ${Math.floor(life.tick / WOOD_DAY) + 1}</p>
      <div class="steward" data-woodland-policy>
        <label>Harvest ${sel('harvest', HARVEST_MODES.map((m) => [m, m === 'sustainable' ? 'only what regrows' : m === 'demand' ? 'what the store needs' : 'paused']), p.harvest)}</label>
        <label>Fell from ${sel('minStage', [['mature', 'mature'], ['old', 'old']], p.minStage)}</label>
        <label><input type="checkbox" data-wpolicy="keepVeterans" ${p.keepVeterans ? 'checked' : ''}> keep old trees</label>
        <label>Dead snags ${sel('snags', [['fell', 'fell for poor wood'], ['keep', 'keep for wildlife']], p.snags)}</label>
        ${num('buffer', 'Keep near buildings (m)')} ${num('waterBuffer', 'near water (m)')} ${num('minStanding', 'Always standing')}
        <label>Replant ${sel('replant', [['0', 'none'], ['1', '1 per tree'], ['2', '2 per tree'], ['3', '3 per tree']], String(p.replant))}</label>
      </div>
      <div class="row-actions">
        <button type="button" data-protect-near ${near ? '' : 'disabled'}>${near ? `Protect the ${near.name} (${near.d.toFixed(0)} m)` : 'Protect nearest tree'}</button>
        ${near && w.protect.includes(near.id) ? `<button type="button" data-unprotect="${near.id}">Unprotect it</button>` : ''}
        <button type="button" data-protect-zone ${this.o.player() ? '' : 'disabled'}>Protect 12 m around me</button>
        <button type="button" class="primary" data-plant-here ${cell && !plantWhy.length ? '' : 'disabled'}>Plant a sapling here</button>
      </div>
      ${plantWhy.length ? `<p class="dim" data-plant-why>Planting here: ${plantWhy.join('; ')}</p>` : ''}
      <p class="dim">Trees that may be felled now (${lot.trees.length}):</p><ul data-fellable>${lot.trees.slice(0, 6).map((e) => { const l = treeLife(this.world, e)!;
        return `<li>${stageLabel(l.stage)} ${l.species} at ${Math.round(e.x)}, ${Math.round(e.z)}${e.harvestedOnce ? ` · ${e.remaining} wood left` : ''} <span class="row-actions"><button type="button" data-protect-tree="${e.id}">Protect</button></span></li>`; }).join('') || '<li class="dim">none now</li>'}</ul>
      ${zones || marked ? `<ul>${zones}${marked}${w.protect.length > 6 ? `<li class="dim">and ${w.protect.length - 6} more marked trees</li>` : ''}</ul>` : ''}`;
  }

  private sendPolicy(): Receipt | null {
    const h = this.world.homestead;
    if (!h?.woodland) return null;
    const p: WoodPolicy = { ...h.woodland.policy };
    this.panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-wpolicy]').forEach((el) => {
      const k = el.dataset.wpolicy as keyof WoodPolicy;
      if (k === 'keepVeterans') p.keepVeterans = (el as HTMLInputElement).checked;
      else if (k === 'buffer' || k === 'waterBuffer' || k === 'minStanding' || k === 'replant') {
        const n = Math.round(Number(el.value));
        p[k] = Math.max(POLICY_LIMITS[k][0], Math.min(POLICY_LIMITS[k][1], Number.isFinite(n) ? n : p[k]));
      } else (p as unknown as Record<string, string>)[k] = el.value;
    });
    return this.send({ type: 'woodland_policy', ...p });
  }

  private onPanelClick(e: Event): void {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    let r: Receipt | null = null;
    if (b.hasAttribute('data-close')) { this.togglePanel(false); return; }
    if (b.hasAttribute('data-plan-new')) { this.startPlanning(); return; }
    if (b.hasAttribute('data-site-new')) {
      const spot = findSiteSpot(this.world, 'woodshed');
      if (!spot) { this.o.toast('There is no clear, level ground for a woodshed near the farmhouse.', 'bad'); return; }
      r = this.send({ type: 'place_site', kind: 'woodshed', x: spot.x, z: spot.z }, `${spot.x},${spot.z}`);
      if (r.ok) this.o.toast(`Woodshed marked out at ${spot.x}, ${spot.z}. Approve it to reserve its materials.`, 'good');
    }
    if (b.dataset.approveSite) {
      r = this.send({ type: 'approve_site', siteId: b.dataset.approveSite }, b.dataset.approveSite);
      if (r.ok && r.outcome.type === 'approve_site') this.o.toast(`Approved: ${Object.entries(r.outcome.reserved).map(([k, n]) => `${n} ${k}`).join(', ') || 'nothing'} reserved now; the rest as it comes in.`, 'good');
    }
    if (b.dataset.cancelSite) r = this.send({ type: 'cancel_site', siteId: b.dataset.cancelSite }, b.dataset.cancelSite);
    // M013 woodland: protect the nearest tree or an area round the player, unprotect, plant in front of the player.
    if (b.hasAttribute('data-protect-near')) {
      const t = this.nearestTree();
      if (t) { r = this.send({ type: 'protect_tree', entityId: t.id, protect: true }, t.id); if (r.ok) this.o.toast(`The ${t.name} is protected: no one will fell it.`, 'good'); }
    }
    if (b.dataset.protectTree) { r = this.send({ type: 'protect_tree', entityId: b.dataset.protectTree, protect: true }, b.dataset.protectTree); if (r.ok) this.o.toast('That tree is protected: no one will fell it.', 'good'); }
    if (b.dataset.unprotect) r = this.send({ type: 'protect_tree', entityId: b.dataset.unprotect, protect: false }, b.dataset.unprotect);
    if (b.hasAttribute('data-protect-zone')) {
      const p = this.o.player();
      if (p) { r = this.send({ type: 'protect_zone', x: Math.round(p.x), z: Math.round(p.z), r: 12 }, `${Math.round(p.x)},${Math.round(p.z)}`); if (r.ok) this.o.toast('Trees within 12 m of here are protected.', 'good'); }
    }
    if (b.dataset.removeZone) r = this.send({ type: 'remove_zone', zoneId: b.dataset.removeZone }, b.dataset.removeZone);
    if (b.hasAttribute('data-plant-here')) {
      const c = this.plantCell();
      if (c) {
        r = this.send({ type: 'plant_tree', x: c.x, z: c.z }, `${c.x},${c.z}`);
        if (r.ok && r.outcome.type === 'plant_tree') this.o.toast(`Planted a ${r.outcome.species} sapling (lifted from a nearby tree).`, 'good');
      }
    }
    if (b.dataset.remove) {
      if (!confirm('Remove this field? Anything growing there is lost and the fence wood is not returned.')) return;
      r = this.send({ type: 'remove_field', fieldId: b.dataset.remove }, b.dataset.remove);
    }
    if (b.dataset.gate) r = this.send({ type: 'set_gate', gateId: b.dataset.gate, state: b.dataset.state }, b.dataset.gate);
    if (b.dataset.assign) r = this.send({ type: 'assign_role', villagerId: b.dataset.assign, role: b.dataset.role, actor: 'player' }, b.dataset.assign);
    if (b.dataset.approve) r = this.send({ type: 'resolve_proposal', proposalId: b.dataset.approve, approve: true }, b.dataset.approve);
    if (b.dataset.decline) r = this.send({ type: 'resolve_proposal', proposalId: b.dataset.decline, approve: false }, b.dataset.decline);
    if (r && !r.ok) this.o.toast(r.reasons.join('; '), 'bad');
    if (r?.ok && r.outcome.type === 'resolve_proposal') this.o.toast(r.outcome.approved ? `Approved: ${r.outcome.result}` : 'Declined', 'good');
    this.panelRevision = -1;
    this.renderPanel();
  }

  private onPanelChange(e: Event): void {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const h = this.world.homestead;
    if (!h) return;
    let r: Receipt | null = null;
    if (el.dataset.field) r = this.send({ type: 'set_crop', fieldId: el.dataset.field, crop: el.value }, el.dataset.field);
    if (el.dataset.roleOf) r = this.send({ type: 'assign_role', villagerId: el.dataset.roleOf, role: el.value, actor: 'player' }, el.dataset.roleOf);
    if (el.dataset.wpolicy) { r = this.sendPolicy(); if (r?.ok) this.o.toast('Woodland policy updated.', 'good'); }
    if (el.dataset.policy || el.hasAttribute('data-steward')) {
      const policy = { ...h.steward.policy };
      const sel = this.panel.querySelectorAll<HTMLSelectElement>('select[data-policy]');
      sel.forEach((s) => { policy[s.dataset.policy as 'assign_role' | 'expand_field'] = s.value as Policy; });
      const enabled = (this.panel.querySelector('input[data-steward]') as HTMLInputElement).checked;
      r = this.send({ type: 'steward_policy', enabled, assign_role: policy.assign_role, expand_field: policy.expand_field });
    }
    if (r && !r.ok) this.o.toast(r.reasons.join('; '), 'bad');
    this.panelRevision = -1;
    this.renderPanel();
  }

  /** Every frame. */
  update(frameDt: number): void {
    if (!this.available) return;
    this.view.update(frameDt);
    this.updatePlanner();
    this.runSteward();
    this.renderPanel();
    // Surface the latest homestead events as toasts, a few at a time.
    const ev = recentHomesteadEvents.get(this.world) ?? [];
    if (ev.length && ev !== this.lastEvents) {
      this.lastEvents = ev;
      const fresh = ev.slice(Math.max(0, ev.length - 1));
      if (this.eventsSeen++ > 0 && /harvested|withered|spoiled|sowed|dug/.test(fresh[0] ?? '')) this.o.toast(fresh[0], /withered|spoiled/.test(fresh[0]) ? 'warn' : 'good');
    }
  }

  /** M013 probe/metrics view of the living woodland (presentation only). */
  woodlandMetrics(): Record<string, unknown> | null {
    const h = this.world.homestead;
    if (!h || !isWoodlandHomestead(h)) return null;
    const w = h.woodland!;
    const lot = managedWoodland(this.world, h);
    const stats = woodlandStats(this.world, { x: h.anchorX - 10, z: h.anchorZ - 10, radius: 85 });
    return {
      epoch: w.epoch, policy: { ...w.policy }, quota: w.quota, rate: w.rate, felled: w.felled, planted: w.planted, seeded: w.seeded, sprouted: w.sprouted,
      protect: [...w.protect], zones: w.zones.map((z) => ({ ...z })), orders: w.orders.map((o) => ({ ...o })), records: w.trees.length,
      standing: lot.standing, eligible: lot.trees.map((e) => e.id),
      trees: lot.all.map((m) => ({ id: m.e.id, x: m.e.x, y: m.e.y, z: m.e.z, sp: m.life.species, stage: m.life.stage, present: m.life.present, age: m.life.age,
        remaining: m.e.harvestedOnce ? m.e.remaining : null, eligible: m.eligible, why: m.why, prot: m.protectedWhy, from: m.life.record?.from ?? 'wild' })),
      woodcutters: h.villagers.filter((v) => v.role === 'woodcutter').map((v) => ({ id: v.id, why: woodcutterStatus(this.world, h, v) })),
      stats: stats ? { ...stats, harvestableIds: undefined, protectedIds: undefined } : null,
    };
  }

  metrics(): Record<string, unknown> | null {
    const h = this.world.homestead, life = this.world.life;
    if (!h || !life) return null;
    return {
      tick: life.tick, day: dayTime(life.tick),
      fields: h.plots.map((p) => ({ id: p.id, crop: p.crop, x: p.x, z: p.z, w: p.w, d: p.d, state: p.state, stage: cropStage(p), growth: p.growth, moisture: p.moisture })),
      villagers: h.villagers.map((v) => ({ id: v.id, name: v.name, role: v.role, task: v.task?.kind ?? null, target: v.task?.target ?? null, leg: v.task?.leg ?? null,
        legOp: v.task?.legs[v.task.leg]?.op ?? null, x: v.x / DM, z: v.z / DM, carry: v.carry, energy: v.energy, hunger: v.hunger,
        nav: v.nav ? { corners: v.nav.path.length / 2, dest: v.nav.dest, opening: v.nav.opening ?? null, opened: v.nav.opened ?? null, blocked: v.nav.blocked ?? null, wait: v.nav.wait ?? null } : null,
        avoid: v.avoid ?? [] })),
      rules: h.version,
      gates: (h.gates ?? []).map((g) => ({ ...g })),
      navStats: { ...navStats(this.world) },
      animals: Object.fromEntries(SPECIES.map((sp) => [sp, h.animals.filter((a) => a.species === sp).length])),
      herd: h.animals.map((a) => ({ id: a.id, species: a.species, x: a.x / DM, z: a.z / DM, go: a.go ?? null })),
      strays: Object.fromEntries(h.enclosures.map((e) => [e.id, straysOf(h, e.id as EnclosureId).map((a) => a.id)])),
      enclosures: h.enclosures.map((e) => ({ ...e })),
      overflow: { ...h.overflow },
      sites: (h.sites ?? []).map((st) => ({ ...st, reserved: { ...st.reserved }, delivered: { ...st.delivered }, progress: siteProgress(st), status: siteStatus(this.world, st) })),
      reserved: reservations(h),
      woodlot: isWorkHomestead(h) ? (() => { const l = woodlot(this.world, h); return { fellable: l.trees.length, standing: l.standing,
        trees: l.trees.map((e) => ({ id: e.id, x: e.x, z: e.z, stage: growthStage(e), remaining: e.remaining, cut: !!e.harvestedOnce })) }; })() : null,
      choppingTree: (() => { const v = h.villagers.find((x) => x.task?.kind === 'chop'); const id = v ? treeEntityId(v.task!.target) : null; const e = id ? this.world.entities.get(id) : null;
        return e ? { id: e.id, x: e.x, z: e.z, stage: growthStage(e), remaining: e.remaining, harvested: e.harvested, by: v!.id } : null; })(),
      store: { ...life.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory },
      woodland: isWoodlandHomestead(h) ? this.woodlandMetrics() : null,
      steward: { enabled: h.steward.enabled, policy: { ...h.steward.policy }, proposals: h.steward.proposals.length },
      planning: this.planning ? { ...this.planning, spec: this.planSpec, reasons: this.planReasons } : null,
      nearest: this.nearest(),
      view: this.view.metrics(),
    };
  }
}
