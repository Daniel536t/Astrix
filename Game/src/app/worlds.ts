// W1 world list. The browser keeps every world it has: the settlement world
// (its save key unchanged since M002) and any number of local wilderness
// worlds, each in its own save slot. Opening a world records it as the active
// one and reloads. Nothing here deletes or rewrites a save.
//
// Wilderness worlds are local only: no MagicBlock record, wallet or ownership.
import type { KeyValueStorage } from './persistence';
import { CURRENT_SAVE_SCHEMA, DESIGN_SAVE_SCHEMA, SAVE_SCHEMA, WORLD_ID, settlementSaveKey, wildernessSaveKey } from './persistence';
import { LATEST_GENERATOR_VERSION, isSupportedGenerator } from '../sim/world';
import { wildernessSpawn } from '../sim/wilderness';

export const WORLDS_KEY = 'astrix:worlds:v1';
export const ACTIVE_WORLD_KEY = 'astrix:world:active:v1';
/** W1 choice: every new wilderness world uses this seed (the curated terrain), on the latest generator. */
export const WILDERNESS_SEED = 1337;

export interface WildernessRecord {
  id: string;
  seed: number;
  generatorVersion: number;
  created: number;
  /** The deterministic spawn, recorded at creation so it never moves. */
  spawn: { x: number; z: number };
}

interface Registry { v: 1; worlds: WildernessRecord[] }

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function validRecord(r: unknown): r is WildernessRecord {
  if (typeof r !== 'object' || r === null) return false;
  const v = r as Record<string, unknown>;
  return typeof v.id === 'string' && WORLD_ID.test(v.id) && Number.isSafeInteger(v.seed) && (v.seed as number) >= 0 && (v.seed as number) <= 0xffffffff
    && isSupportedGenerator(v.generatorVersion) && finite(v.created)
    && typeof v.spawn === 'object' && v.spawn !== null && finite((v.spawn as { x: unknown }).x) && finite((v.spawn as { z: unknown }).z);
}

export class WorldRegistry {
  constructor(private readonly storage: KeyValueStorage | null) {}

  /** Wilderness worlds, oldest first. An unreadable registry reads as empty and is never overwritten by a read. */
  list(): WildernessRecord[] {
    try {
      const raw = this.storage?.getItem(WORLDS_KEY);
      if (!raw) return [];
      const v = JSON.parse(raw) as Partial<Registry> | null;
      if (!v || v.v !== 1 || !Array.isArray(v.worlds)) return [];
      return v.worlds.filter(validRecord).map((r) => ({ id: r.id, seed: r.seed, generatorVersion: r.generatorVersion, created: r.created, spawn: { x: r.spawn.x, z: r.spawn.z } }));
    } catch { return []; }
  }

  get(id: string): WildernessRecord | null { return this.list().find((r) => r.id === id) ?? null; }

  /** The world to open: a known wilderness id, else the settlement. */
  active(): WildernessRecord | null {
    let id: string | null = null;
    try { id = this.storage?.getItem(ACTIVE_WORLD_KEY) ?? null; } catch { id = null; }
    return id && id !== 'settlement' ? this.get(id) : null;
  }

  setActive(id: string | 'settlement'): void {
    if (id !== 'settlement' && !this.get(id)) throw new Error(`unknown world ${id}`);
    this.storage?.setItem(ACTIVE_WORLD_KEY, id);
  }

  /** Add a new wilderness world (its save is written on first play). Returns the record. */
  create(now = Date.now(), seed = WILDERNESS_SEED, generatorVersion = LATEST_GENERATOR_VERSION): WildernessRecord {
    if (!this.storage) throw new Error('local storage is unavailable');
    let raw: string | null = this.storage.getItem(WORLDS_KEY);
    if (raw) {
      // Never replace a registry this code cannot read: keep its bytes beside the new one.
      try { const v = JSON.parse(raw); if (!v || v.v !== 1 || !Array.isArray(v.worlds)) throw new Error('unreadable'); }
      catch { this.storage.setItem(`${WORLDS_KEY}:unreadable:${now}`, raw); raw = null; }
    }
    const worlds = this.list();
    const n = worlds.reduce((m, r) => Math.max(m, Number(r.id.slice(1))), 0) + 1;
    const spawn = wildernessSpawn(seed, generatorVersion);
    const record: WildernessRecord = { id: `w${n}`, seed, generatorVersion, created: now, spawn: { x: spawn.x, z: spawn.z } };
    const next: Registry = { v: 1, worlds: [...worlds, record] };
    this.storage.setItem(WORLDS_KEY, JSON.stringify(next));
    return record;
  }

