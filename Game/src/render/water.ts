// Render layer — near water surfaces built from the authoritative water voxels.
//
// Geometry comes from the voxel volume (so edits, dug pits and the v2 mountain
// river are exact). Each water column's top gets a quad carrying:
//   aFlow  — surface current (direction * speed, m/s) from sim Hydrology,
//   aDepth — water depth to the bed (metres),
//   aFoam  — shore / cascade foam weight.
// Where a water surface stands above a lower neighbour (a cascade or fall), a
// vertical sheet is emitted down to the neighbour's surface.
//
// Hydrology is simulation data; ripples, foam and transparency here are
// presentation only and never feed back into state.
import * as THREE from 'three';
import palette from '../data/palette.json';
import {
  World, VoxelChunk, MAT, CHUNK_SIZE, Y_MIN, Y_MAX, isSolid,
  chunkOriginX, chunkOriginZ, localIndex, yToIndex, getVoxel, hydrologyFor,
} from '../sim/world';

const M = palette.materials as Record<string, { hex: string }>;
const H = (k: string) => new THREE.Color(M[k].hex);

/** The drawn water surface sits this far below the top of the water voxels (the sim surface). */
export const WATER_DRAW_DROP = 0.1;

/** Shared time uniform for every water material. */
export const waterTime = { value: 0 };

function makeWaterMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterTime;
    shader.uniforms.uShallow = { value: H('water_shallow') };
    shader.uniforms.uMid = { value: H('water_mid') };
    shader.uniforms.uDeep = { value: H('water_deep') };
    shader.uniforms.uRim = { value: H('water_rim') };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec2 aFlow;
