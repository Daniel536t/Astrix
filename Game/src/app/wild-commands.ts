// W2: the journaled wilderness commands (pickup, drop, craft, equip, eat and
// the content upgrade of a W1 world), their strict validation and dispatch.
// Coarse by design: one command per pickup, craft or meal, never per step.
//
// Reach: the avatar is player-local physics, so `pickup` and `drop` carry the
// player's position (integer decimetres) like the S2 tick presence, and the
// simulation checks reach from it. The position is reported, not proven; the
// same trust as the existing `harvest` command, whose reach is checked by the
// client only.
import {
  WILD_CONTENT_V2, WILD_ITEMS, WildItem, TOOL_KINDS, ToolKind, PICKUP_ID, PILE_ID, TOOL_ID,
  createWildState, craft, dropItems, eat, equip, pickUp, recipeById, WILD_RECIPES,
} from '../sim/gathering';
import { PRESENCE_POS } from '../sim/bodies';
import type { World } from '../sim/world';

interface Envelope { schema: 3; id: string; expectedRevision: number }
export interface At { x: number; z: number }
export interface PickupCommand extends Envelope { type: 'pickup'; entityId: string; at: At }
export interface DropCommand extends Envelope { type: 'drop'; item: WildItem; n: number; at: At }
export interface CraftCommand extends Envelope { type: 'craft'; recipe: string }
export interface EquipCommand extends Envelope { type: 'equip'; item: ToolKind | 'hands' }
export interface EatCommand extends Envelope { type: 'eat'; item: WildItem }
/** A W1 (content v1) wilderness world gains loose pickups, items and crafting. */
export interface UpgradeWildernessCommand extends Envelope { type: 'upgrade_wilderness'; content: typeof WILD_CONTENT_V2 }
export type WildCommand = PickupCommand | DropCommand | CraftCommand | EquipCommand | EatCommand | UpgradeWildernessCommand;

export type WildOutcome =
  | { type: 'pickup'; entityId: string; item: WildItem; amount: number }
  | { type: 'drop'; pileId: string; item: WildItem; n: number }
  | { type: 'craft'; recipe: string; spent: Record<string, number>; made: Record<string, number>; toolId?: string }
  | { type: 'equip'; item: ToolKind | 'hands'; toolId?: string }
  | { type: 'eat'; item: WildItem; hunger: number }
  | { type: 'upgrade_wilderness'; content: typeof WILD_CONTENT_V2 };

export const WILD_COMMAND_TYPES: readonly string[] = ['pickup', 'drop', 'craft', 'equip', 'eat', 'upgrade_wilderness'];
export const isWildCommandType = (t: unknown): boolean => WILD_COMMAND_TYPES.includes(String(t));

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const uint = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
const itemOf = (v: unknown): v is WildItem => WILD_ITEMS.includes(v as WildItem);
const pickupId = (v: unknown): v is string => typeof v === 'string' && (PICKUP_ID.test(v) || PILE_ID.test(v));
function atOf(v: unknown): At | null {
  if (!isObj(v) || Object.keys(v).length !== 2) return null;
  const pos = (n: unknown) => Number.isSafeInteger(n) && Math.abs(n as number) <= PRESENCE_POS;
  return pos(v.x) && pos(v.z) ? { x: v.x as number, z: v.z as number } : null;
}
function bagOf(v: unknown): Record<string, number> | null {
  if (!isObj(v)) return null;
  const out: Record<string, number> = {};
  for (const k of Object.keys(v).sort()) {
    if (!itemOf(k) && !TOOL_KINDS.includes(k as ToolKind) || !uint(v[k], 10_000) || (v[k] as number) < 1) return null;
    out[k] = v[k] as number;
  }
  return out;
}

/** Canonical command or null (the caller compares fields exactly). */
export function validateWildCommand(value: Record<string, unknown>, base: Envelope): WildCommand | null {
  switch (value.type) {
    case 'pickup': {
      const at = atOf(value.at);
      return pickupId(value.entityId) && at ? { ...base, type: 'pickup', entityId: value.entityId, at } : null;
    }
    case 'drop': {
      const at = atOf(value.at);
      return itemOf(value.item) && uint(value.n, 10_000) && value.n >= 1 && at ? { ...base, type: 'drop', item: value.item, n: value.n, at } : null;
    }
    case 'craft':
      return typeof value.recipe === 'string' && !!recipeById(value.recipe) ? { ...base, type: 'craft', recipe: value.recipe } : null;
    case 'equip':
      return value.item === 'hands' || TOOL_KINDS.includes(value.item as ToolKind) ? { ...base, type: 'equip', item: value.item as ToolKind | 'hands' } : null;
    case 'eat':
      return itemOf(value.item) ? { ...base, type: 'eat', item: value.item } : null;
    case 'upgrade_wilderness':
      return value.content === WILD_CONTENT_V2 ? { ...base, type: 'upgrade_wilderness', content: WILD_CONTENT_V2 } : null;
  }
  return null;
}

