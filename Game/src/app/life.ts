// Playable schema-3 life loop. Every write is a GameSession command; the UI,
// meshes and persistence are derived from the resulting authoritative world.
import * as THREE from 'three';
import { CROP_YIELD_LABEL, FOUNDER_STOCKPILE_ID, LifeResource, cropReady } from '../sim/economy';
import { World } from '../sim/world';
import { buildLifeMeshes, disposeLifeMeshes } from '../render/life';
import { LifeIntent, LifePanel } from '../ui/life';
import { BrowserSaveStore } from './persistence';
import { Command, GameSession } from './session';

export interface LifeGameOptions {
  session: GameSession;
  store: BrowserSaveStore;
  scene: THREE.Scene;
  toast: (message: string, kind: 'good' | 'warn' | 'bad') => void;
}

/** A snapshot for the read-only browser evidence surface, never a write API. */
export function lifeMetrics(world: World): Record<string, unknown> | null {
  const life = world.life;
  if (!life) return null;
  const stock = life.stockpiles.get(FOUNDER_STOCKPILE_ID);
  return {
    tick: life.tick,
    stockpile: stock ? { ...stock, inventory: { ...stock.inventory } } : null,
    jobs: [...life.jobs.values()].map((job) => ({ ...job }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    crops: Array.from({ length: 9 }, (_, index) => {
      const id = `crop:${index}`;
      const crop = life.crops.get(id);
      return crop ? { ...crop, ready: cropReady(crop, life.tick) }
        : { id, plantedTick: null, growthTicks: null, ready: false };
    }),
  };
}

export class LifeGame {
  private readonly panel: LifePanel;
  private readonly meshes: THREE.Group;
  private lastRevision = -1;

  constructor(private readonly options: LifeGameOptions) {
    this.meshes = buildLifeMeshes(options.session.world);
    options.scene.add(this.meshes);
    this.lastRevision = options.session.world.revision;
    this.panel = new LifePanel({
      onIntent: (intent) => this.submit(intent),
    });
    this.panel.render(options.session.world);
  }

  private submit(intent: LifeIntent): void {
    const session = this.options.session;
    if (session.journal.schema !== 3) return;
    const target = intent.type === 'deposit' || intent.type === 'withdraw' ? intent.resource
      : intent.type === 'produce' ? intent.recipe
        : intent.type === 'tick' ? String(intent.ticks)
          : intent.type === 'plant' || intent.type === 'harvest_crop' ? intent.plotId : '';
    const base = {
      schema: 3 as const,
      id: session.commandId(intent.type, target),
      expectedRevision: session.world.revision,
    };
    let command: Command;
    if (intent.type === 'deposit' || intent.type === 'withdraw') {
      command = { ...base, type: intent.type, stockpileId: FOUNDER_STOCKPILE_ID,
        resources: { [intent.resource]: intent.amount } as Partial<Record<LifeResource, number>> };
    } else if (intent.type === 'produce') {
      command = { ...base, type: intent.type, stockpileId: FOUNDER_STOCKPILE_ID,
        recipe: intent.recipe };
    } else if (intent.type === 'tick') {
      command = { ...base, type: intent.type, ticks: intent.ticks };
    } else if (intent.type === 'plant' || intent.type === 'harvest_crop') {
      command = { ...base, type: intent.type, plotId: intent.plotId };
    } else {
      throw new Error('unsupported life intent');
    }
    const result = session.dispatch(command);
    if (!result.ok) {
      this.options.toast(`${intent.type.replace('_', ' ')}: ${result.reasons.join('; ')}`, 'bad');
      return;
    }
    let saved: { ok: boolean; message: string } | null = null;
    if (!result.duplicate) saved = this.options.store.save(session);
    const message = lifeMessage(intent) + (saved ? ` · ${saved.message}` : '');
    this.options.toast(message, saved?.ok === false ? 'bad' : 'good');
    // Rejected commands and duplicate receipts cannot refresh authoritative life.
    if (!result.duplicate) this.refresh();
  }

  refresh(): void {
    const world = this.options.session.world;
    // Rendering and controls consume committed revisions; avoid rebuilding a
    // full snapshot during every animation frame.
    if (world.revision === this.lastRevision) return;
    this.panel.render(world);
    const next = buildLifeMeshes(world);
    // The number of children grows when the farm is first built. Dispose the
    // committed overlay as a group rather than assuming matching child counts.
    disposeLifeMeshes(this.meshes);
    this.meshes.add(...next.children);
    disposeLifeMeshes(next);
    this.lastRevision = world.revision;
  }

  get inspectableRoot(): THREE.Group { return this.meshes; }

  setVisible(visible: boolean): void {
    this.panel.setVisible(visible);
    this.meshes.visible = visible || !document.body.classList.contains('clean');
  }
}

function lifeMessage(intent: LifeIntent): string {
  if (intent.type === 'deposit' || intent.type === 'withdraw') {
    return `${intent.type === 'deposit' ? 'Stored' : 'Collected'} ${intent.amount} ${intent.resource}`;
  }
  if (intent.type === 'produce') return `Started ${intent.recipe} production`;
  if (intent.type === 'tick') return `Advanced ${intent.ticks} simulation tick${intent.ticks === 1 ? '' : 's'}`;
  if (intent.type === 'plant' || intent.type === 'harvest_crop') {
    return intent.type === 'plant' ? `Planted ${intent.plotId}`
      : `Harvested ${intent.plotId}: ${CROP_YIELD_LABEL}`;
  }
  return '';
}
