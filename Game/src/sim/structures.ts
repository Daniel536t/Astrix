// M002 stage 4: authoritative house, path and terrace structures.
//
// Structures are simulation records, not renderer-only meshes. A structure is
// planned from the prepared terrain, authorized against the same local policy
// envelope as terrain preparation, paid for from inventory, and then stored in
// World.structures. The renderer reads those records; it never invents a
// building that the simulation does not own.
import {
  World, ResourceType, MAT, surfaceAt, getVoxel,
} from './world';
import {
  Rect, VoxelRegion, normalizeRect, expandRect,
  envelopeContains, obstructionsIn,
} from './terrain';
import {
  AuthorizationPolicy, LOCAL_AUTHORITY, LOCAL_ENFORCEMENT,
} from './preparation';
import { FARM_RULES } from './construction';
import { inventorySnapshot } from './canonical';

export type StructureKind = 'house' | 'path' | 'terrace';

export type ModuleKind =
  | 'floor'
  | 'wall'
  | 'post'
  | 'lintel'
  | 'roof'
  | 'parapet'
  | 'window'
  | 'door'
  | 'threshold'
  | 'path'
  | 'curb'
  | 'soil_bed'
  | 'retaining_wall'
  | 'crop_row';

export type ModuleTone =
  | 'stone'
  | 'stone_b'
  | 'ochre'
  | 'timber'
  | 'accent'
  | 'soil'
  | 'crop'
  | 'gravel';

export interface StructureModule {
  kind: ModuleKind;
  /** Centre in world x/z, bottom in world y. */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  rot?: number;
  tone?: ModuleTone;
}

export interface Structure {
  id: string;
  kind: StructureKind;
  siteId: string;
  /** Origin: centre of the prepared footprint at floor height. */
  x: number;
  y: number;
  z: number;
  rot: number;
  modules: StructureModule[];
  cost: Partial<Record<ResourceType, number>>;
  builtRevision: number;
  provisional: true;
}

export interface TerraceBand {
  z0: number;
  z1: number;
  y: number;
}

export interface StructureProposal {
  siteId: string;
  kind: StructureKind;
  rect: Rect;
  floorY: number;
  /** Required for houses: voxel column of the door on the east wall. */
  door?: { x: number; z: number };
  /** Optional path metadata; the path is laid along the rect centreline. */
  approach?: { x: number; z: number };
  terraces?: number;
}

export interface SurfaceSample {
  x: number;
  z: number;
  y: number;
}

export interface StructurePlan {
  id: string;
  kind: StructureKind;
  siteId: string;
  rect: Rect;
  floorY: number;
  origin: { x: number; y: number; z: number };
  rot: number;
  modules: StructureModule[];
  cost: Partial<Record<ResourceType, number>>;
  envelope: VoxelRegion[];
  /** Expected prepared surface, checked again at execution time. */
  surface: SurfaceSample[];
  terraces?: TerraceBand[];
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

export function structureDigest(plan: StructurePlan): string {
  const lines: string[] = [
    'm002:structure-plan:v1',
    plan.kind,
    plan.siteId,
    `${plan.rect.x0},${plan.rect.z0},${plan.rect.x1},${plan.rect.z1}`,
    String(plan.floorY),
    `${plan.origin.x},${plan.origin.y},${plan.origin.z}`,
    String(plan.rot),
    `m:${plan.modules.length}`,
  ];
  for (const m of plan.modules) {
    lines.push(`m:${m.kind},${m.x},${m.y},${m.z},${m.w},${m.h},${m.d},${m.rot ?? 0},${m.tone ?? ''}`);
  }
  const costKeys = Object.keys(plan.cost).sort();
  lines.push(`cost:${costKeys.length}`);
  for (const key of costKeys) lines.push(`cost:${key},${plan.cost[key as ResourceType] ?? 0}`);
  for (const s of plan.surface) lines.push(`s:${s.x},${s.z},${s.y}`);
  for (const t of plan.terraces ?? []) lines.push(`t:${t.z0},${t.z1},${t.y}`);
  return digest(lines.join('\n'));
}

// ---------- planning helpers ----------
export interface StructureFailure {
  ok: false;
  stage: 'plan' | 'authorize' | 'execute';
  code: string;
  reasons: string[];
}

export interface StructurePlanSuccess {
  ok: true;
  plan: StructurePlan;
}

export type StructurePlanResult = StructurePlanSuccess | StructureFailure;

function fail(stage: StructureFailure['stage'], code: string, reasons: string[]): StructureFailure {
  return { ok: false, stage, code, reasons };
}

function surfaceMismatches(world: World, samples: readonly SurfaceSample[]) {
  const out: Array<{ x: number; z: number; expected: number; actual: number }> = [];
  for (const s of samples) {
    const actual = surfaceAt(world, s.x, s.z);
    if (actual !== s.y) out.push({ x: s.x, z: s.z, expected: s.y, actual });
  }
  return out;
}

function footprintSurface(world: World, rect: Rect, y: number): SurfaceSample[] {
  const out: SurfaceSample[] = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) out.push({ x, z, y });
  }
  return out;
}