export function validateWildOutcome(value: Record<string, unknown>): WildOutcome | null {
  switch (value.type) {
    case 'pickup':
      return pickupId(value.entityId) && itemOf(value.item) && uint(value.amount, 10_000) && value.amount >= 1
        ? { type: 'pickup', entityId: value.entityId, item: value.item, amount: value.amount } : null;
    case 'drop':
      return typeof value.pileId === 'string' && PILE_ID.test(value.pileId) && itemOf(value.item) && uint(value.n, 10_000) && value.n >= 1
        ? { type: 'drop', pileId: value.pileId, item: value.item, n: value.n } : null;
    case 'craft': {
      const spent = bagOf(value.spent), made = bagOf(value.made);
      if (typeof value.recipe !== 'string' || !recipeById(value.recipe) || !spent || !made
        || value.toolId !== undefined && (typeof value.toolId !== 'string' || !TOOL_ID.test(value.toolId))) return null;
      return { type: 'craft', recipe: value.recipe, spent, made, ...(value.toolId !== undefined ? { toolId: value.toolId as string } : {}) };
    }
    case 'equip':
      if (value.item !== 'hands' && !TOOL_KINDS.includes(value.item as ToolKind)
        || value.toolId !== undefined && (typeof value.toolId !== 'string' || !TOOL_ID.test(value.toolId))) return null;
      return { type: 'equip', item: value.item as ToolKind | 'hands', ...(value.toolId !== undefined ? { toolId: value.toolId as string } : {}) };
    case 'eat':
      return itemOf(value.item) && uint(value.hunger, 100) ? { type: 'eat', item: value.item, hunger: value.hunger } : null;
    case 'upgrade_wilderness':
      return value.content === WILD_CONTENT_V2 ? { type: 'upgrade_wilderness', content: WILD_CONTENT_V2 } : null;
  }
  return null;
}

/** Command and recorded outcome agree on the fields the command fixes. */
export function wildAgrees(c: WildCommand, o: WildOutcome): boolean {
  if (c.type !== o.type) return false;
  switch (c.type) {
    case 'pickup': return o.type === 'pickup' && o.entityId === c.entityId;
    case 'drop': return o.type === 'drop' && o.item === c.item && o.n === c.n;
    case 'craft': return o.type === 'craft' && o.recipe === c.recipe;
    case 'equip': return o.type === 'equip' && o.item === c.item;
    case 'eat': return o.type === 'eat' && o.item === c.item;
    case 'upgrade_wilderness': return true;
  }
}

export type WildDispatch = { ok: true; value: WildOutcome } | { ok: false; code: string; reasons: string[] };

export function dispatchWild(world: World, c: WildCommand): WildDispatch {
  if (c.type === 'upgrade_wilderness') {
    if (world.wild) return { ok: false, code: 'already_current', reasons: ['this world already has wilderness content v2'] };
    world.wild = createWildState();
    return { ok: true, value: { type: 'upgrade_wilderness', content: WILD_CONTENT_V2 } };
  }
  if (!world.wild) return { ok: false, code: 'wilderness', reasons: ['this world predates gathering (wilderness content v1); it needs upgrade_wilderness first'] };
  switch (c.type) {
    case 'pickup': {
      const r = pickUp(world, c.entityId, c.at);
      return r.ok ? { ok: true, value: { type: 'pickup', entityId: c.entityId, item: r.value.item, amount: r.value.amount } } : r;
    }
    case 'drop': {
      const r = dropItems(world, c.item, c.n, c.at);
      return r.ok ? { ok: true, value: { type: 'drop', pileId: r.value.pileId, item: c.item, n: c.n } } : r;
    }
    case 'craft': {
      const r = craft(world, c.recipe);
      return r.ok ? { ok: true, value: { type: 'craft', recipe: c.recipe, spent: r.value.spent, made: r.value.made, ...(r.value.toolId ? { toolId: r.value.toolId } : {}) } } : r;
    }
    case 'equip': {
      const r = equip(world, c.item);
      return r.ok ? { ok: true, value: { type: 'equip', item: c.item, ...(r.value.toolId ? { toolId: r.value.toolId } : {}) } } : r;
    }
    case 'eat': {
      const r = eat(world, c.item);
      return r.ok ? { ok: true, value: { type: 'eat', item: c.item, hunger: r.value.hunger } } : r;
    }
  }
}

export { WILD_RECIPES };
