// Read-only identity for selectable scene objects. Names and purposes are UI
// metadata; quantities and existence always come from authoritative world state.
import { ActiveEntityKind, isRetiredStoneKind, World } from '../sim/world';
import { CROP_YIELD_LABEL, cropReady } from '../sim/economy';
import { M2_PROJECTS } from './projects';

export type InspectionRef =
  | { entityId: string } | { structureId: string } | { siteId: string }
  | { kitId: string } | { stockpileId: string } | { cropId: string };

export interface InspectionInfo {
  ref: InspectionRef;
  key: string;
  name: string;
  category: string;
  description: string;
  facts: { label: string; value: string }[];
}

export const INSPECTION_CATALOG: Record<ActiveEntityKind, {
  name: string; description: string;
}> = {
  styl_tree_spire: { name: 'Spire tree', description: 'A tall, tiered-canopy tree. Harvest its timber for carried wood.' },
  styl_tree_table: { name: 'Table-canopy tree', description: 'A broad, spreading tree. Its trunk and branches provide wood.' },
  styl_tree_cluster: { name: 'Cluster tree', description: 'A many-crowned woodland tree. Harvest it to carry wood.' },
  styl_tree_blossom: { name: 'Blossom tree', description: 'A pink-flowering tree. Its timber is gathered as wood.' },
  styl_shrub: { name: 'Fiber shrub', description: 'A low leafy plant. Gather its plant fiber for processing into crop seed.' },
  styl_ore: { name: 'Purple-seam ore deposit', description: 'A pale rock host with purple mineral seams. Gather it for ore; it is a natural resource.' },
  styl_cairn: { name: 'Stone cairn', description: 'A deliberately stacked pile of natural stones. It can be gathered for stone.' },
  waystone: { name: 'Waystone', description: 'A tall forked Noxel landmark. Its cream stone and teal inlay mark a place of interest; it is not a resource rock.' },
  marker: { name: 'Trail marker', description: 'A small Noxel stone marker with teal inlay, identifying a route or point of interest.' },
};

export const KIT_INSPECTION: Record<string, { name: string; description: string }> = {
  post: { name: 'Noxel post', description: 'A provisional architecture-kit support post with a slab base and cap.' },
  wall: { name: 'Noxel wall panel', description: 'A provisional stone wall module with a foundation and parapet.' },
  gateway: { name: 'Noxel gateway', description: 'A provisional paired-post gateway with a stone lintel.' },
  stair: { name: 'Noxel stair', description: 'A provisional stone stair module with four risers and a landing.' },
  waystone: INSPECTION_CATALOG.waystone,
};

export function inspectionKey(ref: InspectionRef): string {
  const [kind, id] = Object.entries(ref)[0];
  return `${kind}:${id}`;
}

function entityInspection(world: World, ref: { entityId: string }): InspectionInfo | null {
  const e = world.entities.get(ref.entityId);
  if (!e || e.harvested || world.entityRemovals.has(e.id) || isRetiredStoneKind(e.kind)) return null;
  const catalog = INSPECTION_CATALOG[e.kind as ActiveEntityKind];
  if (!catalog) return null;
  return {
    ref, key: inspectionKey(ref), name: catalog.name,
    category: 'Natural resource', description: catalog.description,
    facts: [
      { label: 'Resource', value: e.resource ?? 'None' },
      { label: 'Remaining', value: `${e.remaining} · ${Math.min(e.yieldPerHarvest, e.remaining)} per gather` },
      { label: 'Status', value: e.provisional ? 'Available · provisional art' : 'Available' },
    ],
  };
}

function structureInspection(world: World, ref: { structureId: string }): InspectionInfo | null {
  const s = world.structures.get(ref.structureId);
  if (!s) return null;
  const project = M2_PROJECTS.find((p) => p.siteId === s.siteId && p.kind === s.kind);
  const name = project?.name ?? (s.kind === 'house' ? "Founder's house"
    : s.kind === 'path' ? 'Door path' : 'Terraced field');
  return {
    ref, key: inspectionKey(ref), name, category: 'Architecture · founder project',
    description: project?.description ?? 'A structure recorded in the settlement’s authoritative construction state.',
    facts: [
      { label: 'Type', value: s.kind === 'terrace' ? 'Terraced farm' : s.kind },
      { label: 'Footprint', value: (() => {
        const xs = s.modules.map((m) => [m.x - m.w / 2, m.x + m.w / 2]);
        const zs = s.modules.map((m) => [m.z - m.d / 2, m.z + m.d / 2]);
        return `${Math.max(...xs.map((v) => v[1])) - Math.min(...xs.map((v) => v[0]))} × ${Math.max(...zs.map((v) => v[1])) - Math.min(...zs.map((v) => v[0]))} m`;
      })() },
      { label: 'Art', value: 'Built · provisional Noxel design' },
    ],
  };
}

