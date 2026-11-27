// Render layer — ASTrix playable protagonist GLB rig, modular equipment, and 14-clip animation controller.
// Presentation only; never imports or mutates simulation rules. Equipment visibility and action clips
// are driven strictly by verified simulation state passed in by the app layer ("Nothing from Nothing").
//
// Rig note: `astrix_protagonist.glb` uses a 24-bone rigid-part node hierarchy (hips -> spine -> head,
// limbs, 3-bone articulated cape) rather than smooth linear-blend skinning. This preserves crisp
// stylized Noxel silhouettes with zero rubbery stretching and matches `render/characters.ts` scale
// (1 unit = 1 m, ~1.70 m tall, origin at feet, +Z forward).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CharacterState } from '../sim/character';
import { skinRigidGltf } from './rigid-skin';

export type ProtagonistClip =
  | 'Idle' | 'Walk' | 'Run' | 'Jump' | 'Crouch'
  | 'Chop' | 'Mine' | 'Gather' | 'Pickup' | 'Carry'
  | 'Build' | 'BowAim' | 'ToolEquip' | 'Interact';

export interface ProtagonistEquipmentState {
  equippedTool: 'stone_axe' | 'stone_pickaxe' | 'hammer' | 'knife' | 'bow' | null;
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

export class ProtagonistRig {
  readonly root = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<ProtagonistClip, THREE.AnimationAction>();
  private currentClip: ProtagonistClip | null = null;
  private oneShotClip: ProtagonistClip | null = null;
  private oneShotUntil = 0;
  private eq: ProtagonistEquipmentState = { ...STARTING_EQUIPMENT };
  private loaded = false;
  private disposed = false;

  onLoaded: (() => void) | null = null;

  constructor(url = PROTAGONIST_GLB_URL) {
    this.root.name = 'protagonist_glb_root';
    this.root.visible = false;
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
  get activeClip(): ProtagonistClip | null { return this.currentClip; }
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

  update(s: CharacterState, dt: number, aimActive: boolean, riding = false): void {
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

    this.fadeTo(desired, 0.15);
    this.mixer.update(Math.min(0.1, Math.max(0, dt)));
  }

  dispose(): void {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
  }
}
