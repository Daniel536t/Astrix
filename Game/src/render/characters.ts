// Render layer — articulated, block-built characters (presentation only).
//
// A figure is a hierarchy of rigid parts (hips → torso → head/arms, hips →
// legs) built from boxes of deliberately varied proportion: a tapered torso,
// belt, collar, hair cap, hands and boots, so the silhouette reads as a person
// at gameplay distance without becoming a pile of identical cubes.
// Animation rotates the rigid parts. The parts are drawn as one skinned mesh
// (one rigid bone per part), so a figure costs one draw call per pass.
//
// Scale: 1 unit = 1 m. The founder is 1.7 m tall (ADB §5 human ruler).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import palette from '../data/palette.json';
import type { CharacterState } from '../sim/character';
import { WATER_DRAW_DROP } from './water';

const M = palette.materials as Record<string, { hex: string }>;
/** Palette key, or a literal '#rrggbb' for role colours outside the palette. */
const C = (k: string) => new THREE.Color(k.startsWith('#') ? k : M[k].hex);

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
  /** Work identity: a wide straw hat (farmer), a felt cap (herder). */
  hat?: { kind: 'straw' | 'cap'; color: string };
  /** A work apron over the tunic. */
  apron?: string;
}

export const FOUNDER_STYLE: FigureStyle = { tunic: 'char_tunic', trousers: 'char_trousers', hair: 'char_hair' };
export const VILLAGER_STYLE: FigureStyle = { tunic: 'char_tunic_alt', trousers: 'char_trousers', hair: 'char_hair' };
/** Role looks for homestead villagers (identity per role, small per-person variation via `hair`). */
export const FARMER_STYLE: FigureStyle = { tunic: '#6E8F3A', trousers: '#5B4632', hair: '#3B2A1E', hat: { kind: 'straw', color: '#D9B65A' }, apron: '#B89B6A' };
export const HERDER_STYLE: FigureStyle = { tunic: '#3F6E8C', trousers: '#4A4038', hair: '#7A4A2A', hat: { kind: 'cap', color: '#7A2E2E' } };

export interface Figure {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  /** Ring of foam blocks at the water line (scaled to 0 out of the water). */
  ripple: THREE.Group;
  /** Accumulated gait phase (radians). */
  phase: number;
  /** Accumulated swim stroke phase (radians). */
  swimPhase: number;
  /** Seconds animated (idle breathing, bobbing). */
  time: number;
  /** Smoothed blend weights of the pose families (sum to 1). */
  blend: { ground: number; air: number; surface: number; under: number };
  /** Smoothed underwater body pitch (radians from upright, toward the swim direction). */
  divePitch: number;
  /** Smoothed surface stroke amount (0 treading .. 1 full stroke). */
  stroke: number;
}

interface Part { joint: THREE.Group; geo: THREE.BufferGeometry }

function joint(parts: Part[], name: string, geo: THREE.BufferGeometry, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parts.push({ joint: g, geo });
  return g;
}

/**
 * One skinned mesh for the whole figure. Each rigid part is bound with
 * weight 1 to a bone that sits at its joint, so rotating the joint groups
 * poses the figure exactly as the old one-mesh-per-part hierarchy did, at
 * one draw call per pass instead of six.
 */
function skinFigure(root: THREE.Group, parts: Part[]): THREE.SkinnedMesh {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const bones: THREE.Bone[] = [];
  const geos = parts.map(({ joint: j, geo }, index) => {
    const bone = new THREE.Bone();
    bone.name = `${j.name}_bone`;
    j.add(bone);
    bones.push(bone);
    const g = geo.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, j.matrixWorld));
    const n = g.attributes.position.count;
    const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { skinIndex[i * 4] = index; skinWeight[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    return g;
  });
  const merged = mergeGeometries(geos)!;
  for (const g of geos) g.dispose();
  for (const g of new Set(parts.map((p) => p.geo))) g.dispose();
  const mesh = new THREE.SkinnedMesh(merged, material);
  mesh.name = 'character_body';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  // Fixed bounds in the figure's own space (covers raised arms and the swim
  // pose), so culling never depends on the pose seen at the first frame.
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.5);
  mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-1.5, -0.6, -1.5), new THREE.Vector3(1.5, 2.4, 1.5));
  return mesh;
}

