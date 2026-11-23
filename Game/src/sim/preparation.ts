// M002 stage 3: bounded, authorized terrain preparation.
//
// The pipeline is deliberately one-way and shared by the player and the AI:
//
//   proposal -> validateSite -> planPreparation -> Authorizer -> execute
//
// `executePreparation` is the only function in M002 that edits terrain for
// construction. It refuses to run without an authorization token whose digest
// matches the plan, whose envelope covers every voxel it would touch, and whose
// base revision still matches the world. All edits are computed and checked
// before the first byte is written, so a rejected plan cannot leave a partial
// pad behind.
//
// The authorizer in this file is a local policy stub. It proves that the
// pipeline and the envelope checks exist; it is NOT MagicBlock enforcement.
// No chain program, SDK call, settlement or rollback guarantee is present.
import {
  World, MAT, MatId, Y_MIN, Y_MAX, HALF, isSolid,
  getVoxel, setVoxel, removeEntity, surfaceAt,
  worldToChunkX, worldToChunkZ, chunkKey,
  EntityKind, ResourceType,
} from './world';
import {
  Rect, VoxelRegion, normalizeRect, rectColumns, expandRect,
  envelopeContains, obstructionsIn,
} from './terrain';
import {
  SiteProposal, SiteValidation, BuildingRules, validateSite,
} from './construction';
import {
  inventorySnapshot, normalizeEnvelope,
} from './canonical';

export const LOCAL_AUTHORITY = 'local-stub' as const;
export const LOCAL_ENFORCEMENT = 'local-simulation-only' as const;

export interface ColumnTarget {
  x: number;
  z: number;
  y: number;
}

export interface PlanExpectation {
  cutVolume: number;
  fillVolume: number;
  maxCut: number;
  maxFill: number;
  obstructions: number;
  surfaceEdits: number;
  totalEdits: number;
}

export interface PreparationPlan {
  id: string;
  siteId: string;
  rect: Rect;
  floorY: number;
  rules: BuildingRules;
  /** Exactly one target walking height per footprint column, sorted by z, x. */
  targets: ColumnTarget[];
  /** Authoritative entity ids this plan may remove. */
  clearEntityIds: string[];
  /** Material for the top solid voxel after grading, or null to keep it. */
  surfaceMaterial: MatId | null;
  /** Tight envelope covering every planned voxel change. */
  envelope: VoxelRegion[];
  expected: PlanExpectation;
}

export interface PreparationOptions {
  /** Per-column targets for terraces or stepped paths. Defaults to floorY. */
  targets?: ColumnTarget[];
  /** `none` is only legal when the site has no obstructions. */
  clear?: 'obstructions' | 'none';
  /** Set the top solid voxel of every target column (paths, fields). */
  surfaceMaterial?: MatId;
  /** Explicit work envelope. Defaults to a tight envelope around the edits. */
  envelope?: VoxelRegion[];
}

// ---------- stable digest ----------
function digest(input: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ (c + 0x9e), 0x85ebca6b);
    b ^= b >>> 13;
  }
  return (a >>> 0).toString(16).padStart(8, '0')
    + (b >>> 0).toString(16).padStart(8, '0');
}

/** Digest of everything that changes the set of edits or removals. */
export function planDigest(plan: PreparationPlan): string {
  const lines: string[] = [
    'm002:prep-plan:v1',
    plan.siteId,
    `${plan.rect.x0},${plan.rect.z0},${plan.rect.x1},${plan.rect.z1}`,
    String(plan.floorY),
    plan.rules.id,
    String(plan.targets.length),
    plan.surfaceMaterial === null ? 'surface:keep' : `surface:${plan.surfaceMaterial}`,
  ];
  for (const t of plan.targets) lines.push(`t:${t.x},${t.z},${t.y}`);
  const clears = [...plan.clearEntityIds].sort();
  lines.push(`c:${clears.length}`);
  for (const id of clears) lines.push(`c:${id}`);
  for (const e of normalizeEnvelope(plan.envelope)) {
    lines.push(`e:${e.x0},${e.z0},${e.y0},${e.x1},${e.z1},${e.y1}`);
  }
  const x = plan.expected;
  lines.push(`x:${x.cutVolume},${x.fillVolume},${x.maxCut},${x.maxFill},${x.obstructions},${x.surfaceEdits},${x.totalEdits}`);
  return digest(lines.join('\n'));
}

