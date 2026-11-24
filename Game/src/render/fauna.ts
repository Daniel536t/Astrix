// Render layer — living wildlife (ambient tier) over the sim fauna rules.
//
// FaunaView owns the ambient creature records for resident near chunks:
// spawned deterministically when a chunk loads, dropped when it unloads, and
// stepped at the fixed FAUNA_STEP rate. Each species is one instanced mesh
// with an animated rig (see animal-kit.ts), so a full near ring of wildlife
// costs five draw calls. Wildlife is presentation-tier: not saved or journaled.
import * as THREE from 'three';
import { World } from '../sim/world';
import { Creature, FAUNA_STEP, FaunaContext, SPECIES, spawnChunkFauna, stepCreature } from '../sim/fauna';
import { AnimalBatch } from './animal-kit';
import { ANIMAL_MODELS } from './animal-models';
import { Pose, blendPose, stepAlpha } from './smooth';

type Id = Creature['species'];
const CAP: Record<Id, number> = { deer: 48, rabbit: 48, trout: 160, fox: 24, wolf: 32 };
const IDS = Object.keys(CAP) as Id[];

/** Stable per-animal coin flip (antlers on stags, comb on cocks). */
function isMale(id: string): boolean {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return (h & 1) === 1;
}

export class FaunaView {
  readonly group = new THREE.Group();
  private creatures = new Map<string, Creature[]>();
  private phases = new Map<string, number>();
  /** Pose before the latest fixed step, so drawing can blend between steps (render only). */
  private prev = new Map<string, Pose>();
  private readonly shown: Pose = { x: 0, y: 0, z: 0, heading: 0 };
  /** Chunks whose creatures are spawned per frame; the rest wait for the next frame. */
  static readonly SPAWN_CHUNKS_PER_FRAME = 2;
  private accumulator = 0;
  /** True while sync() left chunks unspawned; the caller should sync again next frame. */
  pendingSpawn = false;
  private readonly batches = new Map<Id, AnimalBatch>();

  constructor(private readonly world: World) {
    this.group.name = 'fauna';
    for (const id of IDS) {
      const b = new AnimalBatch(ANIMAL_MODELS[id], CAP[id], `fauna_${id}`);
      this.batches.set(id, b);
      this.group.add(b.mesh);
    }
  }

  /** Reconcile creature records with the resident near-chunk set. */
  sync(loaded: ReadonlySet<string>): void {
    for (const [key, list] of [...this.creatures]) {
      if (loaded.has(key)) continue;
      for (const c of list) { this.phases.delete(c.id); this.prev.delete(c.id); }
      this.creatures.delete(key);
    }
    let spawned = 0;
    this.pendingSpawn = false;
    for (const key of loaded) {
      if (this.creatures.has(key)) continue;
      if (spawned++ >= FaunaView.SPAWN_CHUNKS_PER_FRAME) { this.pendingSpawn = true; break; }
      const [cx, cz] = key.split(',').map(Number);
      this.creatures.set(key, spawnChunkFauna(this.world, cx, cz));
    }
  }

  get count(): number {
    let n = 0;
    for (const list of this.creatures.values()) n += list.length;
    return n;
  }

  all(): Creature[] { return [...this.creatures.values()].flat(); }

  update(dt: number, ctx: FaunaContext): void {
    this.accumulator = Math.min(this.accumulator + dt, FAUNA_STEP * 4);
    if (this.accumulator >= FAUNA_STEP) {
      // Relationships between creatures, gathered once per frame.
      const predators: Array<{ species: Id; x: number; z: number }> = [];
      const prey: Array<{ x: number; z: number }> = [];
      const leaders = new Map<string, Creature>();
      for (const list of this.creatures.values()) {
        for (const c of list) {
          if (c.species === 'fox' || c.species === 'wolf') predators.push({ species: c.species, x: c.x, z: c.z });
          if (c.species === 'rabbit') prey.push({ x: c.x, z: c.z });
          if (c.species === 'wolf' && !c.leader) leaders.set(c.id, c);
        }
      }
      const full: FaunaContext = { ...ctx, predators, prey, leaders };
      while (this.accumulator >= FAUNA_STEP) {
        for (const list of this.creatures.values()) {
          for (const c of list) {
            const p = this.prev.get(c.id);
            if (p) { p.x = c.x; p.y = c.y; p.z = c.z; p.heading = c.heading; }
            else this.prev.set(c.id, { x: c.x, y: c.y, z: c.z, heading: c.heading });
            stepCreature(this.world, c, full);
          }
        }
        this.accumulator -= FAUNA_STEP;
      }
    }
    this.draw(dt);
  }

  private draw(dt: number): void {
    for (const b of this.batches.values()) b.begin();
    const now = performance.now() / 1000;
    const alpha = stepAlpha(this.accumulator, FAUNA_STEP), shown = this.shown;
    for (const list of this.creatures.values()) {
      for (const c of list) {
        const sp = c.species;
        const before = this.prev.get(c.id);
        if (before) blendPose(before, c, alpha, shown, 3);
        else { shown.x = c.x; shown.y = c.y; shown.z = c.z; shown.heading = c.heading; }
        const batch = this.batches.get(sp)!;
        const moving = c.speed > 0.05;
        const ph = (this.phases.get(c.id) ?? 0) + dt * (moving ? 3 + c.speed * (sp === 'rabbit' ? 4 : sp === 'trout' ? 8 : 2.4) : 1);
        this.phases.set(c.id, ph);
        const lying = (c.behaviour === 'sleep' || c.behaviour === 'rest') && sp !== 'trout';
        const grazing = c.behaviour === 'graze';
        let head = 0, lift = 0, roll = 0, pitch = 0, swing = moving ? Math.min(0.85, 0.25 + c.speed * 0.1) : 0;
        if (grazing) head = 0.75 + Math.sin(now * 3 + c.x) * 0.1;
        else if (lying) head = 0.3;
        else if (c.behaviour === 'stalk') { head = 0.45; swing = 0.35; }
        else if (c.behaviour === 'chase' || c.behaviour === 'flee') head = -0.12;
        else if (!moving) head = Math.sin(now * 0.7 + c.z) * 0.08;
        if (sp === 'rabbit' && moving) { lift = Math.abs(Math.sin(ph)) * 0.18; swing = 0.9; }
        if (sp === 'deer' && c.speed > 3) lift = Math.abs(Math.sin(ph)) * 0.15;
        if (sp === 'trout') { roll = Math.sin(ph * 1.5) * 0.05; swing = 0; }
        batch.push({
          x: shown.x, y: shown.y + lift, z: shown.z, heading: shown.heading, scale: 1,
          phase: ph, legSwing: swing, headPitch: head,
          tailWag: sp === 'trout' ? (moving && c.speed > 1 ? 0.55 : 0.3) : sp === 'fox' || sp === 'wolf' ? (lying ? 0.05 : 0.3) : 0.15,
          male: isMale(c.id), young: false, lying, extra: 1, pitch, roll,
        });
      }
    }
    for (const b of this.batches.values()) b.end();
  }

  metrics(): Record<string, number> {
    const out: Record<string, number> = { total: 0 };
    for (const c of this.all()) { out[c.species] = (out[c.species] ?? 0) + 1; out.total++; }
    return out;
  }
}

export { SPECIES };
