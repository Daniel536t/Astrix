// Render layer — articulated, block-built characters (presentation only).
//
// A figure is a hierarchy of rigid parts (hips → torso → head/arms, hips →
// legs) built from boxes of deliberately varied proportion: a tapered torso,
// belt, collar, hair cap, hands and boots, so the silhouette reads as a person
// at gameplay distance without becoming a pile of identical cubes.
// Animation rotates the rigid parts; there is no skinning.
//
// Scale: 1 unit = 1 m. The founder is 1.7 m tall (ADB §5 human ruler).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import palette from '../data/palette.json';
import type { CharacterState } from '../sim/character';

const M = palette.materials as Record<string, { hex: string }>;
const C = (k: string) => new THREE.Color(M[k].hex);

const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

interface Box { w: number; h: number; d: number; x?: number; y?: number; z?: number; c: string; }

/** Merge boxes (y = bottom) into one vertex-coloured geometry. */
function part(boxes: Box[]): THREE.BufferGeometry {
  const geos = boxes.map((b) => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d).toNonIndexed();
    g.translate(b.x ?? 0, (b.y ?? 0) + b.h / 2, b.z ?? 0);
    g.deleteAttribute('uv');
    const col = C(b.c);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    const normals = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      // Slightly darker undersides and sides: shade stays in the light rig,
      // this only separates faces of the same flat colour.
      const ny = normals.getY(i);
      const k = ny > 0.5 ? 1.0 : ny < -0.5 ? 0.78 : 0.9;
      colors[i * 3] = col.r * k; colors[i * 3 + 1] = col.g * k; colors[i * 3 + 2] = col.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  });
  const merged = mergeGeometries(geos)!;
  for (const g of geos) g.dispose();
  return merged;
}

export interface FigureStyle {
  tunic: string;
  trousers: string;
  hair: string;
  /** Height scale relative to the 1.7 m founder. */
  scale?: number;
}

export const FOUNDER_STYLE: FigureStyle = { tunic: 'char_tunic', trousers: 'char_trousers', hair: 'char_hair' };
export const VILLAGER_STYLE: FigureStyle = { tunic: 'char_tunic_alt', trousers: 'char_trousers', hair: 'char_hair' };

export interface Figure {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  /** Accumulated gait phase (radians). */
  phase: number;
}

