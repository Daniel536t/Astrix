// Pure greedy voxel mesher over a padded chunk volume. No World access and no
// WebGL objects, so it runs identically on the main thread and in a worker.
//
// Padded layout: x and z run from -1 to CHUNK_SIZE (34 cells) so faces on chunk
// borders can see their neighbours; y runs over the full world height. Out of
// range y samples are bedrock below and air above, as in getVoxel.
import {
  CHUNK_SIZE, WORLD_HEIGHT, Y_MIN, MAT, isOpaque, localIndex,
} from '../sim/world';
import { colorForKey, heightBand, keyFor, shadeAt, stoneTone } from './voxel-colors';

export const PAD = CHUNK_SIZE + 2;
export const PADDED_VOLUME = PAD * PAD * WORLD_HEIGHT;

export interface MeshArrays {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  mats: Float32Array;
  indices: Uint32Array;
  triangles: number;
}

export const paddedIndex = (x: number, y: number, z: number): number =>
  (x + 1) + (z + 1) * PAD + y * PAD * PAD;

/** Copy a chunk and its one-cell border into a padded volume. */
export function buildPadded(
  data: Uint8Array,
  neighbour: (lx: number, y: number, lz: number) => number,
): Uint8Array {
  const out = new Uint8Array(PADDED_VOLUME);
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = -1; z <= CHUNK_SIZE; z++) {
      for (let x = -1; x <= CHUNK_SIZE; x++) {
        const inside = x >= 0 && z >= 0 && x < CHUNK_SIZE && z < CHUNK_SIZE;
        out[paddedIndex(x, y, z)] = inside ? data[localIndex(x, y, z)] : neighbour(x, y, z);
      }
    }
  }
  return out;
}

function posFrom(axis: number, slice: number, i: number, j: number, out: Int32Array): void {
  if (axis === 0) { out[0] = slice; out[1] = i; out[2] = j; }
  else if (axis === 1) { out[0] = j; out[1] = slice; out[2] = i; }
  else { out[0] = i; out[1] = j; out[2] = slice; }
}

class Growable {
  private buf: Float32Array;
  length = 0;
  constructor(n: number) { this.buf = new Float32Array(n); }
  push3(a: number, b: number, c: number): void {
    if (this.length + 3 > this.buf.length) this.grow();
    this.buf[this.length++] = a; this.buf[this.length++] = b; this.buf[this.length++] = c;
  }
  push1(a: number): void {
    if (this.length + 1 > this.buf.length) this.grow();
    this.buf[this.length++] = a;
  }
  private grow(): void { const n = new Float32Array(this.buf.length * 2); n.set(this.buf); this.buf = n; }
  done(): Float32Array { return this.buf.slice(0, this.length); }
}

/**
 * Greedy 3D face mesher. A face is emitted where an opaque voxel touches a
 * non-opaque cell (air or water); only the chunk that owns the solid voxel
 * emits it. Output is identical to the former in-place mesher.
 */
