// Render layer — living wildlife over the sim fauna rules.
//
// Two sources, never both in one world:
//  - a wilderness world with content v8 (W7): the creatures are the hashed
//    sim records (sim/wildlife.ts), stepped on the 2 s world tick. This view
//    only draws them: each tick's path (the start and each sub-step) is
//    blended over the tick, starting from where the animal was shown when the
//    tick arrived, so nothing jumps. Only records standing in the loaded near
//    chunks are drawn (they are inside the simulation's full ring).
//  - any other world (the settlement; a wilderness world before its upgrade):
//    the ambient tier as before: spawned deterministically when a chunk
//    loads, dropped when it unloads, stepped at FAUNA_STEP. Presentation only.
// Each species is one instanced mesh with an animated rig (see
// animal-kit.ts), so a full near ring of wildlife costs five draw calls.
import * as THREE from 'three';
import { World, chunkKey, residentSurfaceAt, worldToChunkX, worldToChunkZ } from '../sim/world';
import { Creature, FAUNA_STEP, FaunaContext, SPECIES, spawnChunkFauna, stepCreature } from '../sim/fauna';
import { Animal, BUTCHER_ORDER, STUN_ACT, headingOf, wildGround, wildlifeStats } from '../sim/wildlife';
import { HIT_SHAPES, Prey, lyingAnimal } from '../sim/hunting';
import { AnimalBatch } from './animal-kit';
import { DynamicBody, creatureBody } from '../sim/bodies';
import { ANIMAL_MODELS } from './animal-models';
import { Pose, blendPose, shortestArc, stepAlpha } from './smooth';