/** Build a 1.7 m articulated figure. Feet at y = 0, facing +z. */
export function buildFigure(style: FigureStyle = FOUNDER_STYLE): Figure {
  const root = new THREE.Group();
  root.name = 'character';
  const s = style.scale ?? 1;
  root.scale.setScalar(s);
  const parts: Part[] = [];

  // Legs hang from the hip joint at y = 0.82.
  const legGeo = part([
    { w: 0.17, h: 0.72, d: 0.19, y: -0.72, c: style.trousers },
    { w: 0.19, h: 0.12, d: 0.27, y: -0.82, z: 0.035, c: 'char_boots' },
  ]);
  const hips = new THREE.Group();
  hips.name = 'hips';
  hips.position.y = 0.82;
  const legL = joint(parts, 'legL', legGeo, 0.1, 0, 0);
  const legR = joint(parts, 'legR', legGeo, -0.1, 0, 0);
  hips.add(legL, legR);

  // Torso: hips block, belt, tapered chest, collar.
  const torsoGeo = part([
    { w: 0.40, h: 0.16, d: 0.24, y: -0.02, c: style.trousers },
    { w: 0.42, h: 0.06, d: 0.26, y: 0.12, c: 'char_boots' },
    { w: 0.40, h: 0.28, d: 0.24, y: 0.18, c: style.tunic },
    { w: 0.46, h: 0.20, d: 0.26, y: 0.42, c: style.tunic },
    { w: 0.22, h: 0.05, d: 0.18, y: 0.62, c: style.tunic },
    ...(style.apron ? [{ w: 0.36, h: 0.46, d: 0.03, y: -0.06, z: 0.135, c: style.apron }] : []),
  ]);
  const torso = joint(parts, 'torso', torsoGeo, 0, 0, 0);
  hips.add(torso);

  const headGeo = part([
    { w: 0.10, h: 0.06, d: 0.10, y: 0, c: 'char_skin' },
    { w: 0.24, h: 0.24, d: 0.24, y: 0.05, c: 'char_skin' },
    { w: 0.26, h: 0.09, d: 0.26, y: 0.24, c: style.hair },
    { w: 0.26, h: 0.12, d: 0.06, y: 0.16, z: -0.11, c: style.hair },
    { w: 0.05, h: 0.04, d: 0.03, x: 0.055, y: 0.15, z: 0.12, c: 'char_boots' },
    { w: 0.05, h: 0.04, d: 0.03, x: -0.055, y: 0.15, z: 0.12, c: 'char_boots' },
    ...(style.hat?.kind === 'straw' ? [
      { w: 0.52, h: 0.03, d: 0.52, y: 0.30, c: style.hat.color },
      { w: 0.27, h: 0.10, d: 0.27, y: 0.32, c: style.hat.color },
    ] : style.hat?.kind === 'cap' ? [
      { w: 0.28, h: 0.08, d: 0.28, y: 0.30, c: style.hat.color },
      { w: 0.22, h: 0.02, d: 0.12, y: 0.30, z: 0.17, c: style.hat.color },
    ] : []),
  ]);
  const head = joint(parts, 'head', headGeo, 0, 0.66, 0);
  torso.add(head);

  // Arms hang from the shoulder at y = 0.60 on the torso.
  const armGeo = part([
    { w: 0.13, h: 0.30, d: 0.14, y: -0.30, c: style.tunic },
    { w: 0.11, h: 0.24, d: 0.12, y: -0.53, c: 'char_skin' },
  ]);
  const armL = joint(parts, 'armL', armGeo, 0.29, 0.60, 0);
  const armR = joint(parts, 'armR', armGeo, -0.29, 0.60, 0);
  torso.add(armL, armR);

  root.add(hips);

  // Foam blocks ringing the body at the water line (M011). Part of the same
  // skinned mesh, so they cost no draw call; scaled to zero when dry.
  const foam: Box[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2, r = i % 2 ? 0.5 : 0.42;
    const w = i % 2 ? 0.09 : 0.14;
    foam.push({ w, h: 0.03, d: w * 0.7, x: Math.sin(a) * r, y: -0.015, z: Math.cos(a) * r, c: i % 3 ? '#E6F2F5' : '#C9E3EA' });
  }
  const ripple = joint(parts, 'ripple', part(foam), 0, 1.2, 0);
  root.add(ripple);

  skinFigure(root, parts);
  // Hidden until the figure is in water (after binding: a zero scale at bind time would make the bone inverse singular).
  ripple.scale.setScalar(0);
  return {
    root, hips, torso, head, armL, armR, legL, legR, ripple, phase: 0, swimPhase: 0, time: 0,
    blend: { ground: 1, air: 0, surface: 0, under: 0 }, divePitch: 0.3, stroke: 0,
  };
}

