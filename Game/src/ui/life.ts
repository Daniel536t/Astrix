// Render-only settlement life panel. The session owns every state transition;
// these controls only emit intents and render the latest authoritative world.
import {
  CARRIED_CAPACITY, CROP_PLOT_IDS, FOUNDER_STOCKPILE_ID, LIFE_RESOURCES,
  LifeResource, MAX_PRODUCTION_JOBS, RECIPES, RecipeId, STOCKPILE_CAPACITY,
  cropReady,
} from '../sim/economy';
import type { World } from '../sim/world';

export type LifeIntent =
  | { type: 'deposit' | 'withdraw'; resource: LifeResource; amount: number }
  | { type: 'produce'; recipe: RecipeId }
  | { type: 'tick'; ticks: number }
  | { type: 'plant' | 'harvest_crop'; plotId: string };

export interface LifePanelCallbacks {
  onIntent(intent: LifeIntent): void;
  onToast?(message: string, kind: 'good' | 'warn' | 'bad'): void;
}

interface TransferControls {
  select: HTMLSelectElement;
  input: HTMLInputElement;
  button: HTMLButtonElement;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text: string, action: string): HTMLButtonElement {
  const node = element('button', undefined, text);
  node.type = 'button';
  node.dataset.action = action;
  return node;
}