attribute float aDepth;
attribute float aFoam;
attribute float aSheet;
varying vec2 vFlow;
varying float vDepth;
varying float vFoam;
varying float vSheet;
varying vec3 vWorldPosW;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vFlow = aFlow; vDepth = aDepth; vFoam = aFoam; vSheet = aSheet;
vWorldPosW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform vec3 uShallow; uniform vec3 uMid; uniform vec3 uDeep; uniform vec3 uRim;
varying vec2 vFlow;
varying float vDepth;
varying float vFoam;
varying float vSheet;
varying vec3 vWorldPosW;
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y);
}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
float speed = length(vFlow);
// Advect the pattern downstream. Quantised to 0.25 m cells so ripples read as
// block-built facets rather than smooth gradients.
vec2 p = vWorldPosW.xz;
vec2 adv = p - vFlow * uTime;
vec2 cell = floor(adv * 4.0) / 4.0;
float n1 = wNoise(cell * 0.55);
float n2 = wNoise(cell * 1.7 + vec2(uTime * 0.07, -uTime * 0.05));
float ripple = n1 * 0.6 + n2 * 0.4;
// Still water (sea, lake) gets a slow swell instead of a current.
float swell = 0.5 + 0.5 * sin(dot(p, vec2(0.11, 0.07)) + uTime * 0.6);
ripple = mix(mix(ripple, swell, 0.5), ripple, clamp(speed * 2.0, 0.0, 1.0));
float d = clamp(vDepth / 4.0, 0.0, 1.0);
vec3 water = mix(uShallow, uMid, smoothstep(0.0, 0.5, d));
water = mix(water, uDeep, smoothstep(0.5, 1.0, d));
water *= 0.9 + 0.2 * ripple;
// Streaks along fast current, foam at shores and cascades.
float streak = step(0.78 - clamp(speed * 0.06, 0.0, 0.2), n2) * clamp(speed * 0.5, 0.0, 1.0);
float foamNoise = step(0.45, wNoise(cell * 2.3 + uTime * 0.3));
float foam = clamp(vFoam * foamNoise + streak * 0.6, 0.0, 1.0);
// Falling sheets: fast vertical streaks.
if (vSheet > 0.5) {
  float fall = wNoise(vec2(floor(vWorldPosW.x * 4.0 + vWorldPosW.z * 4.0), floor((vWorldPosW.y + uTime * 3.5) * 3.0)));
  foam = max(foam, step(0.35, fall));
}
vec3 col = mix(water, uRim * 1.08, foam);
float alpha = mix(0.55, 0.9, smoothstep(0.4, 3.0, vDepth));
alpha = max(alpha, foam * 0.95);
if (vSheet > 0.5) alpha = max(alpha, 0.82);
vec4 diffuseColor = vec4( diffuse * col, alpha * opacity );`);
  };
  return mat;
}

export const nearWaterMaterial = makeWaterMaterial();

/** Mesh the water surfaces of one chunk; null when the chunk holds no water. */
export function meshChunkWater(world: World, chunk: VoxelChunk): THREE.Mesh | null {
  const hydro = hydrologyFor(world.seed, world.params.generatorVersion);
  const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
  const levels = new Int16Array(CHUNK_SIZE * CHUNK_SIZE).fill(-9999);
  const beds = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);

  // Water surface per column: the first non-water cell above the water that
  // stands on this column's solid surface.
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const col = lz * CHUNK_SIZE + lx;
      const bed = chunk.heights[col] + Y_MIN + 1;
      let y = bed;
      while (y < Y_MAX && chunk.data[localIndex(lx, yToIndex(y), lz)] === MAT.WATER) y++;
      if (y > bed) { levels[col] = y; beds[col] = bed; }
    }
  }

  const pos: number[] = [], nrm: number[] = [], clr: number[] = [];
  const flow: number[] = [], depth: number[] = [], foam: number[] = [], sheet: number[] = [];
  const idx: number[] = [];
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number,
    fx: number, fz: number, dep: number, fo: number, sh: number) => {
    pos.push(x, y, z); nrm.push(nx, ny, nz); clr.push(1, 1, 1);
    flow.push(fx, fz); depth.push(dep); foam.push(fo); sheet.push(sh);
  };
  const quad = (base: number) => { idx.push(base, base + 1, base + 2, base, base + 2, base + 3); };

  const levelAt = (wx: number, wz: number, lx: number, lz: number): number => {
    if (lx >= 0 && lz >= 0 && lx < CHUNK_SIZE && lz < CHUNK_SIZE) return levels[lz * CHUNK_SIZE + lx];
    // Neighbour chunk: read the voxels (chunks are generated in 3x3 rings for meshing).
    let y = Y_MAX - 1;
    while (y > Y_MIN && !isSolid(getVoxel(world, wx, y, wz)) && getVoxel(world, wx, y, wz) !== MAT.WATER) y--;
    return getVoxel(world, wx, y, wz) === MAT.WATER ? y + 1 : -9999;
  };

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const col = lz * CHUNK_SIZE + lx;
      const level = levels[col];
      if (level === -9999) continue;
      const x = ox + lx, z = oz + lz;
      const f = hydro.flowAt(x + 0.5, z + 0.5, level);
      const fx = f.dx * f.speed, fz = f.dz * f.speed;
      const dep = level - beds[col];
      let shore = 0;
      const sides: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of sides) {
        const m = getVoxel(world, x + dx, level - 1, z + dz);
        if (isSolid(m)) shore = 1;
      }
      const y = level - WATER_DRAW_DROP;
      const base = pos.length / 3;
      const fo = Math.max(shore * 0.65, Math.min(1, f.speed / 3.5));
      push(x, y, z, 0, 1, 0, fx, fz, dep, fo, 0);
      push(x, y, z + 1, 0, 1, 0, fx, fz, dep, fo, 0);
      push(x + 1, y, z + 1, 0, 1, 0, fx, fz, dep, fo, 0);
      push(x + 1, y, z, 0, 1, 0, fx, fz, dep, fo, 0);
      quad(base);

      // Cascade sheets toward lower water (or open air) on any side.
      for (const [dx, dz] of sides) {
        const nLevel = levelAt(x + dx, z + dz, lx + dx, lz + dz);
        if (nLevel === -9999 || nLevel >= level) continue;
        if (isSolid(getVoxel(world, x + dx, level - 1, z + dz))) continue;
        const top = level - WATER_DRAW_DROP, bottom = nLevel - WATER_DRAW_DROP;
        const b = pos.length / 3;
        // Face on the shared edge, oriented toward the lower neighbour.
        const ex = dx > 0 ? x + 1 : dx < 0 ? x : x, ez = dz > 0 ? z + 1 : dz < 0 ? z : z;
        if (dx !== 0) {
          push(ex, top, z, dx, 0, 0, 0, 0, 2, 1, 1);
          push(ex, top, z + 1, dx, 0, 0, 0, 0, 2, 1, 1);
          push(ex, bottom, z + 1, dx, 0, 0, 0, 0, 2, 1, 1);
          push(ex, bottom, z, dx, 0, 0, 0, 0, 2, 1, 1);
        } else {
          push(x, top, ez, 0, 0, dz, 0, 0, 2, 1, 1);
          push(x + 1, top, ez, 0, 0, dz, 0, 0, 2, 1, 1);
          push(x + 1, bottom, ez, 0, 0, dz, 0, 0, 2, 1, 1);
          push(x, bottom, ez, 0, 0, dz, 0, 0, 2, 1, 1);
        }
        quad(b);
      }
    }
  }
  if (idx.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(clr, 3));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
  g.setAttribute('aFoam', new THREE.Float32BufferAttribute(foam, 1));
  g.setAttribute('aSheet', new THREE.Float32BufferAttribute(sheet, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, nearWaterMaterial);
  mesh.name = `water_chunk_${chunk.cx}_${chunk.cz}`;
  mesh.renderOrder = 2;
  mesh.userData.waterTriangles = idx.length / 3;
  return mesh;
}

/**
 * Cut a rectangular hole in the far (opaque) sea plane where near chunks draw
 * their own transparent water, so shallows show the real bed.
 */
export function installFarWaterHole(material: THREE.Material): { value: THREE.Vector4 } {
  const hole = { value: new THREE.Vector4(0, 0, 0, 0) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHole = hole;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFarXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFarXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uHole;\nvarying vec2 vFarXZ;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );',
        'if (vFarXZ.x > uHole.x && vFarXZ.x < uHole.z && vFarXZ.y > uHole.y && vFarXZ.y < uHole.w) discard;\nvec4 diffuseColor = vec4( diffuse, opacity );');
  };
  return hole;
}