/** Joint angles and offsets of one pose; poses of different regimes are blended linearly. */
interface Pose {
  hipsY: number; hipsZ: number; hipsPitch: number; torsoPitch: number; headPitch: number;
  armLx: number; armLz: number; armRx: number; armRz: number;
  legLx: number; legLz: number; legRx: number; legRz: number;
}
const KEYS: Array<keyof Pose> = ['hipsY', 'hipsZ', 'hipsPitch', 'torsoPitch', 'headPitch', 'armLx', 'armLz', 'armRx', 'armRz', 'legLx', 'legLz', 'legRx', 'legRz'];

/** Torso length from the hip joint to the neck (head joint). */
const NECK = 0.66;
/** The neck sits this far above the drawn water line when floating (shoulders at the water line). */
const NECK_CLEAR = 0.07;
/** Arms extended ahead along the body (body frame; -PI points straight up along the spine). */
const REACH = -2.8;

const smooth = (u: number) => u * u * (3 - 2 * u);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** Progress of `u` through [a, b), eased, clamped to 0..1. */
const seg = (u: number, a: number, b: number) => smooth(clamp((u - a) / (b - a), 0, 1));

/** Whip kick of a breaststroke (legs together, draw up, sweep out and snap together). */
function whipKick(u: number, recover: number, kick: number, end: number): { x: number; z: number } {
  if (u < recover) return { x: 0.06, z: 0.03 };
  if (u < kick) { const k = seg(u, recover, kick); return { x: lerp(0.06, -0.95, k), z: lerp(0.03, 0.32, k) }; }
  if (u < end) { const k = seg(u, kick, end); return { x: lerp(-0.95, 0.16, k), z: lerp(0.32, 0.03, k) + 0.22 * Math.sin(Math.PI * k) }; }
  return { x: lerp(0.16, 0.06, seg(u, end, 1)), z: 0.03 };
}

function groundPose(f: Figure, state: CharacterState): Pose {
  const speed = state.speed;
  const sw = Math.min(1, speed / 7.5);
  let legSwing = Math.sin(f.phase) * (0.35 + 0.45 * sw) * Math.min(1, speed * 1.5);
  let armSwing = -legSwing * 0.8;
  let lean = 0.10 * sw;
  let bob = Math.abs(Math.sin(f.phase)) * 0.05 * Math.min(1, speed);
  if (speed < 0.1) {
    // Idle breathing when standing.
    lean = 0; bob = Math.sin(f.time * 1.11) * 0.006;
    armSwing = 0; legSwing = 0;
  }
  return {
    hipsY: 0.82 + bob, hipsZ: 0, hipsPitch: 0, torsoPitch: lean, headPitch: -lean * 0.6,
    armLx: armSwing, armLz: 0.06, armRx: -armSwing, armRz: -0.06,
    legLx: legSwing, legLz: 0, legRx: -legSwing, legRz: 0,
  };
}

const AIR_POSE: Pose = {
  hipsY: 0.82, hipsZ: 0, hipsPitch: 0, torsoPitch: 0.05, headPitch: 0,
  armLx: -0.9, armLz: 0.25, armRx: -0.9, armRz: -0.25, legLx: -0.45, legLz: 0, legRx: 0.25, legRz: 0,
};

/**
 * At the surface: treading water when still (upright, arms sculling out to
 * the sides, legs kicking gently) blending into a head-up breaststroke as the
 * swimmer moves (body pitched forward, arms pull out and round, then shoot
 * ahead; whip kick; glide). The body is placed so the neck stays just above
 * the drawn water line: head and shoulders out of the water.
 */
