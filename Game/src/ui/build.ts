// M002 build sidebar + resource HUD.
//
// The panel is a view. It renders inspections produced by `app/projects.ts`
// and forwards two intents: select a project, or build the selected project.
// It never edits the world or spends resources itself.
import { M2Project, M2ProjectId, ProjectInspection } from '../app/projects';
import { SiteState } from '../sim/construction';

export interface BuildPanelCallbacks {
  onSelect: (id: M2ProjectId) => void;
  onBuild: () => void;
  onCancel: () => void;
}

export interface ProjectRow {
  project: M2Project;
  built: boolean;
  affordable: boolean;
  state: SiteState;
  canBuild: boolean;
}

const RESOURCES = [
  { id: 'wood', label: 'Wood' },
  { id: 'stone', label: 'Stone' },
  { id: 'ore', label: 'Ore' },
  { id: 'fiber', label: 'Fiber' },
] as const;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function stateLabel(state: SiteState, built: boolean): string {
  if (built) return 'Built';
  if (state === 'invalid') return 'Blocked';
  if (state === 'valid_with_preparation') return 'Prep required';
  return 'Ready';
}

function stateClass(state: SiteState, built: boolean): string {
  if (built) return 'state-built';
  if (state === 'invalid') return 'state-invalid';
  if (state === 'valid_with_preparation') return 'state-prep';
  return 'state-valid';
}

function costChips(cost: Partial<Record<string, number>>): HTMLElement {
  const wrap = element('span', 'cost-chips');
  const keys = Object.keys(cost).sort();
  for (const key of keys) {
    const amount = cost[key] ?? 0;
    const chip = element('span', `cost-chip cost-${key}`);
    chip.append(element('i', 'cost-dot'), element('span', undefined, `${amount} ${key}`));
    wrap.append(chip);
  }
  return wrap;
}

export class BuildPanel {
  private root: HTMLElement;
  private inventoryEl: HTMLElement;
  private cardsEl: HTMLElement;
  private detailEl: HTMLElement;
  private toastEl: HTMLElement;
  private inventoryValues = new Map<string, HTMLElement>();
  private selected: M2ProjectId | null = null;
  private busy = false;
  private toastTimer: number | null = null;

  constructor(private callbacks: BuildPanelCallbacks) {
    this.inventoryEl = element('div');
    this.inventoryEl.id = 'inventory';
    this.inventoryEl.setAttribute('aria-label', 'Resources');
    const invTitle = element('div', 'inv-title', 'Resources');
    const invRow = element('div', 'inv-row');
    for (const resource of RESOURCES) {
      const item = element('div', 'inv-item');
      item.dataset.resource = resource.id;
      item.append(
        element('i', `inv-dot inv-${resource.id}`),
        element('span', 'inv-label', resource.label),
      );
      const value = element('strong', 'inv-value', '0');
      item.append(value);
      this.inventoryValues.set(resource.id, value);
      invRow.append(item);
    }
    this.inventoryEl.append(invTitle, invRow);

    this.root = element('aside');
    this.root.id = 'build-panel';
    this.root.setAttribute('aria-label', 'Build');

    const header = element('header', 'build-head');
    const heading = element('div');
    heading.append(
      element('span', 'eyebrow', 'Milestone 2 · first structures'),
      element('strong', undefined, 'Build the founder’s slice'),
    );
    header.append(heading);

    const lead = element('p', 'build-lead',
      'Choose a site, inspect the ghost, then prepare the ground and build. '
      + 'Every cost is paid from the inventory; cleared trees and boulders are gathered.');

    this.cardsEl = element('div', 'build-cards');

    this.detailEl = element('section', 'build-detail');
    this.detailEl.hidden = true;

    this.root.append(header, lead, this.cardsEl, this.detailEl);

    this.toastEl = element('div', 'toast');
    this.toastEl.id = 'toast';
    this.toastEl.setAttribute('role', 'status');
    this.toastEl.setAttribute('aria-live', 'polite');

    document.body.append(this.inventoryEl, this.root, this.toastEl);
  }

  setInventory(inventory: Record<string, number>): void {
    for (const resource of RESOURCES) {
      const value = this.inventoryValues.get(resource.id);
      if (!value) continue;
      const amount = inventory[resource.id] ?? 0;
      value.textContent = String(amount);
      const item = value.parentElement;
      item?.classList.toggle('is-zero', amount <= 0);
    }
  }

  renderProjects(rows: readonly ProjectRow[]): void {
    this.cardsEl.replaceChildren();
    for (const row of rows) {
      const card = element('button', 'build-card');
      card.type = 'button';
      card.dataset.project = row.project.id;
      card.setAttribute('aria-pressed', String(this.selected === row.project.id));
      if (this.selected === row.project.id) card.classList.add('is-selected');
      if (row.built) card.classList.add('is-built');
      if (!row.canBuild && !row.built) card.classList.add('is-unavailable');

      const badge = element('span', `build-icon icon-${row.project.id}`,
        row.project.id === 'house' ? 'H' : row.project.id === 'path' ? 'P' : 'F');
      const body = element('span', 'build-card-body');
      body.append(
        element('strong', undefined, row.project.name),
        element('span', 'build-card-sub', row.project.subtitle),
        costChips(row.project.cost),
      );
      const status = element('span', `build-state ${stateClass(row.state, row.built)}`,
        stateLabel(row.state, row.built));
      card.append(badge, body, status);
      card.addEventListener('click', () => this.callbacks.onSelect(row.project.id));
      this.cardsEl.append(card);
    }
  }