function footprintEnvelope(rect: Rect, y0: number, y1: number, margin = 1): VoxelRegion[] {
  const r = expandRect(rect, margin);
  return [{ ...r, y0, y1 }];
}

function moduleBounds(m: StructureModule): { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number } {
  const r = Math.hypot(m.w, m.d) / 2;
  const halfW = (m.rot ?? 0) === 0 ? m.w / 2 : r;
  const halfD = (m.rot ?? 0) === 0 ? m.d / 2 : r;
  return {
    x0: m.x - halfW, x1: m.x + halfW,
    y0: m.y, y1: m.y + m.h,
    z0: m.z - halfD, z1: m.z + halfD,
  };
}

function moduleInsideEnvelope(m: StructureModule, envelope: readonly VoxelRegion[]): boolean {
  const b = moduleBounds(m);
  return envelope.some((e) => b.x0 >= e.x0 - 1e-6 && b.x1 <= e.x1 + 1 + 1e-6
    && b.y0 >= e.y0 - 1e-6 && b.y1 <= e.y1 + 1 + 1e-6
    && b.z0 >= e.z0 - 1e-6 && b.z1 <= e.z1 + 1 + 1e-6);
}

function costTotal(cost: Partial<Record<ResourceType, number>>): number {
  return Object.values(cost).reduce((a, b) => a + (b ?? 0), 0);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// ---------- house ----------
function planHouse(world: World, proposal: StructureProposal): StructurePlanResult {
  const rect = normalizeRect(proposal.rect);
  const width = rect.x1 - rect.x0 + 1;
  const depth = rect.z1 - rect.z0 + 1;
  if (width !== 8 || depth !== 6) {
    return fail('plan', 'footprint_mismatch', [`house needs 8 x 6 m, got ${width} x ${depth} m`]);
  }
  if (!proposal.door) {
    return fail('plan', 'missing_door', ['house plan needs a door column']);
  }
  if (proposal.door.z < rect.z0 || proposal.door.z > rect.z1) {
    return fail('plan', 'door_outside', [`door z ${proposal.door.z} is outside ${rect.z0}..${rect.z1}`]);
  }

  const surface = footprintSurface(world, rect, proposal.floorY);
  const mismatches = surfaceMismatches(world, surface);
  if (mismatches.length > 0) {
    return fail('plan', 'site_not_prepared', mismatches.slice(0, 4).map(
      (m) => `column ${m.x},${m.z} is at ${m.actual}, expected ${m.expected}`,
    ));
  }
  const obstructions = obstructionsIn(world, rect);
  if (obstructions.length > 0) {
    return fail('plan', 'site_obstructed', obstructions.map((o) => o.entityId));
  }

  const floorY = proposal.floorY;
  const x0 = rect.x0, x1 = rect.x1 + 1;
  const z0 = rect.z0, z1 = rect.z1 + 1;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const doorZ = proposal.door.z + 0.5;
  const doorHalf = 0.6;
  const wallH = 3.0;
  const wallT = 0.5;
  const doorH = 2.2;
  const modules: StructureModule[] = [];

  // Floor slab and roof plate.
  modules.push({ kind: 'floor', x: cx, y: floorY, z: cz, w: 8.0, h: 0.3, d: 6.0, tone: 'stone_b' });
  modules.push({ kind: 'roof', x: cx, y: floorY + wallH, z: cz, w: 8.4, h: 0.3, d: 6.4, tone: 'stone' });

  // North and south walls.
  modules.push({ kind: 'wall', x: cx, y: floorY, z: z0 + wallT / 2, w: 8.0, h: wallH, d: wallT, tone: 'stone' });
  modules.push({ kind: 'wall', x: cx, y: floorY, z: z1 - wallT / 2, w: 8.0, h: wallH, d: wallT, tone: 'stone' });

  // West wall.
  modules.push({ kind: 'wall', x: x0 + wallT / 2, y: floorY, z: cz, w: wallT, h: wallH, d: 6.0, tone: 'stone' });

  // East wall with a real doorway gap.
  const eastX = x1 - wallT / 2;
  const gap0 = doorZ - doorHalf;
  const gap1 = doorZ + doorHalf;
  const leftLen = gap0 - z0;
  const rightLen = z1 - gap1;
  if (leftLen > 0.05) {
    modules.push({
      kind: 'wall', x: eastX, y: floorY, z: z0 + leftLen / 2,
      w: wallT, h: wallH, d: leftLen, tone: 'stone',
    });
  }
  if (rightLen > 0.05) {
    modules.push({
      kind: 'wall', x: eastX, y: floorY, z: gap1 + rightLen / 2,
      w: wallT, h: wallH, d: rightLen, tone: 'stone',
    });
  }
  modules.push({
    kind: 'lintel', x: eastX, y: floorY + doorH, z: doorZ,
    w: wallT, h: wallH - doorH, d: doorHalf * 2, tone: 'stone_b',
  });
  modules.push({
    kind: 'door', x: eastX, y: floorY, z: gap0,
    w: 0.18, h: doorH, d: 0.16, tone: 'timber',
  });
  modules.push({
    kind: 'door', x: eastX, y: floorY, z: gap1,
    w: 0.18, h: doorH, d: 0.16, tone: 'timber',
  });
  modules.push({
    kind: 'threshold', x: x1 + 0.35, y: floorY, z: doorZ,
    w: 0.9, h: 0.16, d: 1.3, tone: 'ochre',
  });

  // Two windows on the south wall, slightly proud of the outer face.
  for (const wx of [cx - 2.2, cx + 2.2]) {
    modules.push({
      kind: 'window', x: wx, y: floorY + 1.45, z: z1 - 0.02,
      w: 1.0, h: 1.0, d: 0.08, tone: 'accent',
    });
  }

  // Parapet around the flat Noxel roof.
  modules.push({ kind: 'parapet', x: cx, y: floorY + wallH + 0.3, z: cz - 3.05, w: 8.4, h: 0.4, d: 0.3, tone: 'stone_b' });
  modules.push({ kind: 'parapet', x: cx, y: floorY + wallH + 0.3, z: cz + 3.05, w: 8.4, h: 0.4, d: 0.3, tone: 'stone_b' });
  modules.push({ kind: 'parapet', x: cx - 4.05, y: floorY + wallH + 0.3, z: cz, w: 0.3, h: 0.4, d: 6.4, tone: 'stone_b' });
  modules.push({ kind: 'parapet', x: cx + 4.05, y: floorY + wallH + 0.3, z: cz, w: 0.3, h: 0.4, d: 6.4, tone: 'stone_b' });

  const plan: StructurePlan = {
    id: '',
    kind: 'house',
    siteId: proposal.siteId,
    rect,
    floorY,
    origin: { x: cx, y: floorY, z: cz },
    rot: 0,
    modules,
    cost: { wood: 10, stone: 18 },
    envelope: footprintEnvelope(rect, floorY, floorY + 4, 2),
    surface,
  };
  plan.id = `structure:${structureDigest(plan)}`;
  return { ok: true, plan };
}

// ---------- path ----------
function planPath(world: World, proposal: StructureProposal): StructurePlanResult {
  const rect = normalizeRect(proposal.rect);
  const width = rect.x1 - rect.x0 + 1;
  const depth = rect.z1 - rect.z0 + 1;
  if (depth !== 3 || width < 3) {
    return fail('plan', 'footprint_mismatch', [`path needs a 3 m wide corridor, got ${width} x ${depth} m`]);
  }

  const centerZ = rect.z0 + 1;
  const surface: SurfaceSample[] = [];
  const heights: number[] = [];
  for (let x = rect.x0; x <= rect.x1; x++) {
    const y = surfaceAt(world, x, centerZ);
    heights.push(y);
    for (let z = rect.z0; z <= rect.z1; z++) surface.push({ x, z, y });
  }
  const mismatches = surfaceMismatches(world, surface);
  if (mismatches.length > 0) {
    return fail('plan', 'path_not_prepared', mismatches.slice(0, 4).map(
      (m) => `column ${m.x},${m.z} is at ${m.actual}, expected ${m.expected}`,
    ));
  }
  for (let i = 1; i < heights.length; i++) {
    const step = heights[i] - heights[i - 1];
    if (Math.abs(step) > 1) {
      return fail('plan', 'path_step', [`step ${step} m at x=${rect.x0 + i}`]);
    }
  }
  for (const s of surface) {
    const top = getVoxel(world, s.x, s.y - 1, s.z);
    if (top === MAT.WATER) {
      return fail('plan', 'path_wet', [`column ${s.x},${s.z} is wet`]);
    }
    if (top !== MAT.GRAVEL) {
      return fail('plan', 'path_surface', [
        `column ${s.x},${s.z} top is ${top}, expected gravel`,
      ]);
    }
  }
  const obstructions = obstructionsIn(world, rect);
  if (obstructions.length > 0) {
    return fail('plan', 'path_obstructed', obstructions.map((o) => o.entityId));
  }

  const cz = centerZ + 0.5;
  const modules: StructureModule[] = [];
  for (let x = rect.x0; x <= rect.x1; x++) {
    const y = surfaceAt(world, x, centerZ);
    const mx = x + 0.5;
    modules.push({ kind: 'path', x: mx, y, z: cz, w: 1.0, h: 0.12, d: 3.0, tone: 'gravel' });
    modules.push({ kind: 'curb', x: mx, y, z: rect.z0 + 0.075, w: 1.0, h: 0.22, d: 0.15, tone: 'stone_b' });
    modules.push({ kind: 'curb', x: mx, y, z: rect.z1 + 1 - 0.075, w: 1.0, h: 0.22, d: 0.15, tone: 'stone_b' });
  }

  const minY = Math.min(...heights);
  const maxY = Math.max(...heights);
  const plan: StructurePlan = {
    id: '',
    kind: 'path',
    siteId: proposal.siteId,
    rect,
    floorY: proposal.floorY,
    origin: { x: (rect.x0 + rect.x1 + 1) / 2, y: minY, z: cz },
    rot: 0,
    modules,
    cost: { stone: width },
    envelope: footprintEnvelope(rect, minY - 1, maxY + 2, 0),
    surface,
  };
  plan.id = `structure:${structureDigest(plan)}`;
  return { ok: true, plan };
}

// ---------- terraces ----------
function planTerraces(world: World, proposal: StructureProposal): StructurePlanResult {
  const rect = normalizeRect(proposal.rect);
  const width = rect.x1 - rect.x0 + 1;
  const depth = rect.z1 - rect.z0 + 1;
  const count = proposal.terraces ?? 3;
  if (width !== 12 || depth !== 8) {
    return fail('plan', 'footprint_mismatch', [`terraces need 12 x 8 m, got ${width} x ${depth} m`]);
  }
  if (count < 2 || count > 4) {
    return fail('plan', 'terrace_count', [`${count} terraces is outside 2..4`]);
  }

  // Split depth into near-equal bands, high side first.
  const base = Math.floor(depth / count);
  const extra = depth % count;
  const bands: TerraceBand[] = [];
  let z = rect.z0;
  const medians: number[] = [];
  for (let i = 0; i < count; i++) {
    const size = base + (i < extra ? 1 : 0);
    const z0 = z, z1 = z + size - 1;
    const values: number[] = [];
    for (let bz = z0; bz <= z1; bz++) {
      for (let x = rect.x0; x <= rect.x1; x++) values.push(surfaceAt(world, x, bz));
    }
    medians.push(median(values));
    bands.push({ z0, z1, y: 0 });
    z = z1 + 1;
  }
  // Each terrace sits exactly one metre below the previous one.
  for (let i = 0; i < bands.length; i++) {
    bands[i].y = i === 0 ? medians[0] : Math.min(medians[i], bands[i - 1].y - 1);
  }

  let maxCut = 0, maxFill = 0, cutVolume = 0, fillVolume = 0;
  const surface: SurfaceSample[] = [];
  for (const b of bands) {
    for (let bz = b.z0; bz <= b.z1; bz++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        const s = surfaceAt(world, x, bz);
        surface.push({ x, z: bz, y: b.y });
        const d = s - b.y;
        if (d > 0) { cutVolume += d; maxCut = Math.max(maxCut, d); }
        if (d < 0) { fillVolume += -d; maxFill = Math.max(maxFill, -d); }
      }
    }
  }
  if (maxCut > FARM_RULES.maxCut || maxFill > FARM_RULES.maxFill
    || cutVolume > FARM_RULES.maxCutVolume || fillVolume > FARM_RULES.maxFillVolume) {
    return fail('plan', 'terrace_earthwork', [
      `cut ${cutVolume} m³ / fill ${fillVolume} m³, max ${maxCut}/${maxFill} m`,
    ]);
  }
  const mismatches = surfaceMismatches(world, surface);
  if (mismatches.length > 0) {
    return fail('plan', 'site_not_prepared', mismatches.slice(0, 4).map(
      (m) => `column ${m.x},${m.z} is at ${m.actual}, expected ${m.expected}`,
    ));
  }
  const obstructions = obstructionsIn(world, rect);
  if (obstructions.length > 0) {
    return fail('plan', 'site_obstructed', obstructions.map((o) => o.entityId));
  }
  for (const s of surface) {
    const top = getVoxel(world, s.x, s.y - 1, s.z);
    if (top !== MAT.SOIL) {
      return fail('plan', 'terrace_surface', [
        `column ${s.x},${s.z} top is ${top}, expected soil`,
      ]);
    }
  }

  const cx = (rect.x0 + rect.x1 + 1) / 2;
  const modules: StructureModule[] = [];
  for (const b of bands) {
    const bz = (b.z0 + b.z1 + 1) / 2;
    modules.push({
      kind: 'soil_bed', x: cx, y: b.y, z: bz,
      w: width, h: 0.18, d: b.z1 - b.z0 + 1, tone: 'soil',
    });
    // Three crop rows per terrace, inset from the retaining walls.
    const rowDepth = b.z1 - b.z0 + 1;
    for (let r = 0; r < 3; r++) {
      const t = (r + 1) / 4;
      modules.push({
        kind: 'crop_row', x: cx, y: b.y + 0.18, z: b.z0 + rowDepth * t,
        w: width - 1.2, h: 0.28, d: 0.36, tone: 'crop',
      });
    }
  }
  for (let i = 1; i < bands.length; i++) {
    const upper = bands[i - 1];
    const lower = bands[i];
    modules.push({
      kind: 'retaining_wall', x: cx, y: lower.y, z: upper.z1 + 0.5,
      w: width, h: upper.y - lower.y, d: 0.4, tone: 'stone_b',
    });
  }

  const minY = Math.min(...bands.map((b) => b.y));
  const maxY = Math.max(...bands.map((b) => b.y));
  const plan: StructurePlan = {
    id: '',
    kind: 'terrace',
    siteId: proposal.siteId,
    rect,
    floorY: proposal.floorY,
    origin: { x: cx, y: minY, z: (rect.z0 + rect.z1 + 1) / 2 },
    rot: 0,
    modules,
    cost: { wood: 6, stone: 12 },
    envelope: footprintEnvelope(rect, minY - 1, maxY + 2, 1),
    surface,
    terraces: bands,
  };
  plan.id = `structure:${structureDigest(plan)}`;
  return { ok: true, plan };
}

