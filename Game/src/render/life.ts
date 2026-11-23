// Schema-3 life-state presentation. The simulation owns stockpile contents,
// crop existence and growth; this module only derives disposable THREE meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import palette from '../data/palette.json';
import { World, surfaceAt } from '../sim/world';
import { StructureModule } from '../sim/structures';
import { CropPlot, Stockpile, cropReady } from '../sim/economy';

const M = palette.materials as Record<string, { hex: string }>;
const H = (key: string) => M[key].hex;
const TIMBER = H('bark_dark');
const WOOD = H('trunk');
const STONE = H('noxel_stone_b');
const SOIL = '#684A32';
const SOIL_EDGE = H('strata_ochre');
const GREEN = H('canopy_green_a');
const GREEN_LIGHT = H('canopy_green_c');
const GOLD = '#D9AD3D';
const GOLD_LIGHT = '#F0CF63';
const FIBER = '#B8A96B';

const LIFE_MATERIAL = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
});

function paint(geometry: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  const colour = new THREE.Color(hex);
  const values = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) {
    values[i * 3] = colour.r;
    values[i * 3 + 1] = colour.g;
    values[i * 3 + 2] = colour.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, colour: string) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(x, y + h / 2, z);
  return paint(geometry, colour);
}

function mesh(parts: THREE.BufferGeometry[], name: string): THREE.Mesh {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error(`could not merge life mesh ${name}`);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const result = new THREE.Mesh(geometry, LIFE_MATERIAL);
  result.name = name;
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

/**
 * A small open Noxel depot: stone pad, timber rails and a pitched canopy. Its
 * resource pile is a separate node so replacing it after a transfer is simple.
 */
function stockpileFrame(): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [
    box(3.4, 0.18, 2.6, 0, 0, 0, STONE),
    // Slatted timber bin, open at the front so empty storage is visible.
    box(3.0, 0.16, 0.16, 0, 0.18, -1.02, TIMBER),
    box(0.16, 0.65, 2.0, -1.43, 0.18, 0, TIMBER),
    box(0.16, 0.65, 2.0, 1.43, 0.18, 0, TIMBER),
    box(3.0, 0.16, 0.16, 0, 0.70, -1.02, WOOD),
  ];
  for (const x of [-1.43, 1.43]) {
    const post = new THREE.CylinderGeometry(0.09, 0.12, 1.85, 4);
    post.rotateY(Math.PI / 4);
    post.translate(x, 1.105, -1.0);
    parts.push(paint(post, TIMBER));
  }
  // A restrained four-sided pitched roof, rather than another generic cuboid.
  const roof = new THREE.ConeGeometry(2.35, 0.62, 4);
  roof.rotateY(Math.PI / 4);
  roof.scale(1, 1, 0.76);
  roof.translate(0, 2.15, -1.0);
  parts.push(paint(roof, WOOD));
  return mesh(parts, 'stockpile_frame');
}

function resourceGeometry(resource: string, index: number): THREE.BufferGeometry {
  const x = -1.05 + (index % 4) * 0.70;
  const z = 0.42 - Math.floor(index / 4) * 0.65;
  if (resource === 'wood') {
    const log = new THREE.CylinderGeometry(0.16, 0.18, 0.58, 6);
    log.rotateZ(Math.PI / 2);
    log.translate(x, 0.39, z);
    return paint(log, WOOD);
  }
  if (resource === 'stone' || resource === 'ore') {
    const rock = new THREE.DodecahedronGeometry(resource === 'ore' ? 0.20 : 0.24, 0);
    rock.scale(1.1, 0.75, 0.9);
    rock.rotateY(index * 0.7);
    rock.translate(x, 0.38, z);
    return paint(rock, resource === 'ore' ? H('ore_crystal') : STONE);
  }
  if (resource === 'fiber' || resource === 'seed') {
    const bundle = new THREE.ConeGeometry(0.22, 0.44, 5);
    bundle.translate(x, 0.40, z);
    return paint(bundle, resource === 'seed' ? GOLD : FIBER);
  }
  // Food and rations are small faceted sacks, recognizable without labels.
  const sack = new THREE.OctahedronGeometry(0.25, 0);
  sack.scale(0.9, 1.15, 0.8);
  sack.translate(x, 0.42, z);
  return paint(sack, resource === 'rations' ? GOLD_LIGHT : GOLD);
}

function stockpileResources(stock: Stockpile): THREE.Mesh | null {
  const entries = Object.entries(stock.inventory)
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  const parts = entries.map(([resource], index) => resourceGeometry(resource, index));
  if (parts.length === 0) return null;
  const resources = mesh(parts, 'stockpile_resources');
  resources.userData.resources = Object.fromEntries(entries);
  resources.userData.stored = entries.reduce((sum, [, amount]) => sum + amount, 0);
  resources.userData.capacity = stock.capacity;
  return resources;
}

function buildStockpile(world: World, stock: Stockpile): THREE.Group {
  const group = new THREE.Group();
  group.name = `life_${stock.id}`;
  group.position.set(stock.x, surfaceAt(world, Math.floor(stock.x), Math.floor(stock.z)), stock.z);
  group.userData.stockpileId = stock.id;
  group.userData.capacity = stock.capacity;
  group.userData.inspectTarget = { x: 0, y: 1.5, z: -0.4 };
  group.add(stockpileFrame());
  const resources = stockpileResources(stock);
  // Empty storage is a real visible state, not an invisible placeholder.
  const empty = new THREE.Object3D();
  empty.name = 'stockpile_empty';
  empty.visible = resources === null;
  group.userData.empty = resources === null;
  group.add(empty);
  if (resources) group.add(resources);
  return group;
}

