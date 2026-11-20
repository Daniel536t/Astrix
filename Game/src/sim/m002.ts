// M002 deterministic fixture and live-world layout.
//
// The fixture is a bounded slice of the real 2048 m world (seed 1337), not a
// synthetic heightfield. It contains:
//   * a rejected house site on a 7 m river-bank slope with a natural boulder;
//   * a viable house shelf 20 m away with 2 m relief and a natural boulder to
//     clear during preparation;
//   * a 3 m farm slope 27 m from the house with a natural blossom tree.
//
// The same coordinates, queries and validators are used by the live-world
// acceptance test. The only difference is how many chunks are materialised.
import {
  World, createWorld, generateWorld, generateChunk, placeAuthoredSites,
  Y_MIN, Y_MAX, chunkOriginX, chunkOriginZ,
} from './world';
import { Rect, VoxelRegion } from './terrain';
import { chunkKeys } from './canonical';

export const M002_SEED = 1337;

/** Pinned path site id for the door-to-approach corridor. */
export const M002_PATH_SITE_ID = 'path-house-farm';

/**
 * Pinned stepped profile for the 9 m path from the house door (x = -53) to the
 * approach (x = -45). The rise is 2 m over 8 m; every step is at most 1 m.
 */
export const M002_PATH_PROFILE = [11, 11, 11, 12, 12, 12, 12, 13, 13] as const;

export interface TerraceBandSpec {
  z0: number;
  z1: number;
  y: number;
}

/** Pinned farm terraces, high side first. */
export const M002_TERRACE_BANDS: readonly TerraceBandSpec[] = [
  { z0: -42, z1: -40, y: 16 },
  { z0: -39, z1: -37, y: 15 },
  { z0: -36, z1: -35, y: 14 },
];

export interface SiteSpec {
  id: string;
  rect: Rect;
  floorY: number;
  door: { x: number; z: number };
  approach: { x: number; z: number };
}

export interface FarmSpec {
  id: string;
  rect: Rect;
  terraces: number;
}

export interface M002Layout {
  seed: number;
  rejected: SiteSpec;
  house: SiteSpec;
  farm: FarmSpec;
  searchArea: Rect;
  workZone: Rect;
  fixtureChunks: { cx0: number; cz0: number; cx1: number; cz1: number };
  protectedRegion: VoxelRegion;
  /** Complete authorized work envelope for the first slice. */
  envelope: VoxelRegion[];
}

const FIXTURE_CHUNKS = { cx0: 28, cz0: 29, cx1: 32, cz1: 32 } as const;

export const M002_LAYOUT: M002Layout = {
  seed: M002_SEED,
  rejected: {
    id: 'site-a-rejected',
    rect: { x0: -74, z0: -66, x1: -67, z1: -61 },
    // A naive low-side floor: the uphill corner would need 5 m of excavation.
    floorY: 3,
    door: { x: -67, z: -63 },
    approach: { x: -60, z: -63 },
  },
  house: {
    id: 'site-b-house',
    rect: { x0: -60, z0: -46, x1: -53, z1: -41 },
    floorY: 11,
    door: { x: -53, z: -43 },
    approach: { x: -45, z: -43 },
  },
  farm: {
    id: 'field-c',
    rect: { x0: -38, z0: -42, x1: -27, z1: -35 },
    terraces: 3,
  },
  searchArea: { x0: -76, z0: -68, x1: -40, z1: -40 },
  workZone: { x0: -76, z0: -68, x1: -23, z1: -31 },
  fixtureChunks: FIXTURE_CHUNKS,
  protectedRegion: {
    x0: chunkOriginX(FIXTURE_CHUNKS.cx0),
    z0: chunkOriginZ(FIXTURE_CHUNKS.cz0),
    x1: chunkOriginX(FIXTURE_CHUNKS.cx1) + 31,
    z1: chunkOriginZ(FIXTURE_CHUNKS.cz1) + 31,
    y0: Y_MIN,
    y1: Y_MAX - 1,
  },
  envelope: [
    // House footprint plus a 2 m preparation buffer.
    { x0: -62, z0: -48, x1: -51, z1: -39, y0: 8, y1: 16 },
    // Door-to-approach path corridor plus a 1 m buffer.
    { x0: -54, z0: -44, x1: -44, z1: -42, y0: 9, y1: 15 },
    // Farm footprint plus a 2 m preparation buffer.
    { x0: -40, z0: -44, x1: -25, z1: -33, y0: 10, y1: 20 },
  ],
};

export interface M002World {
  world: World;
  layout: M002Layout;
  /** Sorted chunk keys materialised at fixture creation. */
  chunkKeys: string[];
}

/**
 * Small deterministic fixture: the 20 chunks covering the work zone and its
 * protected surroundings. Fast enough for the full test suite.
 */
export function createM002Fixture(seed = M002_SEED): M002World {
  const world = createWorld(seed);
  const { cx0, cz0, cx1, cz1 } = M002_LAYOUT.fixtureChunks;
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) generateChunk(world, cx, cz);
  }
  placeAuthoredSites(world);
  return { world, layout: M002_LAYOUT, chunkKeys: chunkKeys(world) };
}

/**
 * Live-world integration target: the same seed and sites with a 9 x 9 chunk
 * neighbourhood (81 chunks) around the founder valley.
 */
export function createM002Live(seed = M002_SEED, radius = 4): M002World {
  const world = generateWorld(seed, radius);
  return { world, layout: M002_LAYOUT, chunkKeys: chunkKeys(world) };
}
