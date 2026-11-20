// M002 site validation, candidate search and preview — pure simulation.
//
// This is the shared gate for the player and the AI agent. Neither may place a
// structure by any other path: both submit a SiteProposal, both receive the
// same SiteValidation, and both must pass the Authorizer before execution.
//
// The validator describes the site as it is. It does not edit voxels, remove
// entities or spend resources. Preparation is a separate, authorized step.
import { World, HALF, Y_MIN, Y_MAX, surfaceAt } from './world';
import {
  Rect, VoxelRegion, FootprintQuery, TerrainQuery, AreaStats,
  normalizeRect, expandRect, rectColumns, effectiveGrade, walkStep, WalkParams,
  DEFAULT_WALK, columnAt,
} from './terrain';

export type SiteState = 'valid' | 'valid_with_preparation' | 'invalid';

export type ValidationCode =
  | 'out_of_bounds'
  | 'footprint_mismatch'
  | 'slope_exceeded'
  | 'step_exceeded'
  | 'cut_exceeded'
  | 'fill_exceeded'
  | 'cut_volume_exceeded'
  | 'fill_volume_exceeded'
  | 'footprint_obstructed'
  | 'water'
  | 'overhang'
  | 'needs_grading'
  | 'needs_clearing';

export interface ValidationReason {
  code: ValidationCode;
  severity: 'error' | 'preparation';
  message: string;
  value?: number;
  limit?: number;
}

export type FoundationType = 'graded_pad' | 'stepped_plinth' | 'deck';

export interface BuildingRules {
  id: string;
  width: number;
  depth: number;
  wallHeight: number;
  clearance: number;
  /** Relief at or below this needs no grading to be called valid. */
  maxReliefNoPrep: number;
  /** Relief above this cannot be prepared by this building type. */
  maxReliefPrepared: number;
  maxStep: number;
  maxCut: number;
  maxFill: number;
  maxCutVolume: number;
  maxFillVolume: number;
  maxObstructions: number;
  requiresDry: boolean;
  foundation: FoundationType;
}

export const HOUSE_RULES: BuildingRules = {
  id: 'house-8x6',
  width: 8,
  depth: 6,
  wallHeight: 3,
  clearance: 3,
  maxReliefNoPrep: 1.2,
  maxReliefPrepared: 4.0,
  maxStep: 1,
  maxCut: 2,
  maxFill: 2,
  maxCutVolume: 48,
  maxFillVolume: 48,
  maxObstructions: 0,
  requiresDry: true,
  foundation: 'graded_pad',
};

export const FARM_RULES: BuildingRules = {
  id: 'farm-12x8',
  width: 12,
  depth: 8,
  wallHeight: 0,
  clearance: 1,
  maxReliefNoPrep: 1.2,
  maxReliefPrepared: 6.0,
  maxStep: 1,
  maxCut: 2,
  maxFill: 2,
  maxCutVolume: 96,
  maxFillVolume: 96,
  maxObstructions: 4,
  requiresDry: true,
  foundation: 'stepped_plinth',
};

export const PATH_RULES: BuildingRules = {
  id: 'path-9x3',
  width: 9,
  depth: 3,
  wallHeight: 0,
  clearance: 1,
  maxReliefNoPrep: 2.0,
  maxReliefPrepared: 4.0,
  maxStep: 1,
  maxCut: 1,
  maxFill: 1,
  maxCutVolume: 32,
  maxFillVolume: 32,
  maxObstructions: 2,
  requiresDry: true,
  foundation: 'deck',
};

export interface SiteProposal {
  siteId: string;
  rect: Rect;
  floorY: number;
  rules: BuildingRules;
}

export interface PreparationSummary {
  needsGrading: boolean;
  needsClearing: boolean;
  cutVolume: number;
  fillVolume: number;
  maxCut: number;
  maxFill: number;
  obstructionIds: string[];
  foundation: FoundationType;
}

export interface SiteValidation {
  siteId: string;
  state: SiteState;
  reasons: ValidationReason[];
  query: FootprintQuery;
  preparation: PreparationSummary;
}