export class LifePanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly transferControls = new Map<'deposit' | 'withdraw', TransferControls>();
  private readonly carriedValues = new Map<LifeResource, HTMLElement>();
  private readonly stockValues = new Map<LifeResource, HTMLElement>();
  private readonly produceButtons = new Map<RecipeId, HTMLButtonElement>();
  private readonly cropButtons = new Map<string, HTMLButtonElement>();
  private readonly tickButtons: HTMLButtonElement[] = [];
  private carriedCapacity!: HTMLElement;
  private stockCapacity!: HTMLElement;
  private jobs!: HTMLElement;
  private tick!: HTMLElement;
  private farmStatus!: HTMLElement;

  constructor(private readonly callbacks: LifePanelCallbacks) {
    this.root = element('section', 'life-panel');
    this.root.id = 'life-panel';
    this.root.setAttribute('aria-label', 'Settlement');
    // World mode owns the panel by default; clean mode hides it explicitly.
    this.root.hidden = false;

    const header = element('header', 'life-head');
    header.append(element('h2', undefined, 'Settlement'));
    this.root.append(header);

    this.body = element('div', 'life-body');
    const unavailable = element('p', 'life-unavailable',
      'Settlement life is unavailable in this legacy world.');
    this.body.append(unavailable, this.makeBagSection('carried', 'Gathered · carried bag',
      CARRIED_CAPACITY, this.carriedValues), this.makeBagSection('stockpile', 'Founder stockpile',
      STOCKPILE_CAPACITY, this.stockValues), this.makeTransfers(), this.makeProduction(),
      this.makeCrops());
    this.root.append(this.body);

    this.toastEl = element('div', 'life-toast');
    this.toastEl.id = 'life-toast';
    this.toastEl.setAttribute('role', 'status');
    this.toastEl.setAttribute('aria-live', 'polite');
    this.toastEl.hidden = true;

    document.body.append(this.root, this.toastEl);
  }

  private makeBagSection(
    id: 'carried' | 'stockpile', title: string, capacity: number,
    values: Map<LifeResource, HTMLElement>,
  ): HTMLElement {
    const section = element('section', `life-bag life-${id}`);
    section.dataset.bag = id;
    section.setAttribute('aria-label', title);
    const heading = element('h3', undefined, title);
    const total = element('strong', 'life-capacity', `0 / ${capacity}`);
    total.dataset.capacity = id;
    if (id === 'carried') this.carriedCapacity = total;
    else this.stockCapacity = total;
    heading.append(total);
    section.append(heading);
    const list = element('dl', 'life-resources');
    for (const resource of LIFE_RESOURCES) {
      const value = element('dd', 'life-resource-value', '0');
      value.dataset.resource = resource;
      values.set(resource, value);
      const label = element('dt', undefined, resource);
      const row = element('div', 'life-resource');
      row.dataset.resource = resource;
      row.append(label, value);
      list.append(row);
    }
    section.append(list);
    return section;
  }

  private makeTransfers(): HTMLElement {
    const section = element('section', 'life-transfers');
    section.setAttribute('aria-label', 'Move resources');
    section.append(element('h3', undefined, 'Move resources'));
    section.append(this.makeTransfer('deposit', 'fiber'));
    section.append(this.makeTransfer('withdraw', 'food'));
    return section;
  }

  private makeTransfer(type: 'deposit' | 'withdraw', defaultResource: LifeResource): HTMLElement {
    const row = element('div', `life-transfer life-${type}`);
    row.dataset.transfer = type;
    const title = type === 'deposit' ? 'Deposit to stockpile' : 'Withdraw to bag';
    row.setAttribute('aria-label', title);
    const id = `life-${type}`;
    const resourceLabel = element('label', undefined, `${title} resource`);
    resourceLabel.htmlFor = `${id}-resource`;
    const select = element('select');
    select.id = `${id}-resource`;
    select.name = `${type}-resource`;
    select.dataset.resource = type;
    select.setAttribute('aria-label', `${title} resource`);
    for (const resource of LIFE_RESOURCES) {
      const option = element('option', undefined, resource);
      option.value = resource;
      select.append(option);
    }
    select.value = defaultResource;
    resourceLabel.append(select);

    const amountLabel = element('label', undefined, 'Amount');
    amountLabel.htmlFor = `${id}-amount`;
    const input = element('input');
    input.id = `${id}-amount`;
    input.name = `${type}-amount`;
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.required = true;
    input.value = '2';
    input.dataset.amount = type;
    amountLabel.append(input);

    const action = button(type === 'deposit' ? 'Deposit' : 'Withdraw', type);
    action.dataset.resource = type;
    action.dataset.amount = type;
    action.disabled = true;
    action.addEventListener('click', () => {
      const resource = select.value as LifeResource;
      const raw = input.value.trim();
      const amount = Number(raw);
      if (!LIFE_RESOURCES.includes(resource) || raw === ''
        || !Number.isSafeInteger(amount) || amount <= 0) {
        input.setCustomValidity('Enter a positive whole-number amount.');
        input.setAttribute('aria-invalid', 'true');
        return;
      }
      input.setCustomValidity('');
      input.removeAttribute('aria-invalid');
      this.callbacks.onIntent({ type, resource, amount });
    });
    input.addEventListener('input', () => {
      input.setCustomValidity('');
      input.removeAttribute('aria-invalid');
    });
    select.addEventListener('change', () => {
      action.dataset.resource = select.value;
    });

    this.transferControls.set(type, { select, input, button: action });
    row.append(resourceLabel, amountLabel, action);
    return row;
  }

  private makeProduction(): HTMLElement {
    const section = element('section', 'life-production');
    section.setAttribute('aria-label', 'Processing and ticks');
    section.append(element('h3', undefined, 'Processing'));
    this.jobs = element('p', 'life-jobs');
    this.jobs.dataset.jobs = '';
    this.tick = element('p', 'life-tick');
    this.tick.dataset.tick = '';
    section.append(this.jobs, this.tick);

    for (const recipeId of ['seed', 'rations'] as const) {
      const recipe = RECIPES[recipeId];
      const [input, inputAmount] = Object.entries(recipe.input)[0];
      const [output, outputAmount] = Object.entries(recipe.output)[0];
      const action = button(
        `Make ${recipeId}: ${inputAmount} ${input} → ${outputAmount} ${output} · ${recipe.ticks} ${recipe.ticks === 1 ? 'tick' : 'ticks'}`,
        'produce',
      );
      action.dataset.recipe = recipeId;
      action.disabled = true;
      action.addEventListener('click', () => {
        this.callbacks.onIntent({ type: 'produce', recipe: recipeId });
      });
      this.produceButtons.set(recipeId, action);
      section.append(action);
    }

    for (const ticks of [1, 4]) {
      const action = button(`+${ticks} ${ticks === 1 ? 'tick' : 'ticks'}`, 'tick');
      action.dataset.ticks = String(ticks);
      action.disabled = true;
      action.addEventListener('click', () => this.callbacks.onIntent({ type: 'tick', ticks }));
      this.tickButtons.push(action);
      section.append(action);
    }
    return section;
  }

  private makeCrops(): HTMLElement {
    const section = element('section', 'life-crops');
    section.setAttribute('aria-label', 'Terraced farm crops');
    section.append(element('h3', undefined, 'Terraced farm crops'));
    this.farmStatus = element('p', 'life-farm-status');
    this.farmStatus.dataset.farm = '';
    section.append(this.farmStatus);
    const plots = element('div', 'life-plots');
    for (const plotId of CROP_PLOT_IDS) {
      const action = button('Plant 1 seed', 'plant');
      action.dataset.plot = plotId;
      action.dataset.action = 'plant';
      action.disabled = true;
      action.addEventListener('click', () => {
        this.callbacks.onIntent({
          type: action.dataset.action === 'harvest_crop' ? 'harvest_crop' : 'plant', plotId,
        });
      });
      this.cropButtons.set(plotId, action);
      plots.append(action);
    }
    section.append(plots);
    return section;
  }

  render(world: World): void {
    const life = world.life;
    this.body.dataset.available = String(Boolean(life));
    this.root.classList.toggle('is-legacy', !life);
    const unavailable = this.body.querySelector<HTMLElement>('.life-unavailable');
    if (unavailable) unavailable.hidden = Boolean(life);

    const carriedValues: Record<string, number | null> = {};
    const stockValues: Record<string, number | null> = {};
    if (life) {
      const stock = life.stockpiles.get(FOUNDER_STOCKPILE_ID);
      const inventory = stock?.inventory ?? {};
      for (const resource of LIFE_RESOURCES) {
        carriedValues[resource] = world.inventory[resource] ?? 0;
        stockValues[resource] = stock ? inventory[resource] ?? 0 : null;
      }
      this.carriedCapacity.textContent = `${Object.values(world.inventory).reduce((sum, n) => sum + n, 0)} / ${CARRIED_CAPACITY}`;
      this.stockCapacity.textContent = stock
        ? `${Object.values(inventory).reduce((sum, n) => sum + n, 0)} / ${STOCKPILE_CAPACITY}`
        : 'Unavailable';
      this.jobs.textContent = `${life.jobs.size} / ${MAX_PRODUCTION_JOBS} active jobs`;
      this.tick.textContent = `Settlement tick ${life.tick}`;
      const hasFarm = [...world.structures.values()].some((structure) => structure.kind === 'terrace');
      this.farmStatus.textContent = hasFarm ? 'Founder terraced farm · 9 plots' : 'Farm missing';
      this.farmStatus.dataset.farm = hasFarm ? 'present' : 'missing';

      for (const [recipeId, action] of this.produceButtons) {
        const enoughInput = Object.entries(RECIPES[recipeId].input)
          .every(([resource, amount]) => (inventory[resource] ?? 0) >= (amount ?? 0));
        action.disabled = !stock || life.jobs.size >= MAX_PRODUCTION_JOBS || !enoughInput;
      }
      for (const action of this.tickButtons) action.disabled = false;
      for (const plotId of CROP_PLOT_IDS) {
        const action = this.cropButtons.get(plotId)!;
        const crop = life.crops.get(plotId);
        if (!crop) {
          action.dataset.action = 'plant';
          action.textContent = 'Plant 1 seed';
          action.disabled = !hasFarm || (inventory.seed ?? 0) < 1;
        } else if (cropReady(crop, life.tick)) {
          action.dataset.action = 'harvest_crop';
          action.textContent = 'Harvest crop';
          action.disabled = false;
        } else {
          action.dataset.action = 'plant';
          const remaining = Math.max(0, crop.plantedTick + crop.growthTicks - life.tick);
          action.textContent = `Growing ${remaining}/${crop.growthTicks} ticks`;
          action.disabled = true;
        }
      }
    } else {
      this.carriedCapacity.textContent = `Unavailable / ${CARRIED_CAPACITY}`;
      this.stockCapacity.textContent = `Unavailable / ${STOCKPILE_CAPACITY}`;
      this.jobs.textContent = 'Jobs unavailable';
      this.tick.textContent = 'Settlement tick unavailable';
      this.farmStatus.textContent = 'Farm missing · settlement life unavailable';
      this.farmStatus.dataset.farm = 'missing';
      for (const action of this.produceButtons.values()) action.disabled = true;
      for (const action of this.tickButtons) action.disabled = true;
      for (const plotId of CROP_PLOT_IDS) {
        const action = this.cropButtons.get(plotId)!;
        action.dataset.action = 'plant';
        action.textContent = 'Plant 1 seed';
        action.disabled = true;
      }
    }

    for (const resource of LIFE_RESOURCES) {
      const carried = this.carriedValues.get(resource)!;
      const stock = this.stockValues.get(resource)!;
      carried.textContent = !life ? 'Unavailable' : String(carriedValues[resource] ?? 0);
      stock.textContent = !life || stockValues[resource] === null ? 'Unavailable' : String(stockValues[resource]);
      carried.dataset.value = !life ? 'unavailable' : String(carriedValues[resource] ?? 0);
      stock.dataset.value = !life || stockValues[resource] === null ? 'unavailable' : String(stockValues[resource]);
    }
    for (const controls of this.transferControls.values()) {
      controls.button.disabled = !life;
      controls.select.disabled = !life;
      controls.input.disabled = !life;
    }
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  toast(message: string, kind: 'good' | 'warn' | 'bad' = 'good'): void {
    this.toastEl.textContent = message;
    this.toastEl.className = `life-toast show ${kind}`;
    this.toastEl.hidden = false;
    this.callbacks.onToast?.(message, kind);
  }
}
