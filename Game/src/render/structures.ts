// M002 structure renderer — Noxel masses from authoritative structure modules.
//
// The simulation owns every module (position, size, tone). This file only turns
// that list into one merged, flat-shaded mesh per structure. It never decides
// what exists, and it never edits terrain.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import palette from '../data/palette.json';
import { Structure, StructureModule } from '../sim/structures';
import { SiteState } from '../sim/construction';
import { Rect } from '../sim/terrain';
const M = palette.materials as Record<string, { hex: string }>;
const H = (k: string) => M[k].hex;

const TONE: Record<string, string> = {
  stone: H('noxel_stone'),
  stone_b: H('noxel_stone_b'),
  timber: H('bark_dark'),
  ochre: H('strata_ochre'),
  accent: H('accent_blue'),
  gravel: new THREE.Color(H('stone_body_b')).lerp(new THREE.Color(H('sand')), 0.35).getHexString().padStart(6, '0'),
  soil: H('strata_ochre'),
  crop: H('canopy_green_a'),
};

// `getHexString()` drops the leading '#', so normalise it back to a CSS colour.
function toneColour(tone: string | undefined): string {
  const raw = (tone && TONE[tone]) || TONE.stone;
  return raw.startsWith('#') ? raw : `#${raw}`;
}

const STRUCTURE_MATERIAL = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
});
const CROP_MATERIAL = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
});

function paint(geometry: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  const colour = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = colour.r;
    arr[i * 3 + 1] = colour.g;
    arr[i * 3 + 2] = colour.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function structureAnchor(structure: Structure, height: number): { x: number; y: number; z: number } {
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const m of structure.modules) {
    // Rotation is around the module centre; a bounding sphere keeps the anchor
    // valid for legacy rotated lintels without assuming a rectangular site.
    const extent = Math.hypot(m.w, m.d) / 2;
    bounds.expandByPoint(point.set(m.x - extent, m.y, m.z - extent));
    bounds.expandByPoint(point.set(m.x + extent, m.y + m.h + height, m.z + extent));
  }
  const centre = bounds.getCenter(new THREE.Vector3());
  return { x: centre.x, y: centre.y + height / 2, z: centre.z };
}

function moduleGeometry(m: StructureModule, designVersion?: Structure['designVersion']): THREE.BufferGeometry {
  // Crop rows are aggregate presentation volumes, never simulation plants.
  // Design 2 uses one restrained faceted silhouette inside the exact row bounds.
  if (m.kind === 'crop_row' && designVersion === 2) return cropGeometry(m);
  const g = new THREE.BoxGeometry(m.w, m.h, m.d);
  if (m.rot) g.rotateY(m.rot);
  g.translate(m.x, m.y + m.h / 2, m.z);
  return paint(g, toneColour(m.tone));
}

