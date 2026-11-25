// Explore mode: the founder character walks the world; the camera follows.
//
// Authority split:
//   sim/character.ts  — deterministic fixed-step movement rules (no three.js).
//   this controller   — input sampling, fixed-step accumulation, interpolation,
//                       follow-camera targeting, interaction prompts.
//   render/characters — rigid-part figure and its animation.
// Gathering still goes through the journaled `harvest` command; the character
// position only decides *which* resource is in reach.
import * as THREE from 'three';
import {
  CharacterState, FIXED_STEP, MAX_HEALTH, createCharacter, findStandingY, respawnCharacter, stepCharacter,
} from '../sim/character';
import { Entity, World, isSolid, residentVoxelAt, nearestHarvestable } from '../sim/world';
import { OrbitRig } from '../render/camera';
import { Figure, buildFigure, animateFigure, placeFigure } from '../render/characters';
import { BannerPoint, BannerSet, BannerTarget, ReturnChannel, bannerGroundY, findLanding, plantBanner } from '../sim/banners';
import { BannerStore } from './banners';
import { BannerView } from '../render/banners';

export const BANNER_NAMES: Record<BannerTarget, string> = { home: 'home banner', field: 'field banner' };

export const INTERACT_REACH = 3.2;

export interface ExploreOptions {
  world: World;
  scene: THREE.Scene;
  rig: OrbitRig;
  storage: Storage | null;
  /** Where to spawn when there is no saved avatar position. */
  spawn: { x: number; z: number };
}

interface SavedAvatar {
  x: number; y: number; z: number; heading: number;
  health?: number; stamina?: number; safe?: { x: number; y: number; z: number };
}
/** While floating, the camera stays at least this far above the water surface (m). */
export const CAMERA_WATER_CLEARANCE = 0.35;
/** Seconds the death screen shows before the character respawns. */
export const RESPAWN_DELAY = 3;
/** A return to a far banner waits this long for its terrain to stream in, then gives up. */
export const RETURN_STREAM_TIMEOUT_MS = 30_000;

export class ExploreController {
  active = false;
  private state: CharacterState | null = null;
  private prev: CharacterState | null = null;
  private accumulator = 0;
  private jumpQueued = false;
  private jumpHeld = false;
  private diveHeld = false;
  private deadFor = 0;
  /** Deaths this session (for the HUD and metrics). */
  deaths = 0;
  /** Called once when the character dies and once when it respawns. */
  onDeath: ((cause: string) => void) | null = null;
  onRespawn: (() => void) | null = null;
  private figure: Figure;
  private readonly marker: THREE.Mesh;
  private readonly smoothTarget = new THREE.Vector3();
  private saveTimer = 0;
  private readonly key: string;
  private steps = 0;
  private spawnAttempts = 0;
  /** Where the character will appear once its terrain is resident. */
  private pendingSpawn: { x: number; z: number } | null = null;
  /** The resource currently within reach, if any. */
  reachable: Entity | null = null;
  // ---- banners (M009) ----
  private readonly bannerStore: BannerStore;
  /** Home and field banner positions (player-local, persisted beside the avatar). */
  banners: BannerSet;
  private homeY: number | null = null;
  private bannerCheck = 0;
  readonly bannerView = new BannerView();
  readonly channel = new ReturnChannel();
  /** A completed return whose banner terrain is still streaming in. */
  private pendingReturn: { target: BannerTarget; carry: CharacterState; since: number } | null = null;
  /** Completed returns this session (metrics). */
  returns = 0;
  /** Player-facing messages (planted, returning, cancelled...). */
  onNotice: ((message: string, kind?: 'good' | 'warn') => void) | null = null;