function surfacePose(f: Figure, waterLine: number): Pose {
  const m = f.stroke;
  const phi = f.swimPhase;
  const u = ((phi / (Math.PI * 2)) % 1 + 1) % 1;
  // Treading water.
  const sc = Math.sin(phi);
  const tread: Pose = {
    hipsY: 0, hipsZ: 0, hipsPitch: 0.16 + 0.03 * Math.sin(phi * 0.5), torsoPitch: 0, headPitch: -0.1,
    armLx: -0.6 + 0.38 * sc, armLz: 0.95 + 0.12 * Math.cos(phi), armRx: -0.6 + 0.38 * sc, armRz: -0.95 - 0.12 * Math.cos(phi),
    legLx: -0.32 + 0.3 * Math.sin(phi), legLz: 0.14, legRx: -0.32 - 0.3 * Math.sin(phi), legRz: -0.14,
  };
  // Breaststroke: pull 0..0.4, arm recovery 0.4..0.58, kick 0.5..0.75, glide.
  let ax: number, az: number;
  if (u < 0.4) { const k = seg(u, 0, 0.4); ax = lerp(REACH, -0.95, k); az = 0.12 + 0.85 * Math.sin(Math.PI * k); }
  else if (u < 0.58) { const k = seg(u, 0.4, 0.58); ax = lerp(-0.95, REACH, k); az = lerp(0.12, 0.04, k); }
  else { ax = REACH; az = 0.04; }
  const kick = whipKick(u, 0.42, 0.56, 0.74);
  const lift = u < 0.4 ? Math.sin(Math.PI * u / 0.4) : 0; // the head lifts to breathe during the pull
  const stroke: Pose = {
    hipsY: 0.05 * lift, hipsZ: 0, hipsPitch: 0.95 - 0.18 * lift, torsoPitch: 0, headPitch: 0,
    armLx: ax, armLz: az, armRx: ax, armRz: -az,
    legLx: kick.x, legLz: kick.z, legRx: kick.x, legRz: -kick.z,
  };
  const p = {} as Pose;
  for (const k of KEYS) p[k] = lerp(tread[k], stroke[k], m);
  // Keep the face forward and the neck above the water line.
  p.headPitch -= p.hipsPitch * 0.85;
  const bob = 0.022 * Math.sin(f.time * 1.7);
  p.hipsY = clamp(waterLine + NECK_CLEAR - NECK * Math.cos(p.hipsPitch) + p.hipsY + bob, 0.15, 1.4);
  p.hipsZ = -0.35 * Math.sin(p.hipsPitch);
  return p;
}

/**
 * Underwater: an underwater breaststroke (long pull to the thighs, glide with
 * the arms back, recover and reach), whip kick, the whole body pitched along
 * the swim direction (head down when diving, level when swimming along).
 */
function underPose(f: Figure): Pose {
  const phi = f.swimPhase;
  const u = ((phi / (Math.PI * 2)) % 1 + 1) % 1;
  let ax: number, az: number;
  if (u < 0.35) { const k = seg(u, 0, 0.35); ax = lerp(REACH - 0.1, 0.12, k); az = 0.18 + 0.75 * Math.sin(Math.PI * k); }
  else if (u < 0.5) { ax = 0.12; az = 0.12; }
  else if (u < 0.7) { const k = seg(u, 0.5, 0.7); ax = lerp(0.12, REACH - 0.1, k); az = lerp(0.12, 0.06, k); }
  else { ax = REACH - 0.1; az = 0.06; }
  const kick = whipKick(u, 0.55, 0.68, 0.85);
  return {
    hipsY: 0.85, hipsZ: 0, hipsPitch: f.divePitch, torsoPitch: 0, headPitch: -clamp(f.divePitch - 0.3, 0, 0.6) * 0.6,
    armLx: ax, armLz: az, armRx: ax, armRz: -az,
    legLx: kick.x, legLz: kick.z, legRx: kick.x, legRz: -kick.z,
  };
}

/**
 * Pose a figure from its simulation state. Walking and running swing limbs in
 * opposition with stride length tied to actual ground speed; airborne poses
 * tuck the legs; wading shortens the stride. In deep water (M011) the figure
 * treads water or swims a breaststroke at the surface, head and shoulders out,
 * and swims an underwater breaststroke pitched toward its direction when
 * submerged. Regimes cross-fade over a few tenths of a second.
 *
 * `feetY` is the drawn feet height (the interpolated position the figure is
 * placed at); it defaults to `state.y`.
 */