function joint(name: string, geo: THREE.BufferGeometry, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

/** Build a 1.7 m articulated figure. Feet at y = 0, facing +z. */
export function buildFigure(style: FigureStyle = FOUNDER_STYLE): Figure {
  const root = new THREE.Group();
  root.name = 'character';
  const s = style.scale ?? 1;
  root.scale.setScalar(s);

  // Legs hang from the hip joint at y = 0.82.
  const legGeo = part([
    { w: 0.17, h: 0.72, d: 0.19, y: -0.72, c: style.trousers },
    { w: 0.19, h: 0.12, d: 0.27, y: -0.82, z: 0.035, c: 'char_boots' },
  ]);
  const hips = new THREE.Group();
  hips.name = 'hips';
  hips.position.y = 0.82;
  const legL = joint('legL', legGeo, 0.1, 0, 0);
  const legR = joint('legR', legGeo, -0.1, 0, 0);
  hips.add(legL, legR);

  // Torso: hips block, belt, tapered chest, collar.
  const torsoGeo = part([
    { w: 0.40, h: 0.16, d: 0.24, y: -0.02, c: style.trousers },
    { w: 0.42, h: 0.06, d: 0.26, y: 0.12, c: 'char_boots' },
    { w: 0.40, h: 0.28, d: 0.24, y: 0.18, c: style.tunic },
    { w: 0.46, h: 0.20, d: 0.26, y: 0.42, c: style.tunic },
    { w: 0.22, h: 0.05, d: 0.18, y: 0.62, c: style.tunic },
  ]);
  const torso = joint('torso', torsoGeo, 0, 0, 0);
  hips.add(torso);

  const headGeo = part([
    { w: 0.10, h: 0.06, d: 0.10, y: 0, c: 'char_skin' },
    { w: 0.24, h: 0.24, d: 0.24, y: 0.05, c: 'char_skin' },
    { w: 0.26, h: 0.09, d: 0.26, y: 0.24, c: style.hair },
    { w: 0.26, h: 0.12, d: 0.06, y: 0.16, z: -0.11, c: style.hair },
    { w: 0.05, h: 0.04, d: 0.03, x: 0.055, y: 0.15, z: 0.12, c: 'char_boots' },
    { w: 0.05, h: 0.04, d: 0.03, x: -0.055, y: 0.15, z: 0.12, c: 'char_boots' },
  ]);
  const head = joint('head', headGeo, 0, 0.66, 0);
  torso.add(head);

  // Arms hang from the shoulder at y = 0.60 on the torso.
  const armGeo = part([
    { w: 0.13, h: 0.30, d: 0.14, y: -0.30, c: style.tunic },
    { w: 0.11, h: 0.24, d: 0.12, y: -0.53, c: 'char_skin' },
  ]);
  const armL = joint('armL', armGeo, 0.29, 0.60, 0);
  const armR = joint('armR', armGeo, -0.29, 0.60, 0);
  torso.add(armL, armR);

  root.add(hips);
  return { root, hips, torso, head, armL, armR, legL, legR, phase: 0 };
}

/**
 * Pose a figure from its simulation state. Walking and running swing limbs in
 * opposition with stride length tied to actual ground speed; airborne poses
 * tuck the legs; swimming strokes the arms; wading shortens the stride.
 */
export function animateFigure(f: Figure, state: CharacterState, dt: number): void {
  const speed = state.speed;
  const stride = state.mode === 'wade' ? 1.6 : 2.4;
  f.phase += (speed / stride) * Math.PI * 2 * dt;
  const sw = Math.min(1, speed / 7.5);
  let legSwing = Math.sin(f.phase) * (0.35 + 0.45 * sw) * Math.min(1, speed * 1.5);
  let armSwing = -legSwing * 0.8;
  let lean = 0.10 * sw;
  let bob = Math.abs(Math.sin(f.phase)) * 0.05 * Math.min(1, speed);

  if (state.mode === 'air') {
    legSwing = 0; armSwing = 0;
    f.legL.rotation.x = -0.45; f.legR.rotation.x = 0.25;
    f.armL.rotation.x = -0.9; f.armR.rotation.x = -0.9;
    f.armL.rotation.z = 0.25; f.armR.rotation.z = -0.25;
    f.torso.rotation.x = 0.05;
    f.hips.position.y = 0.82;
    return;
  }
  if (state.mode === 'swim') {
    f.phase += dt * 3;
    const stroke = Math.sin(f.phase);
    f.torso.rotation.x = 0.9;
    f.hips.rotation.x = 0.4;
    f.armL.rotation.x = -1.6 + stroke * 1.1; f.armR.rotation.x = -1.6 - stroke * 1.1;
    f.armL.rotation.z = 0; f.armR.rotation.z = 0;
    f.legL.rotation.x = 0.3 + stroke * 0.4; f.legR.rotation.x = 0.3 - stroke * 0.4;
    f.hips.position.y = 0.82;
    return;
  }
  // Idle breathing when standing.
  if (speed < 0.1) {
    lean = 0; bob = Math.sin(performance.now() / 900) * 0.006;
    armSwing = 0; legSwing = 0;
  }
  f.hips.rotation.x = 0;
  f.legL.rotation.x = legSwing;
  f.legR.rotation.x = -legSwing;
  f.armL.rotation.x = armSwing;
  f.armR.rotation.x = -armSwing;
  f.armL.rotation.z = 0.06;
  f.armR.rotation.z = -0.06;
  f.torso.rotation.x = lean;
  f.head.rotation.x = -lean * 0.6;
  f.hips.position.y = 0.82 + bob;
}

/** Place the figure at the character state (feet position, heading). */
export function placeFigure(f: Figure, x: number, y: number, z: number, heading: number): void {
  f.root.position.set(x, y, z);
  f.root.rotation.y = heading;
}