function siteInspection(world: World, ref: { siteId: string }): InspectionInfo | null {
  const site = world.sites.find((s) => s.id === ref.siteId);
  if (!site) return null;
  return {
    ref, key: inspectionKey(ref), name: INSPECTION_CATALOG[site.kind].name,
    category: 'Architecture · landmark', description: INSPECTION_CATALOG[site.kind].description,
    facts: [{ label: 'Purpose', value: 'Navigation landmark · not harvestable' },
      { label: 'Art', value: site.provisional ? 'Provisional Noxel design' : 'Authored' }],
  };
}

function stockpileInspection(world: World, ref: { stockpileId: string }): InspectionInfo | null {
  const stock = world.life?.stockpiles.get(ref.stockpileId);
  if (!stock) return null;
  const entries = Object.entries(stock.inventory).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b));
  const stored = entries.reduce((sum, [, n]) => sum + n, 0);
  return {
    ref, key: inspectionKey(ref), name: 'Founder stockpile',
    category: 'Architecture · settlement storage',
    description: 'An open timber-and-stone depot. Deposit carried supplies here for processing; withdraw them to carry them again.',
    facts: [{ label: 'Stored', value: `${stored} / ${stock.capacity}` },
      { label: 'Contents', value: entries.map(([r, n]) => `${n} ${r}`).join(' · ') || 'Empty' }],
  };
}

function cropInspection(world: World, ref: { cropId: string }): InspectionInfo | null {
  const life = world.life;
  const index = Number(ref.cropId.slice('crop:'.length));
  if (!life || !/^crop:[0-8]$/.test(ref.cropId)) return null;
  if (![...world.structures.values()].some((s) => s.kind === 'terrace')) return null;
  const crop = life.crops.get(ref.cropId);
  const ready = !!crop && cropReady(crop, life.tick);
  return {
    ref, key: inspectionKey(ref), name: `Terrace crop plot ${index + 1}`,
    category: 'Settlement infrastructure · farm plot',
    description: crop
      ? 'A planted grain plot. Advance simulation ticks to grow it, then harvest food and fiber.'
      : 'An empty tilled terrace plot. Plant it with seed from the Settlement panel; there is no plant here yet.',
    facts: [{ label: 'State', value: !crop ? 'Empty · needs 1 seed' : ready ? 'Ready to harvest' : 'Growing' },
      { label: 'Yield', value: crop ? `${CROP_YIELD_LABEL} when harvested` : 'Plant through the Settlement panel' },
      ...(crop ? [{ label: 'Growth', value: `${Math.min(life.tick - crop.plantedTick, crop.growthTicks)} / ${crop.growthTicks} ticks` }] : [])],
  };
}

export function resolveInspection(world: World, ref: InspectionRef): InspectionInfo | null {
  if ('entityId' in ref) return entityInspection(world, ref);
  if ('structureId' in ref) return structureInspection(world, ref);
  if ('siteId' in ref) return siteInspection(world, ref);
  if ('kitId' in ref) {
    const item = KIT_INSPECTION[ref.kitId];
    return item ? { ref, key: inspectionKey(ref), category: 'Architecture · provisional kit', ...item,
      facts: [{ label: 'Scene', value: 'Noxel integration-test module · provisional art' }] } : null;
  }
  if ('stockpileId' in ref) return stockpileInspection(world, ref);
  return cropInspection(world, ref);
}

export function inspectionRef(object: { userData?: Record<string, unknown> }, batchId?: number): InspectionRef | null {
  const data = object.userData;
  if (!data) return null;
  if (typeof data.inspectableBatchIds !== 'undefined' && typeof batchId === 'number') {
    const ids = data.inspectableBatchIds as unknown;
    return Array.isArray(ids) && typeof ids[batchId] === 'string' ? { entityId: ids[batchId] } : null;
  }
  for (const key of ['structureId', 'siteId', 'kitId', 'stockpileId', 'cropId'] as const) {
    if (typeof data[key] === 'string') return { [key]: data[key] } as InspectionRef;
  }
  return null;
}


