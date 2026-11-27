// Voxel material ids. Pure data shared by the simulation layer (D-005).
// Ids are persisted in snapshot edits, so existing values must never change.
export const MAT = {
  AIR: 0,
  GRASS: 1,
  SOIL: 2,
  SAND: 3,
  GRAVEL: 4,
  STONE: 5,
  ORE: 6,
  WATER: 7,
  BEDROCK: 8,
  MOSS: 9,
  /** Generator v2 highlands. Never produced by generator v1. */
  SNOW: 10,
} as const;
export type MatId = (typeof MAT)[keyof typeof MAT];

export const isSolid = (m: number): boolean => m !== MAT.AIR && m !== MAT.WATER;
export const isOpaque = isSolid;

/** Highest material id that may appear in a voxel edit. */
export const MAX_MAT_ID = 10;