// ---------- planning ----------
export interface PlanSuccess {
  ok: true;
  plan: PreparationPlan;
  validation: SiteValidation;
}

export interface PreparationFailure {
  ok: false;
  stage: 'plan' | 'authorize' | 'execute';
  code: string;
  reasons: string[];
  validation?: SiteValidation;
}

export type PlanResult = PlanSuccess | PreparationFailure;

function defaultTargets(world: World, rect: Rect, floorY: number): ColumnTarget[] {
  const out: ColumnTarget[] = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) out.push({ x, z, y: floorY });
  }
  return out;
}

function sortedTargets(targets: readonly ColumnTarget[]): ColumnTarget[] {
  return [...targets].sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y);
}

interface TargetStats {
  cutVolume: number;
  fillVolume: number;
  maxCut: number;
  maxFill: number;
  relief: number;
}

/** Cut/fill implied by explicit targets, independent of the flat floorY. */
function targetStats(world: World, targets: readonly ColumnTarget[]): TargetStats {
  let cutVolume = 0, fillVolume = 0, maxCut = 0, maxFill = 0;
  let minY = Number.POSITIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
  for (const t of targets) {
    const surface = surfaceAt(world, t.x, t.z);
    minY = Math.min(minY, surface, t.y);
    maxY = Math.max(maxY, surface, t.y);
    if (surface > t.y) {
      const d = surface - t.y;
      cutVolume += d;
      maxCut = Math.max(maxCut, d);
    } else if (surface < t.y) {
      const d = t.y - surface;
      fillVolume += d;
      maxFill = Math.max(maxFill, d);
    }
  }
  return { cutVolume, fillVolume, maxCut, maxFill, relief: maxY - minY };
}

function targetRuleReasons(stats: TargetStats, rules: BuildingRules): string[] {
  const reasons: string[] = [];
  if (stats.relief > rules.maxReliefPrepared) {
    reasons.push(`relief ${stats.relief} m exceeds the ${rules.maxReliefPrepared} m prepared limit`);
  }
  if (stats.maxCut > rules.maxCut) {
    reasons.push(`cut ${stats.maxCut} m exceeds ${rules.maxCut} m`);
  }
  if (stats.maxFill > rules.maxFill) {
    reasons.push(`fill ${stats.maxFill} m exceeds ${rules.maxFill} m`);
  }
  if (stats.cutVolume > rules.maxCutVolume) {
    reasons.push(`cut volume ${stats.cutVolume} m³ exceeds ${rules.maxCutVolume} m³`);
  }
  if (stats.fillVolume > rules.maxFillVolume) {
    reasons.push(`fill volume ${stats.fillVolume} m³ exceeds ${rules.maxFillVolume} m³`);
  }
  return reasons;
}

/**
 * Turn a proposal into an explicit, checkable plan. Read-only.
 */
