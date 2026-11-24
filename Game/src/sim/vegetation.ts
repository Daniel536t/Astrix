// Vegetation species and growth stages: pure functions of existing entity data.
//
// Nothing here is stored, journaled or drawn from the chunk RNG stream. Species
// and stage are derived from fields every entity already has (kind, variant,
// scale, id, position) plus the world seed, using position/id hashes only.
// Entity generation, entity IDs, yields and obstruction radii are therefore
// unchanged, and so are saves and state hashes.
//
// Growth stage is presentational: a sapling still yields exactly the wood its
// entity record says. It chooses the block-built model and the inspector label,
// never the resource amount.
import type { Entity, EntityKind } from './world';
import { hash2i } from './noise';

export type TreeSpecies = 'pine' | 'spruce' | 'oak' | 'birch' | 'beech' | 'cherry';
export type BushSpecies = 'leafy_bush' | 'berry_bush' | 'fern_clump';
export type VegetationSpecies = TreeSpecies | BushSpecies;
export type GrowthStage = 'sapling' | 'young' | 'mature' | 'old';

export const TREE_SPECIES: readonly TreeSpecies[] = ['pine', 'spruce', 'oak', 'birch', 'beech', 'cherry'];
export const BUSH_SPECIES: readonly BushSpecies[] = ['leafy_bush', 'berry_bush', 'fern_clump'];
export const GROWTH_STAGES: readonly GrowthStage[] = ['sapling', 'young', 'mature', 'old'];

export const SPECIES_INFO: Record<VegetationSpecies, { label: string; blurb: string }> = {
  pine: { label: 'pine', blurb: 'A tall conifer with a bare trunk and flat, layered crowns near the top.' },
  spruce: { label: 'spruce', blurb: 'A dark, stepped conifer of the cooler and higher ground.' },
  oak: { label: 'oak', blurb: 'A broad, spreading broadleaf with a thick trunk and heavy branches.' },
  birch: { label: 'birch', blurb: 'A slender broadleaf with pale bark and a light, narrow crown.' },
  beech: { label: 'beech', blurb: 'A rounded broadleaf with smooth grey bark and a dense crown.' },
  cherry: { label: 'cherry', blurb: 'A pink-flowering cherry with a wide, layered blossom crown.' },
  leafy_bush: { label: 'leafy bush', blurb: 'A low, rounded leafy plant.' },
  berry_bush: { label: 'berry bush', blurb: 'A dark-leaved bush dotted with red berries.' },
  fern_clump: { label: 'fern clump', blurb: 'A low spray of fern fronds.' },
};

/** FNV-1a string hash mixed with a seed, mapped to [0, 1). */
export function idHash(id: string, seed: number): number {
  let h = 0x811c9dc5 ^ (seed | 0);
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

type SpeciesInput = Pick<Entity, 'id' | 'kind' | 'x' | 'y' | 'z' | 'variant'>;
type StageInput = Pick<Entity, 'id' | 'kind' | 'scale'>;

export function isVegetationKind(kind: EntityKind): boolean {
  return kind.startsWith('styl_tree_') || kind === 'styl_shrub';
}

/**
 * Species of a tree or bush entity, or null for other kinds. Conifers split
 * into spruce stands on high or northern ground and pine elsewhere; cluster
 * trees split into birch and beech woods. Stands follow 48 m position cells so
 * neighbours tend to match, like real woods.
 */
export function treeSpecies(entity: SpeciesInput, seed: number): VegetationSpecies | null {
  const cellX = Math.floor(entity.x / 48), cellZ = Math.floor(entity.z / 48);
  switch (entity.kind) {
    case 'styl_tree_spire': {
      const cold = hash2i(cellX, cellZ, seed + 910) + (entity.y - 20) * 0.03 + (entity.z < -150 ? 0.25 : 0);
      return cold > 0.55 ? 'spruce' : 'pine';
    }
    case 'styl_tree_table': return 'oak';
    case 'styl_tree_cluster': return hash2i(cellX, cellZ, seed + 911) < 0.5 ? 'birch' : 'beech';
    case 'styl_tree_blossom': return 'cherry';
    case 'styl_shrub': return BUSH_SPECIES[((entity.variant % 3) + 3) % 3];
    default: return null;
  }
}

/**
 * Growth stage of a tree or bush, or null for other kinds. Derived from the
 * entity's scale band and an id hash, so mature is the most common stage.
 * Authored hero entities (id prefix "hero:") are always mature or old.
 */
export function growthStage(entity: StageInput): GrowthStage | null {
  if (!isVegetationKind(entity.kind)) return null;
  const h = idHash(entity.id, 0x5eed);
  if (entity.id.startsWith('hero:')) return h < 0.4 ? 'old' : 'mature';
  // Natural trees use scale 0.88..1.12, shrubs 0.8..1.2: normalise to 0..1.
  const [lo, span] = entity.kind === 'styl_shrub' ? [0.8, 0.4] : [0.88, 0.24];
  const s = Math.min(1, Math.max(0, (entity.scale - lo) / span));
  const u = 0.7 * h + 0.3 * s;
  return u < 0.17 ? 'sapling' : u < 0.36 ? 'young' : u < 0.78 ? 'mature' : 'old';
}

/** Presentation variant (0..2) so trees of one species and stage differ. */
export function vegetationVariant(entity: Pick<Entity, 'id' | 'variant'>): number {
  return (Math.abs(entity.variant) + Math.floor(idHash(entity.id, 0x7a11) * 3)) % 3;
}

/** Inspector label such as "Young birch". */
export function vegetationLabel(entity: SpeciesInput & StageInput, seed: number): string | null {
  const species = treeSpecies(entity, seed);
  const stage = growthStage(entity);
  if (!species || !stage) return null;
  return `${stage[0].toUpperCase()}${stage.slice(1)} ${SPECIES_INFO[species].label}`;
}
