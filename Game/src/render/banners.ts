// Banner meshes (M009): block-built corner-flag banners in the plain-coloured
// kit style. Both banners are merged into ONE small mesh (one draw call plus
// its shadow pass, under 150 triangles); the geometry is rebuilt only when a
// banner moves. Presentation only: positions come from sim/banners.ts.
import * as THREE from 'three';
import palette from '../data/palette.json';
import { Block, blocksGeometry, FACE_NY } from './vegetation-kit';
import type { BannerPoint } from '../sim/banners';

const M = palette.materials as Record<string, { hex: string }>;
/** Home banner cloth: the founder's tunic red. Field banner: flower yellow, easy to spot over grass and water. */
export const HOME_CLOTH = M.char_tunic.hex;
export const FIELD_CLOTH = M.flower_yellow.hex;
export const POLE_HEIGHT = 2.6;

const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/** Blocks of one corner-flag banner standing at (x, y, z) (feet level). */
export function bannerBlocks(x: number, y: number, z: number, cloth: string, home: boolean): Block[] {
  const pole = M.arch_timber.hex;
  const blocks: Block[] = [
    // Stone foot so the pole reads as planted, half sunk into the ground.
    { x, y: y + 0.06, z, w: 0.34, h: 0.24, d: 0.34, hex: M.arch_stone.hex, omit: FACE_NY },
    { x, y: y + POLE_HEIGHT / 2, z, w: 0.12, h: POLE_HEIGHT, d: 0.12, hex: pole, omit: FACE_NY },
    // The cloth hangs from the top of the pole toward +x, like a corner flag.
    { x: x + 0.5, y: y + POLE_HEIGHT - 0.36, z, w: 0.88, h: 0.62, d: 0.05, hex: cloth },
    // A lower tail block gives the cloth a stepped, block-built edge.
    { x: x + 0.3, y: y + POLE_HEIGHT - 0.78, z, w: 0.48, h: 0.22, d: 0.05, hex: cloth, k: 0.9 },
  ];
  // The home banner carries a gold cap so it reads as "home" at a distance.
  blocks.push({ x, y: y + POLE_HEIGHT + 0.07, z, w: 0.22, h: 0.14, d: 0.22, hex: home ? M.prop_glow.hex : pole });
  return blocks;
}

export class BannerView {
  readonly mesh: THREE.Mesh;
  private key = '';

  constructor() {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.name = 'banners';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
  }

  /** Show the home banner (once its ground is known) and the field banner. Cheap when unchanged. */
  set(home: BannerPoint | null, field: BannerPoint | null): void {
    const key = JSON.stringify([home, field]);
    if (key === this.key) return;
    this.key = key;
    const blocks: Block[] = [];
    if (home) blocks.push(...bannerBlocks(home.x, home.y, home.z, HOME_CLOTH, true));
    if (field) blocks.push(...bannerBlocks(field.x, field.y, field.z, FIELD_CLOTH, false));
    this.mesh.geometry.dispose();
    this.mesh.geometry = blocks.length ? blocksGeometry(blocks) : new THREE.BufferGeometry();
    this.mesh.visible = blocks.length > 0;
  }

  get triangles(): number {
    const p = this.mesh.geometry.getAttribute('position');
    return p ? p.count / 3 : 0;
  }
}