export function planPreparation(
  world: World, proposal: SiteProposal, options: PreparationOptions = {},
): PlanResult {
  const rect = normalizeRect(proposal.rect);
  const validation = validateSite(world, proposal);

  if (validation.state === 'invalid') {
    return {
      ok: false,
      stage: 'plan',
      code: 'site_invalid',
      reasons: validation.reasons.map((r) => `${r.code}: ${r.message}`),
      validation,
    };
  }

  const targets = sortedTargets(options.targets ?? defaultTargets(world, rect, proposal.floorY));
  const columns = rectColumns(rect);
  if (targets.length !== columns) {
    return {
      ok: false,
      stage: 'plan',
      code: 'target_count',
      reasons: [`plan has ${targets.length} targets for ${columns} columns`],
      validation,
    };
  }

  const seen = new Set<string>();
  for (const t of targets) {
    const key = `${t.x},${t.z}`;
    if (seen.has(key)) {
      return {
        ok: false, stage: 'plan', code: 'duplicate_target',
        reasons: [`duplicate target at ${key}`], validation,
      };
    }
    seen.add(key);
    if (t.x < rect.x0 || t.x > rect.x1 || t.z < rect.z0 || t.z > rect.z1) {
      return {
        ok: false, stage: 'plan', code: 'target_outside_footprint',
        reasons: [`target ${key} is outside ${rect.x0},${rect.z0}..${rect.x1},${rect.z1}`],
        validation,
      };
    }
    if (!Number.isInteger(t.y) || t.y < Y_MIN || t.y >= Y_MAX) {
      return {
        ok: false, stage: 'plan', code: 'target_height',
        reasons: [`target ${key} has invalid height ${t.y}`], validation,
      };
    }
  }

  const obstructions = validation.preparation.obstructionIds;
  const clear = options.clear ?? 'obstructions';
  if (clear === 'none' && obstructions.length > 0) {
    return {
      ok: false,
      stage: 'plan',
      code: 'uncleared_obstructions',
      reasons: [`${obstructions.length} obstructions would remain`],
      validation,
    };
  }
  const clearEntityIds = clear === 'none' ? [] : [...new Set(obstructions)].sort();
  const surfaceMaterial = options.surfaceMaterial ?? null;

  const customTargets = options.targets !== undefined;
  const stats = customTargets
    ? targetStats(world, targets)
    : {
      cutVolume: validation.preparation.cutVolume,
      fillVolume: validation.preparation.fillVolume,
      maxCut: validation.preparation.maxCut,
      maxFill: validation.preparation.maxFill,
      relief: validation.query.stats.relief,
    };
  if (customTargets) {
    const reasons = targetRuleReasons(stats, proposal.rules);
    if (reasons.length > 0) {
      return {
        ok: false,
        stage: 'plan',
        code: 'target_rules',
        reasons,
        validation,
      };
    }
  }

  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const t of targets) {
    const surface = surfaceAt(world, t.x, t.z);
    lo = Math.min(lo, surface, t.y);
    hi = Math.max(hi, surface - 1, t.y - 1);
  }
  const buffered = expandRect(rect, 1);
  const derived: VoxelRegion = {
    x0: Math.max(-HALF, buffered.x0),
    z0: Math.max(-HALF, buffered.z0),
    x1: Math.min(HALF - 1, buffered.x1),
    z1: Math.min(HALF - 1, buffered.z1),
    y0: Math.max(Y_MIN, lo - 1),
    y1: Math.min(Y_MAX - 1, hi + 1),
  };
  // An explicit envelope replaces the derived one. Callers that pin an exact
  // work envelope (path preparation) must not silently widen it with the
  // default 1 m buffer.
  const envelope = normalizeEnvelope(options.envelope ?? [derived]);
  const surfaceEdits = surfaceMaterial === null ? 0 : targets.length;

  const plan: PreparationPlan = {
    id: '',
    siteId: proposal.siteId,
    rect,
    floorY: proposal.floorY,
    rules: proposal.rules,
    targets,
    clearEntityIds,
    surfaceMaterial,
    envelope,
    expected: {
      cutVolume: stats.cutVolume,
      fillVolume: stats.fillVolume,
      maxCut: stats.maxCut,
      maxFill: stats.maxFill,
      obstructions: clearEntityIds.length,
      surfaceEdits,
      totalEdits: stats.cutVolume + stats.fillVolume + surfaceEdits,
    },
  };
  plan.id = `prep:${planDigest(plan)}`;
  return { ok: true, plan, validation };
}

// ---------- authorization ----------
export interface AuthorizationLimits {
  maxCutVolume: number;
  maxFillVolume: number;
  maxVoxelEdits: number;
  maxEntityRemovals: number;
  maxTargets: number;
}

