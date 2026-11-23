// Village architecture kit — block-built timber-and-stone buildings and props.
//
// Owner direction (2026-11-23): recognisably block-built, but not identical
// cubes. Pieces mix proportions (plinth courses, posts, braces, stepped roof
// courses, irregular stone blocks), and every dimension snaps to a 0.1 m
// quantum so the language stays crisp. Variation comes from a seeded RNG per
// piece, so the same seed always builds the same building.
//
// Origin convention: footprint centre at y = 0, +z is the front (door side).
// These are presentation builders; placement and costs remain simulation data.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import palette from '../data/palette.json';
import { mulberry32 } from '../sim/world';

const M = palette.materials as Record<string, { hex: string }>;
const C = (k: string) => new THREE.Color(M[k].hex);
const Q = (v: number) => Math.round(v * 10) / 10;

export const kitMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const glowMaterial = new THREE.MeshLambertMaterial({ color: C('prop_glow'), emissive: C('prop_glow'), emissiveIntensity: 0.9 });

interface Part { w: number; h: number; d: number; x: number; y: number; z: number; c: string; ry?: number; rz?: number; rx?: number; k?: number; }

/** Collects box parts and merges them into one vertex-coloured mesh. */
class Builder {
  parts: Part[] = [];
  glow: Part[] = [];
  add(c: string, w: number, h: number, d: number, x: number, y: number, z: number, extra: Partial<Part> = {}): this {
    this.parts.push({ w: Q(w), h: Q(h), d: Q(d), x, y, z, c, ...extra });
    return this;
  }
  light(w: number, h: number, d: number, x: number, y: number, z: number): this {
    this.glow.push({ w, h, d, x, y, z, c: 'prop_glow' });
    return this;
  }
  build(name: string): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    const toGeo = (p: Part) => {
      const g = new THREE.BoxGeometry(p.w, p.h, p.d).toNonIndexed();
      g.deleteAttribute('uv');
      g.translate(0, p.h / 2, 0);
      if (p.rx) g.rotateX(p.rx);
      if (p.rz) g.rotateZ(p.rz);
      if (p.ry) g.rotateY(p.ry);
      g.translate(p.x, p.y, p.z);
      const col = C(p.c).multiplyScalar(p.k ?? 1);
      const n = g.attributes.position.count, cols = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const ny = g.attributes.normal.getY(i);
        const f = ny > 0.5 ? 1 : ny < -0.5 ? 0.72 : 0.88;
        cols[i * 3] = col.r * f; cols[i * 3 + 1] = col.g * f; cols[i * 3 + 2] = col.b * f;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      return g;
    };
    const geos = this.parts.map(toGeo);
    const mesh = new THREE.Mesh(mergeGeometries(geos)!, kitMaterial);
    geos.forEach((g) => g.dispose());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `${name}_body`;
    group.add(mesh);
    if (this.glow.length) {
      const gg = this.glow.map((p) => { const g = new THREE.BoxGeometry(p.w, p.h, p.d); g.translate(p.x, p.y + p.h / 2, p.z); return g; });
      const glow = new THREE.Mesh(mergeGeometries(gg)!, glowMaterial);
      gg.forEach((g) => g.dispose());
      glow.name = `${name}_glow`;
      group.add(glow);
    }
    group.userData.parts = this.parts.length;
    return group;
  }
}

export interface CottageOptions {
  /** Footprint (m), snapped to whole metres; default 7 x 5. */
  width?: number;
  depth?: number;
  /** Wall height above the plinth (m). */
  wall?: number;
  /** Roof rise / half-span. 1.0 = 45 degrees; the references use ~1.1-1.3. */
  pitch?: number;
  roof?: 'thatch' | 'shingle';
  chimney?: boolean;
  seed?: number;
}

/**
 * Timber-framed cottage: stone plinth, plaster infill, corner and mid posts,
 * sill and wall plates, diagonal braces, door and windows with frames, a steep
 * roof built from stepped overhanging courses, ridge, gable infill, chimney.
 */