type Id = Creature['species'];
const CAP: Record<Id, number> = { deer: 96, rabbit: 96, trout: 192, fox: 32, wolf: 64 };
/** A sim animal as drawn: the path of its latest tick (metres), from where it was shown when the tick arrived. */
interface SimTrack { pts: number[]; heading: number; from: number; shown: Pose; speed: number; seen: number }
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

  /** W7: sim-record tracks by id, the tick they were built for, and when it was observed (ms). */
  private tracks = new Map<string, SimTrack>();
  private simTick = -1;
  private simAt = 0;
  private loaded: ReadonlySet<string> = new Set();
  private readonly tickSeconds: number;
  private drawnSim: Array<{ a: Animal; t: SimTrack }> = [];
  /**
   * W8: animals hit by an arrow still in the air. The sim has already decided (a kill removed the record, a stun laid
   * it down); until the drawn arrow arrives the animal is drawn as it was, along its old path.
   */
  private deferred = new Map<string, { a: Animal; until: number }>();
  /** W8: stunned animals drawn this frame (head positions), for the dazed ring. */
  dazed: Array<{ x: number; y: number; z: number }> = [];
  private carcassHeading = new Map<string, number>();

  constructor(private readonly world: World, tickSeconds = 2) {
    this.tickSeconds = tickSeconds;
    this.group.name = 'fauna';
    for (const id of IDS) {
      const b = new AnimalBatch(ANIMAL_MODELS[id], CAP[id], `fauna_${id}`);
      this.batches.set(id, b);
      this.group.add(b.mesh);
    }
  }

  /** W8: how far the drawn animals are along their latest tick's path (0..1): the release moment a shot carries. */
  tickAlpha(): number { return Math.min(1, Math.max(0, (performance.now() - this.simAt) / (this.tickSeconds * 1000))); }
  /** W8: keep drawing `a` (a copy taken before the shot) as it was until `until` (ms). */
  defer(a: Animal, until: number): void { this.deferred.set(a.id, { a, until }); }
  /** W8: drawn land animals' body centres (m), for the touch aim assist (presentation only). */
  drawnTargets(): Array<{ id: string; x: number; y: number; z: number }> {
    const out: Array<{ id: string; x: number; y: number; z: number }> = [];
    for (const { a, t } of this.drawnSim) {
      if (a.sp === 'trout' || a.a === STUN_ACT) continue;
      const H = HIT_SHAPES[a.sp as Prey], ux = Math.sin(t.shown.heading), uz = Math.cos(t.shown.heading);
      out.push({ id: a.id, x: t.shown.x + ux * H.bz, y: t.shown.y + H.y - (lyingAnimal(a) ? H.lie : 0), z: t.shown.z + uz * H.bz });
    }
    return out;
  }

  /** W7: the creatures are sim records in this world. */
  get authoritative(): boolean { return !!this.world.wild?.wildlife; }

  /** Reconcile creature records with the resident near-chunk set. */
  sync(loaded: ReadonlySet<string>): void {
    this.loaded = loaded;
    if (this.authoritative) { this.creatures.clear(); this.pendingSpawn = false; return; }
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
    if (this.authoritative) return this.drawnSim.length;
    let n = 0;
    for (const list of this.creatures.values()) n += list.length;
    return n;
  }

  all(): Creature[] { return [...this.creatures.values()].flat(); }

  /**
   * STAB-002 S2: capsules of the creatures within `range` m of (x, z), from
   * the creature sim records (not the drawn, blended poses). Trout are not bodies.
   */
  bodies(x: number, z: number, range: number, out: DynamicBody[]): void {
    if (this.authoritative) {
      // From the sim records as shown (the blend of their tick path), the same pose the capsule tracker uses for farm animals.
      for (const { a, t } of this.drawnSim) {
        if (a.sp === 'trout' || Math.abs(t.shown.x - x) > range || Math.abs(t.shown.z - z) > range) continue;
        const b = creatureBody({ id: a.id, species: a.sp, x: t.shown.x, y: t.shown.y, z: t.shown.z, heading: t.shown.heading });
        if (b) out.push(b);
      }
      return;
    }
    for (const list of this.creatures.values()) {
      for (const c of list) {
        if (c.species === 'trout' || Math.abs(c.x - x) > range || Math.abs(c.z - z) > range) continue;
        const b = creatureBody(c);
        if (b) out.push(b);
      }
    }
  }

  update(dt: number, ctx: FaunaContext): void {
    if (this.authoritative) { this.drawSim(dt); return; }
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

  /** W7: draw the sim records in the loaded chunks, each blended along its latest tick's path. */
  private drawSim(dt: number): void {
    const wl = this.world.wild!.wildlife!, tick = this.world.life?.tick ?? 0, now = performance.now();
    if (tick !== this.simTick) {
      // A new tick: each track starts from where its animal is shown now and follows the tick's path.
      const alive = new Set<string>();
      for (const a of wl.animals.values()) {
        alive.add(a.id);
        const old = this.tracks.get(a.id);
        const trail = a.trail;
        const pts: number[] = [];
        if (old && trail && trail.length >= 4) {
          pts.push(old.shown.x, old.shown.z);
          for (let i = 2; i < trail.length; i += 2) pts.push(trail[i] / 10, trail[i + 1] / 10);
          if (Math.hypot(pts[0] - trail[0] / 10, pts[1] - trail[1] / 10) > 6) { pts[0] = trail[0] / 10; pts[1] = trail[1] / 10; }
        } else pts.push(a.x / 10, a.z / 10);
        let len = 0;
        for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
        const t = old ?? { pts, heading: headingOf(a.d), from: headingOf(a.d), shown: { x: pts[0], y: 0, z: pts[1], heading: headingOf(a.d) }, speed: 0, seen: 0 };
        t.pts = pts; t.from = t.shown.heading; t.heading = headingOf(a.d); t.speed = len / this.tickSeconds; t.seen = tick;
        this.tracks.set(a.id, t);
      }
      for (const id of [...this.tracks.keys()]) {
        if (alive.has(id) || this.deferred.has(id)) continue;
        // W8: a carcass keeps the heading its animal had.
        if (wl.carcasses.has(id)) this.carcassHeading.set(id, this.tracks.get(id)!.shown.heading);
        this.tracks.delete(id);
      }
      for (const id of [...this.carcassHeading.keys()]) if (!wl.carcasses.has(id)) this.carcassHeading.delete(id);
      this.simTick = tick; this.simAt = now;
    }
    const alpha = Math.min(1, Math.max(0, (now - this.simAt) / (this.tickSeconds * 1000)));
    const g = wildGround(this.world);
    for (const b of this.batches.values()) b.begin();
    this.drawnSim = [];
    this.dazed = [];
    const secs = now / 1000;
    for (const [id, d] of [...this.deferred]) if (now >= d.until) this.deferred.delete(id);
    const list: Animal[] = [...wl.animals.values()];
    for (const d of this.deferred.values()) if (!wl.animals.has(d.a.id)) list.push(d.a);
    for (const live of list) {
      const a = this.deferred.get(live.id)?.a ?? live;
      const t = this.tracks.get(a.id);
      if (!t) continue;
      if (a.a === STUN_ACT) {
        // W8: lying on its side where the arrow laid it, until it comes round.
        const x = a.x / 10, z = a.z / 10, fx = Math.floor(x), fz = Math.floor(z);
        if (!this.loaded.has(chunkKey(worldToChunkX(fx), worldToChunkZ(fz)))) continue;
        const y = residentSurfaceAt(this.world, fx, fz) ?? g.height(fx, fz);
        t.shown.x = x; t.shown.y = y; t.shown.z = z;
        this.drawnSim.push({ a, t });
        this.batches.get(a.sp)!.push({ x, y, z, heading: t.shown.heading, scale: 1, phase: 0, legSwing: 0, headPitch: 0.5, tailWag: 0, male: isMale(a.id), young: false, lying: true, extra: 1, pitch: 0, roll: 1.2 });
        const H = HIT_SHAPES[a.sp as Prey];
        this.dazed.push({ x: x + Math.sin(t.shown.heading) * H.hz, y: y + H.hy - H.lie, z: z + Math.cos(t.shown.heading) * H.hz });
        continue;
      }
      // Where along the path (piecewise, each sub-step an equal share of the tick).
      const segs = (t.pts.length - 2) / 2;
      let x = t.pts[0], z = t.pts[1], hx = 0, hz = 0;
      if (segs > 0) {
        const f = alpha * segs, i = Math.min(segs - 1, Math.floor(f)), k = f - i;
        const ax = t.pts[i * 2], az = t.pts[i * 2 + 1], bx = t.pts[i * 2 + 2], bz = t.pts[i * 2 + 3];
        x = ax + (bx - ax) * k; z = az + (bz - az) * k; hx = bx - ax; hz = bz - az;
      }
      const key = chunkKey(worldToChunkX(Math.floor(x)), worldToChunkZ(Math.floor(z)));
      if (!this.loaded.has(key)) continue;
      const fx = Math.floor(x), fz = Math.floor(z);
      const sp = a.sp;
      let y: number;
      if (sp === 'trout') {
        const top = g.height(fx, fz) + g.depth(fx, fz), d = g.depth(fx, fz);
        y = top - 0.35 - Math.max(0, d - 0.7) * (a.dp / 10);
      } else y = residentSurfaceAt(this.world, fx, fz) ?? g.height(fx, fz);
      // Face the way it moves; standing, turn toward its sim heading.
      const moving = Math.hypot(hx, hz) > 0.05 && t.speed > 0.05;
      const want = moving ? Math.atan2(hx, hz) : t.heading;
      const head = t.shown.heading + shortestArc(t.shown.heading, want) * Math.min(1, dt * (moving ? 8 : 3));
      t.shown.x = x; t.shown.y = y; t.shown.z = z; t.shown.heading = head;
      this.drawnSim.push({ a, t });
      const batch = this.batches.get(sp)!;
      const speed = moving ? t.speed : 0;
      const ph = (this.phases.get(a.id) ?? 0) + dt * (moving ? 3 + speed * (sp === 'rabbit' ? 4 : sp === 'trout' ? 8 : 2.4) : 1);
      this.phases.set(a.id, ph);
      const settled = a.u !== 0 && !moving;
      const lying = sp !== 'trout' && (a.a === 'rest' && settled || sp === 'rabbit' && a.a === 'freeze');
      const down = settled && (a.a === 'graze' || a.a === 'browse' || a.a === 'drink') || a.a === 'mouse' && !moving;
      let headPitch = 0, lift = 0, roll = 0, swing = moving ? Math.min(0.85, 0.25 + speed * 0.1) : 0;
      if (down) headPitch = (a.a === 'browse' ? 0.35 : 0.75) + Math.sin(secs * 3 + x) * 0.1;
      else if (lying) headPitch = 0.3;
      else if (a.a === 'stalk') { headPitch = 0.45; swing = 0.35; }
      else if (a.a === 'alert' || a.a === 'freeze') headPitch = -0.25;
      else if (a.a === 'chase' || a.a === 'flee' || a.a === 'pounce' || a.a === 'avoid') headPitch = -0.12;
      else if (!moving) headPitch = Math.sin(secs * 0.7 + z) * 0.08;
      if (sp === 'rabbit' && moving) { lift = Math.abs(Math.sin(ph)) * 0.18; swing = 0.9; }
      if (sp === 'deer' && speed > 3) lift = Math.abs(Math.sin(ph)) * 0.15;
      if (sp === 'fox' && a.a === 'mouse' && !moving) lift = Math.max(0, Math.sin(secs * 2.2 + x)) * 0.35;
      if (sp === 'trout') { roll = Math.sin(ph * 1.5) * 0.05; swing = 0; }
      batch.push({
        x, y: y + lift, z, heading: head, scale: 1, phase: ph, legSwing: swing, headPitch,
        tailWag: sp === 'trout' ? (moving && speed > 1 ? 0.55 : 0.3) : sp === 'fox' || sp === 'wolf' ? (lying ? 0.05 : 0.3) : 0.15,
        male: isMale(a.id), young: false, lying, extra: 1, pitch: 0, roll,
      });
    }
    // Carcasses (W7: deer brought down by wolves) lie on their side where they fell.
    for (const c of wl.carcasses.values()) {
      if (this.deferred.has(c.id)) continue;
      const x = c.x / 10, z = c.z / 10;
      if (!this.loaded.has(chunkKey(worldToChunkX(Math.floor(x)), worldToChunkZ(Math.floor(z))))) continue;
      const y = residentSurfaceAt(this.world, Math.floor(x), Math.floor(z)) ?? g.height(Math.floor(x), Math.floor(z));
      // W8: a player's kill grows smaller as it is butchered (no gore: the block body simply shrinks).
      const left = c.by === 'player' && c.sp !== 'trout' ? 1 - (c.cut ?? 0) / BUTCHER_ORDER[c.sp].length : 1;
      const heading = this.tracks.get(c.id)?.shown.heading ?? this.carcassHeading.get(c.id) ?? 0;
      this.batches.get(c.sp)!.push({ x, y, z, heading, scale: 0.6 + 0.4 * left, phase: 0, legSwing: 0, headPitch: 0.6, tailWag: 0, male: isMale(c.id), young: false, lying: true, extra: 1, pitch: 0, roll: 1.35 });
    }
    for (const b of this.batches.values()) b.end();
  }

  metrics(): Record<string, number | string | Record<string, number>> {
    if (this.authoritative) {
      const wl = this.world.wild!.wildlife!;
      const out: Record<string, number | string | Record<string, number>> = { total: 0, source: 'sim', records: wl.animals.size, dead: wl.dead.size, carcasses: wl.carcasses.size, kills: wl.kills };
      const acts: Record<string, number> = {};
      for (const { a } of this.drawnSim) { out[a.sp] = ((out[a.sp] as number | undefined) ?? 0) + 1; out.total = (out.total as number) + 1; acts[`${a.sp}:${a.a}`] = (acts[`${a.sp}:${a.a}`] ?? 0) + 1; }
      out.acts = acts;
      out.sim = { ms: Math.round(wildlifeStats.ms * 100) / 100, maxMs: Math.round(wildlifeStats.maxMs * 100) / 100, full: wildlifeStats.full, coarse: wildlifeStats.coarse, frozen: wildlifeStats.frozen };
      return out;
    }
    const out: Record<string, number> = { total: 0 };
    for (const c of this.all()) { out[c.species] = (out[c.species] ?? 0) + 1; out.total++; }
    return out;
  }

  /** W7 evidence (?metrics=1): the drawn sim animals as shown, with their sim state. */
  simSample(): Array<Record<string, unknown>> {
    return this.drawnSim.map(({ a, t }) => ({ id: a.id, sp: a.sp, a: a.a, x: Math.round(t.shown.x * 10) / 10, z: Math.round(t.shown.z * 10) / 10,
      simX: a.x / 10, simZ: a.z / 10, hu: a.hu, th: a.th, fa: a.fa, tg: a.tg }));
  }
}

export { SPECIES };