function error(code: ValidationCode, message: string, value?: number, limit?: number): ValidationReason {
  return { code, severity: 'error', message, value, limit };
}

function prep(code: ValidationCode, message: string, value?: number, limit?: number): ValidationReason {
  return { code, severity: 'preparation', message, value, limit };
}

/**
 * Validate a proposed site against its building rules. Pure: no voxels,
 * entities or resources change. `query` may be supplied by a search to reuse
 * the cached columns, and `footprint` may be supplied when the caller already
 * evaluated the same rect/floor pair.
 */
export function validateSite(
  world: World, proposal: SiteProposal, query = new TerrainQuery(world),
  footprint?: FootprintQuery,
): SiteValidation {
  const rect = normalizeRect(proposal.rect);
  const rules = proposal.rules;
  const reasons: ValidationReason[] = [];
  const fp = footprint ?? query.footprint(rect, proposal.floorY);
  const stats = fp.stats;

  if (rect.x0 < -HALF || rect.z0 < -HALF || rect.x1 >= HALF || rect.z1 >= HALF) {
    reasons.push(error('out_of_bounds', `footprint ${rect.x0},${rect.z0}..${rect.x1},${rect.z1} is outside the world`));
  }
  if (rect.x1 - rect.x0 + 1 !== rules.width || rect.z1 - rect.z0 + 1 !== rules.depth) {
    reasons.push(error(
      'footprint_mismatch',
      `footprint is ${rect.x1 - rect.x0 + 1} x ${rect.z1 - rect.z0 + 1} m, ${rules.width} x ${rules.depth} m required`,
    ));
  }

  if (stats.relief > rules.maxReliefPrepared) {
    reasons.push(error(
      'slope_exceeded',
      `relief ${stats.relief} m exceeds the ${rules.maxReliefPrepared} m prepared limit`,
      stats.relief, rules.maxReliefPrepared,
    ));
  }
  if (stats.maxStep > rules.maxStep) {
    reasons.push(error(
      'step_exceeded',
      `surface step ${stats.maxStep} m exceeds ${rules.maxStep} m`,
      stats.maxStep, rules.maxStep,
    ));
  }
  if (stats.maxCut > rules.maxCut) {
    reasons.push(error(
      'cut_exceeded',
      `cut ${stats.maxCut} m exceeds ${rules.maxCut} m`,
      stats.maxCut, rules.maxCut,
    ));
  }
  if (stats.maxFill > rules.maxFill) {
    reasons.push(error(
      'fill_exceeded',
      `fill ${stats.maxFill} m exceeds ${rules.maxFill} m`,
      stats.maxFill, rules.maxFill,
    ));
  }
  if (stats.cutVolume > rules.maxCutVolume) {
    reasons.push(error(
      'cut_volume_exceeded',
      `cut volume ${stats.cutVolume} m³ exceeds ${rules.maxCutVolume} m³`,
      stats.cutVolume, rules.maxCutVolume,
    ));
  }
  if (stats.fillVolume > rules.maxFillVolume) {
    reasons.push(error(
      'fill_volume_exceeded',
      `fill volume ${stats.fillVolume} m³ exceeds ${rules.maxFillVolume} m³`,
      stats.fillVolume, rules.maxFillVolume,
    ));
  }
  if (rules.requiresDry && stats.waterColumns > 0) {
    reasons.push(error(
      'water',
      `${stats.waterColumns} footprint columns are underwater`,
      stats.waterColumns, 0,
    ));
  }
  if (stats.obstructions.length > rules.maxObstructions) {
    reasons.push(error(
      'footprint_obstructed',
      `${stats.obstructions.length} obstructions exceed the ${rules.maxObstructions} allowance`,
      stats.obstructions.length, rules.maxObstructions,
    ));
  }
  if (fp.overhangCells.length > 0) {
    reasons.push(error(
      'overhang',
      `${fp.overhangCells.length} cells above the floor are blocked`,
      fp.overhangCells.length, 0,
    ));
  }

  const needsGrading = stats.relief > rules.maxReliefNoPrep
    || stats.cutVolume > 0 || stats.fillVolume > 0;
  const needsClearing = stats.obstructions.length > 0
    && stats.obstructions.length <= rules.maxObstructions;

  if (needsGrading) {
    reasons.push(prep(
      'needs_grading',
      `grading required: ${stats.cutVolume} m³ cut, ${stats.fillVolume} m³ fill`,
      stats.cutVolume + stats.fillVolume,
    ));
  }
  if (needsClearing) {
    reasons.push(prep(
      'needs_clearing',
      `${stats.obstructions.length} obstructions to clear`,
      stats.obstructions.length, rules.maxObstructions,
    ));
  }

  const hasError = reasons.some((r) => r.severity === 'error');
  const hasPrep = reasons.some((r) => r.severity === 'preparation');
  const state: SiteState = hasError ? 'invalid' : hasPrep ? 'valid_with_preparation' : 'valid';

  return {
    siteId: proposal.siteId,
    state,
    reasons,
    query: fp,
    preparation: {
      needsGrading,
      needsClearing,
      cutVolume: stats.cutVolume,
      fillVolume: stats.fillVolume,
      maxCut: stats.maxCut,
      maxFill: stats.maxFill,
      obstructionIds: stats.obstructions.map((o) => o.entityId),
      foundation: rules.foundation,
    },
  };
}