export function planStructure(world: World, proposal: StructureProposal): StructurePlanResult {
  if (proposal.kind === 'house') return planHouse(world, proposal);
  if (proposal.kind === 'path') return planPath(world, proposal);
  return planTerraces(world, proposal);
}

// ---------- authorization ----------
export interface StructureLimits {
  maxModules: number;
  maxCost: number;
}

export const DEFAULT_STRUCTURE_LIMITS: StructureLimits = {
  maxModules: 64,
  maxCost: 128,
};

export interface StructureAuthorization {
  id: string;
  authority: typeof LOCAL_AUTHORITY;
  enforcement: typeof LOCAL_ENFORCEMENT;
  planDigest: string;
  envelope: VoxelRegion[];
  baseRevision: number;
  limits: StructureLimits;
}

export interface StructureDecision {
  ok: boolean;
  authorization: StructureAuthorization | null;
  reasons: string[];
}

export class LocalStructureAuthorizer {
  readonly authority = LOCAL_AUTHORITY;
  readonly enforcement = LOCAL_ENFORCEMENT;
  readonly limits: StructureLimits;

  constructor(readonly policy: AuthorizationPolicy, limits: Partial<StructureLimits> = {}) {
    this.limits = { ...DEFAULT_STRUCTURE_LIMITS, ...limits };
  }

