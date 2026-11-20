// The former faceted NatMass prop system was coupled to the retired 256 m
// heightfield. M001 replaces it with Noxel natural assets instanced from
// authoritative sim entities. This module is kept as a compatibility entry
// point for older imports; the implementation lives in `nature.ts`.
export { buildNoxelNature } from './nature';