export function buildCottage(o: CottageOptions = {}): THREE.Group {
  const W = Math.round(o.width ?? 7), D = Math.round(o.depth ?? 5);
  const wall = o.wall ?? 2.8, pitch = o.pitch ?? 1.2;
  const rnd = mulberry32((o.seed ?? 1) * 2654435761 >>> 0);
  const b = new Builder();
  const plinth = 0.5;
  // Plinth: irregular stone blocks, alternating course lengths.
  for (let side = 0; side < 4; side++) {
    const along = side % 2 === 0 ? W : D;
    let t = -along / 2;
    while (t < along / 2 - 0.05) {
      const len = Math.min(along / 2 - t, 0.6 + Math.floor(rnd() * 4) * 0.2);
      const c = rnd() < 0.3 ? 'arch_stone_dark' : 'arch_stone';
      const mid = t + len / 2;
      if (side === 0) b.add(c, len, plinth, 0.5, mid, 0, D / 2 - 0.25);
      if (side === 1) b.add(c, 0.5, plinth, len, W / 2 - 0.25, 0, mid);
      if (side === 2) b.add(c, len, plinth, 0.5, mid, 0, -D / 2 + 0.25);
      if (side === 3) b.add(c, 0.5, plinth, len, -W / 2 + 0.25, 0, mid);
      t += len;
    }
  }
  b.add('arch_stone_dark', W - 1, 0.2, D - 1, 0, 0.3, 0);
  // Plaster walls (inset), timber frame proud of the plaster.
  const y0 = plinth;
  b.add('arch_plaster', W - 0.3, wall, D - 0.3, 0, y0, 0);
  const T = 'arch_timber', post = 0.22;
  const postsX = [-W / 2 + 0.1, -W / 6, W / 6, W / 2 - 0.1];
  for (const x of postsX) { b.add(T, post, wall, post, x, y0, D / 2 - 0.1); b.add(T, post, wall, post, x, y0, -D / 2 + 0.1); }
  for (const z of [-D / 2 + 0.1, 0, D / 2 - 0.1]) { b.add(T, post, wall, post, W / 2 - 0.1, y0, z); b.add(T, post, wall, post, -W / 2 + 0.1, y0, z); }
  for (const z of [D / 2 - 0.08, -D / 2 + 0.08]) {
    b.add(T, W, 0.2, 0.2, 0, y0, z);
    b.add(T, W + 0.2, 0.24, 0.24, 0, y0 + wall - 0.24, z);
    b.add(T, W, 0.16, 0.18, 0, y0 + wall * 0.52, z);
  }
  for (const x of [W / 2 - 0.08, -W / 2 + 0.08]) {
    b.add(T, 0.2, 0.2, D, x, y0, 0);
    b.add(T, 0.24, 0.24, D + 0.2, x, y0 + wall - 0.24, 0);
  }
  // Braces in the outer bays (front and back).
  const brace = Math.atan2(wall * 0.48, W / 3 - 0.3);
  const braceLen = Math.hypot(wall * 0.48, W / 3 - 0.3);
  for (const z of [D / 2 - 0.06, -D / 2 + 0.06]) {
    b.add(T, braceLen, 0.14, 0.12, -W / 3 - 0.0, y0 + wall * 0.52, z, { rz: brace });
    b.add(T, braceLen, 0.14, 0.12, W / 3, y0 + wall * 0.52, z, { rz: -brace });
  }
  // Door (front centre) and windows.
  const doorW = 1.2, doorH = 2.1;
  b.add('arch_timber_light', doorW, doorH, 0.12, 0, y0, D / 2 - 0.02);
  b.add(T, doorW + 0.3, 0.16, 0.18, 0, y0 + doorH, D / 2 - 0.02);
  b.add('prop_iron', 0.08, 0.08, 0.06, 0.38, y0 + 1.0, D / 2 + 0.05);
  for (const x of [-W / 3 + 0.25, W / 3 - 0.25]) {
    b.add('prop_iron', 0.9, 0.8, 0.06, x, y0 + 1.1, D / 2 - 0.03, { k: 0.6 });
    b.add(T, 1.1, 0.12, 0.2, x, y0 + 1.0, D / 2);
    b.add(T, 1.1, 0.12, 0.2, x, y0 + 1.9, D / 2);
    b.add(T, 0.1, 0.8, 0.14, x, y0 + 1.1, D / 2 + 0.01);
  }
  for (const z of [-0.9, 0.9]) b.add('prop_iron', 0.06, 0.7, 0.8, W / 2 + 0.01, y0 + 1.2, z, { k: 0.6 });
  // Steep roof: overhanging courses that step inward and up, alternating tone,
  // so the slope reads as layered thatch/shingle rather than one smooth plane.
  const roofBase = y0 + wall;
  const half = D / 2 + 0.5;
  const courses = Math.max(5, Math.round(half * pitch / 0.32));
  const rise = half * pitch;
  const main = o.roof === 'shingle' ? 'arch_stone_dark' : 'arch_thatch';
  const shade = o.roof === 'shingle' ? 'arch_stone' : 'arch_thatch_dark';
  for (let i = 0; i < courses; i++) {
    const t = i / courses;
    const span = Math.max(0.4, (1 - t) * half * 2);
    const y = roofBase + t * rise;
    const jitter = Q((rnd() - 0.5) * 0.2);
    b.add(i % 2 ? shade : main, W + 1.0 + jitter, rise / courses + 0.08, span, 0, y, 0);
  }
  b.add(T, W + 1.2, 0.22, 0.3, 0, roofBase + rise, 0);
  // Gable infill above the wall plate (plaster triangle approximated by steps).
  for (let i = 0; i < courses - 1; i++) {
    const t = i / courses;
    const span = Math.max(0.2, (1 - t) * (D - 0.3));
    for (const x of [W / 2 - 0.2, -W / 2 + 0.2]) b.add('arch_plaster', 0.2, rise / courses + 0.02, span, x, roofBase + t * rise, 0);
  }
  if (o.chimney !== false) {
    const cx = W / 2 - 1.2, cz = -D / 4;
    for (let y = roofBase - 0.4; y < roofBase + rise + 0.9; y += 0.4) {
      b.add(rnd() < 0.5 ? 'arch_stone' : 'arch_stone_dark', 0.7, 0.4, 0.7, cx, y, cz);
    }
    b.add('arch_stone_dark', 0.85, 0.15, 0.85, cx, roofBase + rise + 1.0, cz);
  }
  const g = b.build('village_cottage');
  g.userData.footprint = { w: W, d: D };
  g.userData.ridgeHeight = roofBase + rise;
  return g;
}