export const DEFAULT_LIMITS: AuthorizationLimits = {
  maxCutVolume: 256,
  maxFillVolume: 256,
  maxVoxelEdits: 1024,
  maxEntityRemovals: 16,
  maxTargets: 512,
};

export interface WorkAuthorization {
  id: string;
  authority: typeof LOCAL_AUTHORITY;
  enforcement: typeof LOCAL_ENFORCEMENT;
  planDigest: string;
  envelope: VoxelRegion[];
  baseRevision: number;
  limits: AuthorizationLimits;
}

export interface AuthorizationDecision {
  ok: boolean;
  authorization: WorkAuthorization | null;
  reasons: string[];
}

export interface AuthorizationPolicy {
  /** The only regions this governor permits for the first slice. */
  envelope: VoxelRegion[];
  limits?: Partial<AuthorizationLimits>;
}

function regionContained(region: VoxelRegion, policy: readonly VoxelRegion[]): boolean {
  return policy.some((p) => region.x0 >= p.x0 && region.x1 <= p.x1
    && region.z0 >= p.z0 && region.z1 <= p.z1
    && region.y0 >= p.y0 && region.y1 <= p.y1);
}

/**
 * Local governor stub. It enforces a fixed envelope and hard volume limits,
 * binds a token to the exact plan digest and world revision, and refuses to
 * pretend it is an on-chain authority.
 */
export class LocalAuthorizer {
  readonly authority = LOCAL_AUTHORITY;
  readonly enforcement = LOCAL_ENFORCEMENT;
  readonly limits: AuthorizationLimits;

  constructor(readonly policy: AuthorizationPolicy) {
    this.limits = { ...DEFAULT_LIMITS, ...(policy.limits ?? {}) };
  }

  authorize(world: World, plan: PreparationPlan): AuthorizationDecision {
    const reasons: string[] = [];
    const rect = normalizeRect(plan.rect);

    if (plan.targets.length !== rectColumns(rect)) {
      reasons.push(`plan has ${plan.targets.length} targets for ${rectColumns(rect)} columns`);
    }
    if (plan.targets.length > this.limits.maxTargets) {
      reasons.push(`${plan.targets.length} targets exceed limit ${this.limits.maxTargets}`);
    }
    if (plan.expected.cutVolume > this.limits.maxCutVolume) {
      reasons.push(`cut ${plan.expected.cutVolume} exceeds limit ${this.limits.maxCutVolume}`);
    }
    if (plan.expected.fillVolume > this.limits.maxFillVolume) {
      reasons.push(`fill ${plan.expected.fillVolume} exceeds limit ${this.limits.maxFillVolume}`);
    }
    if (plan.expected.totalEdits > this.limits.maxVoxelEdits) {
      reasons.push(`planned edits exceed limit ${this.limits.maxVoxelEdits}`);
    }
    if (plan.clearEntityIds.length > this.limits.maxEntityRemovals) {
      reasons.push(`${plan.clearEntityIds.length} removals exceed limit ${this.limits.maxEntityRemovals}`);
    }
    if (new Set(plan.clearEntityIds).size !== plan.clearEntityIds.length) {
      reasons.push('duplicate entity removal ids');
    }

    if (plan.envelope.length === 0) {
      reasons.push('plan has no work envelope');
    }
    for (const region of plan.envelope) {
      if (!regionContained(region, this.policy.envelope)) {
        reasons.push(`envelope ${region.x0},${region.z0},${region.y0}..${region.x1},${region.z1},${region.y1} is outside the local policy`);
      }
    }
    for (const t of plan.targets) {
      if (!envelopeContains(plan.envelope, t.x, t.y, t.z)
        || (t.y > Y_MIN && !envelopeContains(plan.envelope, t.x, t.y - 1, t.z))) {
        reasons.push(`target ${t.x},${t.z},${t.y} is not covered by the work envelope`);
      }
    }

    // Every obstruction currently on the footprint must be in the plan, and
    // the plan may not remove anything that is not an obstruction there.
    const current = obstructionsIn(world, rect).map((o) => o.entityId).sort();
    const planned = [...plan.clearEntityIds].sort();
    if (current.length !== planned.length || current.some((id, i) => id !== planned[i])) {
      reasons.push(`plan removals [${planned.join(',')}] do not match footprint obstructions [${current.join(',')}]`);
    }

    if (reasons.length > 0) return { ok: false, authorization: null, reasons };

    const token: WorkAuthorization = {
      id: `local-stub:${planDigest(plan)}`,
      authority: LOCAL_AUTHORITY,
      enforcement: LOCAL_ENFORCEMENT,
      planDigest: planDigest(plan),
      envelope: normalizeEnvelope(plan.envelope),
      baseRevision: world.revision,
      limits: { ...this.limits },
    };
    return { ok: true, authorization: token, reasons: [] };
  }
}

