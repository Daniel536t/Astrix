// Small DOM harness: the project intentionally has no browser-DOM dependency.
// It implements only the APIs used by LifePanel; event dispatch is synchronous.
import assert from 'node:assert/strict';
import test from 'node:test';
import { LifePanel, LifeIntent } from '../src/ui/life';
import {
  CROP_PLOT_IDS, FOUNDER_STOCKPILE_ID, MAX_PRODUCTION_JOBS,
} from '../src/sim/economy';
import { GameSession } from '../src/app/session';
import { canonicalWorldHash } from '../src/sim/snapshot';

class FakeClassList {
  constructor(private readonly node: FakeElement) {}
  toggle(name: string, force?: boolean): boolean {
    const names = new Set(this.node.className.split(/\s+/).filter(Boolean));
    const enabled = force ?? !names.has(name);
    if (enabled) names.add(name);
    else names.delete(name);
    this.node.className = [...names].join(' ');
    return enabled;
  }
}

type FakeListener = () => void;
class FakeElement {
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly parentElement: FakeElement | null = null;
  readonly classList = new FakeClassList(this);
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, FakeListener[]>();
  private _className = '';

  disabled = false;
  hidden = false;
  required = false;
  type = '';
  name = '';
  min = '';
  step = '';
  value = '';
  htmlFor = '';
  textContent = '';