export function meshPadded(
  padded: Uint8Array, heights: Uint8Array, ox: number, oz: number, seed: number,
): MeshArrays {
  const sample = (x: number, y: number, z: number): number => {
    if (y < 0) return MAT.BEDROCK;
    if (y >= WORLD_HEIGHT) return MAT.AIR;
    return padded[paddedIndex(x, y, z)];
  };
  const positions = new Growable(1 << 15), normals = new Growable(1 << 15);
  const colors = new Growable(1 << 15), mats = new Growable(1 << 13);
  let indices = new Uint32Array(1 << 14);
  let indexCount = 0;
  let vertexCount = 0;
  const dims = [CHUNK_SIZE, WORLD_HEIGHT, CHUNK_SIZE];
  const pa = new Int32Array(3), pb = new Int32Array(3);
  const corners = new Float32Array(12);

  const emitQuad = (axis: number, dir: number, slice: number,
    i0: number, j0: number, w: number, h: number, key: number) => {
    const plane = slice + 1;
    const u0 = i0, u1 = i0 + w, v0 = j0, v1 = j0 + h;
    const set = (k: number, x: number, y: number, z: number) => { corners[k * 3] = x; corners[k * 3 + 1] = y; corners[k * 3 + 2] = z; };
    if (axis === 0) {
      const x = ox + plane, y0 = Y_MIN + u0, y1 = Y_MIN + u1, z0 = oz + v0, z1 = oz + v1;
      if (dir > 0) { set(0, x, y0, z0); set(1, x, y1, z0); set(2, x, y1, z1); set(3, x, y0, z1); }
      else { set(0, x, y0, z0); set(1, x, y0, z1); set(2, x, y1, z1); set(3, x, y1, z0); }
    } else if (axis === 1) {
      const y = Y_MIN + plane, z0 = oz + u0, z1 = oz + u1, x0 = ox + v0, x1 = ox + v1;
      if (dir > 0) { set(0, x0, y, z0); set(1, x0, y, z1); set(2, x1, y, z1); set(3, x1, y, z0); }
      else { set(0, x0, y, z0); set(1, x1, y, z0); set(2, x1, y, z1); set(3, x0, y, z1); }
    } else {
      const z = oz + plane, x0 = ox + u0, x1 = ox + u1, y0 = Y_MIN + v0, y1 = Y_MIN + v1;
      if (dir > 0) { set(0, x0, y0, z); set(1, x1, y0, z); set(2, x1, y1, z); set(3, x0, y1, z); }
      else { set(0, x0, y0, z); set(1, x0, y1, z); set(2, x1, y1, z); set(3, x1, y0, z); }
    }
    const color = colorForKey(key);
    const mat = key & 15;
    const nx = axis === 0 ? dir : 0, ny = axis === 1 ? dir : 0, nz = axis === 2 ? dir : 0;
    const base = vertexCount;
    for (let k = 0; k < 4; k++) {
      positions.push3(corners[k * 3], corners[k * 3 + 1], corners[k * 3 + 2]);
      normals.push3(nx, ny, nz);
      colors.push3(color.r, color.g, color.b);
      mats.push1(mat);
    }
    vertexCount += 4;
    if (indexCount + 6 > indices.length) { const n = new Uint32Array(indices.length * 2); n.set(indices); indices = n; }
    indices[indexCount++] = base; indices[indexCount++] = base + 1; indices[indexCount++] = base + 2;
    indices[indexCount++] = base; indices[indexCount++] = base + 2; indices[indexCount++] = base + 3;
  };

  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    const du = dims[u], dv = dims[v], dd = dims[axis];
    const mask = new Uint16Array(du * dv);
    for (let slice = -1; slice < dd; slice++) {
      mask.fill(0);
      let any = false;
      for (let j = 0; j < dv; j++) {
        for (let i = 0; i < du; i++) {
          posFrom(axis, slice, i, j, pa);
          posFrom(axis, slice + 1, i, j, pb);
          const a = sample(pa[0], pa[1], pa[2]);
          const b = sample(pb[0], pb[1], pb[2]);
          const ao = isOpaque(a), bo = isOpaque(b);
          if (ao === bo) continue;
          const aInside = slice >= 0 && slice < dd;
          const bInside = slice + 1 >= 0 && slice + 1 < dd;
          let x: number, y: number, z: number, mat: number, dir: number;
          if (ao && !bo && aInside) { x = pa[0]; y = pa[1]; z = pa[2]; mat = a; dir = 1; }
          else if (bo && !ao && bInside) { x = pb[0]; y = pb[1]; z = pb[2]; mat = b; dir = -1; }
          else continue;
          const wy = Y_MIN + y;
          const surfaceY = heights[z * CHUNK_SIZE + x] + Y_MIN;
          const depth = surfaceY - (wy + 1);
          let variant: number;
          if (axis === 1 && dir > 0) variant = heightBand(wy);
          else if (axis === 1 && dir < 0) variant = 15;
          else variant = (Math.max(0, Math.min(7, depth)) & 7) | (stoneTone(wy) << 3);
          mask[j * du + i] = keyFor(mat, variant, shadeAt(ox + x, wy, oz + z, seed), axis, dir);
          any = true;
        }
      }
      if (!any) continue;
      for (let j = 0; j < dv; j++) {
        for (let i = 0; i < du;) {
          const key = mask[j * du + i];
          if (!key) { i++; continue; }
          let w = 1;
          while (i + w < du && mask[j * du + i + w] === key) w++;
          let h = 1;
          outer: while (j + h < dv) {
            for (let k = 0; k < w; k++) if (mask[(j + h) * du + i + k] !== key) break outer;
            h++;
          }
          for (let jj = 0; jj < h; jj++) for (let ii = 0; ii < w; ii++) mask[(j + jj) * du + i + ii] = 0;
          emitQuad(axis, (key >> 12) & 1 ? 1 : -1, slice, i, j, w, h, key);
          i += w;
        }
      }
    }
  }
  return {
    positions: positions.done(), normals: normals.done(), colors: colors.done(), mats: mats.done(),
    indices: indices.slice(0, indexCount), triangles: indexCount / 3,
  };
}
