// W4 completion: the Build menu, the placement ghost and bar (the shared M014 build mode with the wilderness
// adapter), rotation, placing and refusing, the site and building panels, honest labels (no campfire warmth,
// the knife says what it is for: W8 butchering), and the rendering budgets of every building model and construction stage.
// The UI runs against a minimal DOM stand-in (no browser): it checks what the panels say and that every
// verdict they show is the simulation's own.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BUILD_CATALOGUE, buildingDef } from '../src/sim/catalogue';
import { WILD_RECIPES } from '../src/sim/gathering';
import { checkWildSite, findWildSpot, siteCellsOf, siteEntranceOf, siteSpotOf, WildSite } from '../src/sim/wild-build';
import { footprintEntrance } from '../src/sim/placement';
import { BUILDINGS_BUDGET, SCENE_BUDGET, WildBuildingsView, siteBoxes, siteTriangles, withinSceneBudget } from '../src/render/wild-buildings';
import type { World } from '../src/sim/world';
import { WildBuildUI } from '../src/app/wild-build-ui';
import { SPAWN, axe, build, dm, fund, load, send, wild } from './w4-harness';

// ---------- a minimal DOM stand-in ----------

type Handler = (e: unknown) => void;
class FakeEl {
  id = ''; className = ''; hidden = false; innerHTML = ''; textContent = '';
  readonly dataset: Record<string, string> = {};
  readonly attrs = new Map<string, string>();
  readonly children: FakeEl[] = [];
  readonly handlers = new Map<string, Handler[]>();
  readonly classes = new Set<string>();
  readonly classList = {
    add: (c: string) => { this.classes.add(c); }, remove: (c: string) => { this.classes.delete(c); },
    toggle: (c: string, on?: boolean) => { if (on ?? !this.classes.has(c)) this.classes.add(c); else this.classes.delete(c); }, contains: (c: string) => this.classes.has(c),
  };
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
  appendChild(c: FakeEl) { this.children.push(c); return c; }
  addEventListener(t: string, h: Handler) { this.handlers.set(t, [...(this.handlers.get(t) ?? []), h]); }
  /** `[data-x]` only: the text of the first element in innerHTML carrying that attribute. */
  querySelector(sel: string): { textContent: string } | null {
    const m = /^\[([\w-]+)\]$/.exec(sel);
    if (!m) return null;
    const r = new RegExp(`<(\\w+)[^>]*\\b${m[1]}\\b[^>]*>([\\s\\S]*?)</\\1>`).exec(this.innerHTML);
    return r ? { textContent: r[2].replace(/<[^>]+>/g, '') } : null;
  }
  /** Click a button in this element's HTML: the first one whose attributes match. */
  click(match: RegExp): void {
    const tag = [...this.innerHTML.matchAll(/<button\b([^>]*)>/g)].map((x) => x[1]).find((a) => match.test(a));
    assert.ok(tag !== undefined, `a button matching ${match} in ${this.id}`);
    const dataset: Record<string, string> = {};
    for (const [, k, v] of tag!.matchAll(/data-([\w-]+)(?:="([^"]*)")?/g)) dataset[k.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = v ?? '';
    const button = { disabled: /\bdisabled\b/.test(tag!), dataset, hasAttribute: (a: string) => new RegExp(`\\b${a}\\b`).test(tag!) };
    for (const h of this.handlers.get('click') ?? []) h({ target: { closest: () => button } });
  }
}
const g = globalThis as unknown as { document?: unknown };
g.document = { body: new FakeEl(), createElement: () => new FakeEl(), getElementById: () => null };


function harness() {
  const s = wild();
  load(s);
  const toasts: string[] = [];
  let pos = { ...SPAWN };
  const ui = new WildBuildUI({
    world: () => s.world,
    send: (c, _t, _quiet) => { const r = send(s, c); return r.ok ? { ok: true, outcome: r.outcome as never } : null; },
    toast: (m) => { toasts.push(m); }, at: () => dm(pos), player: () => ({ ...pos, heading: 0 }), scene: new THREE.Scene(),
  });
  return { s, ui, toasts, stand: (p: { x: number; z: number }) => { pos = { ...p }; } };
}
const el = (x: unknown) => x as FakeEl;

// ---------- the Build menu, ghost, rotation and placing ----------

test('the Build menu lists the catalogue honestly; choosing a building opens the ghost whose verdict is the simulation\'s', async () => {
  const { s, ui } = harness();
  ui.toggleMenu(true);
  const menu = el(ui.menu);
  for (const d of BUILD_CATALOGUE) assert.ok(menu.innerHTML.includes(`<b>${d.label}</b>`), d.label);
  assert.match(menu.innerHTML, /data-choose="cabin" disabled/, 'later buildings are locked');
  assert.match(menu.innerHTML, /Locked: arrives with a later milestone \(needs smithed iron nails\)/);
  assert.ok(!/warm/i.test(menu.innerHTML), 'no warmth is claimed anywhere in the catalogue');
  // W8: the knife now has a use (butchering), and the catalogue says so.
  assert.match(menu.innerHTML, /stone knife \(for butchering\)/);
  assert.match(menu.innerHTML, /placing reserves all its materials/);
  menu.click(/data-choose="campfire"/);
  assert.equal(ui.mode.active, true);
  assert.equal(ui.menu.hidden, true);
  // The ghost starts in front of the player; move it to a good spot and ask for the verdict.
  const p = findWildSpot(s.world, 'campfire', 0, dm(SPAWN))!;
  ui.mode.placeAt(p.x + 1, p.z + 1);
  assert.deepEqual(ui.mode.pos, p);
  ui.mode.update();
  const sim = checkWildSite(s.world, 'campfire', p.x, p.z, 0, dm(SPAWN));
  assert.deepEqual(ui.mode.preview!.check, sim, 'the ghost shows the validator\'s own verdict');
  assert.equal(sim.ok, false, 'nothing carried: the materials cannot be reserved');
  const bar = (ui.mode as unknown as { bar: FakeEl }).bar;
  assert.match(bar.innerHTML, /data-build-place disabled/, 'Place is disabled');
  assert.match(bar.innerHTML, /not enough free materials to reserve: 3 branch, 6 stone more needed/);
  assert.match(bar.innerHTML, /stone 0\/6/);
  assert.equal(ui.mode.ghost.children.length, 1, 'one ghost mesh');
  // Carry the materials: the same spot turns good, and the bar shows what would be reserved.
  fund(s, 'campfire', SPAWN);
  await new Promise((r) => setTimeout(r, 200)); // the validator is asked at most every 180 ms
  ui.mode.update();
  assert.equal(ui.mode.preview!.check.ok, true, ui.mode.preview!.check.reasons.join('; '));
  assert.match(bar.innerHTML, /<b>Good spot\.<\/b>/);
  assert.match(bar.innerHTML, /stone 6\/6/);
  assert.doesNotMatch(bar.innerHTML, /data-build-place disabled/);
  bar.click(/data-build-place/);
  const site = [...s.world.wild!.build!.sites.values()][0];
  assert.ok(site, 'placed');
  assert.deepEqual(site.reserved, { bag: { branch: 3, stone: 6 } });
  assert.equal(ui.mode.active, false, 'placing closes the ghost');
});

test('rotation: the ghost turns in quarter turns; the footprint swaps its sides and the door moves, as the simulation computes them', () => {
  const { s, ui } = harness();
  ui.toggleMenu(true);
  el(ui.menu).click(/data-choose="lean_to"/);
  const p = findWildSpot(s.world, 'lean_to', 0, dm(SPAWN))!;
  ui.mode.placeAt(p.x + 1.5, p.z + 1);
  const seen = new Set<string>();
  for (let rot = 0; rot < 4; rot++) {
    ui.mode.update();
    const c = ui.mode.preview!.check;
    assert.equal(c.rot, rot);
    const w = c.cells.x1 - c.cells.x0, d = c.cells.z1 - c.cells.z0;
    assert.deepEqual([w, d], rot % 2 ? [2, 3] : [3, 2], `rot ${rot}: 3 x 2, turned`);
    assert.deepEqual(c.entrance, footprintEntrance(3, 2, c.x, c.z, rot), `rot ${rot}: the door step`);
    assert.deepEqual(c, checkWildSite(s.world, 'lean_to', c.x, c.z, rot, dm(SPAWN)), `rot ${rot}: the simulation's verdict`);
    // The door step lies outside the footprint, on the side the door faces.
    const e = c.entrance;
    const side = rot === 0 ? e.z === c.cells.z1 : rot === 1 ? e.x === c.cells.x1 : rot === 2 ? e.z === c.cells.z0 - 1 : e.x === c.cells.x0 - 1;
    assert.ok(side, `rot ${rot}: door on the turned side`);
    seen.add(`${e.x - c.x},${e.z - c.z}`);
    assert.equal(ui.mode.metrics().bar !== null, true);
    ui.mode.turn(1);
  }
  assert.equal(seen.size, 4, 'four different door positions');
  ui.mode.update();
  assert.equal(ui.mode.preview!.check.rot, 0, 'four turns come back round');
  assert.equal(ui.mode.key({ key: 'x', shiftKey: false } as KeyboardEvent), true, 'X turns');
  assert.equal(ui.mode.rot, 1);
  assert.equal(ui.mode.key({ key: 'Escape' } as KeyboardEvent), true);
  assert.equal(ui.mode.active, false);
});

test('a refused placement says why (the player is in the footprint) and creates nothing', () => {
  const { s, ui, toasts } = harness();
  fund(s, 'workbench', SPAWN);
  ui.toggleMenu(true);
  el(ui.menu).click(/data-choose="workbench"/);
  ui.mode.placeAt(SPAWN.x, SPAWN.z);
  ui.mode.update();
  assert.equal(ui.mode.preview!.check.ok, false);
  assert.ok(ui.mode.preview!.check.reasons.includes('you are standing where it would go: step out of the footprint'));
  assert.equal(ui.mode.confirm(), false, 'Enter on a red ghost does nothing');
  assert.match(toasts.at(-1)!, /^Cannot build here: .*you are standing where it would go/);
  assert.equal(ui.stats.refusedPlacements, 1);
  assert.equal(s.world.wild!.build!.sites.size, 0);
});

test('the site panel: reservations by source, deliveries, stage progress and a two-press cancel', () => {
  const { s, ui, stand, toasts } = harness();
  fund(s, 'campfire', SPAWN);
  const p = findWildSpot(s.world, 'campfire', 0, dm(SPAWN))!;
  ui.toggleMenu(true); el(ui.menu).click(/data-choose="campfire"/);
  ui.mode.placeAt(p.x + 1, p.z + 1); ui.mode.update(); ui.mode.confirm();
  const site = [...s.world.wild!.build!.sites.values()][0];
  assert.match(toasts.at(-1)!, /Reserved for it: 3 branch, 6 stone in your bag/);
  stand(siteSpotOf(site));
  ui.update(0);
  const panel = el(ui.site);
  assert.equal(ui.near?.id, site.id);
  assert.equal(panel.hidden, false);
  assert.match(panel.innerHTML, /stone <b>0\/6<\/b> <span class="dim" data-reserved-stone>\(reserved: 6 in your bag\)/);
  assert.match(panel.innerHTML, /data-deliver="stone" data-n="6" data-from="bag"/);
  assert.match(panel.innerHTML, /data-work disabled/, 'no work before the ring is delivered');
  panel.click(/data-deliver="stone"/);
  assert.deepEqual(site.delivered, { stone: 6 });
  ui.update(0);
  assert.match(panel.innerHTML, /stone <b>6\/6<\/b>/);
  assert.doesNotMatch(panel.innerHTML, /data-work disabled/);
  // Cancel needs a second press.
  panel.click(/data-cancel/);
  assert.equal(s.world.wild!.build!.sites.size, 1);
  ui.update(0);
  assert.match(panel.innerHTML, /Confirm cancel/);
  panel.click(/data-cancel/);
  assert.equal(s.world.wild!.build!.sites.size, 0, 'cancelled');
  assert.match(toasts.at(-1)!, /reservations released; its delivered materials lie on the ground at the site/);
  const pile = [...s.world.wild!.piles.values()].find((x) => x.item === 'stone' && x.qty === 6);
  assert.ok(pile && Math.hypot(pile.x - siteSpotOf(site).x, pile.z - siteSpotOf(site).z) < 1.5, 'the stones lie at the site');
});

test('building panels are honest: the campfire cooks (no warmth claimed), the knife says what it is for (W8: butchering), reserved items are not offered as free', () => {
  const { s, ui, stand, toasts } = harness();
  axe(s);
  const fid = build(s, 'campfire', SPAWN);
  stand(siteSpotOf(s.world.wild!.build!.sites.get(fid)!));
  ui.update(0);
  assert.equal(ui.near?.id, fid);
  assert.ok(!/warm/i.test(el(ui.site).innerHTML), 'no warmth on the fire panel');
  assert.ok(!/warm/i.test(buildingDef('campfire')!.function.summary + buildingDef('campfire')!.description));
  const wid = build(s, 'workbench', SPAWN);
  stand(siteSpotOf(s.world.wild!.build!.sites.get(wid)!));
  ui.update(0);
  assert.equal(ui.near?.id, wid);
  // W8 (content v9): the knife's note says what it now does (butchering a carcass the player shot; shaping the bow and arrows).
  const knife = WILD_RECIPES.find((r) => r.id === 'knife')!;
  assert.doesNotMatch(knife.note!, /no use yet/);
  assert.match(knife.note!, /Butchers the carcass of an animal you shot/);
  assert.doesNotMatch(knife.label + knife.note!, /skins?/i);
  assert.match(el(ui.site).innerHTML, /data-recipe="knife"[\s\S]*?Butchers the carcass/);
  // Reserve stones for a campfire, then try to craft a pickaxe with them at the bench: refused by the simulation.
  fund(s, 'campfire', SPAWN);
  const c = findWildSpot(s.world, 'campfire', 0, dm(SPAWN))!;
  const r = send(s, { type: 'place_site', kind: 'campfire', x: c.x, z: c.z, rot: 0, at: dm(SPAWN) });
  assert.ok(r.ok, JSON.stringify(r));
  ui.update(0);
  assert.match(el(ui.site).innerHTML, /stone 0\/2/, 'the bench counts free stones only');
  void toasts;
});

// ---------- rendering budgets ----------

const at = (kind: string, rot: number, stage: number, work: number, extra: Partial<WildSite> = {}): WildSite => ({
  id: 'b:1', kind, x: 10, z: -20, rot, y: 5, state: stage >= buildingDef(kind)!.stages.length ? 'done' : stage || work ? 'building' : 'planned',
  reserved: {}, delivered: {}, consumed: {}, stage, work, placed: 0, ...extra,
});

test('rendering budget: every building model, in every construction stage and rotation, stays inside its footprint and under its triangle budget', () => {
  let worst = 0;
  for (const d of BUILD_CATALOGUE.filter((x) => x.implemented)) {
    for (let rot = 0; rot < 4; rot++) {
      const states: WildSite[] = [at(d.id, rot, 0, 0)];
      d.stages.forEach((st, i) => { states.push(at(d.id, rot, i, Math.max(1, st.work - 1))); });
      states.push(at(d.id, rot, d.stages.length, 0, d.function.kind === 'storage' ? { stock: { log: 13 } } : d.function.kind === 'fire' ? { fuel: 30 } : {}));
      let last = -1;
      for (const site of states) {
        const tris = siteTriangles(site);
        worst = Math.max(worst, tris);
        assert.ok(tris <= BUILDINGS_BUDGET.trianglesPerBuilding, `${d.id} rot ${rot} stage ${site.stage}/${site.work}: ${tris} triangles`);
        const c = siteCellsOf(site);
        // Inside the footprint; a roof may overhang it by up to 0.2 m (the storage shed's roof does by 0.15 m).
        for (const b of siteBoxes(site)) {
          assert.ok(b.x - b.w / 2 >= c.x0 - 0.2 && b.x + b.w / 2 <= c.x1 + 0.2 && b.z - b.d / 2 >= c.z0 - 0.2 && b.z + b.d / 2 <= c.z1 + 0.2,
            `${d.id} rot ${rot}: part inside the footprint`);
        }
        if (site.state === 'done') assert.ok(tris > 0 && tris >= last - 8 * 12, `${d.id}: the finished model is drawn`);
        last = tris;
      }
    }
  }
  assert.ok(worst > 0 && worst <= BUILDINGS_BUDGET.trianglesPerBuilding);
  void siteEntranceOf;
});

test('rendering budget: 32 finished buildings and 8 lit fires are 2 meshes under the buildings budget; flames only where there is fuel', () => {
  const view = new WildBuildingsView();
  const sites = new Map<string, WildSite>();
  const kinds = ['storage_shed', 'lean_to', 'log_store', 'campfire', 'workbench'];
  for (let i = 0; i < 32; i++) {
    const kind = kinds[i % kinds.length], d = buildingDef(kind)!;
    sites.set(`b:${i + 1}`, { ...at(kind, i % 4, d.stages.length, 0, d.function.kind === 'fire' ? { fuel: i % 2 ? 30 : 0 } : d.function.kind === 'storage' ? { stock: { log: 6 } } : {}), id: `b:${i + 1}`, x: (i % 8) * 6, z: Math.floor(i / 8) * 6 });
  }
  const world = { wild: { build: { sites, home: null, death: null } } } as unknown as World;
  view.sync(world);
  view.update(1);
  assert.equal(view.drawn.sites, 32);
  assert.ok(view.drawn.meshes <= BUILDINGS_BUDGET.meshes, `${view.drawn.meshes} meshes`);
  assert.equal(view.group.children.length, 2, 'one merged mesh and one instanced flame mesh');
  assert.ok(view.drawn.triangles <= BUILDINGS_BUDGET.triangles, `${view.drawn.triangles} triangles`);
  const lit = [...sites.values()].filter((x) => x.kind === 'campfire' && (x.fuel ?? 0) > 0).length;
  assert.equal(view.drawn.fires, Math.min(8, lit), 'flames only for fires with fuel');
  assert.ok(BUILDINGS_BUDGET.triangles + BUILDINGS_BUDGET.flameTriangles < SCENE_BUDGET.triangles / 10, 'the buildings are under a tenth of the scene budget');
  // A frame measurement is checked against the scene budget.
  assert.deepEqual(withinSceneBudget(119, 249_999).ok, true);
  assert.deepEqual(withinSceneBudget(121, 1000).ok, false);
  assert.deepEqual(withinSceneBudget(10, 250_001).ok, false);
  // Rebuilt only when a site changes.
  const rebuilds = view.drawn.rebuilds;
  view.sync(world);
  assert.equal(view.drawn.rebuilds, rebuilds);
});