  authorize(world: World, plan: StructurePlan): StructureDecision {
    const reasons: string[] = [];
    if (plan.modules.length === 0) reasons.push('plan has no modules');
    if (plan.modules.length > this.limits.maxModules) {
      reasons.push(`${plan.modules.length} modules exceed limit ${this.limits.maxModules}`);
    }
    if (costTotal(plan.cost) > this.limits.maxCost) {
      reasons.push(`cost ${costTotal(plan.cost)} exceeds limit ${this.limits.maxCost}`);
    }
    for (const [resource, amount] of Object.entries(plan.cost)) {
      if (!Number.isInteger(amount) || (amount ?? 0) < 0) {
        reasons.push(`cost ${resource}=${amount} is not a non-negative integer`);
      }
    }
    if (plan.envelope.length === 0) reasons.push('plan has no work envelope');
    for (const region of plan.envelope) {
      if (!this.policy.envelope.some((p) => region.x0 >= p.x0 && region.x1 <= p.x1
        && region.z0 >= p.z0 && region.z1 <= p.z1
        && region.y0 >= p.y0 && region.y1 <= p.y1)) {
        reasons.push(`envelope ${region.x0},${region.z0},${region.y0}..${region.x1},${region.z1},${region.y1} is outside the local policy`);
      }
    }
    for (const m of plan.modules) {
      if (!moduleInsideEnvelope(m, plan.envelope)) {
        reasons.push(`module ${m.kind} at ${m.x},${m.y},${m.z} is outside the plan envelope`);
      }
    }
    if (plan.surface.length === 0) reasons.push('plan has no surface samples');
    for (const s of plan.surface) {
      if (!envelopeContains(plan.envelope, s.x, s.y, s.z)) {
        reasons.push(`surface ${s.x},${s.z},${s.y} is outside the plan envelope`);
      }
    }
    if (reasons.length > 0) return { ok: false, authorization: null, reasons };

    const token: StructureAuthorization = {
      id: `local-stub:structure:${structureDigest(plan)}`,
      authority: LOCAL_AUTHORITY,
      enforcement: LOCAL_ENFORCEMENT,
      planDigest: structureDigest(plan),
      envelope: plan.envelope.map((e) => ({ ...e })),
      baseRevision: world.revision,
      limits: { ...this.limits },
    };
    return { ok: true, authorization: token, reasons: [] };
  }
}