  constructor(private readonly o: ExploreOptions) {
    this.bannerStore = new BannerStore(o.storage, o.world.seed, o.world.params.generatorVersion, o.spawn);
    this.banners = this.bannerStore.load();
    // Record the derived home banner, so it stays put even if the default spawn changes later.
    this.bannerStore.save(this.banners);
    o.scene.add(this.bannerView.mesh);
    this.figure = buildFigure();
    this.figure.root.visible = false;
    o.scene.add(this.figure.root);
    this.key = `astrix:avatar:v1:seed:${o.world.seed}:gen:${o.world.params.generatorVersion}`;
    const ring = new THREE.RingGeometry(0.7, 0.9, 6);
    ring.rotateX(-Math.PI / 2);
    this.marker = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({
      color: 0xfff4d6, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    this.marker.visible = false;
    this.marker.renderOrder = 3;
    o.scene.add(this.marker);
    o.rig.collider = (from, dir, max) => this.armClearance(from, dir, max);

    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'Space') { if (!e.repeat) this.setJumpHeld(true); e.preventDefault(); }
      if (e.code === 'KeyC') this.diveHeld = true;
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.code === 'KeyR') this.startReturn('home');
        if (e.code === 'KeyT') this.startReturn('field');
        if (e.code === 'KeyV') this.plantFieldBanner();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.setJumpHeld(false);
      if (e.code === 'KeyC') this.diveHeld = false;
    });
    window.addEventListener('blur', () => { this.jumpHeld = false; this.diveHeld = false; });
  }

  /** Request a single jump. */
  jump(): void { this.jumpQueued = true; }
  /** Jump button or Space: a press jumps; holding swims upward. */
  setJumpHeld(held: boolean): void {
    if (held && !this.jumpHeld) this.jumpQueued = true;
    this.jumpHeld = held;
  }
  /** Dive button or C: holding swims downward. */
  setDiveHeld(held: boolean): void { this.diveHeld = held; }

  /** "Plant banner" (V / touch): the field banner moves to where the founder stands. */
  plantFieldBanner(): boolean {
    if (!this.active) return false;
    const r = plantBanner(this.state);
    if (!r.ok) { this.onNotice?.(`Cannot plant the banner: ${r.reason}`, 'warn'); return false; }
    const moved = !!this.banners.field;
    this.banners = { ...this.banners, field: r.banner };
    const saved = this.bannerStore.save(this.banners);
    this.refreshBanners(true);
    this.onNotice?.(`${moved ? 'Moved' : 'Planted'} your field banner here${saved ? '' : ' (not saved: storage unavailable)'}`, 'good');
    return true;
  }

  /** "Return home" (R) / "Return to banner" (T): stand still for a moment, then go back. */
  startReturn(target: BannerTarget): boolean {
    if (!this.active) return false;
    const s = this.state;
    if (!s || this.pendingReturn) return false;
    if (s.dead) return false;
    if (target === 'field' && !this.banners.field) { this.onNotice?.('No field banner yet: plant one first (Plant banner, V)', 'warn'); return false; }
    if (this.channel.target === target) { this.cancelReturn('cancelled'); return false; }
    this.channel.start(target, performance.now());
    this.onNotice?.(`Returning to your ${BANNER_NAMES[target]}: hold still…`);
    return true;
  }

  cancelReturn(why: string): void {
    const e = this.channel.cancel(why);
    if (e?.type === 'cancelled') this.onNotice?.(`Return ${why}`, 'warn');
  }

  /** Where a banner stands (feet level), or null while its ground is not resident. */
  bannerPoint(target: BannerTarget): BannerPoint | null {
    if (target === 'field') return this.banners.field;
    return this.homeY === null ? null : { x: this.banners.home.x, y: this.homeY, z: this.banners.home.z };
  }

  /** Keep the banner mesh in step with the banners and the home ground (cheap; throttled). */
  private refreshBanners(force = false): void {
    // The home ground is looked up until its chunk is resident, then every ~10 s
    // in case the terrain there changed (construction cuts).
    const every = this.homeY === null ? 20 : 600;
    if (force || this.bannerCheck++ % every === 0) {
      const y = bannerGroundY(this.o.world, this.banners.home.x, this.banners.home.z);
      if (y !== null) this.homeY = y;
    }
    this.bannerView.set(this.bannerPoint('home'), this.banners.field);
  }

  /** Put the founder next to a banner (on safe ground), or wait for its terrain to stream in. */
  private arrive(target: BannerTarget, carry: CharacterState): boolean {
    const b = target === 'home' ? { x: this.banners.home.x, y: this.homeY, z: this.banners.home.z } : this.banners.field;
    if (!b) return false;
    const land = findLanding(this.o.world, b.x, b.z, target === 'field' ? b.y : null);
    if (!land.ok) {
      if (land.reason === 'blocked') {
        this.pendingReturn = null;
        this.onNotice?.(`There is no safe ground beside your ${BANNER_NAMES[target]}`, 'warn');
        if (!this.state) { this.state = carry; this.prev = { ...carry }; this.figure.root.visible = this.active; }
        return false;
      }
      // Stream the banner's terrain: the camera target leads chunk loading.
      const since = this.pendingReturn?.since ?? performance.now();
      if (performance.now() - since > RETURN_STREAM_TIMEOUT_MS) {
        // Never leave the founder hidden: give up and stay where they were.
        this.pendingReturn = null;
        this.state = carry; this.prev = { ...carry }; this.figure.root.visible = this.active;
        this.smoothTarget.set(carry.x, carry.y + 1.5, carry.z);
        this.onNotice?.(`The land around your ${BANNER_NAMES[target]} did not load; try again`, 'warn');
        return false;
      }
      this.pendingReturn = { target, carry, since };
      this.state = null;
      this.prev = null;
      this.figure.root.visible = false;
      this.o.rig.target.set(b.x, b.y ?? this.o.rig.target.y, b.z);
      this.o.rig.apply();
      return false;
    }
    this.pendingReturn = null;
    // Facing away from the pole, toward where the founder came from is unknowable: face the banner's cloth side.
    const next = createCharacter(land.x, land.y, land.z, Math.atan2(b.x - land.x, b.z - land.z));
    next.health = carry.health; next.stamina = carry.stamina; next.breath = carry.breath;
    next.calm = carry.calm;
    this.state = next;
    this.prev = { ...next };
    this.accumulator = 0;
    this.smoothTarget.set(next.x, next.y + 1.5, next.z);
    this.figure.root.visible = this.active;
    this.returns++;
    this.persist();
    this.onNotice?.(`Back at your ${BANNER_NAMES[target]}`, 'good');
    return true;
  }

  enter(): void {
    if (this.active) return;
    this.active = true;
    const rig = this.o.rig;
    rig.setMode('explore');
    rig.distance = 9;
    rig.pitch = 0.32;
    if (!this.state && !this.pendingReturn) this.trySpawn();
    if (this.state) this.smoothTarget.set(this.state.x, this.state.y + 1.5, this.state.z);
    this.figure.root.visible = !!this.state;
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.channel.cancel('cancelled');
    this.persist();
    const rig = this.o.rig;
    rig.setMode('builder');
    rig.distance = Math.max(rig.distance, 60);
    rig.pitch = Math.max(rig.pitch, 0.4);
    rig.apply();
    this.marker.visible = false;
  }

  private trySpawn(): void {
    const saved = this.load();
    const x = saved?.x ?? this.o.spawn.x + 0.5;
    const z = saved?.z ?? this.o.spawn.z + 0.5;
    const y = findStandingY(this.o.world, x, z, saved ? saved.y + 2 : 110);
    if (y === null) { this.pendingSpawn = { x, z }; return; }
    this.pendingSpawn = null;
    this.state = createCharacter(x, y, z, saved?.heading ?? Math.PI);
    if (saved) {
      if (Number.isFinite(saved.health)) this.state.health = Math.max(1, Math.min(MAX_HEALTH, saved.health!));
      if (Number.isFinite(saved.stamina)) this.state.stamina = Math.max(0, Math.min(1, saved.stamina!));
      if (saved.safe && [saved.safe.x, saved.safe.y, saved.safe.z].every(Number.isFinite)) this.state.safe = { ...saved.safe };
    }
    this.prev = { ...this.state };
    this.figure.root.visible = this.active;
  }

  /** Called every rendered frame with the real elapsed time (seconds). */
  update(frameDt: number): void {
    this.refreshBanners();
    if (!this.active) return;
    if (!this.state && this.pendingReturn) {
      // A return to a far banner: wait for its terrain (the rig target is already there).
      if (this.spawnAttempts++ % 15 === 0) this.arrive(this.pendingReturn.target, this.pendingReturn.carry);
      if (!this.state) return;
    }
    if (!this.state) {
      if (this.spawnAttempts++ % 15 === 0) this.trySpawn();
      // Terrain streams around the camera target: aim it at the spawn point,
      // otherwise a saved position far from the origin would never load.
      if (this.pendingSpawn && !this.state) {
        this.o.rig.target.set(this.pendingSpawn.x, this.o.rig.target.y, this.pendingSpawn.z);
        this.o.rig.apply();
      }
      const spawned = this.state as CharacterState | null;
      if (!spawned) return;
      this.smoothTarget.set(spawned.x, spawned.y + 1.5, spawned.z);
    }
    const rig = this.o.rig;
    this.accumulator = Math.min(Math.max(0, this.accumulator) + Math.max(0, frameDt), FIXED_STEP * 6);
    const intent = rig.moveIntent();
    if (this.channel.active) {
      const why = this.state!.dead ? 'interrupted' : Math.hypot(intent.x, intent.z) > 0.1 ? 'cancelled: you moved'
        : this.jumpQueued ? 'cancelled: you jumped' : null;
      const ev = this.channel.update(performance.now(), why);
      if (ev?.type === 'cancelled') this.onNotice?.(`Return ${ev.why}`, 'warn');
      if (ev?.type === 'done') {
        this.arrive(ev.target, this.state!);
        if (!this.state) return;
      }
    }
    while (this.accumulator >= FIXED_STEP) {
      this.prev = this.state;
      const wasDead = this.state!.dead;
      this.state = stepCharacter(this.o.world, this.state!, {
        moveX: intent.x, moveZ: intent.z, run: intent.run, jump: this.jumpQueued,
        rise: this.jumpHeld, dive: this.diveHeld,
      });
      this.jumpQueued = false;
      this.accumulator -= FIXED_STEP;
      this.steps++;
      if (this.state.dead && !wasDead) { this.deaths++; this.deadFor = 0; this.onDeath?.(this.state.cause ?? 'died'); }
      if (this.state.hurt > 0 && this.channel.active) this.cancelReturn('cancelled: you are hurt');
    }
    if (this.state!.dead) {
      this.deadFor += frameDt;
      if (this.deadFor >= RESPAWN_DELAY) {
        this.state = respawnCharacter(this.o.world, this.state!);
        this.prev = { ...this.state };
        this.smoothTarget.set(this.state.x, this.state.y + 1.5, this.state.z);
        this.persist();
        this.onRespawn?.();
      }
    }
    const s = this.state!, p = this.prev ?? s;
    const a = this.accumulator / FIXED_STEP;
    const x = p.x + (s.x - p.x) * a, y = p.y + (s.y - p.y) * a, z = p.z + (s.z - p.z) * a;
    placeFigure(this.figure, x, y, z, s.heading);
    animateFigure(this.figure, s, frameDt, y);

    // Follow camera: smooth the target (snappier horizontally than vertically
    // so stepping up a voxel does not jolt the view).
    const k = 1 - Math.exp(-frameDt * 10), ky = 1 - Math.exp(-frameDt * 5);
    this.smoothTarget.x += (x - this.smoothTarget.x) * k;
    this.smoothTarget.z += (z - this.smoothTarget.z) * k;
    this.smoothTarget.y += (y + 1.5 - this.smoothTarget.y) * ky;
    rig.target.copy(this.smoothTarget);
    rig.apply();
    // Floating at the surface: keep the lens above the water (a low orbit
    // would otherwise dip under the surface and look like the head is under).
    if (s.mode === 'swim' && !s.headUnderwater) {
      const floor = s.waterSurface + CAMERA_WATER_CLEARANCE;
      if (rig.camera.position.y < floor) { rig.camera.position.y = floor; rig.camera.lookAt(rig.target); }
    }

    // Interaction prompt.
    const e = nearestHarvestable(this.o.world, s.x, s.z, INTERACT_REACH + 1.5);
    this.reachable = e && Math.hypot(e.x - s.x, e.z - s.z) <= INTERACT_REACH + 1.5 ? e : null;
    if (this.reachable) {
      this.marker.position.set(this.reachable.x, this.reachable.y + 0.06, this.reachable.z);
      this.marker.visible = true;
    } else {
      this.marker.visible = false;
    }

    this.saveTimer += frameDt;
    if (this.saveTimer > 3) { this.saveTimer = 0; this.persist(); }
  }

  /** Free distance along the camera arm before resident terrain blocks it. */
  private armClearance(from: THREE.Vector3, dir: THREE.Vector3, max: number): number {
    const step = 0.4;
    for (let t = 0.8; t <= max; t += step) {
      const x = Math.floor(from.x + dir.x * t);
      const y = Math.floor(from.y + dir.y * t);
      const z = Math.floor(from.z + dir.z * t);
      // Pad the probe by a voxel vertically so the lens stays out of slopes.
      for (const dy of [0, -1]) {
        const m = residentVoxelAt(this.o.world, x, y + dy, z);
        if (m !== null && isSolid(m) && dy === 0) return t;
      }
    }
    return max;
  }

  get character(): CharacterState | null { return this.state; }

  /** Banner state for metrics, HUD and browser probes. */
  bannerMetrics(): Record<string, unknown> {
    const r = (v: number) => Math.round(v * 100) / 100;
    const p = (b: BannerPoint | null) => (b ? { x: r(b.x), y: r(b.y), z: r(b.z) } : null);
    const now = performance.now();
    return {
      home: p(this.bannerPoint('home')), field: p(this.banners.field),
      channel: this.channel.target, channelLeft: Math.round(this.channel.remaining(now) * 10) / 10,
      channelProgress: Math.round(this.channel.progress(now) * 100) / 100,
      pendingReturn: this.pendingReturn?.target ?? null, returns: this.returns,
      meshTriangles: this.bannerView.triangles,
    };
  }

  metrics(): Record<string, unknown> | null {
    if (!this.state) return { active: this.active, spawned: false, banners: this.bannerMetrics() };
    const s = this.state;
    return {
      banners: this.bannerMetrics(),
      active: this.active, spawned: true,
      x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100, z: Math.round(s.z * 100) / 100,
      mode: s.mode, grounded: s.grounded, speed: Math.round(s.speed * 10) / 10,
      steps: this.steps, cameraDistance: Math.round(this.o.rig.effectiveDistance * 10) / 10,
      reachable: this.reachable?.id ?? null,
      health: Math.round(s.health * 10) / 10, breath: Math.round(s.breath * 1000) / 1000,
      stamina: Math.round(s.stamina * 1000) / 1000, headUnderwater: s.headUnderwater,
      vy: Math.round(s.vy * 100) / 100, dead: s.dead, deaths: this.deaths, waterSurface: Math.round(s.waterSurface * 100) / 100,
    };
  }

  private persist(): void {
    if (!this.state || !this.o.storage) return;
    try {
      // A dead or drowning character is saved at its safe spot, not under water.
      const s = this.state;
      const at = s.dead || s.headUnderwater ? s.safe : s;
      const v: SavedAvatar = { x: at.x, y: at.y, z: at.z, heading: s.heading,
        health: s.dead ? MAX_HEALTH : s.health, stamina: s.stamina, safe: s.safe };
      this.o.storage.setItem(this.key, JSON.stringify(v));
    } catch { /* presentation state: losing it is harmless */ }
  }

  private load(): SavedAvatar | null {
    try {
      const raw = this.o.storage?.getItem(this.key);
      if (!raw) return null;
      const v = JSON.parse(raw) as SavedAvatar;
      if (![v.x, v.y, v.z, v.heading].every(Number.isFinite)) return null;
      if (Math.abs(v.x) > 1000 || Math.abs(v.z) > 1000) return null;
      return v;
    } catch { return null; }
  }
}
