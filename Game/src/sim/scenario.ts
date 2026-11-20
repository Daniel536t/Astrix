// M002 stage 7 scenario wiring: the pinned first slice, run through the same
// public simulation pipeline used by the player, the AI and the tests.
//
// The scenario is deliberately plain data in / data out. It does not touch the
// renderer, and every terrain edit still goes through prepareSite ->
// LocalAuthorizer -> executePreparation. Structures still go through
// buildStructure -> LocalStructureAuthorizer -> executeStructure.
import { MAT, ResourceType } from './world';
import {
  M002World, M002_LAYOUT, M002_PATH_PROFILE, M002_PATH_SITE_ID,
  M002_TERRACE_BANDS,
} from './m002';
import { Rect } from './terrain';
import { HOUSE_RULES, PATH_RULES, FARM_RULES } from './construction';
import {
  ColumnTarget, LocalAuthorizer, prepareSite, PreparationLedger,
} from './preparation';
import {
  LocalStructureAuthorizer, buildStructure, StructureLedger,
} from './structures';
import {
  canonicalEntityHash, canonicalInventoryHash, canonicalRegionHash,
  canonicalStructureHash, inventorySnapshot,
} from './canonical';

export const M002_STARTER_INVENTORY: Readonly<Record<string, number>> = {
  wood: 24,
  stone: 48,
};

/** The 9 x 3 m corridor from the house door to the approach. */
export function m002PathRect(): Rect {
  const door = M002_LAYOUT.house.door;
  const approach = M002_LAYOUT.house.approach;
  return {
    x0: door.x,
    z0: door.z - 1,
    x1: approach.x,
    z1: door.z + 1,
  };
}

/** One target per path column, using the pinned stepped profile. */
export function m002PathTargets(): ColumnTarget[] {
  const rect = m002PathRect();
  const targets: ColumnTarget[] = [];
  for (let i = 0; i < M002_PATH_PROFILE.length; i++) {
    for (let z = rect.z0; z <= rect.z1; z++) {
      targets.push({ x: rect.x0 + i, z, y: M002_PATH_PROFILE[i] });
    }
  }
  return targets;
}

/** One target per farm column, using the pinned terrace bands. */
export function m002FarmTargets(): ColumnTarget[] {
  const rect = M002_LAYOUT.farm.rect;
  const targets: ColumnTarget[] = [];
  for (const band of M002_TERRACE_BANDS) {
    for (let z = band.z0; z <= band.z1; z++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        targets.push({ x, z, y: band.y });
      }
    }
  }
  return targets;
}

export interface M002ScenarioOptions {
  /** Starter resources before the slice runs. Defaults to wood 24 / stone 48. */
  inventory?: Partial<Record<ResourceType, number>>;
}

export interface M002ScenarioSite {
  preparation: PreparationLedger | null;
  structure: StructureLedger | null;
}

export interface M002ScenarioResult {
  ok: boolean;
  errors: string[];
  house: M002ScenarioSite;
  path: M002ScenarioSite;
  farm: M002ScenarioSite;
  inventoryBefore: Record<string, number>;
  inventoryAfter: Record<string, number>;
  hashes: {
    voxels: string;
    structures: string;
    inventory: string;
    entities: string;
  };
}

function emptySite(): M002ScenarioSite {
  return { preparation: null, structure: null };
}

function describeFailure(result: { code: string; reasons: string[] }): string {
  return `${result.code}: ${result.reasons.join('; ')}`;
}

/**
 * Run house, path and terraced farm in their pinned order. A failed step is
 * recorded and later independent steps still run; a structure is never built
 * unless its own terrain preparation succeeded.
 */