export function animateFigure(f: Figure, state: CharacterState, dt: number, feetY = state.y): void {
  f.time += dt;
  const speed = state.speed;
  const stride = state.mode === 'wade' ? 1.6 : 2.4;
  f.phase += (speed / stride) * Math.PI * 2 * dt;

  // Which regime: underwater once the head is under (or the feet are well below the float line).
  const swim = state.mode === 'swim';
  const surfaceY = Number.isFinite(state.waterSurface) ? state.waterSurface : feetY;
  const under = swim && (state.headUnderwater || state.y < surfaceY - 1.75);
  const target = {
    ground: !swim && state.mode !== 'air' ? 1 : 0,
    air: state.mode === 'air' ? 1 : 0,
    surface: swim && !under ? 1 : 0,
    under: under ? 1 : 0,
  };
  const kb = 1 - Math.exp(-dt * (state.mode === 'air' || f.blend.air > 0.01 ? 12 : 7));
  const b = f.blend;
  b.ground += (target.ground - b.ground) * kb;
  b.air += (target.air - b.air) * kb;
  b.surface += (target.surface - b.surface) * kb;
  b.under += (target.under - b.under) * kb;
  const sum = b.ground + b.air + b.surface + b.under || 1;

  // Stroke rhythm tied to the swim speed: treading ~0.55 Hz, full breaststroke ~1.1 Hz.
  const vy = Number.isFinite(state.vy) ? state.vy : 0;
  const swimSpeed = Math.hypot(speed, vy);
  f.stroke += (clamp(speed / 1.8, 0, 1) - f.stroke) * (1 - Math.exp(-dt * 4));
  const hz = under ? 0.4 + 0.2 * Math.min(swimSpeed, 2.6) : lerp(0.55, 0.5 + 0.25 * speed, f.stroke);
  if (b.surface + b.under > 0.001) f.swimPhase += Math.PI * 2 * hz * dt;
  // Underwater the body points along the swim direction (0 = upright rising, PI = head down).
  // Out of the dive it follows the drawn body pitch, so a dive starts from the current pose;
  // the turn rate is limited (a duck dive takes about half a second).
  // Hovering still underwater (or held on the bed by Dive), the body lies prone.
  const wantPitch = !under ? f.hips.rotation.x : swimSpeed < 0.35 ? 1.35 : clamp(Math.atan2(speed, vy), 0.15, 2.9);
  const turn = (wantPitch - f.divePitch) * (1 - Math.exp(-dt * 5));
  f.divePitch += clamp(turn, -4 * dt, 4 * dt);

  const parts: Array<[number, Pose]> = [];
  if (b.ground > 0.001) parts.push([b.ground / sum, groundPose(f, state)]);
  if (b.air > 0.001) parts.push([b.air / sum, AIR_POSE]);
  if (b.surface > 0.001) parts.push([b.surface / sum, surfacePose(f, surfaceY - WATER_DRAW_DROP - feetY)]);
  if (b.under > 0.001) parts.push([b.under / sum, underPose(f)]);
  const p = {} as Pose;
  for (const k of KEYS) { let v = 0; for (const [w, q] of parts) v += w * q[k]; p[k] = v; }

  f.hips.position.set(0, p.hipsY, p.hipsZ);
  f.hips.rotation.x = p.hipsPitch;
  f.torso.rotation.x = p.torsoPitch;
  f.head.rotation.x = p.headPitch;
  f.armL.rotation.x = p.armLx; f.armL.rotation.z = p.armLz;
  f.armR.rotation.x = p.armRx; f.armR.rotation.z = p.armRz;
  f.legL.rotation.x = p.legLx; f.legL.rotation.z = p.legLz;
  f.legR.rotation.x = p.legRx; f.legR.rotation.z = p.legRz;

  // Foam ring at the water line while swimming at the surface (or wading):
  // pulses with the stroke and widens with speed.
  const wet = swim ? b.surface / sum : state.mode === 'wade' ? 0.6 * (b.ground / sum) : 0;
  if (wet > 0.02 && Number.isFinite(state.waterSurface)) {
    const k = wet * (0.85 + 0.15 * Math.sin(f.swimPhase * 2 + 0.6) + 0.1 * clamp(speed / 2.4, 0, 1));
    f.ripple.scale.set(k * (1 + 0.05 * clamp(speed, 0, 2)), 1, k * (1 + 0.12 * clamp(speed, 0, 2)));
    f.ripple.position.set(0, surfaceY - WATER_DRAW_DROP + 0.01 - feetY, p.hipsZ * 0.6);
    f.ripple.rotation.y = f.time * 0.4;
  } else {
    f.ripple.scale.setScalar(0);
  }
}

/** Place the figure at the character state (feet position, heading). */
export function placeFigure(f: Figure, x: number, y: number, z: number, heading: number): void {
  f.root.position.set(x, y, z);
  f.root.rotation.y = heading;
}
