// Block-built animals that move, in one instanced draw call per species.
//
// A model is a list of boxes. Each box belongs to a *part* (body, leg, head,
// tail, wing, wool) with a pivot. A small vertex-shader patch swings legs
// about the hip, tips the head about the neck, wags the tail, flaps wings and
// scales wool, all driven by two per-instance vec4s, so a whole herd animates
// without per-frame geometry work and without extra draw calls.
//
// Part ids (add 10 to make a part appear on males only: horns, antlers, combs):
//   0 body   1 leg set A   2 leg set B   3 head   4 tail   6 wing   7 wool
// Instance data:
//   iAnim  = (gait phase, leg swing, head pitch (+ = nose down), tail wag)
//   iState = (male, young, lying, wing flap / wool fullness)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import palette from '../data/palette.json';

const M = palette.materials as Record<string, { hex: string }>;
const colour = (k: string) => new THREE.Color(k.startsWith('#') ? k : M[k].hex);

export const PART = { body: 0, legA: 1, legB: 2, head: 3, tail: 4, wing: 6, wool: 7, male: 10 } as const;

export interface ABox {
  w: number; h: number; d: number;
  /** Box centre (metres; +z forward, y up, ground at 0). */
  x: number; y: number; z: number;
  c: string;
  part?: number;
  pivot?: [number, number, number];
  rx?: number; ry?: number; rz?: number;
}

export function bx(w: number, h: number, d: number, x: number, y: number, z: number, c: string,
  part: number = PART.body, pivot?: [number, number, number], rot?: { rx?: number; ry?: number; rz?: number }): ABox {
  return { w, h, d, x, y, z, c, part, pivot, ...rot };
}

export interface AnimalModel {
  id: string;
  boxes: ABox[];
  /** Hip height: a lying animal lowers its body by most of this. */
  legLen: number;
  /** Tint a young animal towards this colour (chicks are yellow). */
  youngTint?: string;
}

/** Merge the boxes into one geometry with per-vertex colour and part data. */
export function buildAnimalGeometry(model: AnimalModel): THREE.BufferGeometry {
  const geos = model.boxes.map((b) => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d).toNonIndexed();
    if (b.rx || b.ry || b.rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0)));
    g.translate(b.x, b.y, b.z);
    g.deleteAttribute('uv');
    const col = colour(b.c), n = g.attributes.position.count;
    const colors = new Float32Array(n * 3), rig = new Float32Array(n * 4);
    const pv = b.pivot ?? [b.x, b.y, b.z];
    const normals = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      const ny = normals.getY(i);
      const k = ny > 0.5 ? 1 : ny < -0.5 ? 0.74 : 0.88;
      colors[i * 3] = col.r * k; colors[i * 3 + 1] = col.g * k; colors[i * 3 + 2] = col.b * k;
      rig[i * 4] = pv[0]; rig[i * 4 + 1] = pv[1]; rig[i * 4 + 2] = pv[2]; rig[i * 4 + 3] = b.part ?? 0;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aRig', new THREE.BufferAttribute(rig, 4));
    return g;
  });
  const merged = mergeGeometries(geos)!;
  for (const g of geos) g.dispose();
  return merged;
}

const VERTEX_HEAD = /* glsl */`
attribute vec4 aRig;
attribute vec4 iAnim;
attribute vec4 iState;
vec3 rotX(vec3 p, vec3 c, float a) { float s = sin(a), k = cos(a); vec3 d = p - c; return c + vec3(d.x, d.y * k - d.z * s, d.y * s + d.z * k); }
vec3 rotY(vec3 p, vec3 c, float a) { float s = sin(a), k = cos(a); vec3 d = p - c; return c + vec3(d.x * k + d.z * s, d.y, -d.x * s + d.z * k); }
vec3 rotZ(vec3 p, vec3 c, float a) { float s = sin(a), k = cos(a); vec3 d = p - c; return c + vec3(d.x * k - d.y * s, d.x * s + d.y * k, d.z); }
`;

