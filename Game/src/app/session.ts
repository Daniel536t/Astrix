// The sole write boundary for the playable M002 slice. Accepted commands are
// durable input; rejected attempts, renderer work and terrain queries are not.
import {
  ResourceType, World, createWorld, generateWorld, harvestEntity, placeAuthoredSites,
  retireStoneEntities, isRetiredStoneKind, GENERATOR_VERSION, GENERATOR_V2,
} from '../sim/world';
import { M002_LAYOUT } from '../sim/m002';
import { LocalAuthorizer } from '../sim/preparation';
import { LocalStructureAuthorizer, FOUNDER_DESIGN_VERSION } from '../sim/structures';
import { M002_STARTER_INVENTORY } from '../sim/scenario';
import {
  WorldSnapshot, canonicalWorldHash, createWorldSnapshot,
  legacyStoneHash, migrateStoneSnapshot, restoreWorldSnapshotExact, validateWorldSnapshot, worldFromSnapshot,
} from '../sim/snapshot';
import { enableStoneReplay, finishStoneReplay } from '../sim/stone-compat';
import { M2ProjectId, buildProject, projectById } from './projects';
import {
  CROP_GROWTH_TICKS, CROP_YIELD, FOUNDER_STOCKPILE_ID, LIFE_RESOURCES, MAX_TICKS_PER_COMMAND, LifeResource, LifeResourceBag, RECIPES, RecipeId,
  advanceTicks, createLifeState, harvestCrop, plantCrop, startProduction, transfer,
} from '../sim/economy';
import {
  Actor, CROPS, CropKind, FIELD_MAX, FIELD_MIN, HOMESTEAD_ACTIONS, HomesteadAction, Policy, ROLES, Role, STEWARD_ACTIONS, StewardAction,
  assignRole, expandField, foundHomestead, homesteadAct, markField, permitted, propose, removeField, resolveProposal, seedReserve,
  setFieldCrop, setStewardPolicy, stepHomestead, FOUNDING_SUPPLIES,
} from '../sim/homestead';

export const JOURNAL_SCHEMA = 1 as const;
export const DESIGN_JOURNAL_SCHEMA = 2 as const;
export const CURRENT_JOURNAL_SCHEMA = 3 as const;
export const MAX_JOURNAL_ENTRIES = 100_000;
export type Command = LegacyBuildCommand | BuildCommand | HarvestCommand
  | TransferCommand | ProduceCommand | TickCommand | PlantCommand | HarvestCropCommand | HomesteadCommand;
/** M006 homestead commands (schema 3). `actor` attributes steward (AI agent) actions. */
export type HomesteadCommand = FoundHomesteadCommand | HomesteadActCommand | AssignRoleCommand
  | ExpandFieldCommand | StewardProposeCommand | ResolveProposalCommand | StewardPolicyCommand
  | MarkFieldCommand | SetCropCommand | RemoveFieldCommand;
/** The player lays out a field: where (metres, min corner), how big, and what to grow. */
export interface MarkFieldCommand extends CommandEnvelope { type: 'mark_field'; x: number; z: number; w: number; d: number; crop: CropKind }
export interface SetCropCommand extends CommandEnvelope { type: 'set_crop'; fieldId: string; crop: CropKind }
export interface RemoveFieldCommand extends CommandEnvelope { type: 'remove_field'; fieldId: string }
export interface FoundHomesteadCommand extends CommandEnvelope { type: 'found_homestead' }
export interface HomesteadActCommand extends CommandEnvelope { type: 'homestead_act'; action: HomesteadAction; target: string }
export interface AssignRoleCommand extends CommandEnvelope { type: 'assign_role'; villagerId: string; role: Role; actor: Actor }
export interface ExpandFieldCommand extends CommandEnvelope { type: 'expand_field'; actor: Actor }
export interface StewardProposeCommand extends CommandEnvelope {
  type: 'steward_propose'; action: StewardAction; reason: string; villagerId?: string; role?: Role;
}
export interface ResolveProposalCommand extends CommandEnvelope { type: 'resolve_proposal'; proposalId: string; approve: boolean }
export interface StewardPolicyCommand extends CommandEnvelope {
  type: 'steward_policy'; enabled: boolean; assign_role: Policy; expand_field: Policy;
}
interface CommandEnvelope {
  schema: typeof CURRENT_JOURNAL_SCHEMA;
  id: string;
  expectedRevision: number;
}
export interface TransferCommand extends CommandEnvelope {
  type: 'deposit' | 'withdraw';
  stockpileId: typeof FOUNDER_STOCKPILE_ID;
  resources: LifeResourceBag;
}
export interface ProduceCommand extends CommandEnvelope {
  type: 'produce'; stockpileId: typeof FOUNDER_STOCKPILE_ID; recipe: keyof typeof RECIPES;
}
export interface TickCommand extends CommandEnvelope { type: 'tick'; ticks: number; }
export interface PlantCommand extends CommandEnvelope { type: 'plant'; plotId: string; }
export interface HarvestCropCommand extends CommandEnvelope { type: 'harvest_crop'; plotId: string; }
export interface LegacyBuildCommand {
  schema: typeof JOURNAL_SCHEMA;
  id: string;
  type: 'build';
  projectId: M2ProjectId;
  expectedRevision: number;
}
export interface BuildCommand {
  schema: typeof DESIGN_JOURNAL_SCHEMA | typeof CURRENT_JOURNAL_SCHEMA;
  id: string;
  type: 'build';
  projectId: M2ProjectId;
  expectedRevision: number;
  designVersion: typeof FOUNDER_DESIGN_VERSION;
}
export interface HarvestCommand {
  schema: typeof JOURNAL_SCHEMA | typeof CURRENT_JOURNAL_SCHEMA;
  id: string;
  type: 'harvest';
  entityId: string;
  expectedRevision: number;
}

export type CommandOutcome = BuildOutcome | HarvestOutcome | TransferOutcome | ProduceOutcome | TickOutcome | PlantOutcome | CropOutcome
  | HomesteadOutcome;
