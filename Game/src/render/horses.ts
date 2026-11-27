// W9 render layer: persistent wild & tamed Noxel horses (presentation only).
// Loads astrix_horse_<coat>.glb, toggles eq_saddle/eq_bridle strictly from
// simulation state, and drives the 13 named AnimationClips.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { World } from '../sim/world';
import type { HorseCoat, HorseGait, HorseRecord } from '../sim/horses';
import { skinRigidGltf } from './rigid-skin';

interface HorseVisual {
  id: string;
  coat: HorseCoat;
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  currentClip: string;
  saddleNode: THREE.Object3D | null;
  bridleNode: THREE.Object3D | null;
  x: number;
  z: number;
  yaw: number;
}

const coatCache = new Map<HorseCoat, Promise<GLTF | null>>();
const loader = new GLTFLoader();

function loadCoatGltf(coat: HorseCoat): Promise<GLTF | null> {
  const existing = coatCache.get(coat);
  if (existing) return existing;
  const p = new Promise<GLTF | null>((resolve) => {
    const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ? import.meta.env.BASE_URL : '/';
    loader.load(
      `${base}assets/models/astrix_horse_${coat}.glb`,
      (gltf) => resolve(gltf),
      undefined,
      () => resolve(null),
    );
  });
  coatCache.set(coat, p);
  return p;
}

function desiredClipFor(h: HorseRecord, mounted: boolean, gait: HorseGait, moving: boolean): string {
  if (mounted) {
    if (!moving) return 'Idle';
    if (gait === 'gallop') return 'Gallop';
    if (gait === 'trot') return 'Trot';
    return 'RiderMove';
  }
  switch (h.state) {
    case 'graze': return 'Graze';
    case 'walk': return 'Walk';
    case 'flee': return 'Gallop';
    case 'approach': return 'Walk';
    case 'rest': return 'Rest';
    default: return 'Idle';
  }
}

export class HorsesView {
  readonly group = new THREE.Group();
  private readonly visuals = new Map<string, HorseVisual>();
  private readonly pending = new Set<string>();
  private disposed = false;

  constructor() {
    this.group.name = 'w9-horses';
  }

  get count(): number { return this.visuals.size; }

  clips(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [id, v] of this.visuals) out[id] = v.currentClip;
    return out;
  }

  update(
    world: World,
    groundY: (x: number, z: number) => number | null,
    dt: number,
    rider?: { x: number; y: number; z: number; heading: number; speed: number } | null,
  ): void {
    const hs = world.wild?.horses;
    if (!hs || this.disposed) return;

    // Remove visuals for horses no longer present
    for (const [id, vis] of this.visuals) {
      if (!hs.horses.has(id)) {
        this.group.remove(vis.root);
        vis.mixer.stopAllAction();
        this.visuals.delete(id);
      }
    }

    const alpha = Math.min(1, dt * 8);
    for (const h of hs.horses.values()) {
      const vis = this.visuals.get(h.id);
      if (!vis) {
        if (!this.pending.has(h.id)) this.spawnVisual(h);
        continue;
      }

      const isMounted = hs.mountedId === h.id && !!rider;
      const targetX = isMounted ? rider!.x : h.x / 10;
      const targetZ = isMounted ? rider!.z : h.z / 10;
      const targetYaw = isMounted ? rider!.heading : h.yaw / 1000;

      if (isMounted) {
        vis.x = targetX;
        vis.z = targetZ;
        vis.yaw = targetYaw;
      } else {
        vis.x += (targetX - vis.x) * alpha;
        vis.z += (targetZ - vis.z) * alpha;
        const dy = Math.atan2(Math.sin(targetYaw - vis.yaw), Math.cos(targetYaw - vis.yaw));
        vis.yaw += dy * alpha;
      }

      const gy = isMounted ? rider!.y : (groundY(vis.x, vis.z) ?? 0);
      vis.root.position.set(vis.x, gy, vis.z);
      vis.root.rotation.y = vis.yaw;

      // Authoritative modular tack visibility (never shown on wild horses)
      if (vis.saddleNode) vis.saddleNode.visible = h.saddled;
      if (vis.bridleNode) vis.bridleNode.visible = h.bridled;

      const moving = isMounted ? (rider!.speed > 0.35) : (h.state === 'walk' || h.state === 'flee' || h.state === 'approach');
      const clip = desiredClipFor(h, isMounted, hs.gait, moving);
      if (clip !== vis.currentClip) {
        const next = vis.actions.get(clip);
        const prev = vis.actions.get(vis.currentClip);
        if (next) {
          next.reset().setEffectiveWeight(1).play();
          if (prev && prev !== next) prev.crossFadeTo(next, 0.18, false);
          vis.currentClip = clip;
        }
      }
      vis.mixer.update(Math.min(0.1, Math.max(0, dt)));
    }
  }

  private spawnVisual(h: HorseRecord): void {
    this.pending.add(h.id);
    loadCoatGltf(h.coat).then((gltf) => {
      this.pending.delete(h.id);
      if (this.disposed || !gltf) return;
      const root = gltf.scene.clone(true);
      skinRigidGltf(root, (o) => o.name.startsWith('eq_'), 2.4);
      let saddleNode: THREE.Object3D | null = null;
      let bridleNode: THREE.Object3D | null = null;
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
        if (o.name === 'eq_saddle') { saddleNode = o; o.visible = h.saddled; }
        if (o.name === 'eq_bridle') { bridleNode = o; o.visible = h.bridled; }
      });
      const mixer = new THREE.AnimationMixer(root);
      const actions = new Map<string, THREE.AnimationAction>();
      for (const clip of gltf.animations) {
        actions.set(clip.name, mixer.clipAction(clip));
      }
      const idle = actions.get('Idle');
      if (idle) idle.play();
      const x = h.x / 10, z = h.z / 10, yaw = h.yaw / 1000;
      root.position.set(x, 0, z);
      root.rotation.y = yaw;
      this.group.add(root);
      this.visuals.set(h.id, {
        id: h.id,
        coat: h.coat,
        root,
        mixer,
        actions,
        currentClip: 'Idle',
        saddleNode,
        bridleNode,
        x,
        z,
        yaw,
      });
    });
  }

  dispose(): void {
    this.disposed = true;
    for (const vis of this.visuals.values()) {
      vis.mixer.stopAllAction();
      this.group.remove(vis.root);
    }
    this.visuals.clear();
  }
}
