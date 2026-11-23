// Direct-DOM, read-only inspection UI. Hover is not a live region: deliberate
// keyboard selection opens the labelled dialog without pointer-move chatter.
import { InspectionInfo } from '../app/inspection';
import type { InspectionTarget } from '../app/inspector';

export class InspectorPanel {
  readonly root: HTMLElement;
  readonly toggle: HTMLButtonElement;
  private readonly card: HTMLElement;
  private readonly list: HTMLElement;

  constructor(options: { onSelect: (key: string) => void; onDismiss: () => void }) {
    this.root = document.createElement('section');
    this.root.id = 'inspector';
    this.root.className = 'inspector';
    this.root.setAttribute('aria-label', 'Object inspector');
    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.id = 'inspect-toggle';
    this.toggle.className = 'inspect-toggle';
    this.toggle.textContent = 'Inspect';
    this.toggle.title = 'Choose an object by name, or hover / click / tap one in the world';
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.setAttribute('aria-controls', 'inspect-objects');
    this.toggle.addEventListener('click', () => this.setListVisible(this.list.hidden));

    this.card = document.createElement('article');
    this.card.id = 'inspect-card';
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-labelledby', 'inspect-name');
    this.card.setAttribute('aria-describedby', 'inspect-description');
    this.card.hidden = true;
    const head = document.createElement('div');
    head.className = 'inspect-head';
    const heading = document.createElement('div');
    const category = document.createElement('span');
    category.className = 'inspect-category';
    const title = document.createElement('h2');
    title.id = 'inspect-name';
    heading.append(category, title);
    const close = document.createElement('button');
    close.type = 'button';
    close.id = 'inspect-close';
    close.setAttribute('aria-label', 'Close object inspection');
    close.textContent = '×';
    close.hidden = true;
    head.append(heading, close);
    const description = document.createElement('p');
    description.id = 'inspect-description';
    const facts = document.createElement('dl');
    facts.className = 'inspect-facts';
    this.card.append(head, description, facts);
    this.show = (info, pinned, x = 0, y = 0) => {
      close.hidden = !pinned;
      close.onclick = pinned ? () => options.onDismiss() : null;
      this.card.hidden = false;
      this.card.classList.toggle('is-pinned', pinned);
      this.card.dataset.ref = info.key;
      this.card.dataset.mode = pinned ? 'pinned' : 'hover';
      category.textContent = info.category;
      title.textContent = info.name;
      description.textContent = info.description;
      facts.replaceChildren();
      for (const fact of info.facts) {
        const row = document.createElement('div');
        const label = document.createElement('dt');
        label.textContent = fact.label;
        const value = document.createElement('dd');
        value.textContent = fact.value;
        row.append(label, value);
        facts.append(row);
      }
      if (pinned) {
        this.card.style.removeProperty('left');
        this.card.style.removeProperty('top');
      } else {
        this.card.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 324))}px`;
        this.card.style.top = `${Math.max(8, Math.min(y, window.innerHeight - this.card.offsetHeight - 12))}px`;
      }
    };

    this.list = document.createElement('div');
    this.list.id = 'inspect-objects';
    this.list.className = 'inspect-list';
    this.list.hidden = true;
    const listTitle = document.createElement('span');
    listTitle.className = 'inspect-category';
    listTitle.id = 'inspect-list-title';
    listTitle.textContent = 'Named objects in this scene';
    this.list.setAttribute('role', 'group');
    this.list.setAttribute('aria-labelledby', 'inspect-list-title');
    const help = document.createElement('p');
    help.textContent = 'Names read from the current world. Inspection does not change or gather anything.';
    this.list.append(listTitle, help);
    this.renderList = (items) => {
      this.list.querySelectorAll('button[data-inspect-key]').forEach((button) => button.remove());
      for (const target of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.inspectKey = target.key;
        button.textContent = `${target.name} — ${target.category}`;
        button.addEventListener('click', () => options.onSelect(target.key));
        this.list.append(button);
      }
      this.list.dataset.count = String(items.length);
    };
    this.root.append(this.toggle, this.list, this.card);
    document.body.appendChild(this.root);
  }

  readonly show: (info: InspectionInfo, pinned: boolean, x?: number, y?: number) => void;
  readonly renderList: (items: InspectionTarget[]) => void;

  hideCard(restoreFocus = false): void {
    // Hiding a focused Close button moves focus in some browsers. Capture focus
    // ownership first so Escape/Close can reliably return to the world canvas.
    const hadInspectorFocus = this.root.contains(document.activeElement);
    this.card.hidden = true;
    this.card.removeAttribute('data-ref');
    this.card.removeAttribute('data-mode');
    this.card.style.removeProperty('left');
    this.card.style.removeProperty('top');
    if (restoreFocus && hadInspectorFocus) {
      document.querySelector<HTMLCanvasElement>('#app canvas')?.focus();
    }
  }

  setListVisible(visible: boolean): void {
    this.list.hidden = !visible;
    this.toggle.setAttribute('aria-expanded', String(visible));
    if (visible) this.hideCard();
  }

  setVisible(visible: boolean): void { this.root.hidden = !visible; }
  pinnedKey(): string | null {
    return this.card.hidden || this.card.dataset.mode !== 'pinned' ? null : this.card.dataset.ref ?? null;
  }
  isListVisible(): boolean { return !this.list.hidden; }
  focusCard(): void { this.card.querySelector<HTMLButtonElement>('button:not([hidden])')?.focus(); }
  focusList(): void { this.list.querySelector<HTMLButtonElement>('button')?.focus(); }
}