// ---------- candidate search ----------
export interface SearchOptions {
  /** Candidate grid step in metres. Default 2. */
  step?: number;
  maxResults?: number;
  anchor?: { x: number; z: number };
  maxDistance?: number;
  /** Hard constraint: candidate centre must lie within this radius of a point. */
  near?: { x: number; z: number; maxDistance: number };
  /** Do not return two candidates whose footprints overlap. Default true. */
  distinct?: boolean;
  /** Wall-clock budget for the scan. Default 100 ms. */
  budgetMs?: number;
  walk?: WalkParams;
}

export interface SiteCandidate {
  siteId: string;
  rect: Rect;
  floorY: number;
  state: 'valid' | 'valid_with_preparation';
  validation: SiteValidation;
  cutVolume: number;
  fillVolume: number;
  obstructionCount: number;
  distance: number;
  score: number;
}

export interface SiteSearchResult {
  candidates: SiteCandidate[];
  evaluated: number;
  rejected: number;
  elapsedMs: number;
  budgetMs: number;
  /** True when the wall-clock budget stopped the scan before the area was exhausted. */
  truncated: boolean;
}

function floorCandidates(stats: AreaStats): number[] {
  const mean = Math.round(stats.meanY);
  const set = new Set<number>();
  for (let d = -1; d <= 1; d++) set.add(mean + d);
  set.add(stats.minY);
  set.add(stats.maxY);
  return [...set].filter((y) => y >= Y_MIN && y < Y_MAX).sort((a, b) => a - b);
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0;
}

function candidateScore(v: SiteValidation, distance: number): number {
  const prepPenalty = v.state === 'valid' ? 0 : 25;
  const grading = v.preparation.cutVolume + v.preparation.fillVolume;
  const clearing = v.preparation.obstructionIds.length * 4;
  return prepPenalty + grading + clearing + distance * 0.25;
}

/**
 * Search a bounded area for viable footprints. The same validator and the same
 * floor-selection policy are used by the AI agent and the player's build
 * preview. Search is read-only.
 */