/** Stone well with timber frame, small roof and bucket (2.2 m across). */
export function buildWell(seed = 1): THREE.Group {
  const rnd = mulberry32(seed * 40503 >>> 0);
  const b = new Builder();
  const r = 1.0, n = 10;
  for (let course = 0; course < 3; course++) {
    for (let i = 0; i < n; i++) {
      const a = (i + (course % 2) * 0.5) / n * Math.PI * 2;
      b.add(rnd() < 0.35 ? 'arch_stone_dark' : 'arch_stone', 0.7, 0.3, 0.36, Math.sin(a) * r, course * 0.3, Math.cos(a) * r, { ry: a });
    }
  }
  b.add('arch_stone_dark', 1.6, 0.06, 1.6, 0, 0.55, 0, { k: 0.5 });
  for (const x of [-1.05, 1.05]) b.add('arch_timber', 0.18, 2.0, 0.18, x, 0.6, 0);
  b.add('arch_timber', 2.4, 0.16, 0.16, 0, 2.4, 0);
  b.add('arch_timber_light', 0.12, 0.5, 0.12, 0, 1.9, 0);
  b.add('arch_timber_light', 0.34, 0.32, 0.34, 0, 1.55, 0);
  b.add('prop_iron', 0.38, 0.05, 0.38, 0, 1.87, 0);
  for (let i = 0; i < 4; i++) b.add(i % 2 ? 'arch_thatch_dark' : 'arch_thatch', 2.6 - i * 0.55, 0.16, 1.4, 0, 2.55 + i * 0.16, 0);
  return b.build('village_well');
}

/** Stone arch bridge spanning `span` metres; deck top at y = rise. */
export function buildBridge(span = 10, width = 3, rise = 2.4, seed = 1): THREE.Group {
  const rnd = mulberry32(seed * 9973 >>> 0);
  const b = new Builder();
  const steps = Math.round(span / 0.5);
  for (let i = 0; i < steps; i++) {
    const x = -span / 2 + (i + 0.5) * (span / steps);
    const t = x / (span / 2);
    const archTop = rise - 0.5;
    const under = archTop * Math.sqrt(Math.max(0, 1 - t * t));
    const h = Math.max(0.5, rise - under);
    b.add(rnd() < 0.3 ? 'arch_stone_dark' : 'arch_stone', span / steps + 0.02, h, width, x, rise - h, 0);
  }
  b.add('arch_stone_dark', span + 2, 0.15, width - 0.4, 0, rise, 0);
  for (const z of [width / 2 - 0.2, -width / 2 + 0.2]) {
    let x = -span / 2 - 1;
    while (x < span / 2 + 1) {
      const len = 0.6 + Math.floor(rnd() * 3) * 0.2;
      b.add(rnd() < 0.4 ? 'arch_stone_dark' : 'arch_stone', Math.min(len, span / 2 + 1 - x), 0.5 + (rnd() < 0.2 ? 0.1 : 0), 0.4, x + len / 2, rise, z);
      x += len;
    }
  }
  // Ramps at both ends.
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) b.add('arch_stone', 0.6, rise - i * 0.6, width, s * (span / 2 + 0.3 + i * 0.6), 0, 0);
  const g = b.build('village_bridge');
  g.userData.deckHeight = rise + 0.15;
  return g;
}

