// M002 playable first slice — the three authored projects as plain data.
//
// This module is deliberately DOM-free. The build sidebar, the ghost preview
// and the tests all read the same definitions and call the same simulation
// entry points; a project cannot advertise one footprint, price or preparation
// step and then execute another.
import { MAT, World, ResourceType } from '../sim/world';
import { Rect } from '../sim/terrain';
import {
  BuildingRules, HOUSE_RULES, PATH_RULES, FARM_RULES,
  SiteProposal, SitePreview, SiteState, ValidationReason, previewSite,
} from '../sim/construction';
import {
  M002_LAYOUT, M002_PATH_SITE_ID, M002_TERRACE_BANDS,
} from '../sim/m002';
import {
  m002FarmTargets, m002PathRect, m002PathTargets,
} from '../sim/scenario';
import {
  ColumnTarget, LocalAuthorizer, PreparationLedger, PreparationOptions,
  PlanResult, planPreparation, prepareSite,
} from '../sim/preparation';
import { createWorldSnapshot, restoreWorldSnapshot } from '../sim/snapshot';

import {
  HOUSE_COST, TERRACE_COST, LocalStructureAuthorizer, Structure,
  StructureKind, StructureLedger, StructureProposal, StructureDesignVersion,
  buildStructure, pathCost,
} from '../sim/structures';

export type M2ProjectId = 'house' | 'path' | 'farm';

export interface M2GhostBand {
  z0: number;
  z1: number;
  y: number;
}

export interface M2Project {
  id: M2ProjectId;
  name: string;
  subtitle: string;
  description: string;
  siteId: string;
  kind: StructureKind;
  rect: Rect;
  floorY: number;
  rules: BuildingRules;
  cost: Partial<Record<ResourceType, number>>;
  door?: { x: number; z: number };
  approach?: { x: number; z: number };
  terraces?: number;
  prep: PreparationOptions;
  ghostBands?: readonly M2GhostBand[];
}

const pathRect = m002PathRect();
const pathTargets: ColumnTarget[] = m002PathTargets();
const farmTargets: ColumnTarget[] = m002FarmTargets();

/**
 * The first playable slice in the pinned order: a house on the prepared shelf,
 * a stepped path from its door, and a terraced field on the slope below.
 */
export const M2_PROJECTS: readonly M2Project[] = [
  {
    id: 'house',
    name: "Founder's house",
    subtitle: '8 x 6 m · flat stone shelf',
    description:
      'The 19-module founder candidate uses a flat stone foundation, a 3.2 m storey, a real east doorway '
      + 'and two open south windows. Structural wall voids require more primitives than the provisional '
      + 'asset-volume target; this design remains subject to art review.',
    siteId: M002_LAYOUT.house.id,
    kind: 'house',
    rect: M002_LAYOUT.house.rect,
    floorY: M002_LAYOUT.house.floorY,
    rules: HOUSE_RULES,
    cost: { ...HOUSE_COST },
    door: M002_LAYOUT.house.door,
    approach: M002_LAYOUT.house.approach,
    prep: {},
  },
  {
    id: 'path',
    name: 'Door path',
    subtitle: '9 x 3 m · stepped gravel',
    description:
      'A nine-metre corridor from the house door to the approach. '
      + 'Each column is cut to a pinned profile so the rise stays walkable.',
    siteId: M002_PATH_SITE_ID,
    kind: 'path',
    rect: pathRect,
    floorY: 12,
    rules: PATH_RULES,
    cost: pathCost(pathRect.x1 - pathRect.x0 + 1),
    prep: {
      targets: pathTargets,
      surfaceMaterial: MAT.GRAVEL,
      envelope: [M002_LAYOUT.envelope[1]],
    },
  },
  {
    id: 'farm',
    name: 'Terraced field',
    subtitle: '12 x 8 m · three bands',
    description:
      'Three soil terraces stepping down the slope, held by stone retaining walls. '
      + 'The blossom tree on the field is cleared during preparation.',
    siteId: M002_LAYOUT.farm.id,
    kind: 'terrace',
    rect: M002_LAYOUT.farm.rect,
    floorY: 15,
    rules: FARM_RULES,
    cost: { ...TERRACE_COST },
    terraces: M002_LAYOUT.farm.terraces,
    prep: {
      targets: farmTargets,
      surfaceMaterial: MAT.SOIL,
      envelope: [M002_LAYOUT.envelope[2]],
    },
    ghostBands: M002_TERRACE_BANDS,
  },
];

export function projectById(id: M2ProjectId): M2Project {
  const project = M2_PROJECTS.find((p) => p.id === id);
  if (!project) throw new Error(`unknown M002 project: ${id}`);
  return project;
}

export function projectSiteProposal(project: M2Project): SiteProposal {
  return {
    siteId: project.siteId,
    rect: project.rect,
    floorY: project.floorY,
    rules: project.rules,
  };
}