  /** True when a wilderness world has a save. */
  hasSave(r: WildernessRecord): boolean {
    try { return this.storage?.getItem(wildernessSaveKey(r.id, r.seed)) != null; } catch { return false; }
  }

  /** True when this browser has a settlement save for the seed (any save schema). */
  hasSettlement(seed: number): boolean {
    try {
      return [CURRENT_SAVE_SCHEMA, DESIGN_SAVE_SCHEMA, SAVE_SCHEMA].some((s) => this.storage?.getItem(settlementSaveKey(seed, s)) != null);
    } catch { return false; }
  }
}

export interface WorldListState {
  registry: WorldRegistry;
  /** Seed of the settlement world (as main.ts chooses it). */
  settlementSeed: number;
  /** The world open now: 'settlement' or a wilderness id. */
  current: string;
}

const date = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');

/** The "Your worlds" section (buttons carry data-world). */
export function worldListHtml(o: WorldListState): string {
  const wild = o.registry.list();
  const here = (id: string) => (o.current === id ? ' <span class="here">(open now)</span>' : '');
  const settlement = o.registry.hasSettlement(o.settlementSeed);
  const rows = [
    `<div class="world-row world-demo"><div><b>Founder’s Settlement</b> <span class="demo-badge">DEMO</span>${here('settlement')}<br><span class="hint">${settlement ? `guided demo settlement · preloaded starter kit (24 wood, 48 stone) · seed ${o.settlementSeed}` : 'guided demo settlement · preloaded starter kit (24 wood, 48 stone), farm &amp; villagers showcase'}</span></div>`
      + `<button data-world="settlement" class="${o.current === 'settlement' ? '' : 'primary'}">${settlement ? 'Continue demo' : 'Open demo'}</button></div>`,
    ...wild.map((r) => `<div class="world-row"><div><b>Wilderness ${r.id.slice(1)}</b>${here(r.id)}<br><span class="hint">local only · seed ${r.seed} · made ${date(r.created)}${o.registry.hasSave(r) ? '' : ' · not played yet'}</span></div>`
      + `<button data-world="${r.id}" class="primary">Continue wilderness</button></div>`),
    `<div class="world-row"><div><b>New wilderness world</b><br><span class="hint">start from nothing · bare hands, empty bag, untamed land. Kept on this device only; your other worlds stay as they are.</span></div>`
      + `<button data-world="new-wilderness" class="primary">New wilderness</button></div>`,
  ];
  return `<section class="world-list" aria-label="Your worlds"><h2>Your worlds</h2>${rows.join('')}</section>`;
}

/**
 * Act on a world-list button. Returns false when nothing needs to change (the
 * world is already open). Otherwise records the active world and reloads.
 */
export function openWorld(act: string, o: WorldListState, reload: () => void = () => location.reload()): boolean {
  let target: string;
  if (act === 'new-wilderness') target = o.registry.create().id;
  else if (act === 'settlement') target = 'settlement';
  else if (o.registry.get(act)) target = act;
  else return false;
  if (target === o.current) return false;
  o.registry.setActive(target);
  reload();
  return true;
}

/** A standalone world list (Settings → Worlds, ?worlds=1): the same rows, with a Close button. */
export function showWorldList(o: WorldListState, onClose?: () => void): HTMLElement {
  document.getElementById('enter-screen')?.remove();
  const el = document.createElement('div');
  el.id = 'enter-screen';
  el.className = 'worlds-only';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Your worlds');
  el.innerHTML = `<div class="enter-card"><h1>ASTrix</h1>${worldListHtml(o)}<div class="enter-secondary"><button data-close>Close</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) { el.remove(); onClose?.(); return; }
    const act = b.getAttribute('data-world');
    if (act && !openWorld(act, o)) { el.remove(); onClose?.(); }
  });
  return el;
}
