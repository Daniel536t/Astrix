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
  CHARACTER_RADIUS, CONTACT_SQUEEZE_AFTER, CharacterState, FIXED_STEP, bodyLevel, MAX_HEALTH, createCharacter, stepCharacter,
} from '../sim/character';
import { LandingPlan, SpawnPlan, planAvatarSpawn, planLanding } from './avatar-spawn';
import { Entity, World, isSolid, residentVoxelAt, nearestHarvestable } from '../sim/world';
import { OrbitRig } from '../render/camera';
import { Figure, buildFigure, animateFigure, placeFigure } from '../render/characters';
import { ProtagonistClip, ProtagonistEquipmentState, ProtagonistRig } from '../render/protagonist';
import { BannerPoint, BannerSet, BannerTarget, ReturnChannel, bannerGroundY, findLanding, plantBanner } from '../sim/banners';
import { BannerStore } from './banners';
import { BannerView } from '../render/banners';
import { DynamicBody, penetration } from '../sim/bodies';

export const BANNER_NAMES: Record<BannerTarget, string> = { home: 'home banner', field: 'field banner' };

export const INTERACT_REACH = 3.2;

export interface ExploreOptions {
  world: World;
  scene: THREE.Scene;
  rig: OrbitRig;
  storage: Storage | null;
  /** Where to spawn when there is no saved avatar position. */
  spawn: { x: number; z: number };
  /** W1: a wilderness world's id; its avatar and banners get their own records. Absent: the settlement's keys, unchanged. */
  storageScope?: string;
  /**
   * STAB-002 S2: moving bodies near the character (farm animals, villagers,
   * wildlife), as capsules derived from sim state. Read once per frame and
   * used for every fixed step of that frame (player-local physics).
   */
  bodies?: (x: number, z: number) => ReadonlyArray<DynamicBody>;
}