// ---------- execution ----------
interface PendingEdit {
  x: number;
  y: number;
  z: number;
  before: MatId;
  after: MatId;
  /** True for a material-only top-surface change. */
  surface?: boolean;
}

export interface ChunkDelta {
  chunk: string;
  changed: number;
  added: number;
  removed: number;
}

export interface ClearedEntity {
  entityId: string;
  kind: EntityKind;
  resource: ResourceType | null;
  amount: number;
  x: number;
  y: number;
  z: number;
}

export interface PreparationLedger {
  authority: typeof LOCAL_AUTHORITY;
  enforcement: typeof LOCAL_ENFORCEMENT;
  authorizationId: string;
  planDigest: string;
  siteId: string;
  rect: Rect;
  floorY: number;
  cutVolume: number;
  fillVolume: number;
  netSpoil: number;
  borrowedFill: number;
  cutByMaterial: Record<string, number>;
  fillByMaterial: Record<string, number>;
  voxelEdits: number;
  surfaceEdits: number;
  entitiesCleared: ClearedEntity[];
  resourcesGained: Partial<Record<ResourceType, number>>;
  inventoryBefore: Record<string, number>;
  inventoryAfter: Record<string, number>;
  chunkDeltas: ChunkDelta[];
  revisionBefore: number;
  revisionAfter: number;
}

export interface PreparationSuccess {
  ok: true;
  plan: PreparationPlan;
  authorization: WorkAuthorization;
  ledger: PreparationLedger;
}

export type PreparationOutcome = PreparationSuccess | PreparationFailure;

const MATERIAL_NAMES: Record<number, string> = {
  [MAT.GRASS]: 'grass',
  [MAT.SOIL]: 'soil',
  [MAT.SAND]: 'sand',
  [MAT.GRAVEL]: 'gravel',
  [MAT.STONE]: 'stone',
  [MAT.ORE]: 'ore',
  [MAT.WATER]: 'water',
  [MAT.BEDROCK]: 'bedrock',
  [MAT.MOSS]: 'moss',
};

function materialName(m: MatId): string {
  return MATERIAL_NAMES[m] ?? `mat_${m}`;
}

function fillMaterial(y: number, target: number): MatId {
  return y === target - 1 ? MAT.GRASS : MAT.SOIL;
}

function fail(stage: PreparationFailure['stage'], code: string, reasons: string[]): PreparationFailure {
  return { ok: false, stage, code, reasons };
}

/**
 * Apply an authorized plan. No voxel is written until every edit and removal
 * has been checked against the token, the plan envelope and the hard limits.
 */