/** Deterministic low-sided leaf canopy, bounded by an authoritative crop row. */
function cropGeometry(m: StructureModule): THREE.BufferGeometry {
  const leaves: THREE.BufferGeometry[] = [];
  const count = Math.max(3, Math.round(m.w / 1.2));
  const sides = 5;
  const radius = Math.min(m.d / 2 - 0.035, m.w / count / 2);
  for (let i = 0; i < count; i++) {
    const cx = m.x - m.w / 2 + m.w * (i + 0.5) / count;
    const cz = m.z + (i % 2 === 0 ? -0.035 : 0.035);
    const top = m.y + m.h * (i % 3 === 0 ? 1 : 0.82);
    const shoulder = m.y + m.h * 0.46;
    const pos: number[] = [];
    const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
    const outerPoint = (k: number) => {
      const angle = (k % sides) * 2 * Math.PI / sides;
      return [cx + Math.cos(angle) * radius, shoulder, cz + Math.sin(angle) * radius];
    };
    for (let k = 0; k < sides; k++) {
      const a = outerPoint(k), b = outerPoint(k + 1);
      tri([cx, m.y, cz], b, a);
      tri(a, b, [cx, top, cz]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    leaves.push(paint(g, toneColour(m.tone)));
  }
  const merged = mergeGeometries(leaves, false);
  for (const leaf of leaves) leaf.dispose();
  if (!merged) throw new Error('could not merge crop-row presentation');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** One merged mesh for a finished structure. */
export function buildStructureMesh(structure: Structure): THREE.Mesh | THREE.Group {
  if (structure.designVersion === 2 && structure.kind === 'terrace') {
    const group = new THREE.Group();
    group.name = `structure_${structure.kind}`;
    group.userData.structureId = structure.id;    group.userData.inspectTarget = structureAnchor(structure, 0.6);
    const earth = buildStructureMesh({ ...structure, designVersion: undefined,
      modules: structure.modules.filter((m) => m.kind !== 'crop_row') });
    if (!(earth instanceof THREE.Mesh)) throw new Error('unexpected terrace group');
    group.add(earth);
    const parts = structure.modules.filter((m) => m.kind === 'crop_row').map(cropGeometry);
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!merged) throw new Error(`could not merge crop rows ${structure.id}`);
    const foliage = new THREE.Mesh(merged, CROP_MATERIAL);
    foliage.name = 'crop_row_foliage';
    foliage.castShadow = true;
    foliage.receiveShadow = true;
    foliage.userData.presentationBounds = structure.modules.filter((m) => m.kind === 'crop_row').length;
    group.add(foliage);
    return group;
  }
  const parts = structure.modules.map((m) => moduleGeometry(m, structure.designVersion));
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error(`could not merge structure ${structure.id}`);
  const mesh = new THREE.Mesh(merged, STRUCTURE_MATERIAL);
  mesh.name = `structure_${structure.kind}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.structureId = structure.id;  mesh.userData.inspectTarget = structureAnchor(structure, structure.kind === 'house' ? 0.6 : 0.3);
  return mesh;
}

const GHOST_COLOUR: Record<SiteState, string> = {
  valid: '#6FE39A',
  valid_with_preparation: '#F2B35C',
  invalid: '#E86A5E',
};

export interface ProjectGhostSpec {
  kind: 'house' | 'path' | 'terrace';
  rect: Rect;
  floorY: number;
  door?: { x: number; z: number };
  bands?: readonly { z0: number; z1: number; y: number }[];
}

function ghostBox(
  group: THREE.Group,
  cx: number, y: number, cz: number,
  w: number, h: number, d: number,
  colour: string,
): void {
  const box = new THREE.BoxGeometry(w, h, d);
  const fill = new THREE.Mesh(box, new THREE.MeshBasicMaterial({
    color: colour,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  fill.position.set(cx, y + h / 2, cz);
  fill.renderOrder = 2;
  group.add(fill);

  const edges = new THREE.EdgesGeometry(box);
  box.dispose();
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
    color: colour,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  }));
  line.position.copy(fill.position);
  line.renderOrder = 3;
  group.add(line);
}

/**
 * Footprint ghost for a project. Houses get a massing box; the terraced field
 * gets one box per pinned band so the preview shows the actual step profile.
 */
export function buildProjectGhost(project: ProjectGhostSpec, state: SiteState): THREE.Group {
  const group = new THREE.Group();
  group.name = `m2_ghost_${project.kind}`;
  const colour = GHOST_COLOUR[state];
  const rect = project.rect;
  const w = rect.x1 - rect.x0 + 1;
  const d = rect.z1 - rect.z0 + 1;
  const cx = rect.x0 + w / 2;
  const cz = rect.z0 + d / 2;

  if (project.bands) {
    for (const band of project.bands) {
      const bd = band.z1 - band.z0 + 1;
      ghostBox(group, cx, band.y, band.z0 + bd / 2, w, 0.32, bd, colour);
    }
  } else {
    const h = project.kind === 'house' ? 3.6 : project.kind === 'path' ? 0.3 : 0.55;
    ghostBox(group, cx, project.floorY, cz, w, h, d, colour);
  }

  if (project.door) {
    const door = project.door;
    ghostBox(group, door.x + 0.5, project.floorY, door.z + 0.5, 0.9, 2.2, 1.2, colour);
  }

  return group;
}