export function runM002Scenario(
  m002: M002World, options: M002ScenarioOptions = {},
): M002ScenarioResult {
  const { world, layout } = m002;
  const starter = options.inventory ?? M002_STARTER_INVENTORY;
  world.inventory = {};
  for (const [resource, amount] of Object.entries(starter)) {
    if ((amount ?? 0) > 0) world.inventory[resource] = amount as number;
  }

  const prepAuthorizer = new LocalAuthorizer({ envelope: layout.envelope });
  const structureAuthorizer = new LocalStructureAuthorizer({ envelope: layout.envelope });
  const inventoryBefore = inventorySnapshot(world);
  const errors: string[] = [];
  const house = emptySite();
  const path = emptySite();
  const farm = emptySite();

  const housePrep = prepareSite(world, prepAuthorizer, {
    siteId: layout.house.id,
    rect: layout.house.rect,
    floorY: layout.house.floorY,
    rules: HOUSE_RULES,
  });
  if (!housePrep.ok) {
    errors.push(`house preparation: ${describeFailure(housePrep)}`);
  } else {
    house.preparation = housePrep.ledger;
    const houseBuild = buildStructure(world, structureAuthorizer, {
      siteId: layout.house.id,
      kind: 'house',
      rect: layout.house.rect,
      floorY: layout.house.floorY,
      door: layout.house.door,
    });
    if (!houseBuild.ok) {
      errors.push(`house structure: ${describeFailure(houseBuild)}`);
    } else {
      house.structure = houseBuild.ledger;
    }
  }

  const pathRect = m002PathRect();
  const pathPrep = prepareSite(world, prepAuthorizer, {
    siteId: M002_PATH_SITE_ID,
    rect: pathRect,
    floorY: 12,
    rules: PATH_RULES,
  }, {
    targets: m002PathTargets(),
    surfaceMaterial: MAT.GRAVEL,
    envelope: [layout.envelope[1]],
  });
  if (!pathPrep.ok) {
    errors.push(`path preparation: ${describeFailure(pathPrep)}`);
  } else {
    path.preparation = pathPrep.ledger;
    const pathBuild = buildStructure(world, structureAuthorizer, {
      siteId: M002_PATH_SITE_ID,
      kind: 'path',
      rect: pathRect,
      floorY: 12,
    });
    if (!pathBuild.ok) {
      errors.push(`path structure: ${describeFailure(pathBuild)}`);
    } else {
      path.structure = pathBuild.ledger;
    }
  }

  const farmPrep = prepareSite(world, prepAuthorizer, {
    siteId: layout.farm.id,
    rect: layout.farm.rect,
    floorY: 15,
    rules: FARM_RULES,
  }, {
    targets: m002FarmTargets(),
    surfaceMaterial: MAT.SOIL,
    envelope: [layout.envelope[2]],
  });
  if (!farmPrep.ok) {
    errors.push(`farm preparation: ${describeFailure(farmPrep)}`);
  } else {
    farm.preparation = farmPrep.ledger;
    const farmBuild = buildStructure(world, structureAuthorizer, {
      siteId: layout.farm.id,
      kind: 'terrace',
      rect: layout.farm.rect,
      floorY: 15,
      terraces: layout.farm.terraces,
    });
    if (!farmBuild.ok) {
      errors.push(`farm structure: ${describeFailure(farmBuild)}`);
    } else {
      farm.structure = farmBuild.ledger;
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    house,
    path,
    farm,
    inventoryBefore,
    inventoryAfter: inventorySnapshot(world),
    hashes: {
      voxels: canonicalRegionHash(world, layout.protectedRegion).hash,
      structures: canonicalStructureHash(world),
      inventory: canonicalInventoryHash(world),
      entities: canonicalEntityHash(world, layout.protectedRegion),
    },
  };
}

/** Total resources paid to structures in a scenario result. */
export function m002StructureCosts(result: M002ScenarioResult): Partial<Record<ResourceType, number>> {
  const total: Partial<Record<ResourceType, number>> = {};
  for (const site of [result.house, result.path, result.farm]) {
    for (const [resource, amount] of Object.entries(site.structure?.costPaid ?? {})) {
      total[resource as ResourceType] = (total[resource as ResourceType] ?? 0) + (amount ?? 0);
    }
  }
  return total;
}
