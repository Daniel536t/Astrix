// Render layer — ASTrix playable protagonist GLB rig, modular equipment, 14-clip animation
// controller, and M011 procedural swimming/treading/diving stroke & water-ripple overlay.
// Presentation only; never imports or mutates simulation rules. Equipment visibility and action clips
// are driven strictly by verified simulation state passed in by the app layer ("Nothing from Nothing").
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CharacterState } from '../sim/character';
import type { Figure } from './characters';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { skinRigidGltf } from './rigid-skin';

export type ProtagonistClip =
  | 'Idle' | 'Walk' | 'Run' | 'Jump' | 'Crouch'
  | 'Chop' | 'Mine' | 'Gather' | 'Pickup' | 'Carry'
  | 'Build' | 'BowAim' | 'Interact' | 'ToolEquip'
  | 'Swim' | 'SwimTread' | 'SwimDive';

export interface ProtagonistEquipmentState {
  equippedTool: string | null;
  hasQuiver: boolean;
  carryingLog: boolean;
  hasCape: boolean;
  hasPauldrons: boolean;
  hasHarness: boolean;
  hasBracers: boolean;
  hasAdventurerBoots: boolean;
}

export const STARTING_EQUIPMENT: ProtagonistEquipmentState = {
  equippedTool: null,
  hasQuiver: false,
  carryingLog: false,
  hasCape: false,
  hasPauldrons: false,
  hasHarness: false,
  hasBracers: false,
  hasAdventurerBoots: false,
};

const EQUIPMENT_GROUPS: Record<string, readonly string[]> = {
  cape: ['eq_cape_collar', 'eq_cape_seg0', 'eq_cape_seg1', 'eq_cape_seg2'],
  pauldrons: ['eq_pauldron_l', 'eq_pauldron_r'],
  harness: ['eq_chest_harness_upper', 'eq_chest_harness_belt', 'eq_chest_harness_tassets'],
  bracers: ['eq_bracer_l', 'eq_bracer_r', 'eq_glove_l', 'eq_glove_r'],
  boots: ['eq_boot_cuff_l', 'eq_boot_cuff_r', 'eq_boot_foot_l', 'eq_boot_foot_r'],
  quiver: ['eq_quiver'],
  bow: ['eq_bow'],
  stone_axe: ['eq_stone_axe'],
  stone_pickaxe: ['eq_stone_pickaxe'],
  hammer: ['eq_hammer'],
  knife: ['eq_knife'],
  carry_log: ['eq_carry_log'],
};

const PROTAGONIST_GLB_URL = './assets/models/astrix_protagonist.glb';