export function executePreparation(
  world: World, plan: PreparationPlan, authorization: WorkAuthorization,
): PreparationOutcome {
  if (authorization.authority !== LOCAL_AUTHORITY
    || authorization.enforcement !== LOCAL_ENFORCEMENT) {
    return fail('execute', 'unsupported_authority', [
      `authority ${authorization.authority}/${authorization.enforcement} is not the local stub`,
    ]);
  }
  if (authorization.planDigest !== planDigest(plan)) {
    return fail('execute', 'digest_mismatch', ['authorization does not match this plan']);
  }
  if (authorization.baseRevision !== world.revision) {
    return fail('execute', 'stale_authorization', [
      `authorization was issued at revision ${authorization.baseRevision}, world is at ${world.revision}`,
    ]);
  }
  if (plan.envelope.some((r) => !regionContained(r, authorization.envelope))) {
    return fail('execute', 'envelope_mismatch', ['plan envelope is wider than the authorization']);
  }

  const rect = normalizeRect(plan.rect);
  const edits: PendingEdit[] = [];
  for (const t of plan.targets) {
    const surface = surfaceAt(world, t.x, t.z);
    if (t.y < surface) {
      for (let y = t.y; y < surface; y++) {
        const before = getVoxel(world, t.x, y, t.z);
        if (isSolid(before)) edits.push({ x: t.x, y, z: t.z, before, after: MAT.AIR });
      }
    } else if (t.y > surface) {
      for (let y = surface; y < t.y; y++) {
        const before = getVoxel(world, t.x, y, t.z);
        if (!isSolid(before)) {
          const after = plan.surfaceMaterial !== null && y === t.y - 1
            ? plan.surfaceMaterial
            : fillMaterial(y, t.y);
          edits.push({ x: t.x, y, z: t.z, before, after });
        }
      }
    }
    // Material-only surface change for cut or already-level columns. Fill
    // columns already receive the surface material in the fill loop above.
    if (plan.surfaceMaterial !== null) {
      const topY = t.y - 1;
      const before = getVoxel(world, t.x, topY, t.z);
      if (isSolid(before) && before !== plan.surfaceMaterial) {
        edits.push({
          x: t.x, y: topY, z: t.z, before, after: plan.surfaceMaterial, surface: true,
        });
      }
    }
  }

  // Check every edit before mutating anything.
  const reasons: string[] = [];
  for (const e of edits) {
    if (e.x < rect.x0 || e.x > rect.x1 || e.z < rect.z0 || e.z > rect.z1) {
      reasons.push(`edit ${e.x},${e.y},${e.z} is outside the footprint`);
    }
    if (!envelopeContains(authorization.envelope, e.x, e.y, e.z)) {
      reasons.push(`edit ${e.x},${e.y},${e.z} is outside the authorized envelope`);
    }
  }
  const cutVolume = edits.filter((e) => e.after === MAT.AIR && isSolid(e.before)).length;
  const fillVolume = edits.filter((e) => e.after !== MAT.AIR && !isSolid(e.before)).length;
  if (cutVolume > authorization.limits.maxCutVolume) {
    reasons.push(`cut ${cutVolume} exceeds limit ${authorization.limits.maxCutVolume}`);
  }
  if (fillVolume > authorization.limits.maxFillVolume) {
    reasons.push(`fill ${fillVolume} exceeds limit ${authorization.limits.maxFillVolume}`);
  }
  if (edits.length > authorization.limits.maxVoxelEdits) {
    reasons.push(`${edits.length} edits exceed limit ${authorization.limits.maxVoxelEdits}`);
  }

  const current = obstructionsIn(world, rect).map((o) => o.entityId).sort();
  const planned = [...plan.clearEntityIds].sort();
  if (current.length !== planned.length || current.some((id, i) => id !== planned[i])) {
    reasons.push('footprint obstructions changed after authorization');
  }
  if (plan.clearEntityIds.length > authorization.limits.maxEntityRemovals) {
    reasons.push(`${plan.clearEntityIds.length} removals exceed limit ${authorization.limits.maxEntityRemovals}`);
  }
  for (const id of plan.clearEntityIds) {
    if (!world.entities.has(id)) reasons.push(`entity ${id} no longer exists`);
  }
  if (world.life) {
    let recovered = 0;
    for (const id of plan.clearEntityIds) {
      const entity = world.entities.get(id);
      if (entity?.resource && entity.remaining > 0) recovered += entity.remaining;
    }
    // Check before any voxel or entity changes, preserving legacy unbounded
    // construction behavior and schema-3 carried-capacity conservation.
    if (Object.values(world.inventory).reduce((sum, amount) => sum + amount, 0) + recovered > 120) {
      reasons.push('resources recovered during site clearing would exceed carried capacity 120');
    }
  }
  if (reasons.length > 0) return fail('execute', 'unauthorized_edits', reasons);

  const inventoryBefore = inventorySnapshot(world);
  const revisionBefore = world.revision;
  const chunkDeltas = new Map<string, ChunkDelta>();
  const cutByMaterial: Record<string, number> = {};
  const fillByMaterial: Record<string, number> = {};
  let applied = 0;
  let surfaceEdits = 0;

  for (const e of edits) {
    if (!setVoxel(world, e.x, e.y, e.z, e.after)) continue;
    applied++;
    if (e.surface) surfaceEdits++;
    const key = chunkKey(worldToChunkX(e.x), worldToChunkZ(e.z));
    let delta = chunkDeltas.get(key);
    if (!delta) {
      delta = { chunk: key, changed: 0, added: 0, removed: 0 };
      chunkDeltas.set(key, delta);
    }
    delta.changed++;
    const wasSolid = isSolid(e.before);
    const isNowSolid = isSolid(e.after);
    if (!wasSolid && isNowSolid) delta.added++;
    if (wasSolid && !isNowSolid) delta.removed++;
    const name = materialName(e.before);
    if (wasSolid && !isNowSolid) cutByMaterial[name] = (cutByMaterial[name] ?? 0) + 1;
    if (!wasSolid && isNowSolid) fillByMaterial[materialName(e.after)] = (fillByMaterial[materialName(e.after)] ?? 0) + 1;
  }

  const entitiesCleared: ClearedEntity[] = [];
  const resourcesGained: Partial<Record<ResourceType, number>> = {};
  for (const id of [...plan.clearEntityIds].sort()) {
    const e = world.entities.get(id);
    if (!e) continue;
    const amount = e.resource && e.remaining > 0 ? e.remaining : 0;
    if (e.resource && amount > 0) {
      world.inventory[e.resource] = (world.inventory[e.resource] ?? 0) + amount;
      resourcesGained[e.resource] = (resourcesGained[e.resource] ?? 0) + amount;
    }
    removeEntity(world, id);
    entitiesCleared.push({
      entityId: id, kind: e.kind, resource: e.resource, amount, x: e.x, y: e.y, z: e.z,
    });
  }

  const cut = applied > 0 ? Object.values(cutByMaterial).reduce((a, b) => a + b, 0) : 0;
  const fill = applied > 0 ? Object.values(fillByMaterial).reduce((a, b) => a + b, 0) : 0;
  const ledger: PreparationLedger = {
    authority: LOCAL_AUTHORITY,
    enforcement: LOCAL_ENFORCEMENT,
    authorizationId: authorization.id,
    planDigest: authorization.planDigest,
    siteId: plan.siteId,
    rect,
    floorY: plan.floorY,
    cutVolume: cut,
    fillVolume: fill,
    netSpoil: cut - fill,
    borrowedFill: Math.max(0, fill - cut),
    cutByMaterial,
    fillByMaterial,
    voxelEdits: applied,
    surfaceEdits,
    entitiesCleared,
    resourcesGained,
    inventoryBefore,
    inventoryAfter: inventorySnapshot(world),
    chunkDeltas: [...chunkDeltas.values()].sort((a, b) => a.chunk.localeCompare(b.chunk)),
    revisionBefore,
    revisionAfter: world.revision,
  };
  return { ok: true, plan, authorization, ledger };
}

/**
 * The shared player/AI entry point. There is no other construction path.
 */
export function prepareSite(
  world: World,
  authorizer: LocalAuthorizer,
  proposal: SiteProposal,
  options: PreparationOptions = {},
): PreparationOutcome {
  const planned = planPreparation(world, proposal, options);
  if (!planned.ok) return planned;
  const decision = authorizer.authorize(world, planned.plan);
  if (!decision.ok || !decision.authorization) {
    return fail('authorize', 'not_authorized', decision.reasons);
  }
  return executePreparation(world, planned.plan, decision.authorization);
}