export function searchSites(
  world: World, rules: BuildingRules, area: Rect, options: SearchOptions = {},
): SiteSearchResult {
  const t0 = performance.now();
  const step = Math.max(1, Math.floor(options.step ?? 2));
  const maxResults = Math.max(1, options.maxResults ?? 8);
  const distinct = options.distinct !== false;
  const maxDistance = options.maxDistance ?? Number.POSITIVE_INFINITY;
  const budgetMs = options.budgetMs ?? 100;
  const anchor = options.anchor ?? { x: (area.x0 + area.x1) / 2, z: (area.z0 + area.z1) / 2 };
  const query = new TerrainQuery(world);
  const all: SiteCandidate[] = [];
  let evaluated = 0;
  let rejected = 0;
  let truncated = false;

  const x1Max = area.x1 - rules.width + 1;
  const z1Max = area.z1 - rules.depth + 1;
  scan: for (let z = area.z0; z <= z1Max; z += step) {
    for (let x = area.x0; x <= x1Max; x += step) {
      const rect = { x0: x, z0: z, x1: x + rules.width - 1, z1: z + rules.depth - 1 };
      const cx = (rect.x0 + rect.x1) / 2;
      const cz = (rect.z0 + rect.z1) / 2;
      const distance = Math.hypot(cx - anchor.x, cz - anchor.z);
      if (distance > maxDistance) continue;
      if (options.near) {
        const nearDistance = Math.hypot(cx - options.near.x, cz - options.near.z);
        if (nearDistance > options.near.maxDistance) continue;
      }

      const stats = query.area(rect);
      let best: SiteCandidate | null = null;
      for (const floorY of floorCandidates(stats)) {
        evaluated++;
        const proposal: SiteProposal = {
          siteId: `${rules.id}:${x},${z},${floorY}`,
          rect, floorY, rules,
        };
        const footprint = query.footprint(rect, floorY);
        const validation = validateSite(world, proposal, query, footprint);
        if (validation.state === 'invalid') {
          rejected++;
          continue;
        }
        const score = candidateScore(validation, distance);
        const candidate: SiteCandidate = {
          siteId: proposal.siteId,
          rect,
          floorY,
          state: validation.state,
          validation,
          cutVolume: validation.preparation.cutVolume,
          fillVolume: validation.preparation.fillVolume,
          obstructionCount: validation.preparation.obstructionIds.length,
          distance,
          score,
        };
        if (!best
          || (candidate.state === 'valid' && best.state !== 'valid')
          || (candidate.state === best.state && candidate.score < best.score)) {
          best = candidate;
        }
      }
      if (best) all.push(best);
    }
    if (performance.now() - t0 > budgetMs) {
      truncated = true;
      break scan;
    }
  }

  all.sort((a, b) => a.score - b.score || a.distance - b.distance
    || a.rect.x0 - b.rect.x0 || a.rect.z0 - b.rect.z0);
  const selected: SiteCandidate[] = [];
  for (const candidate of all) {
    if (distinct && selected.some((s) => overlaps(s.rect, candidate.rect))) continue;
    selected.push(candidate);
    if (selected.length >= maxResults) break;
  }

  return {
    candidates: selected,
    evaluated,
    rejected,
    elapsedMs: Math.round((performance.now() - t0) * 100) / 100,
    budgetMs,
    truncated,
  };
}

// ---------- preview ----------
export interface FoundationPreview {
  type: FoundationType;
  /** Stone floor slab plus fill under the prepared floor. */
  plinthCells: number;
  /** Perimeter cells that need a retaining face because of cut or fill. */
  retainingWallCells: number;
  cutVolume: number;
  fillVolume: number;
}

export interface AccessPreview {
  door: { x: number; z: number };
  approach: { x: number; z: number };
  distance: number;
  grade: number;
  walkable: boolean;
  reasons: string[];
}

export interface SitePreview {
  siteId: string;
  state: SiteState;
  rect: Rect;
  floorY: number;
  rules: BuildingRules;
  reasons: ValidationReason[];
  terrain: {
    minY: number;
    maxY: number;
    meanY: number;
    relief: number;
    maxStep: number;
    cutVolume: number;
    fillVolume: number;
    maxCut: number;
    maxFill: number;
  };
  foundation: FoundationPreview;
  obstructions: Array<{
    entityId: string;
    kind: string;
    x: number;
    z: number;
    action: 'clear' | 'blocked';
  }>;
  access: AccessPreview | null;
  /** Complete work envelope this preview would authorize. */
  envelope: VoxelRegion[];
}