interface SwimBones {
  hips: THREE.Object3D | null;
  spineLower: THREE.Object3D | null;
  spineUpper: THREE.Object3D | null;
  neck: THREE.Object3D | null;
  head: THREE.Object3D | null;
  shoulderL: THREE.Object3D | null;
  shoulderR: THREE.Object3D | null;
  upperArmL: THREE.Object3D | null;
  upperArmR: THREE.Object3D | null;
  forearmL: THREE.Object3D | null;
  forearmR: THREE.Object3D | null;
  handL: THREE.Object3D | null;
  handR: THREE.Object3D | null;
  thighL: THREE.Object3D | null;
  thighR: THREE.Object3D | null;
  shinL: THREE.Object3D | null;
  shinR: THREE.Object3D | null;
  footL: THREE.Object3D | null;
  footR: THREE.Object3D | null;
  cape0: THREE.Object3D | null;
  cape1: THREE.Object3D | null;
  cape2: THREE.Object3D | null;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (u: number) => u * u * (3 - 2 * u);
const seg = (u: number, a: number, b: number) => smooth(clamp((u - a) / (b - a), 0, 1));
// Drawn water surface sits 0.20 m below the voxel water top (matches WATER_DRAW_DROP in render/water.ts).
const SWIM_WATER_DRAW_DROP = 0.2;
// Protagonist neck distance above hips joint in astrix_protagonist.glb (0.10 + 0.22 + 0.20 = 0.52 m).
const PROTAGONIST_NECK = 0.52;

function buildRippleRing(): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const r = i % 2 ? 0.52 : 0.44;
    const w = i % 2 ? 0.09 : 0.14;
    const g = new THREE.BoxGeometry(w, 0.03, w * 0.7).toNonIndexed();
    g.translate(Math.sin(a) * r, 0, Math.cos(a) * r);
    g.deleteAttribute('uv');
    const col = new THREE.Color(i % 3 ? '#E6F2F5' : '#C9E3EA');
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let j = 0; j < n; j++) { colors[j * 3] = col.r; colors[j * 3 + 1] = col.g; colors[j * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.name = 'protagonist_water_ripple';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.visible = false;
  return mesh;
}

export class ProtagonistRig {
  readonly root = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<ProtagonistClip, THREE.AnimationAction>();
  private currentClip: ProtagonistClip | null = null;
  private reportedClip: ProtagonistClip | null = null;
  private oneShotClip: ProtagonistClip | null = null;
  private oneShotUntil = 0;
  private eq: ProtagonistEquipmentState = { ...STARTING_EQUIPMENT };
  private loaded = false;
  private disposed = false;
  private bones: SwimBones | null = null;
  private hipsRestPos = new THREE.Vector3(0, 0.74, 0);
  private swimDirty = false;
  private readonly ripple = buildRippleRing();

  onLoaded: (() => void) | null = null;

  constructor(url = PROTAGONIST_GLB_URL) {
    this.root.name = 'protagonist_glb_root';
    this.root.visible = false;
    this.root.add(this.ripple);
    if (typeof fetch === 'function') {
      const loader = new GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          if (this.disposed) return;
          this.model = gltf.scene;
          skinRigidGltf(this.model, (o) => o.name.startsWith('eq_'), 1.8);
          this.model.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          const get = (n: string) => this.model!.getObjectByName(n) ?? null;
          this.bones = {
            hips: get('hips'),
            spineLower: get('spine_lower'),
            spineUpper: get('spine_upper'),
            neck: get('neck'),
            head: get('head'),
            shoulderL: get('shoulder_l'),
            shoulderR: get('shoulder_r'),
            upperArmL: get('upper_arm_l'),
            upperArmR: get('upper_arm_r'),
            forearmL: get('forearm_l'),
            forearmR: get('forearm_r'),
            handL: get('hand_l'),
            handR: get('hand_r'),
            thighL: get('thigh_l'),
            thighR: get('thigh_r'),
            shinL: get('shin_l'),
            shinR: get('shin_r'),
            footL: get('foot_l'),
            footR: get('foot_r'),
            cape0: get('cape_0'),
            cape1: get('cape_1'),
            cape2: get('cape_2'),
          };
          if (this.bones.hips) this.hipsRestPos.copy(this.bones.hips.position);
          this.root.add(this.model);
          this.mixer = new THREE.AnimationMixer(this.model);
          for (const clip of gltf.animations) {
            const name = clip.name as ProtagonistClip;
            const act = this.mixer.clipAction(clip);
            this.actions.set(name, act);
          }
          this.loaded = true;
          this.applyEquipment(this.eq);
          this.fadeTo('Idle', 0);
          this.onLoaded?.();
        },
        undefined,
        () => {
          // Non-fatal: caller keeps fallback procedural figure.
        },
      );
    }
  }

  get isLoaded(): boolean { return this.loaded; }
  get activeClip(): ProtagonistClip | null { return this.reportedClip ?? this.currentClip; }
  get equipment(): ProtagonistEquipmentState { return { ...this.eq }; }

  applyEquipment(next: ProtagonistEquipmentState): void {
    this.eq = { ...next };
    if (!this.model) return;
    const setGroup = (group: string, visible: boolean) => {
      const names = EQUIPMENT_GROUPS[group];
      if (!names) return;
      for (const n of names) {
        const obj = this.model!.getObjectByName(n);
        if (obj) obj.visible = visible;
      }
    };
    setGroup('cape', next.hasCape);
    setGroup('pauldrons', next.hasPauldrons);
    setGroup('harness', next.hasHarness);
    setGroup('bracers', next.hasBracers);
    setGroup('boots', next.hasAdventurerBoots);
    setGroup('quiver', next.hasQuiver);
    setGroup('bow', next.equippedTool === 'bow');
    setGroup('stone_axe', next.equippedTool === 'stone_axe');
    setGroup('stone_pickaxe', next.equippedTool === 'stone_pickaxe');
    setGroup('hammer', next.equippedTool === 'hammer');
    setGroup('knife', next.equippedTool === 'knife');
    setGroup('carry_log', next.carryingLog);
  }

  /** Trigger a verified gameplay one-shot clip (only called on accepted simulation outcomes). */
  triggerAction(clip: ProtagonistClip, durationSec = 0.65): void {
    this.oneShotClip = clip;
    this.oneShotUntil = performance.now() + durationSec * 1000;
    this.fadeTo(clip, 0.1, true);
  }

  private fadeTo(clip: ProtagonistClip, fadeSec = 0.16, forceRestart = false): void {
    if (!this.mixer) return;
    const next = this.actions.get(clip);
    if (!next) return;
    if (this.currentClip === clip && !forceRestart) return;
    const prev = this.currentClip ? this.actions.get(this.currentClip) : undefined;
    next.reset().setEffectiveWeight(1).play();
    if (prev && prev !== next && fadeSec > 0) prev.crossFadeTo(next, fadeSec, false);
    else if (prev && prev !== next) prev.stop();
    this.currentClip = clip;
  }

  /**
   * Apply M011 procedural swimming / treading / breaststroke / underwater diving
   * pose directly onto the protagonist GLB humanoid bones, driven by `figure`'s
   * smoothed regime blend weights, stroke factor, divePitch, and swimPhase.
   */
  private applySwimOverlay(
    s: CharacterState,
    figure: Figure,
    swimWeight: number,
    surfaceWeight: number,
    underWeight: number,
  ): void {
    const b = this.bones;
    if (!b || swimWeight <= 0.005) return;
    const w = clamp(swimWeight, 0, 1);
    const sw = surfaceWeight / (surfaceWeight + underWeight || 1);
    const uw = 1 - sw;

    const blendRot = (obj: THREE.Object3D | null, rx: number, ry: number, rz: number) => {
      if (!obj) return;
      obj.rotation.set(
        lerp(obj.rotation.x, rx, w),
        lerp(obj.rotation.y, ry, w),
        lerp(obj.rotation.z, rz, w),
      );
    };

    const phi = figure.swimPhase;
    const u = ((phi / (Math.PI * 2)) % 1 + 1) % 1;
    const m = clamp(figure.stroke, 0, 1);
    const feetY = this.root.position.y;
    const surfaceY = Number.isFinite(s.waterSurface) ? s.waterSurface : feetY;
    const waterLine = surfaceY - SWIM_WATER_DRAW_DROP - feetY;

    // --- 1. Surface Treading Water (m = 0): upright, sculling arms wide in water, alternating scissor kick ---
    const sc = Math.sin(phi);
    const cc = Math.cos(phi);
    const treadHipsPitch = 0.22 + 0.04 * Math.sin(phi * 0.5);
    const treadArmX = -0.45 + 0.28 * sc;
    const treadArmZ = 0.78 + 0.26 * cc;
    const treadForearmX = -0.35 - 0.12 * sc;
    const treadForearmZ = -0.25;
    const treadThighL = -0.32 + 0.42 * sc;
    const treadThighR = -0.32 - 0.42 * sc;
    const treadShinL = 0.55 + 0.40 * Math.max(0, -sc);
    const treadShinR = 0.55 + 0.40 * Math.max(0, sc);

    // --- 2. Surface Breaststroke (m = 1): prone horizontal torso, wide in-water pull & tuck, frog whip kick ---
    // Pull 0.00..0.42, tuck/recovery 0.42..0.64, glide 0.64..1.00
    const breathLift = u < 0.42 ? Math.sin((Math.PI * u) / 0.42) : 0;
    const strokeHipsPitch = 1.22 - 0.14 * breathLift;
    let stArmX: number, stArmZ: number, stForearmX: number, stForearmZ: number;
    if (u < 0.42) {
      // Wide out-sweep and power pull back through the water
      const k = seg(u, 0, 0.42);
      stArmX = lerp(-2.55, -1.25, k);
      stArmZ = 0.10 + 1.05 * Math.sin(Math.PI * k);
      stForearmX = 0.28 * Math.sin(Math.PI * k); // scoop down into water, never up into sky
      stForearmZ = -0.65 * Math.sin(Math.PI * k); // bend elbows inward toward chest
    } else if (u < 0.64) {
      // Hands tuck under chest then shoot straight ahead under the surface
      const k = seg(u, 0.42, 0.64);
      stArmX = lerp(-1.25, -2.55, k);
      stArmZ = lerp(0.18, 0.08, k);
      stForearmX = lerp(0.15, 0.04, k);
      stForearmZ = -0.75 * (1 - k);
    } else {
      // Streamlined forward glide just below water surface
      stArmX = -2.55;
      stArmZ = 0.08;
      stForearmX = 0.04;
      stForearmZ = -0.05;
    }
    // Breaststroke whip kick (draw heels up 0.42..0.58, whip out & snap straight 0.58..0.78, glide)
    let stThighX: number, stThighZ: number, stShinX: number;
    if (u < 0.42) {
      stThighX = 0.08; stThighZ = 0.05; stShinX = 0.10;
    } else if (u < 0.58) {
      const k = seg(u, 0.42, 0.58);
      stThighX = lerp(0.08, -0.58, k);
      stThighZ = lerp(0.05, 0.44, k);
      stShinX = lerp(0.10, 1.32, k);
    } else if (u < 0.78) {
      const k = seg(u, 0.58, 0.78);
      stThighX = lerp(-0.58, 0.16, k);
      stThighZ = lerp(0.44, 0.05, k) + 0.24 * Math.sin(Math.PI * k);
      stShinX = lerp(1.32, 0.10, k);
    } else {
      const k = seg(u, 0.78, 1.0);
      stThighX = lerp(0.16, 0.08, k);
      stThighZ = 0.05;
      stShinX = 0.10;
    }

    // Blend surface tread -> surface breaststroke
    const surfHipsPitch = lerp(treadHipsPitch, strokeHipsPitch, m);
    const surfSpineLower = lerp(0, -0.08, m);
    const surfSpineUpper = lerp(0, -0.10, m);
    const surfHeadPitch = lerp(-0.18, -0.88 + 0.10 * breathLift, m);
    const bob = 0.022 * Math.sin(figure.time * 1.7) + 0.04 * breathLift * m;
    const surfHipsY = clamp(waterLine + 0.04 - PROTAGONIST_NECK * Math.cos(surfHipsPitch) + bob, 0.15, 1.45);
    const surfHipsZ = -0.32 * Math.sin(surfHipsPitch);

    const surfArmLx = lerp(treadArmX, stArmX, m);
    const surfArmLz = lerp(treadArmZ, stArmZ, m);
    const surfArmRx = surfArmLx;
    const surfArmRz = -surfArmLz;
    const surfForearmLx = lerp(treadForearmX, stForearmX, m);
    const surfForearmLz = lerp(treadForearmZ, stForearmZ, m);
    const surfForearmRx = surfForearmLx;
    const surfForearmRz = -surfForearmLz;
    const surfThighLx = lerp(treadThighL, stThighX, m);
    const surfThighLz = lerp(0.14, stThighZ, m);
    const surfThighRx = lerp(treadThighR, stThighX, m);
    const surfThighRz = -lerp(0.14, stThighZ, m);
    const surfShinLx = lerp(treadShinL, stShinX, m);
    const surfShinRx = lerp(treadShinR, stShinX, m);

    // --- 3. Underwater Breaststroke (streamlined along divePitch, full long pull to hips) ---
    let unArmX: number, unArmZ: number, unForearmX: number, unForearmZ: number;
    if (u < 0.38) {
      const k = seg(u, 0, 0.38);
      unArmX = lerp(-2.78, -0.15, k);
      unArmZ = 0.12 + 0.95 * Math.sin(Math.PI * k);
      unForearmX = 0.25 * Math.sin(Math.PI * k);
      unForearmZ = -0.55 * Math.sin(Math.PI * k);
    } else if (u < 0.52) {
      unArmX = -0.15; unArmZ = 0.12; unForearmX = 0.08; unForearmZ = -0.12;
    } else if (u < 0.72) {
      const k = seg(u, 0.52, 0.72);
      unArmX = lerp(-0.15, -2.78, k);
      unArmZ = lerp(0.12, 0.06, k);
      unForearmX = lerp(0.08, 0, k);
      unForearmZ = -0.65 * Math.sin(Math.PI * k);
    } else {
      unArmX = -2.78; unArmZ = 0.06; unForearmX = 0; unForearmZ = 0;
    }
    const unHipsPitch = figure.divePitch;
    const unHeadPitch = -clamp(figure.divePitch - 0.3, 0, 0.6) * 0.55;

    // --- 4. Blend surface <-> underwater regimes ---
    const hipsY = surfHipsY * sw + 0.85 * uw;
    const hipsZ = surfHipsZ * sw;
    const hipsPitch = surfHipsPitch * sw + unHipsPitch * uw;
    const spineLower = surfSpineLower * sw;
    const spineUpper = surfSpineUpper * sw;
    const headPitch = surfHeadPitch * sw + unHeadPitch * uw;

    const armLx = surfArmLx * sw + unArmX * uw;
    const armLz = surfArmLz * sw + unArmZ * uw;
    const armRx = surfArmRx * sw + unArmX * uw;
    const armRz = surfArmRz * sw - unArmZ * uw;
    const forearmLx = surfForearmLx * sw + unForearmX * uw;
    const forearmLz = surfForearmLz * sw + unForearmZ * uw;
    const forearmRx = surfForearmRx * sw + unForearmX * uw;
    const forearmRz = surfForearmRz * sw - unForearmZ * uw;

    const thighLx = surfThighLx * sw + stThighX * uw;
    const thighLz = surfThighLz * sw + stThighZ * uw;
    const thighRx = surfThighRx * sw + stThighX * uw;
    const thighRz = surfThighRz * sw - stThighZ * uw;
    const shinLx = surfShinLx * sw + stShinX * uw;
    const shinRx = surfShinRx * sw + stShinX * uw;

    if (b.hips) {
      b.hips.position.set(
        lerp(b.hips.position.x, 0, w),
        lerp(b.hips.position.y, hipsY, w),
        lerp(b.hips.position.z, hipsZ, w),
      );
      blendRot(b.hips, hipsPitch, 0, 0);
    }

    blendRot(b.spineLower, spineLower, 0, 0);
    blendRot(b.spineUpper, spineUpper, 0, 0);
    blendRot(b.neck, 0, 0, 0);
    blendRot(b.head, headPitch, 0, 0);
    blendRot(b.shoulderL, 0, 0, 0);
    blendRot(b.shoulderR, 0, 0, 0);

    blendRot(b.upperArmL, armLx, 0, armLz);
    blendRot(b.upperArmR, armRx, 0, armRz);
    blendRot(b.forearmL, forearmLx, 0, forearmLz);
    blendRot(b.forearmR, forearmRx, 0, forearmRz);
    blendRot(b.handL, 0, 0, 0);
    blendRot(b.handR, 0, 0, 0);

    blendRot(b.thighL, thighLx, 0, thighLz);
    blendRot(b.thighR, thighRx, 0, thighRz);
    blendRot(b.shinL, shinLx, 0, 0);
    blendRot(b.shinR, shinRx, 0, 0);
    blendRot(b.footL, 0.42, 0, 0);
    blendRot(b.footR, 0.42, 0, 0);

    // Cape trails smoothly along the water surface behind the swimmer
    const wave = Math.sin(phi * 1.5);
    blendRot(b.cape0, 0.25 + 0.08 * wave, 0, 0);
    blendRot(b.cape1, 0.12 - 0.10 * wave, 0, 0);
    blendRot(b.cape2, 0.10 + 0.12 * wave, 0, 0);
  }

  private resetSwimBones(): void {
    const b = this.bones;
    if (!b) return;
    if (b.hips) {
      b.hips.position.copy(this.hipsRestPos);
      b.hips.rotation.set(0, 0, 0);
    }
    b.spineLower?.rotation.set(0, 0, 0);
    b.spineUpper?.rotation.set(0, 0, 0);
    b.neck?.rotation.set(0, 0, 0);
    b.head?.rotation.set(0, 0, 0);
    b.shoulderL?.rotation.set(0, 0, 0);
    b.shoulderR?.rotation.set(0, 0, 0);
    b.upperArmL?.rotation.set(0, 0, 0);
    b.upperArmR?.rotation.set(0, 0, 0);
    b.forearmL?.rotation.set(0, 0, 0);
    b.forearmR?.rotation.set(0, 0, 0);
    b.handL?.rotation.set(0, 0, 0);
    b.handR?.rotation.set(0, 0, 0);
    b.thighL?.rotation.set(0, 0, 0);
    b.thighR?.rotation.set(0, 0, 0);
    b.shinL?.rotation.set(0, 0, 0);
    b.shinR?.rotation.set(0, 0, 0);
    b.footL?.rotation.set(0, 0, 0);
    b.footR?.rotation.set(0, 0, 0);
    b.cape0?.rotation.set(0, 0, 0);
    b.cape1?.rotation.set(0, 0, 0);
    b.cape2?.rotation.set(0, 0, 0);
  }

  update(s: CharacterState, dt: number, aimActive: boolean, riding = false, figure?: Figure): void {
    if (!this.loaded || !this.mixer) return;
    const now = performance.now();
    if (this.oneShotClip && now >= this.oneShotUntil) this.oneShotClip = null;

    let desired: ProtagonistClip;
    if (this.oneShotClip) {
      desired = this.oneShotClip;
    } else if (aimActive) {
      desired = 'BowAim';
    } else if (riding) {
      desired = 'Idle';
    } else if (!s.grounded && s.mode === 'air') {
      desired = 'Jump';
    } else {
      const speed = Math.hypot(s.vx, s.vz);
      if (this.eq.carryingLog && speed > 0.35) desired = 'Carry';
      else if (speed > 5.0) desired = 'Run';
      else if (speed > 0.35) desired = 'Walk';
      else desired = 'Idle';
    }

    if (this.swimDirty) {
      this.resetSwimBones();
      this.swimDirty = false;
    }

    this.fadeTo(desired, 0.15);
    this.mixer.update(Math.min(0.1, Math.max(0, dt)));

    if (figure) {
      const b = figure.blend;
      const sum = b.ground + b.air + b.surface + b.under || 1;
      const swimWeight = (b.surface + b.under) / sum;
      if (swimWeight > 0.005) {
        this.applySwimOverlay(s, figure, swimWeight, b.surface / sum, b.under / sum);
        this.swimDirty = true;
      }
      // Mirror M011 water-line foam ripple ring when swimming or wading
      const showRipple = figure.ripple.scale.x > 0.02;
      this.ripple.visible = showRipple;
      if (showRipple) {
        this.ripple.position.copy(figure.ripple.position);
        this.ripple.scale.copy(figure.ripple.scale);
        this.ripple.rotation.copy(figure.ripple.rotation);
      }
      if (s.mode === 'swim') {
        this.reportedClip = s.headUnderwater ? 'SwimDive' : (s.speed > 0.35 ? 'Swim' : 'SwimTread');
      } else {
        this.reportedClip = this.currentClip;
      }
    } else {
      this.ripple.visible = false;
      this.reportedClip = this.currentClip;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
  }
}