const VERTEX_BODY = /* glsl */`
vec3 transformed = vec3( position );
{
  vec3 pv = aRig.xyz;
  float male = step(9.5, aRig.w);
  float part = aRig.w - 10.0 * male;
  float swing = sin(iAnim.x) * iAnim.y;
  if (male > 0.5 && iState.x < 0.5) {
    transformed = pv;                                  // not on this animal
  } else if (part > 0.5 && part < 2.5) {               // legs: fold when lying, then swing about the hip
    transformed.y = pv.y + (transformed.y - pv.y) * mix(1.0, 0.3, iState.z);
    transformed = rotX(transformed, pv, part < 1.5 ? swing : -swing);
  } else if (part > 2.5 && part < 3.5) {               // head: bigger on the young, tips about the neck
    transformed = pv + (transformed - pv) * (1.0 + 0.3 * iState.y);
    transformed = rotX(transformed, pv, iAnim.z);
  } else if (part > 3.5 && part < 4.5) {               // tail
    transformed = rotY(transformed, pv, sin(iAnim.x * 0.8) * iAnim.w);
  } else if (part > 5.5 && part < 6.5) {               // wings flap about the shoulder
    transformed = rotZ(transformed, pv, iState.w * sin(iAnim.x * 3.0) * sign(pv.x) * 0.9);
  } else if (part > 6.5 && part < 7.5) {               // wool thins after shearing
    transformed = pv + (transformed - pv) * mix(0.7, 1.0, iState.w);
  }
}
#ifdef USE_COLOR
  #ifdef YOUNG_TINT
    vColor.rgb = mix(vColor.rgb, YOUNG_TINT, iState.y * 0.9);
  #endif
#endif
`;

/** One shared look for every animal: flat-shaded vertex colours plus the rig patch. */
export function animalMaterial(youngTint?: string): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  if (youngTint) {
    const t = colour(youngTint);
    mat.defines = { YOUNG_TINT: `vec3(${t.r.toFixed(3)}, ${t.g.toFixed(3)}, ${t.b.toFixed(3)})` };
  }
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', VERTEX_BODY);
  };
  mat.customProgramCacheKey = () => `animal-rig-${youngTint ?? 'none'}`;
  return mat;
}

export interface AnimalPose {
  x: number; y: number; z: number; heading: number; scale: number;
  phase: number; legSwing: number; headPitch: number; tailWag: number;
  male: boolean; young: boolean; lying: boolean;
  /** Wing flap amount (birds) or wool fullness 0..1 (sheep). */
  extra: number;
  pitch?: number; roll?: number;
}

/** All instances of one species: one InstancedMesh, one draw call. */
export class AnimalBatch {
  readonly mesh: THREE.InstancedMesh;
  readonly model: AnimalModel;
  private readonly anim: THREE.InstancedBufferAttribute;
  private readonly state: THREE.InstancedBufferAttribute;
  private n = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(model: AnimalModel, readonly capacity: number, name: string) {
    this.model = model;
    const geo = buildAnimalGeometry(model);
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.state = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.anim.setUsage(THREE.DynamicDrawUsage);
    this.state.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iAnim', this.anim);
    geo.setAttribute('iState', this.state);
    this.mesh = new THREE.InstancedMesh(geo, animalMaterial(model.youngTint), capacity);
    this.mesh.name = name;
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // Culled as a whole by a sphere around this frame's instances (end()),
    // so a herd that is off screen or outside the sun's shadow box costs no
    // draw call. Every animal still exists and moves in the simulation.
    this.mesh.frustumCulled = true;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
  }

  /** Margin (m) around instance origins covering the largest model and pose. */
  static readonly BOUNDS_MARGIN = 4;
  private readonly lo = new THREE.Vector3();
  private readonly hi = new THREE.Vector3();

  begin(): void { this.n = 0; this.lo.set(Infinity, Infinity, Infinity); this.hi.set(-Infinity, -Infinity, -Infinity); }

  push(p: AnimalPose): boolean {
    if (this.n >= this.capacity) return false;
    const i = this.n++;
    const lie = p.lying ? 1 : 0;
    this.e.set(p.pitch ?? 0, p.heading, p.roll ?? 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.v.set(p.x, p.y - lie * this.model.legLen * 0.7 * p.scale, p.z);
    this.s.set(p.scale, p.scale, p.scale);
    this.mesh.setMatrixAt(i, this.m.compose(this.v, this.q, this.s));
    this.lo.min(this.v); this.hi.max(this.v);
    this.anim.setXYZW(i, p.phase, p.legSwing, p.headPitch, p.tailWag);
    this.state.setXYZW(i, p.male ? 1 : 0, p.young ? 1 : 0, lie, p.extra);
    return true;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    const sphere = this.mesh.boundingSphere!;
    if (this.n > 0) {
      sphere.center.addVectors(this.lo, this.hi).multiplyScalar(0.5);
      sphere.radius = this.lo.distanceTo(this.hi) / 2 + AnimalBatch.BOUNDS_MARGIN;
    }
    // Upload only the instances in use, not the whole capacity.
    for (const [a, stride] of [[this.mesh.instanceMatrix, 16], [this.anim, 4], [this.state, 4]] as const) {
      a.clearUpdateRanges();
      if (this.n > 0) a.addUpdateRange(0, this.n * stride);
      a.needsUpdate = this.n > 0;
    }
  }

  get count(): number { return this.n; }
}