  renderDetail(project: M2Project, inspection: ProjectInspection): void {
    this.selected = project.id;
    this.detailEl.hidden = false;
    this.detailEl.replaceChildren();

    const head = element('div', 'detail-head');
    const title = element('div');
    title.append(
      element('span', 'eyebrow', `Site · ${project.siteId}`),
      element('strong', undefined, project.name),
    );
    head.append(title, element('span', `build-state ${stateClass(inspection.state, inspection.built)}`,
      stateLabel(inspection.state, inspection.built)));

    const description = element('p', 'detail-desc', project.description);

    const facts = element('dl', 'detail-facts');
    const addFact = (label: string, value: Node | string) => {
      const row = element('div');
      row.append(element('dt', undefined, label), element('dd', undefined, typeof value === 'string' ? value : undefined));
      if (typeof value !== 'string') row.lastElementChild?.append(value);
      facts.append(row);
    };

    const width = project.rect.x1 - project.rect.x0 + 1;
    const depth = project.rect.z1 - project.rect.z0 + 1;
    addFact('Footprint', `${width} × ${depth} m · floor y ${project.floorY}`);
    addFact('Terrain', `${inspection.preview.terrain.relief} m relief · `
      + `${inspection.preview.obstructions.length} obstruction`
      + `${inspection.preview.obstructions.length === 1 ? '' : 's'}`);

    if (inspection.plan.ok) {
      const work = inspection.plan.plan.expected;
      const edits = work.cutVolume + work.fillVolume + work.surfaceEdits;
      addFact('Work', edits === 0
        ? 'none — prepared and clear'
        : `${work.cutVolume} cut · ${work.fillVolume} fill · ${work.surfaceEdits} surface`
          + `${work.obstructions > 0 ? ` · ${work.obstructions} cleared` : ''}`);
    } else {
      addFact('Work', 'blocked — see notes');
    }
    addFact('Cost', costChips(project.cost));

    const reasons = element('ul', 'detail-reasons');
    const addReason = (text: string, kind = '') => {
      const item = element('li', kind, text);
      item.title = text;
      reasons.append(item);
    };

    if (inspection.built) {
      addReason('Built through the authorized preparation and structure pipeline.', 'good');
    } else if (!inspection.plan.ok) {
      for (const reason of inspection.plan.reasons.slice(0, 4)) addReason(reason, 'bad');
    } else {
      const errors = inspection.reasons.filter((r) => r.severity === 'error');
      if (errors.length > 0) {
        for (const reason of errors.slice(0, 4)) addReason(reason.message, 'bad');
      }
      for (const missing of inspection.missing) {
        addReason(`Need ${missing.need - missing.have} more ${missing.resource} `
          + `(${missing.have}/${missing.need}).`, 'warn');
      }
      if (inspection.preview.access && !inspection.preview.access.walkable) {
        addReason('The door approach is not walkable.', 'warn');
      }
      const prep = inspection.reasons.filter((r) => r.severity === 'preparation');
      if (inspection.plan.ok && prep.length > 0) {
        for (const reason of prep.slice(0, 3)) addReason(reason.message, 'warn');
      }
      if (inspection.canBuild && errors.length === 0 && inspection.missing.length === 0) {
        addReason(inspection.state === 'valid_with_preparation'
          ? 'The site is valid; preparation will grade it before construction.'
          : 'The site is flat, dry and clear.', 'good');
      }
    }

    const actions = element('div', 'detail-actions');
    const build = element('button', 'btn-build');
    build.type = 'button';
    build.disabled = this.busy || !inspection.canBuild;
    build.textContent = inspection.built
      ? 'Built'
      : inspection.canBuild
        ? inspection.state === 'valid_with_preparation' ? 'Prepare & build' : 'Build'
        : inspection.affordable ? 'Site blocked' : 'Not enough resources';
    build.addEventListener('click', () => this.callbacks.onBuild());

    const cancel = element('button', 'btn-cancel', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => this.callbacks.onCancel());
    actions.append(build, cancel);

    this.detailEl.append(head, description, facts, reasons, actions);
  }

  hideDetail(): void {
    this.selected = null;
    this.detailEl.hidden = true;
    this.detailEl.replaceChildren();
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.root.classList.toggle('is-busy', busy);
    const button = this.detailEl.querySelector<HTMLButtonElement>('.btn-build');
    if (button && busy) button.disabled = true;
  }

  toast(message: string, kind: 'good' | 'warn' | 'bad' = 'good'): void {
    this.toastEl.textContent = message;
    this.toastEl.className = `toast show ${kind}`;
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.className = 'toast';
      this.toastTimer = null;
    }, 4600);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    this.inventoryEl.hidden = !visible;
  }

  get selectedProject(): M2ProjectId | null {
    return this.selected;
  }

  get isBusy(): boolean {
    return this.busy;
  }
}