// ---------- execution ----------
export interface StructureLedger {
  authority: typeof LOCAL_AUTHORITY;
  enforcement: typeof LOCAL_ENFORCEMENT;
  authorizationId: string;
  planDigest: string;
  structureId: string;
  siteId: string;
  kind: StructureKind;
  moduleCount: number;
  costPaid: Partial<Record<ResourceType, number>>;
  inventoryBefore: Record<string, number>;
  inventoryAfter: Record<string, number>;
  revisionBefore: number;
  revisionAfter: number;
}

export interface StructureSuccess {
  ok: true;
  plan: StructurePlan;
  authorization: StructureAuthorization;
  ledger: StructureLedger;
}

export type StructureOutcome = StructureSuccess | StructureFailure;

export function executeStructure(
  world: World, plan: StructurePlan, authorization: StructureAuthorization,
): StructureOutcome {
  if (authorization.authority !== LOCAL_AUTHORITY
    || authorization.enforcement !== LOCAL_ENFORCEMENT) {
    return fail('execute', 'unsupported_authority', [
      `authority ${authorization.authority}/${authorization.enforcement} is not the local stub`,
    ]);
  }
  if (authorization.planDigest !== structureDigest(plan)) {
    return fail('execute', 'digest_mismatch', ['authorization does not match this structure plan']);
  }
  if (authorization.baseRevision !== world.revision) {
    return fail('execute', 'stale_authorization', [
      `authorization was issued at revision ${authorization.baseRevision}, world is at ${world.revision}`,
    ]);
  }
  if (plan.envelope.some((r) => !authorization.envelope.some((a) => r.x0 >= a.x0
    && r.x1 <= a.x1 && r.z0 >= a.z0 && r.z1 <= a.z1 && r.y0 >= a.y0 && r.y1 <= a.y1))) {
    return fail('execute', 'envelope_mismatch', ['plan envelope is wider than the authorization']);
  }

  const reasons: string[] = [];
  for (const m of plan.modules) {
    if (!moduleInsideEnvelope(m, authorization.envelope)) {
      reasons.push(`module ${m.kind} at ${m.x},${m.y},${m.z} is outside the authorized envelope`);
    }
  }
  const mismatches = surfaceMismatches(world, plan.surface);
  if (mismatches.length > 0) {
    reasons.push(...mismatches.slice(0, 4).map(
      (m) => `column ${m.x},${m.z} is at ${m.actual}, expected ${m.expected}`,
    ));
  }
  const obstructions = obstructionsIn(world, plan.rect);
  if (obstructions.length > 0) {
    reasons.push(`footprint has ${obstructions.length} obstructions`);
  }
  if (world.structures.has(plan.id)) {
    reasons.push(`structure ${plan.id} already exists`);
  }
  for (const [resource, amount] of Object.entries(plan.cost)) {
    const have = world.inventory[resource] ?? 0;
    if (have < (amount ?? 0)) {
      reasons.push(`need ${amount} ${resource}, have ${have}`);
    }
  }
  if (reasons.length > 0) return fail('execute', 'unauthorized_structure', reasons);

  const inventoryBefore = inventorySnapshot(world);
  const revisionBefore = world.revision;
  for (const [resource, amount] of Object.entries(plan.cost)) {
    const left = (world.inventory[resource] ?? 0) - (amount ?? 0);
    if (left > 0) world.inventory[resource] = left;
    else delete world.inventory[resource];
  }

  world.revision++;
  const structure: Structure = {
    id: plan.id,
    kind: plan.kind,
    siteId: plan.siteId,
    x: plan.origin.x,
    y: plan.origin.y,
    z: plan.origin.z,
    rot: plan.rot,
    modules: plan.modules.map((m) => ({ ...m })),
    cost: { ...plan.cost },
    builtRevision: world.revision,
    provisional: true,
  };
  world.structures.set(structure.id, structure);

  const ledger: StructureLedger = {
    authority: LOCAL_AUTHORITY,
    enforcement: LOCAL_ENFORCEMENT,
    authorizationId: authorization.id,
    planDigest: authorization.planDigest,
    structureId: structure.id,
    siteId: plan.siteId,
    kind: plan.kind,
    moduleCount: structure.modules.length,
    costPaid: { ...plan.cost },
    inventoryBefore,
    inventoryAfter: inventorySnapshot(world),
    revisionBefore,
    revisionAfter: world.revision,
  };
  return { ok: true, plan, authorization, ledger };
}

/**
 * The shared player/AI structure entry point. Terrain must already be prepared.
 */
export function buildStructure(
  world: World,
  authorizer: LocalStructureAuthorizer,
  proposal: StructureProposal,
): StructureOutcome {
  const planned = planStructure(world, proposal);
  if (!planned.ok) return planned;
  const decision = authorizer.authorize(world, planned.plan);
  if (!decision.ok || !decision.authorization) {
    return fail('authorize', 'not_authorized', decision.reasons);
  }
  return executeStructure(world, planned.plan, decision.authorization);
}