function plant(
  parts: THREE.BufferGeometry[], x: number, y: number, z: number,
  height: number, spread: number, colour: string, crown: string,
): void {
  const stem = new THREE.CylinderGeometry(0.025, 0.04, height, 5);
  stem.translate(x, y + height / 2, z);
  parts.push(paint(stem, colour));
  // Two pointed leaves give sprouts a readable organic silhouette.
  for (const side of [-1, 1]) {
    const leaf = new THREE.OctahedronGeometry(0.10, 0);
    leaf.scale(1.6, 0.45, 0.8);
    leaf.rotateZ(side * 0.55);
    leaf.translate(x + side * spread * 0.45, y + height * 0.52, z);
    parts.push(paint(leaf, colour));
  }
  if (height > 0.5) {
    const head = new THREE.DodecahedronGeometry(0.10, 0);
    head.scale(0.85, 1.35, 0.85);
    head.translate(x, y + height, z);
    parts.push(paint(head, crown));
  }
}

/** Geometry remains inside the corresponding authoritative crop-row bounds. */
function cropGeometry(row: StructureModule, crop: CropPlot | undefined, tick: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  if (!crop) {
    // Empty plots show a low tilled ridge, with small breaks in its silhouette.
    parts.push(box(row.w, 0.07, row.d * 0.72, row.x, row.y, row.z, SOIL));
    const clods = Math.max(3, Math.round(row.w / 1.5));
    for (let i = 0; i < clods; i++) {
      const clod = new THREE.DodecahedronGeometry(0.085, 0);
      clod.scale(1.4, 0.45, 0.8);
      clod.translate(row.x - row.w / 2 + row.w * (i + 0.5) / clods, row.y + 0.075, row.z);
      parts.push(paint(clod, i % 2 ? SOIL_EDGE : SOIL));
    }
  } else {
    const progress = THREE.MathUtils.clamp(
      (tick - crop.plantedTick) / crop.growthTicks, 0, 1,
    );
    const ready = progress >= 1;
    // Four visible stages; readiness also changes green foliage to gold.
    const stage = ready ? 3 : Math.floor(progress * 3);
    const height = 0.14 + stage * 0.09;
    const count = Math.max(3, Math.round(row.w / 0.9));
    for (let i = 0; i < count; i++) {
      const x = row.x - row.w / 2 + row.w * (i + 0.5) / count;
      const z = row.z + (i % 2 === 0 ? -0.025 : 0.025);
      plant(parts, x, row.y, z, height, row.d * 0.4,
        ready ? GOLD : stage === 0 ? GREEN_LIGHT : GREEN,
        ready ? GOLD_LIGHT : GREEN_LIGHT);
    }
  }
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error(`could not merge life crop row ${row.x},${row.z}`);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function cropRows(world: World): StructureModule[] {
  const structures = [...world.structures.values()]
    .filter((structure) => structure.kind === 'terrace')
    .sort((a, b) => a.id.localeCompare(b.id));
  const source = structures.find((structure) => structure.designVersion === 2) ?? structures[0];
  return source?.modules.filter((module) => module.kind === 'crop_row') ?? [];
}

/**
 * Build the complete schema-3 life overlay. No structure meshes are included:
 * the caller must render that farm without its static crop foliage to avoid a
 * second, lifecycle-unaware plant layer. Legacy worlds return an empty group.
 */
export function buildLifeMeshes(world: World): THREE.Group {
  const group = new THREE.Group();
  group.name = 'life_state';
  group.userData.schema = 3;
  if (!world.life) return group;

  const life = world.life;
  for (const stock of [...life.stockpiles.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    group.add(buildStockpile(world, stock));
  }
  const rows = cropRows(world);
  // IDs are fixed plot indices, so extra/missing terrace rows cannot silently
  // associate a plant with the wrong physical location.
  for (let index = 0; index < Math.min(rows.length, 9); index++) {
    const id = `crop:${index}`;
    const crop = life.crops.get(id);
    const ready = crop !== undefined && cropReady(crop, life.tick);
    const plot = new THREE.Mesh(cropGeometry(rows[index], crop, life.tick), LIFE_MATERIAL);
    plot.name = `life_${id}`;
    plot.castShadow = crop !== undefined;
    plot.receiveShadow = true;
    plot.userData.cropId = id;
    plot.userData.state = !crop ? 'empty' : ready ? 'ready' : 'sprout';
    plot.userData.plantedTick = crop?.plantedTick;
    plot.userData.growthTicks = crop?.growthTicks;
    plot.userData.tick = life.tick;
    plot.userData.inspectTarget = {
      x: rows[index].x, y: rows[index].y + Math.max(0.12, rows[index].h / 2), z: rows[index].z,
    };
    group.add(plot);
  }
  return group;
}

/** Dispose per-instance geometry; the shared flat-shaded material is retained. */
export function disposeLifeMeshes(group: THREE.Group): void {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
  group.clear();
}