export function projectStructureProposal(
  project: M2Project, designVersion?: StructureDesignVersion,
): StructureProposal {
  return {
    siteId: project.siteId,
    kind: project.kind,
    rect: project.rect,
    floorY: project.floorY,
    door: project.door,
    approach: project.approach,
    terraces: project.terraces,
    ...(designVersion === undefined ? {} : { designVersion }),
  };
}

export function isProjectBuilt(world: World, project: M2Project): boolean {
  for (const structure of world.structures.values()) {
    if (structure.siteId === project.siteId && structure.kind === project.kind) return true;
  }
  return false;
}

export interface MissingResource {
  resource: ResourceType;
  need: number;
  have: number;
}

export function missingResources(world: World, project: M2Project): MissingResource[] {
  const missing: MissingResource[] = [];
  for (const [resource, amount] of Object.entries(project.cost)) {
    const need = amount ?? 0;
    const have = world.inventory[resource] ?? 0;
    if (have < need) missing.push({ resource: resource as ResourceType, need, have });
  }
  return missing;
}

export interface ProjectInspection {
  projectId: M2ProjectId;
  built: boolean;
  affordable: boolean;
  missing: MissingResource[];
  state: SiteState;
  reasons: ValidationReason[];
  preview: SitePreview;
  plan: PlanResult;
  canBuild: boolean;
}

/**
 * Read-only inspection for the ghost and sidebar. It runs the same validator
 * and the same preparation planner the build button will run.
 */
export function inspectProject(world: World, project: M2Project): ProjectInspection {
  const proposal = projectSiteProposal(project);
  const preview = previewSite(world, proposal, {
    door: project.door,
    approach: project.approach,
  });
  const plan = planPreparation(world, proposal, project.prep);
  const built = isProjectBuilt(world, project);
  const missing = missingResources(world, project);
  const state = plan.ok ? plan.validation.state : preview.state;
  const reasons = plan.ok ? plan.validation.reasons : preview.reasons;

  return {
    projectId: project.id,
    built,
    affordable: missing.length === 0,
    missing,
    state,
    reasons,
    preview,
    plan,
    canBuild: !built && missing.length === 0 && plan.ok && state !== 'invalid',
  };
}

export interface ProjectBuildSuccess {
  ok: true;
  project: M2Project;
  preparation: PreparationLedger;
  structure: StructureLedger;
  record: Structure;
}

export interface ProjectBuildFailure {
  ok: false;
  project: M2Project;
  stage: 'precheck' | 'prepare' | 'structure';
  code: string;
  reasons: string[];
  preparation?: PreparationLedger;
  /** Failed builds roll back the entire authoritative pre-build snapshot. */
  structureFailureRetained: false;
  retryable: true;
}

export type ProjectBuildResult = ProjectBuildSuccess | ProjectBuildFailure;

/**
 * Prepare the site and construct the project through the authorized pipeline.
 * The resource check happens before any terrain edit, so an unaffordable build
 * cannot leave a graded pad behind.
 */
export function buildProject(
  world: World,
  prepAuthorizer: LocalAuthorizer,
  structureAuthorizer: LocalStructureAuthorizer,
  project: M2Project,
  designVersion?: StructureDesignVersion,
): ProjectBuildResult {
  if (isProjectBuilt(world, project)) {
    return {
      ok: false, project, stage: 'precheck', code: 'already_built',
      reasons: [`${project.name} is already built`],
      structureFailureRetained: false, retryable: true,
    };
  }
  const missing = missingResources(world, project);
  if (missing.length > 0) {
    return {
      ok: false, project, stage: 'precheck', code: 'insufficient_resources',
      reasons: missing.map((m) => `need ${m.need} ${m.resource}, have ${m.have}`),
      structureFailureRetained: false, retryable: true,
    };
  }

  const before = createWorldSnapshot(world, 0);
  const prepared = prepareSite(world, prepAuthorizer, projectSiteProposal(project), project.prep);
  if (!prepared.ok) {
    restoreWorldSnapshot(world, before);
    return {
      ok: false, project, stage: 'prepare', code: prepared.code,
      reasons: [...prepared.reasons, 'No preparation, resource or entity changes were retained.'],
      structureFailureRetained: false, retryable: true,
    };
  }

  const built = buildStructure(world, structureAuthorizer, projectStructureProposal(project, designVersion));
  if (!built.ok) {
    restoreWorldSnapshot(world, before);
    return {
      ok: false, project, stage: 'structure', code: built.code,
      reasons: [...built.reasons,
        'All preparation, resource and entity changes were rolled back; the build can be retried.'],
      structureFailureRetained: false, retryable: true,
    };
  }

  const record = world.structures.get(built.ledger.structureId);
  if (!record) {
    restoreWorldSnapshot(world, before);
    return {
      ok: false, project, stage: 'structure', code: 'missing_record',
      reasons: ['structure ledger was written but the world has no record',
        'All preparation, resource and entity changes were rolled back; the build can be retried.'],
      structureFailureRetained: false, retryable: true,
    };
  }

  return {
    ok: true,
    project,
    preparation: prepared.ledger,
    structure: built.ledger,
    record,
  };
}