export interface PreviewOptions {
  door?: { x: number; z: number };
  approach?: { x: number; z: number };
  walk?: WalkParams;
}

/**
 * Build the three-state preview. It is deliberately data-only: the renderer
 * can draw it, but it never edits terrain or spends resources.
 */
export function previewSite(
  world: World, proposal: SiteProposal, options: PreviewOptions = {},
): SitePreview {
  const query = new TerrainQuery(world);
  const validation = validateSite(world, proposal, query);
  const fp = validation.query;
  const stats = fp.stats;
  const rect = normalizeRect(proposal.rect);
  const rules = proposal.rules;

  let perimeter = 0;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (x !== rect.x0 && x !== rect.x1 && z !== rect.z0 && z !== rect.z1) continue;
      if (columnAt(world, x, z).surfaceY !== proposal.floorY) perimeter++;
    }
  }
  const foundation: FoundationPreview = {
    type: rules.foundation,
    plinthCells: rectColumns(rect) + stats.fillVolume,
    retainingWallCells: perimeter,
    cutVolume: stats.cutVolume,
    fillVolume: stats.fillVolume,
  };

  let access: AccessPreview | null = null;
  if (options.door && options.approach) {
    const door = options.door;
    const approach = options.approach;
    const reasons: string[] = [];
    const distance = Math.hypot(door.x - approach.x, door.z - approach.z);
    const steps = Math.max(1, Math.ceil(distance));
    let prevX = approach.x, prevZ = approach.z;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(approach.x + (door.x - approach.x) * t);
      const z = Math.round(approach.z + (door.z - approach.z) * t);
      if (x === prevX && z === prevZ) continue;
      const result = walkStep(world, prevX, prevZ, x, z, options.walk ?? DEFAULT_WALK);
      if (!result.ok) reasons.push(`${result.reason} at ${x},${z}`);
      prevX = x; prevZ = z;
    }
    access = {
      door, approach, distance,
      grade: effectiveGrade(world, approach.x, approach.z, door.x, door.z),
      walkable: reasons.length === 0,
      reasons,
    };
  }

  const y0 = proposal.floorY - Math.max(1, stats.maxCut) - 1;
  const y1 = proposal.floorY + Math.max(rules.wallHeight, 1) + 1;
  const envelope: VoxelRegion[] = [
    {
      ...expandRect(rect, 2),
      y0: Math.max(Y_MIN, y0),
      y1: Math.min(Y_MAX - 1, y1),
    },
  ];
  if (access) {
    const ax0 = Math.min(access.door.x, access.approach.x) - 1;
    const ax1 = Math.max(access.door.x, access.approach.x) + 1;
    const az0 = Math.min(access.door.z, access.approach.z) - 1;
    const az1 = Math.max(access.door.z, access.approach.z) + 1;
    const aMin = Math.min(surfaceAt(world, ax0, az0), surfaceAt(world, ax1, az1));
    const aMax = Math.max(surfaceAt(world, ax0, az0), surfaceAt(world, ax1, az1));
    envelope.push({
      x0: ax0, x1: ax1, z0: az0, z1: az1,
      y0: Math.max(Y_MIN, aMin - 2),
      y1: Math.min(Y_MAX - 1, aMax + 2),
    });
  }

  return {
    siteId: proposal.siteId,
    state: validation.state,
    rect,
    floorY: proposal.floorY,
    rules,
    reasons: validation.reasons,
    terrain: {
      minY: stats.minY,
      maxY: stats.maxY,
      meanY: stats.meanY,
      relief: stats.relief,
      maxStep: stats.maxStep,
      cutVolume: stats.cutVolume,
      fillVolume: stats.fillVolume,
      maxCut: stats.maxCut,
      maxFill: stats.maxFill,
    },
    foundation,
    obstructions: stats.obstructions.map((o) => ({
      entityId: o.entityId,
      kind: o.kind,
      x: o.x,
      z: o.z,
      action: validation.state === 'invalid' ? 'blocked' : 'clear',
    })),
    access,
    envelope,
  };
}