export type HomesteadOutcome =
  | { type: 'found_homestead'; anchorX: number; anchorZ: number; supplies: Record<string, number> }
  | { type: 'homestead_act'; action: HomesteadAction; target: string; spent: Record<string, number>; gained: Record<string, number> }
  | { type: 'assign_role'; villagerId: string; role: Role; actor: Actor }
  | { type: 'expand_field'; plotId: string; wood: number; actor: Actor }
  | { type: 'steward_propose'; proposalId: string; action: StewardAction }
  | { type: 'resolve_proposal'; proposalId: string; approved: boolean; result: string }
  | { type: 'steward_policy'; enabled: boolean; assign_role: Policy; expand_field: Policy }
  | { type: 'mark_field'; fieldId: string; units: number; wood: number }
  | { type: 'set_crop'; fieldId: string; crop: CropKind }
  | { type: 'remove_field'; fieldId: string };
export interface TransferOutcome {
  type: 'deposit' | 'withdraw'; stockpileId: typeof FOUNDER_STOCKPILE_ID;
  resources: Partial<Record<LifeResource, number>>;
}
export interface ProduceOutcome {
  type: 'produce'; jobId: string; stockpileId: typeof FOUNDER_STOCKPILE_ID;
  recipe: keyof typeof RECIPES; remainingTicks: number;
}
export interface TickOutcome {
  type: 'tick'; fromTick: number; toTick: number;
  completedJobs: Array<{ id: string; recipe: keyof typeof RECIPES; output: Record<string, number> }>;
  readyCrops: string[];
}
export interface PlantOutcome {
  type: 'plant'; plotId: string; plantedTick: number; growthTicks: number;
}
export interface CropOutcome {
  type: 'harvest_crop'; plotId: string; resources: { food: number; fiber: number };
}
export interface BuildOutcome {
  type: 'build';
  structureId: string;
  costPaid: Partial<Record<ResourceType, number>>;
  resourcesGained: Partial<Record<ResourceType, number>>;
}
export interface HarvestOutcome {
  type: 'harvest';
  entityId: string;
  resource: ResourceType;
  amount: number;
}
export interface JournalEntry {
  command: Command;
  sequence: number;
  revision: number;
  hash: string;
  outcome: CommandOutcome;
}
export interface CommandJournal {
  schema: typeof JOURNAL_SCHEMA | typeof DESIGN_JOURNAL_SCHEMA | typeof CURRENT_JOURNAL_SCHEMA;
  seed: number;
  /**
   * Terrain generator of the world this journal replays on. Absent means v1:
   * every save written before generator v2 omits the field, so its canonical
   * bytes (and hashes) are unchanged.
   */
  generatorVersion?: typeof GENERATOR_V2;
  starterInventory: Record<string, number>;
  entries: JournalEntry[];
}
export interface CommandReceipt {
  ok: true;
  duplicate: boolean;
  id: string;
  sequence: number;
  revision: number;
  hash: string;
  outcome: CommandOutcome;
}
export interface CommandRejection {
  ok: false;
  duplicate: false;
  id: string;
  code: string;
  reasons: string[];
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function uint(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function id(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:%-]{0,127}$/.test(value);
}
function entityId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 128
    && (/^e:\d+,\d+:\d+$/.test(value)
      || /^hero:styl_[a-z_]+:-?\d+:-?\d+$/.test(value));
}
function sameFields(a: unknown, b: unknown): boolean {
  if (object(a) && object(b)) {
    const aKeys = Object.keys(a).sort(), bKeys = Object.keys(b).sort();
    return JSON.stringify(aKeys) === JSON.stringify(bKeys)
      && aKeys.every((key) => sameFields(a[key], b[key]));
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

const HOMESTEAD_TARGET = /^(?:field:\d{1,6}|well|coop|pen|sty|paddock|animal:\d{3,6})$/;
const FIELD_ID = /^field:\d{1,6}$/;
const coord = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= -1000 && v <= 1000;
const side = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= FIELD_MIN && v <= FIELD_MAX;
const cropOf = (v: unknown): v is CropKind => CROPS.includes(v as CropKind);
const VILLAGER_ID = /^villager:\d{1,3}$/;
const PROPOSAL_ID = /^proposal:\d{1,6}$/;
const POLICIES = ['auto', 'approve', 'off'];
const reasonText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 160 && /^[\x20-\x7e]+$/.test(v);
const actorOf = (v: unknown): v is Actor => v === 'player' || v === 'steward';

function validateHomesteadCommand(value: Record<string, unknown>, base: { schema: typeof CURRENT_JOURNAL_SCHEMA; id: string; expectedRevision: number }): Command | null {
  switch (value.type) {
    case 'found_homestead': return { ...base, type: 'found_homestead' };
    case 'homestead_act':
      if (!HOMESTEAD_ACTIONS.includes(value.action as HomesteadAction) || typeof value.target !== 'string' || !HOMESTEAD_TARGET.test(value.target)) return null;
      return { ...base, type: 'homestead_act', action: value.action as HomesteadAction, target: value.target };
    case 'assign_role':
      if (typeof value.villagerId !== 'string' || !VILLAGER_ID.test(value.villagerId) || !ROLES.includes(value.role as Role) || !actorOf(value.actor)) return null;
      return { ...base, type: 'assign_role', villagerId: value.villagerId, role: value.role as Role, actor: value.actor };
    case 'expand_field':
      if (!actorOf(value.actor)) return null;
      return { ...base, type: 'expand_field', actor: value.actor };
    case 'steward_propose':
      if (!STEWARD_ACTIONS.includes(value.action as StewardAction) || !reasonText(value.reason)
        || value.villagerId !== undefined && (typeof value.villagerId !== 'string' || !VILLAGER_ID.test(value.villagerId))
        || value.role !== undefined && !ROLES.includes(value.role as Role)) return null;
      return { ...base, type: 'steward_propose', action: value.action as StewardAction, reason: value.reason,
        ...(value.villagerId !== undefined ? { villagerId: value.villagerId as string } : {}),
        ...(value.role !== undefined ? { role: value.role as Role } : {}) };
    case 'resolve_proposal':
      if (typeof value.proposalId !== 'string' || !PROPOSAL_ID.test(value.proposalId) || typeof value.approve !== 'boolean') return null;
      return { ...base, type: 'resolve_proposal', proposalId: value.proposalId, approve: value.approve };
    case 'steward_policy':
      if (typeof value.enabled !== 'boolean' || !POLICIES.includes(String(value.assign_role)) || !POLICIES.includes(String(value.expand_field))) return null;
      return { ...base, type: 'steward_policy', enabled: value.enabled, assign_role: value.assign_role as Policy, expand_field: value.expand_field as Policy };
    case 'mark_field':
      if (!coord(value.x) || !coord(value.z) || !side(value.w) || !side(value.d) || !cropOf(value.crop)) return null;
      return { ...base, type: 'mark_field', x: value.x, z: value.z, w: value.w, d: value.d, crop: value.crop };
    case 'set_crop':
      if (typeof value.fieldId !== 'string' || !FIELD_ID.test(value.fieldId) || !cropOf(value.crop)) return null;
      return { ...base, type: 'set_crop', fieldId: value.fieldId, crop: value.crop };
    case 'remove_field':
      if (typeof value.fieldId !== 'string' || !FIELD_ID.test(value.fieldId)) return null;
      return { ...base, type: 'remove_field', fieldId: value.fieldId };
  }
  return null;
}

function validateHomesteadOutcome(value: Record<string, unknown>): CommandOutcome | null {
  const bag = (v: unknown) => v !== undefined && object(v) && Object.keys(v).length === 0 ? {} : inventory(v);
  switch (value.type) {
    case 'found_homestead':
      if (!Number.isSafeInteger(value.anchorX) || !Number.isSafeInteger(value.anchorZ)) return null;
      return { type: 'found_homestead', anchorX: value.anchorX as number, anchorZ: value.anchorZ as number, supplies: inventory(value.supplies) };
    case 'homestead_act':
      if (!HOMESTEAD_ACTIONS.includes(value.action as HomesteadAction) || typeof value.target !== 'string' || !HOMESTEAD_TARGET.test(value.target)) return null;
      return { type: 'homestead_act', action: value.action as HomesteadAction, target: value.target, spent: bag(value.spent), gained: bag(value.gained) };
    case 'assign_role':
      if (typeof value.villagerId !== 'string' || !VILLAGER_ID.test(value.villagerId) || !ROLES.includes(value.role as Role) || !actorOf(value.actor)) return null;
      return { type: 'assign_role', villagerId: value.villagerId, role: value.role as Role, actor: value.actor };
    case 'expand_field':
      if (typeof value.plotId !== 'string' || !FIELD_ID.test(value.plotId) || !uint(value.wood) || !actorOf(value.actor)) return null;
      return { type: 'expand_field', plotId: value.plotId, wood: value.wood, actor: value.actor };
    case 'steward_propose':
      if (typeof value.proposalId !== 'string' || !PROPOSAL_ID.test(value.proposalId) || !STEWARD_ACTIONS.includes(value.action as StewardAction)) return null;
      return { type: 'steward_propose', proposalId: value.proposalId, action: value.action as StewardAction };
    case 'resolve_proposal':
      if (typeof value.proposalId !== 'string' || !PROPOSAL_ID.test(value.proposalId) || typeof value.approved !== 'boolean' || !reasonText(value.result)) return null;
      return { type: 'resolve_proposal', proposalId: value.proposalId, approved: value.approved, result: value.result };
    case 'steward_policy':
      if (typeof value.enabled !== 'boolean' || !POLICIES.includes(String(value.assign_role)) || !POLICIES.includes(String(value.expand_field))) return null;
      return { type: 'steward_policy', enabled: value.enabled, assign_role: value.assign_role as Policy, expand_field: value.expand_field as Policy };
    case 'mark_field':
      if (typeof value.fieldId !== 'string' || !FIELD_ID.test(value.fieldId) || !uint(value.units) || !uint(value.wood)) return null;
      return { type: 'mark_field', fieldId: value.fieldId, units: value.units, wood: value.wood };
    case 'set_crop':
      if (typeof value.fieldId !== 'string' || !FIELD_ID.test(value.fieldId) || !cropOf(value.crop)) return null;
      return { type: 'set_crop', fieldId: value.fieldId, crop: value.crop };
    case 'remove_field':
      if (typeof value.fieldId !== 'string' || !FIELD_ID.test(value.fieldId)) return null;
      return { type: 'remove_field', fieldId: value.fieldId };
  }
  return null;
}

function inventory(value: unknown): Record<string, number> {
  if (!object(value)) throw new Error('invalid resource record');
  const result: Record<string, number> = {};
  for (const key of Object.keys(value).sort()) {
    if (!LIFE_RESOURCES.includes(key as LifeResource)
      || !uint(value[key]) || value[key] <= 0 || value[key] > 1_000_000_000) {
      throw new Error('invalid resource record');
    }
    result[key] = value[key];
  }
  return result;
}

/** Canonicalize and reject unknown, ambiguous or malformed command fields. */
export function validateCommand(value: unknown): Command {
  if (!object(value) || (value.schema !== JOURNAL_SCHEMA && value.schema !== DESIGN_JOURNAL_SCHEMA && value.schema !== CURRENT_JOURNAL_SCHEMA)
    || !id(value.id) || !uint(value.expectedRevision)) throw new Error('invalid command envelope');
  if (value.type === 'build' && ['house', 'path', 'farm'].includes(String(value.projectId))) {
    const command: Command = value.schema !== JOURNAL_SCHEMA ? {
      schema: value.schema, id: value.id, type: 'build',
      projectId: value.projectId as M2ProjectId, expectedRevision: value.expectedRevision,
      designVersion: value.designVersion as typeof FOUNDER_DESIGN_VERSION,
    } : {
      schema: JOURNAL_SCHEMA, id: value.id, type: 'build',
      projectId: value.projectId as M2ProjectId, expectedRevision: value.expectedRevision,
    };
    if (command.schema !== JOURNAL_SCHEMA && command.designVersion !== FOUNDER_DESIGN_VERSION) {
      throw new Error('unsupported structure design');
    }
    if (!sameFields(command, value)) throw new Error('non-canonical build command');
    return command;
  }
  if (value.type === 'harvest' && value.schema === JOURNAL_SCHEMA && entityId(value.entityId)) {
    const command: Command = {
      schema: value.schema, id: value.id, type: 'harvest',
      entityId: value.entityId, expectedRevision: value.expectedRevision,
    };
    if (!sameFields(command, value)) throw new Error('non-canonical harvest command');
    return command;
  }
  if (value.schema === CURRENT_JOURNAL_SCHEMA) {
    const base = { schema: value.schema, id: value.id, expectedRevision: value.expectedRevision };
    let command: Command | null = null;
    if (value.type === 'harvest' && entityId(value.entityId)) {
      command = { schema: value.schema, id: value.id, type: value.type,
        entityId: value.entityId, expectedRevision: value.expectedRevision };
    } else if ((value.type === 'deposit' || value.type === 'withdraw') && value.stockpileId === FOUNDER_STOCKPILE_ID) {
      command = { ...base, type: value.type, stockpileId: value.stockpileId, resources: inventory(value.resources) };
    } else if (value.type === 'produce' && value.stockpileId === FOUNDER_STOCKPILE_ID
      && (value.recipe === 'seed' || value.recipe === 'rations')) {
      command = { ...base, type: value.type, stockpileId: value.stockpileId, recipe: value.recipe };
    } else if (value.type === 'tick' && uint(value.ticks) && value.ticks > 0 && value.ticks <= MAX_TICKS_PER_COMMAND) {
      command = { ...base, type: value.type, ticks: value.ticks };
    } else if (value.type === 'plant' && typeof value.plotId === 'string' && /^crop:[0-8]$/.test(value.plotId)) {
      command = { ...base, type: value.type, plotId: value.plotId };
    } else if (value.type === 'harvest_crop' && typeof value.plotId === 'string' && /^crop:[0-8]$/.test(value.plotId)) {
      command = { ...base, type: value.type, plotId: value.plotId };
    } else {
      command = validateHomesteadCommand(value, base as { schema: typeof CURRENT_JOURNAL_SCHEMA; id: string; expectedRevision: number });
    }
    if (command) {
      if (!sameFields(command, value)) throw new Error('non-canonical life-loop command');
      return command;
    }
  }
  throw new Error('unsupported command');
}

function validateOutcome(value: unknown): CommandOutcome {
  if (!object(value)) throw new Error('invalid command outcome');
  if (value.type === 'build' && id(value.structureId)) {
    const outcome: CommandOutcome = {
      type: 'build', structureId: value.structureId,
      costPaid: inventory(value.costPaid), resourcesGained: inventory(value.resourcesGained),
    };
    if (JSON.stringify(outcome) !== JSON.stringify(value)) throw new Error('non-canonical build outcome');
    return outcome;
  }
  if (value.type === 'harvest' && entityId(value.entityId)
    && ['wood', 'stone', 'ore', 'fiber'].includes(String(value.resource))
    && uint(value.amount) && value.amount > 0 && value.amount <= 1_000_000) {
    const outcome: CommandOutcome = {
      type: 'harvest', entityId: value.entityId,
      resource: value.resource as ResourceType, amount: value.amount,
    };
    if (JSON.stringify(outcome) !== JSON.stringify(value)) throw new Error('non-canonical harvest outcome');
    return outcome;
  }
  let outcome: CommandOutcome | null = null;
  if ((value.type === 'deposit' || value.type === 'withdraw') && value.stockpileId === FOUNDER_STOCKPILE_ID) {
    outcome = { type: value.type, stockpileId: value.stockpileId, resources: inventory(value.resources) };
  } else if (value.type === 'produce' && id(value.jobId) && value.stockpileId === FOUNDER_STOCKPILE_ID
    && (value.recipe === 'seed' || value.recipe === 'rations') && uint(value.remainingTicks) && value.remainingTicks > 0) {
    outcome = { type: value.type, jobId: value.jobId, stockpileId: value.stockpileId,
      recipe: value.recipe, remainingTicks: value.remainingTicks };
  } else if (value.type === 'plant' && typeof value.plotId === 'string' && /^crop:[0-8]$/.test(value.plotId)
    && uint(value.plantedTick) && value.growthTicks === CROP_GROWTH_TICKS) {
    outcome = { type: value.type, plotId: value.plotId, plantedTick: value.plantedTick, growthTicks: value.growthTicks };
  } else if (value.type === 'harvest_crop' && typeof value.plotId === 'string' && /^crop:[0-8]$/.test(value.plotId)
    && isResources(value.resources) && value.resources.food === CROP_YIELD.food && value.resources.fiber === CROP_YIELD.fiber) {
    outcome = { type: value.type, plotId: value.plotId,
      resources: { food: CROP_YIELD.food, fiber: CROP_YIELD.fiber } };
  } else if (value.type === 'tick' && uint(value.fromTick) && uint(value.toTick)
    && value.toTick > value.fromTick && value.toTick - value.fromTick <= MAX_TICKS_PER_COMMAND
    && Array.isArray(value.completedJobs) && Array.isArray(value.readyCrops)) {
    const completedJobs: Array<{ id: string; recipe: RecipeId; output: Record<string, number> }> = value.completedJobs.map((raw: unknown) => {
      if (!object(raw) || !id(raw.id) || (raw.recipe !== 'seed' && raw.recipe !== 'rations')) throw new Error('invalid completed job');
      return { id: raw.id, recipe: raw.recipe, output: inventory(raw.output) };
    });
    if (!value.readyCrops.every((plot) => typeof plot === 'string' && /^crop:[0-8]$/.test(plot))) throw new Error('invalid ready crops');
    outcome = { type: value.type, fromTick: value.fromTick, toTick: value.toTick,
      completedJobs, readyCrops: [...value.readyCrops] };
  } else {
    outcome = validateHomesteadOutcome(value);
  }
  if (outcome) {
    if (JSON.stringify(outcome) !== JSON.stringify(value)) throw new Error('non-canonical life-loop outcome');
    return outcome;
  }
  throw new Error('invalid command outcome');
}

function isResources(value: unknown): value is Record<string, number> {
  return object(value) && Object.values(value).every((amount) => uint(amount));
}

export function createJournal(
  seed = 1337, schema: CommandJournal['schema'] = CURRENT_JOURNAL_SCHEMA, generatorVersion = GENERATOR_VERSION,
): CommandJournal {
  if (generatorVersion !== GENERATOR_VERSION && schema !== CURRENT_JOURNAL_SCHEMA) {
    throw new Error('legacy journal schemas only exist for generator v1');
  }
  return {
    schema, seed,
    ...(generatorVersion === GENERATOR_V2 ? { generatorVersion: GENERATOR_V2 } : {}),
    starterInventory: inventory(M002_STARTER_INVENTORY), entries: [],
  };
}

/** Generator version a journal replays on (absent field = v1). */
export function journalGenerator(journal: Pick<CommandJournal, 'generatorVersion'>): number {
  return journal.generatorVersion ?? GENERATOR_VERSION;
}

/** Validate an entire journal without changing a live session. */
export function validateJournal(value: unknown): CommandJournal {
  if (!object(value) || (value.schema !== JOURNAL_SCHEMA && value.schema !== DESIGN_JOURNAL_SCHEMA && value.schema !== CURRENT_JOURNAL_SCHEMA)
    || !uint(value.seed) || value.seed > 0xffffffff
    || !Array.isArray(value.entries) || value.entries.length > MAX_JOURNAL_ENTRIES
    || 'generatorVersion' in value && (value.generatorVersion !== GENERATOR_V2 || value.schema !== CURRENT_JOURNAL_SCHEMA)) {
    throw new Error('invalid command journal');
  }
  const journal: CommandJournal = {
    schema: value.schema, seed: value.seed,
    ...('generatorVersion' in value ? { generatorVersion: GENERATOR_V2 } : {}),
    starterInventory: inventory(value.starterInventory), entries: [],
  };
  const ids = new Set<string>();
  for (let i = 0; i < value.entries.length; i++) {
    const raw = value.entries[i];
    if (!object(raw) || raw.sequence !== i || !uint(raw.revision)
      || typeof raw.hash !== 'string' || !/^[0-9a-f]{16}$/.test(raw.hash)) throw new Error('non-contiguous or invalid journal entry');
    const entry: JournalEntry = {
      command: validateCommand(raw.command), sequence: i,
      revision: raw.revision, hash: raw.hash, outcome: validateOutcome(raw.outcome),
    };
    if ((entry.command.type === 'build' || entry.command.type === 'harvest')
      && entry.command.schema !== value.schema) {
      throw new Error('journal schema and build command schema differ');
    }
    if (JSON.stringify(entry) !== JSON.stringify(raw)) throw new Error('non-canonical journal entry');
    if (ids.has(entry.command.id)) throw new Error('duplicate journal command id');
    if (entry.command.type !== entry.outcome.type
      || entry.command.type === 'harvest' && entry.outcome.type === 'harvest'
      && entry.command.entityId !== entry.outcome.entityId
      || (entry.command.type === 'plant' || entry.command.type === 'harvest_crop')
      && entry.command.type === entry.outcome.type && entry.command.plotId !== entry.outcome.plotId
      || (entry.command.type === 'deposit' || entry.command.type === 'withdraw')
      && entry.command.type === entry.outcome.type
      && (entry.command.stockpileId !== entry.outcome.stockpileId
        || JSON.stringify(entry.command.resources) !== JSON.stringify(entry.outcome.resources))
      || entry.command.type === 'produce' && entry.outcome.type === 'produce'
      && (entry.command.stockpileId !== entry.outcome.stockpileId || entry.command.recipe !== entry.outcome.recipe)
      || entry.command.type === 'tick' && entry.outcome.type === 'tick'
      && entry.outcome.toTick - entry.outcome.fromTick !== entry.command.ticks
      || entry.command.type === 'homestead_act' && entry.outcome.type === 'homestead_act'
      && (entry.command.action !== entry.outcome.action || entry.command.target !== entry.outcome.target)
      || entry.command.type === 'assign_role' && entry.outcome.type === 'assign_role'
      && (entry.command.villagerId !== entry.outcome.villagerId || entry.command.role !== entry.outcome.role || entry.command.actor !== entry.outcome.actor)
      || entry.command.type === 'expand_field' && entry.outcome.type === 'expand_field' && entry.command.actor !== entry.outcome.actor
      || entry.command.type === 'steward_propose' && entry.outcome.type === 'steward_propose' && entry.command.action !== entry.outcome.action
      || entry.command.type === 'resolve_proposal' && entry.outcome.type === 'resolve_proposal'
      && (entry.command.proposalId !== entry.outcome.proposalId || entry.command.approve !== entry.outcome.approved)
      || (entry.command.type === 'set_crop' || entry.command.type === 'remove_field')
      && (entry.outcome.type === 'set_crop' || entry.outcome.type === 'remove_field') && entry.command.fieldId !== entry.outcome.fieldId
      || entry.command.type === 'set_crop' && entry.outcome.type === 'set_crop' && entry.command.crop !== entry.outcome.crop
      || entry.command.type === 'steward_policy' && entry.outcome.type === 'steward_policy'
      && (entry.command.enabled !== entry.outcome.enabled || entry.command.assign_role !== entry.outcome.assign_role
        || entry.command.expand_field !== entry.outcome.expand_field)) {
      throw new Error('journal command and outcome disagree');
    }
    ids.add(entry.command.id);
    journal.entries.push(entry);
  }
  if (JSON.stringify(journal) !== JSON.stringify(value)) throw new Error('non-canonical command journal');
  // This slice has one deterministic genesis configuration. A changed starter
  // grant must not pass unnoticed when replay begins from a later snapshot.
  if (JSON.stringify(journal.starterInventory) !== JSON.stringify(createJournal(value.seed, value.schema, journalGenerator(journal)).starterInventory)) {
    throw new Error('journal starter inventory is incompatible with this version');
  }
  return journal;
}

function referencesRetiredStone(entry: JournalEntry): boolean {
  return /^hero:styl_rock_(?:small|medium|large):/.test(
    entry.command.type === 'harvest' ? entry.command.entityId : entry.outcome.type === 'harvest' ? entry.outcome.entityId : '',
  );
}

export class GameSession {
  readonly journal: CommandJournal;
  private readonly prepAuthorizer: LocalAuthorizer;
  private readonly structureAuthorizer: LocalStructureAuthorizer;
  private readonly ids = new Map<string, JournalEntry>();

  private constructor(readonly world: World, journal: CommandJournal) {
    this.journal = journal;
    for (const entry of journal.entries) this.ids.set(entry.command.id, entry);
    this.prepAuthorizer = new LocalAuthorizer({ envelope: M002_LAYOUT.envelope });
    this.structureAuthorizer = new LocalStructureAuthorizer({ envelope: M002_LAYOUT.envelope });
  }

  /** A new current-schema world. `generatorVersion` defaults to v1 for API compatibility. */
  static genesis(seed = 1337, generatorVersion = GENERATOR_VERSION): GameSession {
    return new GameSession(
      genesisWorld(seed, inventory(M002_STARTER_INVENTORY), CURRENT_JOURNAL_SCHEMA, generatorVersion),
      createJournal(seed, CURRENT_JOURNAL_SCHEMA, generatorVersion),
    );
  }

  /** Compatibility entry point for recorded M002 fixtures and saved worlds. */
  static legacyGenesis(seed = 1337, schema: typeof JOURNAL_SCHEMA | typeof DESIGN_JOURNAL_SCHEMA = JOURNAL_SCHEMA): GameSession {
    return new GameSession(genesisWorld(seed, inventory(M002_STARTER_INVENTORY), schema), createJournal(seed, schema));
  }

  /** Replay accepted commands in their authoritative order from an empty world.
   * A normal replay is attempted first: stone from retained cairns and building
   * preparation must not force historical mode. Raw old journals enter private
   * reconstruction only when their original stone obstructions required it. */
  static replay(input: unknown): GameSession {
    const journal = validateJournal(input);
    try {
      return GameSession.replayCurrent(journal);
    } catch (currentError) {
      if (!journal.entries.some(containsRetiredStone)) throw currentError;
      try {
        return GameSession.reconstructHistorical(journal).session;
      } catch (historicalError) {
        // An already-migrated journal has rewritten hashes; verify its retained
        // stone commands normally instead of accepting the failed old replay.
        try {
          return GameSession.replayCurrent(journal);
        } catch {
          throw historicalError;
        }
      }
    }
  }

  /** Restore a validated snapshot, then replay only its accepted-command tail. */
  static restore(snapshotInput: WorldSnapshot, journalInput: unknown): GameSession {
    const journal = validateJournal(journalInput);
    const snapshot = validateWorldSnapshot(snapshotInput);
    if (snapshot.schema !== journal.schema) throw new Error('snapshot and journal schemas differ');
    const next = snapshot.nextSequence;
    if (next > journal.entries.length) throw new Error('snapshot is ahead of the journal');
    // Current saves (including every migrated boundary) keep their exact hash.
    // Try them before reconstructing a compatible old journal. Deposit-only
    // migrated saves no longer carry an explicit stone command to classify them.
    if (!snapshot.entities.some((entity) => isRetiredStoneKind(entity.kind))) {
      try { return GameSession.restoreCurrent(snapshot, journal, next); } catch { /* authenticated migration below */ }
    }
    if (next > 0 || snapshot.entities.some((entity) => isRetiredStoneKind(entity.kind))) {
      // A boundary authenticated during migration is compared with the migrated
      // state; a raw old boundary is compared with the original historical one.
      // Both paths authenticate the complete original accepted journal first.
      const historical = journal.entries.some(referencesRetiredStone)
        || snapshot.entities.some((entity) => isRetiredStoneKind(entity.kind));
      // A migrated save no longer contains retired entities. Its rewritten
      // boundary hashes describe the filtered state, so ordinary restoration
      // must succeed before trying to interpret it as raw old-save bytes.
      // A referenced authored stone alone does *not* imply a raw old boundary:
      // legitimate saves can contain untouched natural retired deposits only.
      if (!snapshot.entities.some((entity) => isRetiredStoneKind(entity.kind))) {
        try { return GameSession.restoreCurrent(snapshot, journal, next); } catch { /* try original reconstruction */ }
      }
      if (historical) {
        const reconstructed = GameSession.reconstructHistorical(journal);
        const expected = reconstructed.snapshots.get(next);
        const migrated = expected ? migrateStoneSnapshot(expected) : undefined;
        if (migrated && legacyStoneHash(snapshot) === legacyStoneHash(migrated))
          return reconstructed.session;
        if (snapshot.entities.some((entity) => isRetiredStoneKind(entity.kind))
          && expected && legacyStoneHash(snapshot) === legacyStoneHash(expected))
          return reconstructed.session;
        if (snapshot.entities.some((entity) => isRetiredStoneKind(entity.kind))) {
          throw new Error('historical snapshot does not match its original journal boundary');
        }
      }
    }
    if (next > 0) return GameSession.restoreCurrent(snapshot, journal, next);
    const historical = journal.entries.some(containsRetiredStone);
    if (historical) {
      try { return GameSession.restoreCurrent(snapshot, journal, next); } catch { /* raw or migrated genesis */ }
      const reconstructed = GameSession.reconstructHistorical(journal);
      const rawGenesis = reconstructed.snapshots.get(0)!;
      if (legacyStoneHash(snapshot) === legacyStoneHash(rawGenesis)) return reconstructed.session;
    }
    return GameSession.restoreCurrent(snapshot, journal, next);
  }

  /** Replay already-authenticated current-state commands. */
  private static replayCurrent(journal: CommandJournal): GameSession {
    const session = new GameSession(
      genesisWorld(journal.seed, journal.starterInventory, journal.schema, journalGenerator(journal)),
      createJournal(journal.seed, journal.schema, journalGenerator(journal)),
    );
    for (const entry of journal.entries) session.replayEntry(entry);
    return session;
  }

  private static restoreCurrent(snapshot: WorldSnapshot, journal: CommandJournal, next: number): GameSession {
    const world = worldFromSnapshot(snapshot);
    if (world.seed !== journal.seed) throw new Error('snapshot and journal seeds differ');
    if (world.params.generatorVersion !== journalGenerator(journal)) {
      throw new Error('snapshot and journal terrain generators differ');
    }
    const genesis = genesisWorld(journal.seed, journal.starterInventory, journal.schema, journalGenerator(journal));
    if (next === 0 && legacyStoneHash(snapshot) !== canonicalWorldHash(genesis, 0, journal.schema)) {
      throw new Error('genesis snapshot does not match journal configuration');
    }
    if (next > 0 && legacyStoneHash(snapshot) !== journal.entries[next - 1].hash) {
      throw new Error('snapshot hash does not match its journal boundary');
    }
    const session = GameSession.fromValidatedBoundary(world, {
      schema: journal.schema, seed: journal.seed,
      ...(journal.generatorVersion ? { generatorVersion: journal.generatorVersion } : {}),
      starterInventory: { ...journal.starterInventory }, entries: journal.entries.slice(0, next),
    });
    for (const entry of journal.entries.slice(next)) session.replayEntry(entry);
    return session;
  }

  /** @internal Assemble an authenticated save boundary; gameplay uses dispatch. */
  private static fromValidatedBoundary(world: World, journal: CommandJournal): GameSession {
    return new GameSession(world, journal);
  }

  /** @internal Source for deterministic old-save fixtures; not a live session. */
  static historicalJournal(world: World): GameSession {
    return new GameSession(world, createJournal(world.seed, world.life ? CURRENT_JOURNAL_SCHEMA
      : world.structures.size > 0 ? DESIGN_JOURNAL_SCHEMA : JOURNAL_SCHEMA));
  }

  /** @internal Source for deterministic old-save fixtures; not a live session. */
  static historicalGenesisWorld(seed = 1337, schema: CommandJournal['schema'] = JOURNAL_SCHEMA): World {
    return historicalGenesisWorld(seed, inventory(M002_STARTER_INVENTORY), schema);
  }

  private static reconstructHistorical(journal: CommandJournal): {
    session: GameSession; snapshots: Map<number, WorldSnapshot>;
  } {
    const expectedGenesis = historicalGenesisWorld(journal.seed, journal.starterInventory, journal.schema);
    const snapshots = new Map<number, WorldSnapshot>();
    snapshots.set(0, createWorldSnapshot(expectedGenesis, 0, journal.schema));
    const replay = new GameSession(expectedGenesis, createJournal(journal.seed, journal.schema));
    const migratedJournal = createJournal(journal.seed, journal.schema);
    for (const entry of journal.entries) {
      replay.replayEntry(entry);
      const snapshot = createWorldSnapshot(replay.world, replay.nextSequence, journal.schema);
      snapshots.set(replay.nextSequence, snapshot);
      // Keep the rewritten authenticated boundary in the returned journal. A
      // replay-only journal rebuild would silently put the raw hash back.
      entry.hash = legacyStoneHash(migrateStoneSnapshot(snapshot));
      migratedJournal.entries.push(entry);
    }
    const session = GameSession.fromValidatedBoundary(replay.world, migratedJournal);
    return { session: session.migrateRetiredStones(), snapshots };
  }

  private snapshotSchema(): WorldSnapshot['schema'] { return this.journal.schema; }

  get nextSequence(): number { return this.journal.entries.length; }
  get snapshot(): WorldSnapshot {
    return createWorldSnapshot(this.world, this.nextSequence, this.snapshotSchema());
  }
  get stateHash(): string {
    return canonicalWorldHash(this.world, this.nextSequence, this.snapshotSchema());
  }

  commandId(kind: Command['type'], target: string): string {
    // Entity IDs contain chunk coordinates; encode commas and other separators
    // so generated commands satisfy the same envelope validation as input.
    return `${kind}:${this.nextSequence}:${encodeURIComponent(target)}`;
  }

  entry(sequence: number): JournalEntry | undefined { return this.journal.entries[sequence]; }

  dispatch(input: unknown): CommandReceipt | CommandRejection {
    let command: Command;
    try { command = validateCommand(input); } catch (error) {
      return this.reject(object(input) && typeof input.id === 'string' ? input.id : '',
        'invalid_command', [(error as Error).message]);
    }
    if ((command.type === 'build' || command.type === 'harvest')
      && command.schema !== this.journal.schema
      || command.type !== 'build' && command.type !== 'harvest'
        && this.journal.schema !== CURRENT_JOURNAL_SCHEMA) {
      return this.reject(command.id, 'schema_mismatch', ['command schema does not match this world journal']);
    }
    const prior = this.ids.get(command.id);
    if (prior) {
      if (!sameFields(prior.command, command)) {
        return this.reject(command.id, 'duplicate_command_id', ['command id already has different accepted input']);
      }
      return this.receipt(prior, true);
    }
    if (command.expectedRevision !== this.world.revision) {
      return this.reject(command.id, 'stale_revision', [
        `command expects revision ${command.expectedRevision}; world is at ${this.world.revision}`,
      ]);
    }
    const before = this.stateHash;
    let outcome: CommandOutcome;
    if (command.type === 'build') {
      const result = buildProject(this.world, this.prepAuthorizer, this.structureAuthorizer,
        projectById(command.projectId),
        'designVersion' in command ? command.designVersion : undefined);
      if (!result.ok) {
        if (this.stateHash !== before) throw new Error('rejected build changed authoritative state');
        return this.reject(command.id, result.code, result.reasons);
      }
      outcome = {
        type: 'build', structureId: result.record.id,
        costPaid: inventory(result.structure.costPaid),
        resourcesGained: inventory(result.preparation.resourcesGained),
      };
    } else if (command.type === 'harvest') {
      const result = harvestEntity(this.world, command.entityId);
      if (!result) return this.reject(command.id, 'not_harvestable', ['entity is absent, depleted or has no resource']);
      outcome = {
        type: 'harvest', entityId: result.entity.id,
        resource: result.resource, amount: result.amount,
      };
    } else if (command.type === 'deposit' || command.type === 'withdraw') {
      // Seed set aside for the homestead's own plots cannot be withdrawn.
      const h = this.world.homestead;
      const wantSeed = command.type === 'withdraw' ? command.resources.seed ?? 0 : 0;
      if (h && wantSeed > 0) {
        const have = this.world.life?.stockpiles.get(FOUNDER_STOCKPILE_ID)?.inventory.seed ?? 0;
        const reserve = seedReserve(h);
        if (have - wantSeed < reserve) {
          return this.reject(command.id, 'reserved', [`${reserve} seed is reserved for replanting; ${Math.max(0, have - reserve)} available`]);
        }
      }
      const result = transfer(this.world, command.type, command.resources);
      if (!result.ok) {
        if (this.stateHash !== before) throw new Error('rejected transfer changed authoritative state');
        return this.reject(command.id, result.code, result.reasons);
      }
      outcome = { type: command.type, stockpileId: FOUNDER_STOCKPILE_ID, resources: result.value };
    } else if (command.type === 'produce') {
      const result = startProduction(this.world, command.recipe, command.id);
      if (!result.ok) return this.reject(command.id, result.code, result.reasons);
      outcome = { type: 'produce', jobId: result.value.id, stockpileId: result.value.stockpileId,
        recipe: result.value.recipe, remainingTicks: result.value.remainingTicks };
    } else if (command.type === 'tick') {
      const world = this.world;
      const result = advanceTicks(world, command.ticks, (tick) => { stepHomestead(world, tick); });
      if (!result.ok) return this.reject(command.id, result.code, result.reasons);
      outcome = { type: 'tick', ...result.value };
    } else if (command.type === 'plant') {
      const result = plantCrop(this.world, command.plotId);
      if (!result.ok) return this.reject(command.id, result.code, result.reasons);
      outcome = { type: 'plant', plotId: command.plotId,
        plantedTick: result.value.plantedTick, growthTicks: result.value.growthTicks };
    } else if (command.type === 'harvest_crop') {
      const result = harvestCrop(this.world, command.plotId);
      if (!result.ok) return this.reject(command.id, result.code, result.reasons);
      outcome = { type: 'harvest_crop', plotId: command.plotId, resources: result.value };
    } else {
      const result = this.dispatchHomestead(command);
      if (!result.ok) {
        if (this.stateHash !== before) throw new Error('rejected homestead command changed authoritative state');
        return this.reject(command.id, result.code, result.reasons);
      }
      outcome = result.value;
    }
    const entry: JournalEntry = {
      command, sequence: this.nextSequence, revision: this.world.revision,
      // The sequence is part of the state hash at this accepted boundary.
      hash: canonicalWorldHash(this.world, this.nextSequence + 1, this.snapshotSchema()), outcome,
    };
    this.journal.entries.push(entry);
    this.ids.set(command.id, entry);
    return this.receipt(entry, false);
  }

  private dispatchHomestead(command: Command): { ok: true; value: CommandOutcome } | { ok: false; code: string; reasons: string[] } {
    const world = this.world;
    switch (command.type) {
      case 'found_homestead': {
        const r = foundHomestead(world);
        return r.ok ? { ok: true, value: { type: 'found_homestead', anchorX: r.value.anchor.x, anchorZ: r.value.anchor.z,
          supplies: inventory({ ...FOUNDING_SUPPLIES }) } } : r;
      }
      case 'homestead_act': {
        const r = homesteadAct(world, command.action, command.target);
        return r.ok ? { ok: true, value: { type: 'homestead_act', action: r.value.action, target: r.value.target,
          spent: sortedBag(r.value.spent), gained: sortedBag(r.value.gained) } } : r;
      }
      case 'assign_role': {
        const h = world.homestead;
        if (h) { const gate = permitted(h, command.actor, 'assign_role'); if (!gate.ok) return gate; }
        const r = assignRole(world, command.villagerId, command.role);
        return r.ok ? { ok: true, value: { type: 'assign_role', villagerId: command.villagerId, role: command.role, actor: command.actor } } : r;
      }
      case 'expand_field': {
        const h = world.homestead;
        if (h) { const gate = permitted(h, command.actor, 'expand_field'); if (!gate.ok) return gate; }
        const r = expandField(world);
        return r.ok ? { ok: true, value: { type: 'expand_field', plotId: r.value.plotId, wood: r.value.wood, actor: command.actor } } : r;
      }
      case 'steward_propose': {
        const r = propose(world, command.action, command.reason, command.villagerId, command.role);
        return r.ok ? { ok: true, value: { type: 'steward_propose', proposalId: r.value.id, action: r.value.action } } : r;
      }
      case 'resolve_proposal': {
        const r = resolveProposal(world, command.proposalId, command.approve);
        return r.ok ? { ok: true, value: { type: 'resolve_proposal', proposalId: command.proposalId, approved: r.value.approved, result: r.value.result } } : r;
      }
      case 'mark_field': {
        const r = markField(world, { x: command.x, z: command.z, w: command.w, d: command.d, crop: command.crop }, 'bag');
        return r.ok ? { ok: true, value: { type: 'mark_field', fieldId: r.value.fieldId, units: r.value.units, wood: r.value.wood } } : r;
      }
      case 'set_crop': {
        const r = setFieldCrop(world, command.fieldId, command.crop);
        return r.ok ? { ok: true, value: { type: 'set_crop', fieldId: command.fieldId, crop: command.crop } } : r;
      }
      case 'remove_field': {
        const r = removeField(world, command.fieldId);
        return r.ok ? { ok: true, value: { type: 'remove_field', fieldId: command.fieldId } } : r;
      }
      case 'steward_policy': {
        const r = setStewardPolicy(world, command.enabled, { assign_role: command.assign_role, expand_field: command.expand_field });
        return r.ok ? { ok: true, value: { type: 'steward_policy', enabled: command.enabled, assign_role: command.assign_role, expand_field: command.expand_field } } : r;
      }
    }
    throw new Error('unhandled command type');
  }

  private replayEntry(entry: JournalEntry): void {
    if (entry.sequence !== this.nextSequence) throw new Error('journal sequence gap');
    const receipt = this.dispatch(entry.command);
    if (!receipt.ok || receipt.duplicate || receipt.hash !== entry.hash
      || receipt.revision !== entry.revision
      || JSON.stringify(receipt.outcome) !== JSON.stringify(entry.outcome)) {
      throw new Error(`journal replay diverged at sequence ${entry.sequence}`);
    }
  }

  /** Historical entries have passed their original outcome/hash checks. Their
   * accepted commands and stone yields remain; only entity existence and the
   * resulting canonical boundary hashes change. */
  private migrateRetiredStones(): GameSession {
    retireStoneEntities(this.world);
    finishStoneReplay(this.world);
    const migrated = createWorldSnapshot(this.world, this.nextSequence, this.snapshotSchema());
    restoreWorldSnapshotExact(this.world, migrated);
    return this;
  }

  private receipt(entry: JournalEntry, duplicate: boolean): CommandReceipt {
    return {
      ok: true, duplicate, id: entry.command.id, sequence: entry.sequence,
      revision: entry.revision, hash: entry.hash, outcome: entry.outcome,
    };
  }

  private reject(id: string, code: string, reasons: string[]): CommandRejection {
    return { ok: false, duplicate: false, id, code, reasons };
  }
}

export function genesisWorld(seed: number, starter = inventory(M002_STARTER_INVENTORY),
  schema: CommandJournal['schema'] = CURRENT_JOURNAL_SCHEMA, generatorVersion = GENERATOR_VERSION): World {
  const world = generateWorld(seed, 0, generatorVersion);
  world.inventory = { ...starter };
  if (schema === CURRENT_JOURNAL_SCHEMA) world.life = createLifeState();
  return world;
}

function historicalGenesisWorld(seed: number, starter: Record<string, number>,
  schema: CommandJournal['schema']): World {
  const world = createWorld(seed);
  enableStoneReplay(world);
  placeAuthoredSites(world);
  world.inventory = { ...starter };
  if (schema === CURRENT_JOURNAL_SCHEMA) world.life = createLifeState();
  return world;
}

function sortedBag(bag: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(bag).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
}

function containsRetiredStone(entry: JournalEntry): boolean {
  if (entry.command.type === 'harvest') {
    return entry.outcome.type === 'harvest'
      && (entry.outcome.resource === 'stone'
        || /^hero:styl_rock_(?:small|medium|large):/.test(entry.command.entityId));
  }
  return entry.outcome.type === 'build' && (entry.outcome.resourcesGained.stone ?? 0) > 0;
}