interface SavedAvatar {
  x: number; y: number; z: number; heading: number;
  health?: number; stamina?: number; safe?: { x: number; y: number; z: number };
}
/** While floating, the camera stays at least this far above the water surface (m). */
export const CAMERA_WATER_CLEARANCE = 0.35;
/** Seconds the death screen shows before the character respawns. */
export const RESPAWN_DELAY = 3;
/** W3: one axe swing, wind-up to recovery (s). */
export const SWING_S = 0.5;
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
  /** W4: journals the respawn and returns where the dead character lands (exactly), or null for the last dry spot (as before). */
  respawnAt: (() => { x: number; z: number } | null) | null = null;
  /** The recorded landing point while its terrain streams in ('none': no recorded respawn). */
  private landing: { x: number; z: number } | 'none' | null = null;
  /** W4: the Home return goes here instead of the home banner (a claimed lean-to), with its name. */
  homeOverride: (() => { x: number; z: number; name: string } | null) | null = null;
  private placeName(target: BannerTarget): string {
    const o = target === 'home' ? this.homeOverride?.() : null;
    return o ? o.name : BANNER_NAMES[target];
  }
  private figure: Figure;
  private protagonist: ProtagonistRig;
  private mounted = false;
  private mountGait: 'walk' | 'trot' | 'gallop' | null = null;
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
  /** W2: when set, the ring marks what this returns (a pickup in reach) instead of the nearest harvestable entity. */
  reachOverride: ((x: number, z: number) => { x: number; y: number; z: number } | null) | null = null;
  /** W2: the right arm joint, for a held tool. */
  get rightHand(): THREE.Object3D { return this.figure.armR; }
  /** W8: the left arm joint, for the bow. */
  get leftHand(): THREE.Object3D { return this.figure.armL; }
  get protagonistLoaded(): boolean { return this.protagonist.isLoaded; }
  get protagonistClip(): ProtagonistClip | null { return this.protagonist.activeClip; }
  setEquipment(eq: ProtagonistEquipmentState): void { this.protagonist.applyEquipment(eq); }
  setMounted(mounted: boolean, gait: 'walk' | 'trot' | 'gallop' | null = null): void {
    this.mounted = mounted;
    this.mountGait = mounted ? (gait ?? 'walk') : null;
  }
  triggerAction(clip: ProtagonistClip, durationSec = 0.65): void { this.protagonist.triggerAction(clip, durationSec); }
  /** W3: an accepted axe swing (presentation): start time and the direction to face. */
  private swingStart = -1;
  private swingFace: number | null = null;
  /** Swings drawn this session (metrics). */
  swings = 0;
  /** W3: play the tool swing toward (x, z): wind-up over the head, strike, recover (SWING_S). */
  swing(x: number, z: number, clip: ProtagonistClip = 'Chop'): void {
    const s = this.state;
    this.swingStart = performance.now();
    this.swingFace = s ? Math.atan2(x - s.x, z - s.z) : null;
    this.swings++;
    this.protagonist.triggerAction(clip, SWING_S);
  }
  get swinging(): boolean { return this.swingStart >= 0 && performance.now() - this.swingStart < SWING_S * 1000; }
  /** Player-facing messages (planted, returning, cancelled...). */
  onNotice: ((message: string, kind?: 'good' | 'warn') => void) | null = null;

  constructor(private readonly o: ExploreOptions) {
    this.bannerStore = new BannerStore(o.storage, o.world.seed, o.world.params.generatorVersion, o.spawn, o.storageScope);
    this.banners = this.bannerStore.load();
    // Record the derived home banner, so it stays put even if the default spawn changes later.
    this.bannerStore.save(this.banners);
    o.scene.add(this.bannerView.mesh);
    this.figure = buildFigure();
    this.figure.root.visible = false;
    o.scene.add(this.figure.root);
    this.protagonist = new ProtagonistRig();
    o.scene.add(this.protagonist.root);
    this.key = `astrix:avatar:v1:seed:${o.world.seed}:gen:${o.world.params.generatorVersion}${o.storageScope ? `:world:${o.storageScope}` : ''}`;
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
    this.onNotice?.(`Returning to your ${this.placeName(target)}: hold still…`);
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
    const over = target === 'home' ? this.homeOverride?.() : null;
    const b = over ? { x: over.x, y: null, z: over.z } : target === 'home' ? { x: this.banners.home.x, y: this.homeY, z: this.banners.home.z } : this.banners.field;
    if (!b) return false;
    const land = findLanding(this.o.world, b.x, b.z, target === 'field' ? b.y : null);
    if (!land.ok) {
      if (land.reason === 'blocked') {
        this.pendingReturn = null;
        this.onNotice?.(`There is no safe ground beside your ${this.placeName(target)}`, 'warn');
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
        this.onNotice?.(`The land around your ${this.placeName(target)} did not load; try again`, 'warn');
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
    this.onNotice?.(`Back at your ${this.placeName(target)}`, 'good');
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

  /** Where the character last appeared and why (metrics): the saved spot, ground near it, or the spawn banner. */
  placement: { kind: 'load' | 'respawn' | 'landing' | 'wake'; from: { x: number; y: number | null; z: number } | null; to: { x: number; y: number; z: number }; source: string; problem: string | null; moved: number; note: string | null } | null = null;
  private placementNoted = '';
  /** Say once (not silently) that the character was not put exactly where it was saved or recorded. */
  private notePlacement(note: string | null, kind: 'warn' | 'good' = 'warn'): void {
    if (!note || this.placementNoted === note) return;
    this.placementNoted = note;
    this.onNotice?.(note, kind);
  }

  private trySpawn(): void {
    const saved = this.load();
    const plan: SpawnPlan = planAvatarSpawn(this.o.world, saved, this.o.spawn);
    if (plan.status !== 'ok') {
      this.pendingSpawn = { x: plan.x, z: plan.z };
      if (plan.status === 'none') this.notePlacement(plan.note);
      return;
    }
    const { x, y, z } = plan;
    this.pendingSpawn = null;
    this.placement = { kind: 'load', from: saved ? { x: saved.x, y: saved.y, z: saved.z } : null, to: { x, y, z }, source: plan.source, problem: plan.problem, moved: plan.moved, note: plan.note };
    this.notePlacement(plan.note);
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
    this.lastIntent = { x: intent.x, z: intent.z };
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
    const tContact = performance.now();
    const bodies = this.accumulator >= FIXED_STEP && this.o.bodies ? this.o.bodies(this.state!.x, this.state!.z) : undefined;
    const collectMs = performance.now() - tContact;
    let stepped = 0;
    while (this.accumulator >= FIXED_STEP) {
      this.prev = this.state;
      const wasDead = this.state!.dead;
      const mountedRun = this.mounted ? (this.mountGait === 'trot' || this.mountGait === 'gallop' || intent.run) : intent.run;
      this.state = stepCharacter(this.o.world, this.state!, {
        moveX: intent.x, moveZ: intent.z, run: mountedRun, jump: this.jumpQueued,
        rise: this.jumpHeld, dive: this.diveHeld,
      }, FIXED_STEP, bodies);
      if (this.mounted && this.mountGait === 'gallop' && !this.state.dead && (intent.x !== 0 || intent.z !== 0)) {
        this.state = stepCharacter(this.o.world, this.state, {
          moveX: intent.x, moveZ: intent.z, run: true, jump: false,
          rise: false, dive: false,
        }, FIXED_STEP * 0.75, bodies);
      }
      stepped++;
      this.jumpQueued = false;
      this.accumulator -= FIXED_STEP;
      this.steps++;
      if (this.state.dead && !wasDead) { this.deaths++; this.deadFor = 0; this.onDeath?.(this.state.cause ?? 'died'); }
      if (this.state.hurt > 0 && this.channel.active) this.cancelReturn('cancelled: you are hurt');
    }
    if (bodies) this.noteContact(bodies, stepped, collectMs, performance.now() - tContact - collectMs, Math.hypot(intent.x, intent.z) > 0.1, frameDt);
    if (this.state!.dead) {
      this.deadFor += frameDt;
      if (this.deadFor >= RESPAWN_DELAY) {
        // W4: the journaled respawn names the landing point (the claimed lean-to's door step or the spawn banner's spot);
        // the character lands exactly there, waiting for its terrain if needed. Without a recorded death: the last dry spot.
        this.landing ??= this.respawnAt?.() ?? 'none';
        const p = this.landing === 'none' ? null : this.landing;
        const dead = this.state!;
        // A recorded landing: exactly there (said when it cannot be). Otherwise the last dry spot, or ground near it, or the spawn banner.
        const plan: LandingPlan | SpawnPlan = p ? planLanding(this.o.world, p, this.o.spawn) : planAvatarSpawn(this.o.world, dead.safe, this.o.spawn);
        if (plan.status === 'none') this.notePlacement(plan.note);
        if (plan.status === 'ok') {
          this.landing = null;
          this.placement = { kind: p ? 'landing' : 'respawn', from: p ? { x: p.x, y: null, z: p.z } : { ...dead.safe }, to: { x: plan.x, y: plan.y, z: plan.z },
            source: 'exact' in plan ? (plan.exact ? 'recorded' : 'recorded_nearby') : plan.source, problem: plan.problem, moved: plan.moved, note: plan.note };
          this.notePlacement(plan.note);
          this.state = createCharacter(plan.x, plan.y, plan.z, dead.heading);
          this.prev = { ...this.state };
          this.smoothTarget.set(this.state.x, this.state.y + 1.5, this.state.z);
          this.persist();
          this.onRespawn?.();
        }
      }
    }
    const s = this.state!, p = this.prev ?? s;
    const a = this.accumulator / FIXED_STEP;
    const x = p.x + (s.x - p.x) * a, y = p.y + (s.y - p.y) * a, z = p.z + (s.z - p.z) * a;
    placeFigure(this.figure, x, y, z, s.heading);
    animateFigure(this.figure, s, frameDt, y);
    this.poseSwing(s);
    this.poseAim(s);
    if (this.protagonist.isLoaded) {
      this.figure.root.visible = false;
      this.protagonist.root.visible = this.active && !!this.state;
      this.protagonist.root.position.set(x, y + (this.mounted ? 0.62 : 0), z);
      this.protagonist.root.rotation.y = this.aim ? this.aim.heading : (this.swinging && this.swingFace !== null ? this.swingFace : s.heading);
      this.protagonist.update(s, frameDt, !!this.aim, this.mounted);
    } else {
      this.protagonist.root.visible = false;
    }

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

    // Interaction prompt. W2: a wilderness world marks the loose pickup in reach instead.
    if (this.reachOverride) {
      this.reachable = null;
      const t = this.reachOverride(s.x, s.z);
      this.marker.visible = !!t;
      if (t) this.marker.position.set(t.x, t.y + 0.06, t.z);
      this.saveTimer += frameDt;
      if (this.saveTimer > 3) { this.saveTimer = 0; this.persist(); }
      return;
    }
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

  /** W8: while the bow is drawn: face the aim (radians, +z forward) and how far it is drawn (0..1). Null otherwise. */
  aim: { heading: number; pitch: number; draw: number } | null = null;
  /** W8: the left arm holds the bow out along the aim, the right draws the string back. */
  private poseAim(s: CharacterState): void {
    const a = this.aim;
    if (!a) return;
    s.heading = a.heading;
    this.figure.root.rotation.y = a.heading;
    const f = this.figure, up = -Math.PI / 2 - a.pitch;
    f.armL.rotation.x = up; f.armL.rotation.z = 0.12;
    f.armR.rotation.x = up + 0.25 * a.draw; f.armR.rotation.z = -0.35 - 0.45 * a.draw;
  }

  /** W3: the two-handed axe swing laid over the walk pose. */
  private poseSwing(s: CharacterState): void {
    if (this.swingStart < 0) return;
    const t = (performance.now() - this.swingStart) / 1000 / SWING_S;
    if (t >= 1) { this.swingStart = -1; return; }
    if (this.swingFace !== null) { s.heading = this.swingFace; this.figure.root.rotation.y = this.swingFace; }
    const f = this.figure;
    // Wind-up to over the head (0-40 %), strike down and forward (40-62 %), recover.
    const up = -2.8, down = -0.45, rest = f.armR.rotation.x;
    const ease = (k: number) => k * k * (3 - 2 * k);
    const arm = t < 0.4 ? rest + (up - rest) * ease(t / 0.4) : t < 0.62 ? up + (down - up) * ((t - 0.4) / 0.22) ** 2 : down + (rest - down) * ease((t - 0.62) / 0.38);
    f.armR.rotation.x = arm; f.armL.rotation.x = arm;
    f.armR.rotation.z = -0.12; f.armL.rotation.z = 0.32;
    const lean = t < 0.4 ? -0.12 * ease(t / 0.4) : t < 0.62 ? -0.12 + 0.42 * ((t - 0.4) / 0.22) : 0.3 * (1 - ease((t - 0.62) / 0.38));
    f.torso.rotation.x += lean;
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
  /**
   * W4: put a living character exactly at a recorded respawn point (a page
   * reloaded while its death was pending). False while the terrain there streams in.
   */
  wakeAt(p: { x: number; z: number }): boolean {
    if (!this.state || this.state.dead) return false;
    const plan = planLanding(this.o.world, p, this.o.spawn);
    if (plan.status === 'none') this.notePlacement(plan.note);
    if (plan.status !== 'ok') return false;
    this.placement = { kind: 'wake', from: { x: p.x, y: null, z: p.z }, to: { x: plan.x, y: plan.y, z: plan.z }, source: plan.exact ? 'recorded' : 'recorded_nearby', problem: plan.problem, moved: plan.moved, note: plan.note };
    this.notePlacement(plan.note);
    this.state = createCharacter(plan.x, plan.y, plan.z, this.state.heading);
    this.prev = { ...this.state };
    this.smoothTarget.set(this.state.x, this.state.y + 1.5, this.state.z);
    this.persist();
    return true;
  }
  /** STAB-002 S2: the move the founder last asked for (stick or keys), for the presence sent with a tick. */
  get intent(): { x: number; z: number } { return this.lastIntent; }
  private lastIntent = { x: 0, z: 0 };

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

  /** STAB-002 S2 contact metrics (presentation only). */
  private contact = { frames: 0, steps: 0, bodies: 0, ms: 0, maxMs: 0, collectMs: 0, maxCollectMs: 0, nearest: null as null | { id: string; gap: number; x: number; z: number }, minGap: Infinity, minAt: null as null | { id: string; x: number; z: number; y: number; bodyY: number; pressing: number }, held: 0, maxHeld: 0 };
  /**
   * STAB-002 S2: the smallest gap (m) per body id over all frames (bodies that came within 0.1 m), apart
   * from frames where the founder has pressed for CONTACT_SQUEEZE_AFTER and may squeeze (`squeezeById`).
   */
  private minById = new Map<string, number>();
  private squeezeById = new Map<string, number>();
  /** collect: building the capsules from sim state; step: the frame's fixed steps (all of stepCharacter, contact included). */
  private noteContact(bodies: ReadonlyArray<DynamicBody>, steps: number, collect: number, ms: number, pushing: boolean, frameDt: number): void {
    const c = this.contact, s = this.state!;
    c.frames++; c.steps += steps; c.bodies = bodies.length; c.ms += ms; c.maxMs = Math.max(c.maxMs, ms);
    c.collectMs += collect; c.maxCollectMs = Math.max(c.maxCollectMs, collect);
    let best: { id: string; gap: number; x: number; z: number; y: number } | null = null;
    for (const b of bodies) {
      // Bodies the founder is above or below (standing on a step, a deck) are not in contact.
      if (!bodyLevel(b, s.y)) continue;
      const gap = -penetration(b, s.x, s.z, CHARACTER_RADIUS);
      if (!best || gap < best.gap) best = { id: b.id, gap, x: b.x, z: b.z, y: b.y };
      // Closest each body came (every frame, not swimming), for per-species evidence.
      const byId = (s.pressing ?? 0) >= CONTACT_SQUEEZE_AFTER ? this.squeezeById : this.minById;
      if (gap < 0.1 && s.mode !== 'swim' && gap < (byId.get(b.id) ?? Infinity)) byId.set(b.id, gap);
    }
    c.nearest = best ? { id: best.id, gap: Math.round(best.gap * 1000) / 1000, x: Math.round(best.x * 100) / 100, z: Math.round(best.z * 100) / 100 } : null;
    if (best && s.mode !== 'swim' && best.gap < c.minGap) { c.minGap = best.gap; c.minAt = { id: best.id, x: Math.round(s.x * 100) / 100, z: Math.round(s.z * 100) / 100, y: Math.round(s.y * 100) / 100, bodyY: Math.round(best.y * 100) / 100, pressing: Math.round((s.pressing ?? 0) * 10) / 10 }; }
    // Held: trying to move, touching a body, and barely moving.
    if (pushing && best && best.gap < 0.02 && s.speed < 0.3) { c.held += frameDt; c.maxHeld = Math.max(c.maxHeld, c.held); } else c.held = 0;
  }
  contactMetrics(): Record<string, unknown> {
    const c = this.contact;
    return { frames: c.frames, steps: c.steps, bodies: c.bodies, stepMsPerFrame: c.frames ? Math.round((c.ms / c.frames) * 1000) / 1000 : 0, maxStepMs: Math.round(c.maxMs * 1000) / 1000,
      collectMsPerFrame: c.frames ? Math.round((c.collectMs / c.frames) * 10000) / 10000 : 0, maxCollectMs: Math.round(c.maxCollectMs * 1000) / 1000,
      nearest: c.nearest, minAt: c.minAt, minGapById: Object.fromEntries([...this.minById].map(([id, g]) => [id, Math.round(g * 1000) / 1000])),
      squeezeGapById: Object.fromEntries([...this.squeezeById].map(([id, g]) => [id, Math.round(g * 1000) / 1000])), minGap: Number.isFinite(c.minGap) ? Math.round(c.minGap * 1000) / 1000 : null, heldS: Math.round(c.held * 100) / 100, maxHeldS: Math.round(c.maxHeld * 100) / 100 };
  }

  metrics(): Record<string, unknown> | null {
    if (!this.state) return { active: this.active, spawned: false, pendingSpawn: this.pendingSpawn, placement: this.placement, banners: this.bannerMetrics() };
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
      vx: Math.round(s.vx * 100) / 100, vz: Math.round(s.vz * 100) / 100,
      contact: this.contactMetrics(),
      placement: this.placement,
      protagonistLoaded: this.protagonist.isLoaded,
      protagonistClip: this.protagonist.activeClip,
      mounted: this.mounted,
      mountGait: this.mountGait,
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