export function buildLantern(): THREE.Group {
  const b = new Builder();
  b.add('arch_stone_dark', 0.5, 0.2, 0.5, 0, 0, 0);
  b.add('arch_timber', 0.16, 2.2, 0.16, 0, 0.2, 0);
  b.add('arch_timber', 0.6, 0.1, 0.12, 0.22, 2.25, 0);
  b.add('prop_iron', 0.3, 0.06, 0.3, 0.45, 2.15, 0);
  b.add('prop_iron', 0.34, 0.08, 0.34, 0.45, 1.72, 0);
  b.light(0.22, 0.36, 0.22, 0.45, 1.79, 0);
  return b.build('village_lantern');
}

export function buildWoodpile(seed = 1): THREE.Group {
  const rnd = mulberry32(seed * 7919 >>> 0);
  const b = new Builder();
  for (let layer = 0; layer < 4; layer++) {
    for (let i = 0; i < 6 - layer; i++) {
      const z = (i - (5 - layer) / 2) * 0.34;
      b.add(rnd() < 0.5 ? 'arch_timber_light' : 'arch_timber', 1.6 + Q(rnd() * 0.4), 0.3, 0.3, Q((rnd() - 0.5) * 0.2), layer * 0.3, z);
    }
  }
  b.add('arch_timber', 0.12, 1.3, 0.12, 0.95, 0, -1.0).add('arch_timber', 0.12, 1.3, 0.12, 0.95, 0, 1.0);
  return b.build('village_woodpile');
}

export function buildFence(length = 4, seed = 1): THREE.Group {
  const rnd = mulberry32(seed * 104729 >>> 0);
  const b = new Builder();
  const posts = Math.max(2, Math.round(length / 1.6) + 1);
  for (let i = 0; i < posts; i++) {
    const x = -length / 2 + (i / (posts - 1)) * length;
    b.add('arch_timber', 0.16, 1.0 + Q(rnd() * 0.2), 0.16, x, 0, 0);
  }
  b.add('arch_timber_light', length, 0.1, 0.08, 0, 0.45, 0.05).add('arch_timber_light', length, 0.1, 0.08, 0, 0.8, 0.05);
  return b.build('village_fence');
}

export function buildCrate(): THREE.Group {
  const b = new Builder();
  b.add('arch_timber_light', 0.8, 0.7, 0.8, 0, 0, 0);
  for (const y of [0, 0.6]) { b.add('arch_timber', 0.84, 0.1, 0.1, 0, y, 0.4); b.add('arch_timber', 0.84, 0.1, 0.1, 0, y, -0.4); }
  b.add('arch_thatch', 0.6, 0.12, 0.6, 0, 0.7, 0);
  return b.build('village_crate');
}

/** Every kit piece, laid out for the kit inspection scene. */
export function buildVillageKitShowcase(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'village_kit';
  const place = (o: THREE.Object3D, x: number, z: number, ry = 0) => { o.position.set(x, 0, z); o.rotation.y = ry; g.add(o); };
  place(buildCottage({ seed: 1 }), -9, 0);
  place(buildCottage({ width: 6, depth: 5, pitch: 1.35, roof: 'shingle', seed: 2 }), 0, -1, 0);
  place(buildWell(), 7, 4);
  place(buildLantern(), 4, 6);
  place(buildWoodpile(), 9, -2, Math.PI / 2);
  place(buildFence(5), -2, 6);
  place(buildCrate(), 5, -3);
  const bridge = buildBridge(10, 3, 2.4);
  place(bridge, 0, 14);
  return g;
}