  get className(): string { return this._className; }
  set className(value: string) {
    this._className = value;
    this.attributes.set('class', value);
  }

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
    if (this.tagName === 'SELECT') this.value = 'fiber';
  }

  private get idValue(): string { return this.attributes.get('id') ?? ''; }
  private set idValue(value: string) { this.attributes.set('id', value); }
  get id(): string { return this.idValue; }
  set id(value: string) { this.idValue = value; }

  append(...nodes: (FakeElement | string)[]): void {
    for (const child of nodes) {
      if (typeof child === 'string') this.textContent += child;
      else {
        Object.defineProperty(child, 'parentElement', { value: this });
        this.children.push(child);
      }
    }
  }

  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  removeAttribute(name: string): void { this.attributes.delete(name); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  setCustomValidity(message: string): void { this.attributes.set('data-validity', message); }
  addEventListener(type: string, listener: FakeListener): void {
    this.listeners.set(type, [...this.listeners.get(type) ?? [], listener]);
  }
  click(): void {
    if (!this.disabled) for (const listener of this.listeners.get('click') ?? []) listener();
  }

  private descendants(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
  private matches(selector: string): boolean {
    const tag = selector.match(/^[a-z]+(?=[.#[]|$)/i)?.[0];
    if (tag && tag.toUpperCase() !== this.tagName) return false;
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    const data = [...selector.matchAll(/\[data-([a-z-]+)(?:="([^"]*)")?\]/g)];
    if (data.length > 0) {
      return data.every((match) => {
        const key = match[1].replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
        return key in this.dataset && (match[2] === undefined || this.dataset[key] === match[2]);
      });
    }
    return tag !== undefined;
  }
  querySelector<T = FakeElement>(selector: string): T | null {
    for (const node of this.descendants()) {
      if (node.matches(selector)) return node as T;
      const scoped = node.querySelector<T>(selector);
      if (scoped) return scoped;
    }
    return null;
  }
  querySelectorAll<T = FakeElement>(selector: string): T[] {
    return this.descendants().filter((node) => node.matches(selector)) as T[];
  }
  get text(): string {
    return this.textContent + this.children.map((child) => child.text).join('');
  }
}

class FakeDocument {
  readonly body = new FakeElement('body');
  createElement(tag: string): FakeElement { return new FakeElement(tag); }
  querySelector<T = FakeElement>(selector: string): T | null {
    if (this.body.matches(selector)) return this.body as T;
    return this.body.querySelector<T>(selector);
  }
}

const documentHarness = new FakeDocument();
Object.assign(globalThis, { document: documentHarness });

function query(selector: string): FakeElement {
  const node = documentHarness.querySelector(selector);
  assert.ok(node, `missing ${selector}`);
  return node;
}
function panelWithWorld(): { panel: LifePanel; world: ReturnType<typeof GameSession.genesis>['world']; intents: LifeIntent[] } {
  const world = GameSession.genesis().world;
  const intents: LifeIntent[] = [];
  const panel = new LifePanel({ onIntent: (intent) => intents.push(intent) });
  panel.render(world);
  return { panel, world, intents };
}
function bagValue(bag: 'carried' | 'stockpile', resource: string): string {
  return query(`[data-bag="${bag}"]`).querySelector(`dd[data-resource="${resource}"]`)!.textContent;
}

test('life panel emits one-resource transfer, production, tick and crop intents', () => {
  documentHarness.body = new FakeElement('body');  const { panel, world, intents } = panelWithWorld();
  panel.setVisible(true);
  assert.equal(query('#life-panel').hidden, false);
  assert.equal(query('#life-panel').getAttribute('aria-label'), 'Settlement');
  assert.equal(query('[data-action="deposit"][data-amount="deposit"]').disabled, false);
  query('[data-action="deposit"]').click();
  query('[data-action="withdraw"]').click();
  assert.deepEqual(intents, [
    { type: 'deposit', resource: 'fiber', amount: 2 },
    { type: 'withdraw', resource: 'food', amount: 2 },
  ]);

  const stock = world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory;
  stock.fiber = 2;
  stock.food = 2;
  panel.render(world);
  query('[data-action="produce"][data-recipe="seed"]').click();
  query('[data-action="tick"][data-ticks="1"]').click();
  query('[data-action="tick"][data-ticks="4"]').click();
  assert.deepEqual(intents.slice(2), [
    { type: 'produce', recipe: 'seed' }, { type: 'tick', ticks: 1 }, { type: 'tick', ticks: 4 },
  ]);
});

test('invalid and non-integral transfer amounts emit no intent', () => {
  documentHarness.body = new FakeElement('body');  const { panel, intents } = panelWithWorld();
  const input = query('[data-action="deposit"][data-amount="deposit"]');
  const amountInput = query('#life-deposit-amount');
  assert.equal(input.tagName, 'BUTTON');
  for (const value of ['0', '-1', '1.5', '', '1e309']) {
    amountInput.value = value;
    query('[data-action="deposit"]').click();
  }
  assert.deepEqual(intents, []);
  assert.equal(amountInput.getAttribute('aria-invalid'), 'true');
  assert.match(amountInput.getAttribute('data-validity')!, /positive whole-number/);
});

test('render reads quantities and capacities without mutating the authoritative world', () => {
  documentHarness.body = new FakeElement('body');  const { panel, world } = panelWithWorld();
  world.inventory = { fiber: 5, food: 2 };
  const stock = world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory;
  stock.wood = 17;
  stock.seed = 2;
  const before = canonicalWorldHash(world, 0, 3);
  panel.render(world);
  query('[data-action="deposit"]').click();
  assert.equal(canonicalWorldHash(world, 0, 3), before);
  assert.equal(bagValue('carried', 'fiber'), '5');
  assert.equal(bagValue('carried', 'ore'), '0');
  assert.equal(bagValue('stockpile', 'wood'), '17');
  assert.equal(query('[data-capacity="carried"]').textContent, '7 / 120');
  assert.equal(query('[data-capacity="stockpile"]').textContent, '19 / 200');
});

test('crop controls track empty, growing and ready plots and farm availability', () => {
  documentHarness.body = new FakeElement('body');  const { panel, world, intents } = panelWithWorld();
  const plot = query('[data-plot="crop:0"]');
  assert.equal(plot.disabled, true);
  assert.match(query('[data-farm]').textContent, /Farm missing/);
  world.structures.set('test-farm', {
    id: 'test-farm', kind: 'terrace', siteId: 'site:farm', x: 0, y: 0, z: 0,
    rot: 0, modules: [], cost: {}, builtRevision: 0, provisional: true,
  });
  world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory.seed = 1;
  panel.render(world);
  assert.equal(plot.disabled, false);
  assert.equal(plot.textContent, 'Plant 1 seed');
  plot.click();
  assert.deepEqual(intents, [{ type: 'plant', plotId: 'crop:0' }]);

  world.life!.crops.set('crop:0', { id: 'crop:0', plantedTick: 0, growthTicks: 4 });
  world.life!.tick = 1;
  panel.render(world);
  assert.equal(plot.textContent, 'Growing 3/4 ticks');
  assert.equal(plot.disabled, true);
  plot.click();
  assert.equal(intents.length, 1);

  world.life!.tick = 4;
  panel.render(world);
  assert.equal(plot.textContent, 'Harvest crop');
  assert.equal(plot.dataset.action, 'harvest_crop');
  assert.equal(plot.disabled, false);
  plot.click();
  assert.deepEqual(intents[1], { type: 'harvest_crop', plotId: 'crop:0' });
  assert.equal(CROP_PLOT_IDS.length, 9);
  for (const id of CROP_PLOT_IDS) assert.ok(query(`[data-plot="${id}"]`));
});

test('processing disablement and legacy rendering are derived from life state', () => {
  documentHarness.body = new FakeElement('body');  const { panel, world } = panelWithWorld();
  assert.equal(query('[data-recipe="seed"]').disabled, true);
  assert.equal(query('[data-recipe="rations"]').disabled, true);
  world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory.fiber = 2;
  panel.render(world);
  assert.equal(query('[data-recipe="seed"]').disabled, false);
  for (let i = 0; i < MAX_PRODUCTION_JOBS; i++) {
    world.life!.jobs.set(`job:${i}`, {
      id: `job:${i}`, stockpileId: FOUNDER_STOCKPILE_ID, recipe: 'seed', remainingTicks: 1,
    });
  }
  panel.render(world);
  assert.equal(query('[data-recipe="seed"]').disabled, true);
  assert.equal(query('[data-jobs]').textContent, '16 / 16 active jobs');

  const legacyWorld = GameSession.genesis().world;
  delete legacyWorld.life;
  panel.render(legacyWorld);
  assert.equal(bagValue('carried', 'fiber'), 'Unavailable');
  assert.match(query('#life-panel').text, /unavailable in this legacy world/);
  for (const action of documentHarness.body.querySelectorAll('[data-action]')) {
    assert.equal(action.disabled, true, action.dataset.action);
  }
});

test('toast is independent of panel visibility and supports its optional callback', () => {
  documentHarness.body = new FakeElement('body');
  const messages: [string, string][] = [];
  const panel = new LifePanel({
    onIntent: () => {}, onToast: (message, kind) => messages.push([message, kind]),
  });
  panel.setVisible(false);
  panel.toast('Saved', 'good');
  assert.equal(query('#life-panel').hidden, true);
  assert.equal(query('#life-toast').hidden, false);
  assert.equal(query('#life-toast').getAttribute('role'), 'status');
  assert.equal(query('#life-toast').textContent, 'Saved');
  assert.deepEqual(messages, [['Saved', 'good']]);
});
